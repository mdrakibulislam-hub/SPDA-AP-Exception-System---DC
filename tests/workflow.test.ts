import { describe, expect, test } from "bun:test";

import { answerAssistant, applyAssistantReview, type ActionReview } from "../apps/web/src/features/exceptions/assistant-model";
import {
  activeRole, allowed, applyBulk, approvalProgress, attachEvidence, bulkKey, findEvidence, ownerOptions,
  paymentRisk, planBulk, seedCases, statusOf, updateCase, validateProofFile, visibleCases,
  type Invoice, type Proof, type Role,
} from "../apps/web/src/features/exceptions/model";

const now = new Date(2026, 10, 27, 12);
const reason = { note: "Checked the invoice against the purchase order.", recipient: "Supplier" as const };

function fixtures() {
  const cases = seedCases(now);
  const invoice = (id: string) => cases.find(item => item.id === id)!;
  const assign = (id: string, owner = ownerOptions(invoice(id), cases).suggested?.id) =>
    updateCase(cases, id, "ap", "assign", { ...reason, note: "", owner });
  return { cases, invoice, assign };
}

function assistantReview(cases: Invoice[], input: string): ActionReview {
  const reply = answerAssistant(input, { cases, visible: cases, role: "ap", recentIds: [], now });
  if (!reply.review) throw new Error(`Expected an action review: ${reply.text}`);
  return reply.review;
}

describe("assignment and approval workflow", () => {
  test("routes an unavailable owner's invoice to an available backup in the same scope", () => {
    const { cases, invoice, assign } = fixtures();
    const meghna = invoice("meghna");
    const openedEvent = structuredClone(meghna.events[0]);

    expect(allowed(meghna, "budget", "approve")).toBe(false);
    expect(() => updateCase(cases, meghna.id, "budget", "approve", reason)).toThrow("latest stage");
    expect(ownerOptions(meghna, cases).suggested?.id).toBe("bd-backup");

    assign(meghna.id);

    expect(meghna.assignment).toMatchObject({ stage: "budget", owner: "bd-backup" });
    expect(allowed(meghna, "budget", "approve")).toBe(true);
    expect(statusOf(meghna)).toBe("assigned");
    expect(meghna.events[0]).toEqual(openedEvent);
    expect(meghna.events.at(-1)?.title).toBe("Approval requested");
  });

  test.each(["bd-owner", "uk-owner"])("rejects unavailable or out-of-scope assignee %s without changing the invoice", owner => {
    const { cases, invoice } = fixtures();
    const before = structuredClone(invoice("cpe"));
    expect(() => updateCase(cases, "cpe", "ap", "assign", { ...reason, owner })).toThrow("available budget owner");
    expect(invoice("cpe")).toEqual(before);
  });

  test.each([
    { id: "smith", stages: ["budget"] as Role[] },
    { id: "northgate", stages: ["budget", "head"] as Role[] },
    { id: "vantage", stages: ["budget", "head", "controller"] as Role[] },
  ])("requires every approval stage for $id before setting a final outcome", ({ id, stages }) => {
    const { cases, invoice, assign } = fixtures();
    const bill = invoice(id);
    assign(id);

    for (const [index, role] of stages.entries()) {
      expect(activeRole(bill)).toBe(role);
      expect(statusOf(bill)).toBe("assigned");
      expect(bill.outcome).toBeNull();
      for (const other of ["ap", "supplier", "budget", "head", "controller"] as Role[]) {
        expect(allowed(bill, other, "approve")).toBe(other === role);
      }
      const inactiveRole: Role = role === "budget" ? "head" : "budget";
      expect(() => updateCase(cases, id, inactiveRole, "approve", reason)).toThrow("latest stage");
      expect(bill.decisions).toHaveLength(index);

      updateCase(cases, id, role, "approve", reason);
      expect(bill.decisions).toHaveLength(index + 1);
      if (index < stages.length - 1) expect(activeRole(bill)).toBe(stages[index + 1]);
    }

    expect(statusOf(bill)).toBe("approved");
    expect(bill.assignment).toBeNull();
    expect(bill.outcome?.note).toBe(reason.note);
    expect(approvalProgress(bill).map(step => step.state)).toEqual(stages.map(() => "approved"));
    if (id === "vantage") expect(paymentRisk(bill)).toBe(true);
  });

  test.each(["approve", "reject"] as const)("requires a nonblank %s reason before recording a decision", action => {
    const { cases, invoice, assign } = fixtures();
    assign("northgate");
    const before = structuredClone(invoice("northgate"));
    expect(() => updateCase(cases, "northgate", "budget", action, { ...reason, note: " \n " })).toThrow("Enter a reason");
    expect(invoice("northgate")).toEqual(before);
  });

  test.each(["approve", "reject"] as const)("rejects a stale %s dialog after AP reassigns the same stage", action => {
    const { cases, invoice, assign } = fixtures();
    assign("northgate", "uk-owner");
    const expectedAssignment = structuredClone(invoice("northgate").assignment);
    assign("northgate", "uk-backup");
    const before = structuredClone(invoice("northgate"));

    expect(() => updateCase(cases, "northgate", "budget", action, { ...reason, expectedAssignment })).toThrow("assignee changed");
    expect(invoice("northgate")).toEqual(before);
  });

  test("rejection stops later approvals and retains the reviewer's reason", () => {
    const { cases, invoice, assign } = fixtures();
    assign("northgate");
    updateCase(cases, "northgate", "budget", "reject", { ...reason, note: "  Delivery records cover only 40 units.  " });

    expect(statusOf(invoice("northgate"))).toBe("rejected");
    expect(invoice("northgate").outcome?.note).toBe("Delivery records cover only 40 units.");
    expect(invoice("northgate").assignment).toBeNull();
    expect(approvalProgress(invoice("northgate")).map(step => step.state)).toEqual(["rejected", "stopped"]);
    expect(() => updateCase(cases, "northgate", "head", "approve", reason)).toThrow("latest stage");
  });

  test("requires documented controller coverage before a delegate can satisfy budget approval", () => {
    const { cases, invoice, assign } = fixtures();
    assign("kowalczyk");
    const bill = invoice("kowalczyk");
    expect(bill.assignment?.stage).toBe("coverage");
    expect(allowed(bill, "controller", "approve")).toBe(false);
    expect(() => updateCase(cases, bill.id, "controller", "coverage", { ...reason, note: " " })).toThrow("Enter a reason");

    updateCase(cases, bill.id, "controller", "coverage", { ...reason, note: "Delegation approved in Finance record FIN-42." });
    expect(bill.assignment?.stage).toBe("delegate");
    updateCase(cases, bill.id, "controller", "approve", reason);
    expect(activeRole(bill)).toBe("head");
    expect(bill.outcome).toBeNull();
    updateCase(cases, bill.id, "head", "approve", reason);
    expect(statusOf(bill)).toBe("approved");
  });
});

describe("supplier evidence and bank verification", () => {
  test("shows a supplier only its invoice and attaches one submission to the requested case", () => {
    const { cases, invoice } = fixtures();
    expect(() => updateCase(cases, "northgate", "ap", "request", { ...reason, note: " " })).toThrow("Enter a reason");
    const { requestId } = updateCase(cases, "northgate", "ap", "request", { ...reason, note: "Send delivery records for the remaining 20 units." });
    expect(requestId).toBeDefined();
    const supplierCases = visibleCases(cases, "supplier", "northgate");
    expect(supplierCases.map(item => item.id)).toEqual(["northgate"]);
    expect(findEvidence(supplierCases, requestId!)?.invoice.id).toBe("northgate");
    expect(findEvidence(visibleCases(cases, "supplier", "vantage"), requestId!)).toBeUndefined();
    expect(allowed(invoice("northgate"), "supplier", "approve")).toBe(false);

    const proof: Proof = { name: "delivery-record.pdf", data: "data:application/pdf;base64,cHJvb2Y=", review: "Manual review needed." };
    attachEvidence(cases, requestId!, proof);

    expect(invoice("northgate").requests[0]?.proof).toEqual(proof);
    expect(invoice("northgate").events.at(-1)).toMatchObject({ title: "Evidence submitted", who: "Supplier" });
    expect(invoice("vantage").requests).toHaveLength(0);
    expect(() => attachEvidence(cases, requestId!, proof)).toThrow("already been answered");
    expect(() => attachEvidence(cases, "unknown-request", proof)).toThrow("unavailable");
    expect(invoice("northgate").events.filter(event => event.title === "Evidence submitted")).toHaveLength(1);
  });

  test("accepts supported evidence files and refuses empty, oversized or unsupported uploads", () => {
    expect(validateProofFile(new File(["delivery record"], "record.txt"))).toBe("text/plain");
    expect(validateProofFile(new File(["pdf"], "record.PDF"))).toBe("application/pdf");
    expect(validateProofFile(new File(["photo"], "record.jpeg"))).toBe("image/jpeg");
    for (const file of [new File([], "empty.pdf"), new File([new Uint8Array(1024 * 1024 + 1)], "large.png"), new File(["script"], "record.exe")]) {
      expect(() => validateProofFile(file)).toThrow("up to 1 MB");
    }
  });

  test("keeps the bank hold until AP's phone check receives separate controller confirmation", () => {
    const { cases, invoice } = fixtures();
    const bill = invoice("vantage");
    expect(paymentRisk(bill)).toBe(true);
    expect(() => updateCase(cases, bill.id, "controller", "bank", reason)).toThrow("latest stage");
    expect(() => updateCase(cases, bill.id, "budget", "phone", reason)).toThrow("latest stage");
    expect(() => updateCase(cases, bill.id, "ap", "phone", { ...reason, note: " " })).toThrow("Enter a reason");
    expect(bill.bank).toBe("pending");

    updateCase(cases, bill.id, "ap", "phone", { ...reason, note: "Called the known supplier contact on file." });
    expect(bill.bank).toBe("phone");
    expect(paymentRisk(bill)).toBe(true);
    expect(() => updateCase(cases, bill.id, "ap", "bank", reason)).toThrow("latest stage");
    expect(() => updateCase(cases, bill.id, "controller", "bank", { ...reason, note: " " })).toThrow("Enter a reason");

    updateCase(cases, bill.id, "controller", "bank", { ...reason, note: "Reviewed AP's independent phone confirmation." });
    expect(bill.bank).toBe("confirmed");
    expect(paymentRisk(bill)).toBe(false);
    expect(statusOf(bill)).toBe("needs");
    expect(bill.events.slice(-2).map(event => event.title)).toEqual(["Supplier phone check logged", "Bank change approved"]);
  });
});

describe("reviewed bulk and assistant actions", () => {
  test("bulk routing skips unavailable scope coverage and records the batch on eligible cases", () => {
    const { cases, invoice } = fixtures();
    const rows = planBulk(cases, "route", ["northgate", "kowalczyk"], "Supplier");
    expect(rows[0]?.owner?.scope).toBe(invoice("northgate").scope);
    expect(rows[1]?.skip).toContain("No available owner");
    const result = applyBulk(rows, "route", "Supplier", "Review the delivery discrepancy.", {});

    expect(statusOf(invoice("northgate"))).toBe("assigned");
    expect(invoice("northgate").events.at(-1)?.batch).toBe(result.code);
    expect(invoice("kowalczyk").assignment).toBeNull();
    expect(result.rows[1]?.skip).toBeDefined();
  });

  test("detects a stale bulk preview when another operation has routed its invoice", () => {
    const { cases } = fixtures();
    const preview = planBulk(cases, "route", ["northgate"], "Supplier");
    const latest = structuredClone(cases);
    updateCase(latest, "northgate", "ap", "assign", { ...reason, owner: "uk-backup" });
    const refreshed = planBulk(latest, "route", ["northgate"], "Supplier");

    expect(bulkKey(refreshed)).not.toBe(bulkKey(preview));
    expect(refreshed[0]?.skip).toContain("Already assigned");
    expect(cases.find(item => item.id === "northgate")?.assignment).toBeNull();
  });

  test("bulk evidence skips an existing recipient request and validates every ready draft before creating links", () => {
    const { cases, invoice } = fixtures();
    updateCase(cases, "cpe", "ap", "request", reason);
    const rows = planBulk(cases, "proof", ["cpe", "northgate"], "Supplier");
    expect(rows[0]?.skip).toContain("already exists");
    expect(() => applyBulk(rows, "proof", "Supplier", "", {})).toThrow("Enter a request for each invoice");
    expect(invoice("northgate").requests).toHaveLength(0);

    const result = applyBulk(rows, "proof", "Supplier", "", { northgate: "Please share the delivery record." });
    expect(invoice("cpe").requests).toHaveLength(1);
    expect(result.rows[0]?.key).toBeUndefined();
    expect(result.rows[1]?.key).toBe(invoice("northgate").requests[0]?.key);
    expect(planBulk(cases, "proof", ["cpe"], "Second reviewer")[0]?.skip).toBeUndefined();
  });

  test("assistant actions remain drafts until applied and then return real evidence links", () => {
    const { cases, invoice } = fixtures();
    const before = structuredClone(cases);
    const review = assistantReview(cases, "Route Meghna to the Bangladesh backup owner, then request evidence for Northgate");
    expect(review.actions).toHaveLength(2);
    expect(cases).toEqual(before);

    const receipts = applyAssistantReview(cases, "ap", review);
    expect(invoice("meghna").assignment?.owner).toBe("bd-backup");
    expect(receipts[1]?.evidenceKey).toBe(invoice("northgate").requests[0]?.key);
    expect(receipts[1]?.evidenceKey).toBeDefined();
  });

  test("assistant rejects a stale multi-action review before changing any of its cases", () => {
    const { cases } = fixtures();
    const review = assistantReview(cases, "Route Meghna to the Bangladesh backup owner, then request evidence for Northgate");
    const latest = structuredClone(cases);
    updateCase(latest, "northgate", "ap", "assign", { ...reason, owner: "uk-owner" });
    const before = structuredClone(latest);

    expect(() => applyAssistantReview(latest, "ap", review)).toThrow("queue changed after you reviewed");
    expect(latest).toEqual(before);
    expect(() => applyAssistantReview(cases, "budget", review)).toThrow("AP Manager view");
    expect(cases.find(item => item.id === "meghna")?.assignment?.owner).toBe("bd-owner");
  });
});
