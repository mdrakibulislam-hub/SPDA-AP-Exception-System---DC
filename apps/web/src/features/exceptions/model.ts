export const roles = {
  ap: "AP specialist",
  budget: "Budget owner",
  head: "Department head",
  controller: "Finance controller",
  supplier: "Supplier",
} as const;

export const statuses = {
  needs: "Needs attention",
  assigned: "Assigned",
  approved: "Approved",
  rejected: "Rejected",
} as const;

export type Role = keyof typeof roles;
export type Status = keyof typeof statuses;
type Outcome = "approved" | "rejected";
type ApprovalStep = "budget" | "head" | "controller";
type Stage = ApprovalStep | "coverage" | "delegate";
type Entity = "US" | "UK" | "Bangladesh";
type Issue = "Mismatch" | "Possible duplicate" | "Missing PO" | "Approval delay" | "Bank change";
export type Recipient = "Supplier" | "Second reviewer";
export type Action = "assign" | "request" | "approve" | "reject" | "coverage" | "phone" | "bank";
export type BulkAction = "route" | "proof" | "note";

interface InvoiceSeed {
  id: string;
  ref: string;
  supplier: string;
  entity: Entity;
  amount: string;
  band: 1 | 2 | 3;
  score: string;
  type: Issue;
  issue: string;
  offset: number;
  scope?: string;
  day?: number;
}

export interface Owner {
  id: string;
  name: string;
  scope: string;
  load: number;
  available: boolean;
}

export interface Proof {
  name: string;
  data: string;
  review: string;
}

export interface EvidenceRequest {
  key: string;
  recipient: Recipient;
  reason: string;
  proof?: Proof;
}

export interface Invoice extends Omit<InvoiceSeed, "offset" | "day" | "scope"> {
  scope: string;
  opened: string;
  accounting?: { originalPeriod: string; period: string };
  assignment: { stage: Stage; name: string; owner?: string } | null;
  outcome: { status: Outcome; note: string; when: string } | null;
  decisions: { role: Role; action: "approve" | "reject"; note: string }[];
  requests: EvidenceRequest[];
  bank: "pending" | "phone" | "confirmed";
  events: { title: string; who: string; when: string; why: string; batch?: string }[];
}

const owners: Owner[] = [
  { id: "us-owner", name: "US budget owner", scope: "US purchasing", load: 5, available: true },
  { id: "us-backup", name: "US backup owner", scope: "US purchasing", load: 2, available: true },
  { id: "uk-owner", name: "UK budget owner", scope: "UK purchasing", load: 4, available: true },
  { id: "uk-backup", name: "UK backup owner", scope: "UK purchasing", load: 2, available: true },
  { id: "uk-cross-border", name: "UK cross-border budget owner", scope: "UK cross-border purchasing", load: 3, available: false },
  { id: "bd-owner", name: "Farhana Rahman", scope: "Bangladesh purchasing", load: 4, available: false },
  { id: "bd-backup", name: "Bangladesh backup owner", scope: "Bangladesh purchasing", load: 1, available: true },
  { id: "bd-secondary", name: "Bangladesh secondary backup", scope: "Bangladesh purchasing", load: 3, available: true },
];

const samples: InvoiceSeed[] = [
  { id: "cpe", ref: "CPE/2026/0457", supplier: "Chattogram Precision Engineering and Fabrication Works Ltd.", entity: "Bangladesh", amount: "BDT 12,45,600.00", band: 2, score: "0.94", type: "Mismatch", issue: "Price is 3.1% above the purchase order. Withholding tax is missing.", offset: -5 },
  { id: "northgate", ref: "88213", supplier: "Northgate Packaging (UK) Ltd", entity: "UK", amount: "£4,812.50", band: 2, score: "0.97", type: "Mismatch", issue: "The bill is for 60 units. The delivery record covers 40.", offset: -4 },
  { id: "brightwater", ref: "INV 20991", supplier: "Brightwater Logistics LLC", entity: "US", amount: "$18,250.00", band: 2, score: "0.91", type: "Possible duplicate", issue: "May be a duplicate of INV 20991A, paid on 12 November.", offset: 0, day: 12 },
  { id: "smith", ref: "Not found", supplier: "Smith & Okafor Office Supplies", entity: "UK", amount: "£312.40", band: 1, score: "0.58", type: "Missing PO", issue: "Phone photo. The total and date are unclear, and there is no purchase order.", offset: -1 },
  { id: "meghna", ref: "7Q/4471", supplier: "Meghna Agro Chemicals", entity: "Bangladesh", amount: "BDT 3,80,000.00", band: 1, score: "0.89", type: "Approval delay", issue: "Assigned budget owner Farhana Rahman is on leave until 8 December.", offset: 0 },
  { id: "vantage", ref: "553019", supplier: "Vantage Industrial Components Inc.", entity: "US", amount: "$96,400.00", band: 3, score: "0.99", type: "Bank change", issue: "The supplier emailed new bank details on 20 November.", offset: 0, day: 20 },
  { id: "kowalczyk", ref: "7781", supplier: "Kowalczyk Brennan Engineering Services GmbH", entity: "UK", scope: "UK cross-border purchasing", amount: "€22,960.00", band: 2, score: "0.95", type: "Mismatch", issue: "The bill is in euros and the purchase order is in pounds.", offset: -2 },
];

export function monthAt(now: Date, offset: number) {
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

export function localDate(value: Date) {
  return [value.getFullYear(), String(value.getMonth() + 1).padStart(2, "0"), String(value.getDate()).padStart(2, "0")].join("-");
}

export function seedCases(now = new Date()): Invoice[] {
  return samples.map(({ offset, day, ...invoice }) => {
    const openedDate = monthAt(now, offset);
    openedDate.setDate(Math.min(day ?? 1, now.getDate()));
    const opened = openedDate.toISOString();
    const period = localDate(openedDate).slice(0, 7);
    const assigned = invoice.id === "meghna";
    return {
      ...invoice, opened, scope: invoice.scope ?? `${invoice.entity} purchasing`,
      accounting: { originalPeriod: period, period },
      assignment: assigned ? { stage: "budget", owner: "bd-owner", name: "Farhana Rahman" } : null,
      outcome: null, decisions: [], requests: [], bank: "pending",
      events: [
        { title: "Exception opened", who: "Invoice matching service", when: opened, why: invoice.issue },
        ...(assigned ? [{ title: "Approval requested", who: roles.ap, when: opened, why: "Sent to the assigned budget owner, Farhana Rahman." }] : []),
      ],
    };
  });
}

export const statusOf = (invoice: Invoice): Status => invoice.outcome?.status ?? (invoice.assignment ? "assigned" : "needs");

const stageRoles: Record<Stage, Role> = {
  budget: "budget", head: "head", controller: "controller", coverage: "controller", delegate: "controller",
};

export const activeRole = (invoice: Invoice) => invoice.assignment && stageRoles[invoice.assignment.stage];
const entityRole = (invoice: Invoice, role: Role) => `${roles[role]} · ${invoice.entity}`;
export const ownerAway = (invoice: Invoice) => owners.some(owner => owner.id === invoice.assignment?.owner && !owner.available);

const approvalOrder: readonly ApprovalStep[] = ["budget", "head", "controller"];

function currentApprovalStep(invoice: Invoice): ApprovalStep | undefined {
  const stage = invoice.assignment?.stage;
  return stage === "coverage" || stage === "delegate" ? "budget" : stage;
}

export function nextApprovalStep(invoice: Invoice) {
  const step = currentApprovalStep(invoice);
  return step && approvalOrder.slice(0, invoice.band)[approvalOrder.indexOf(step) + 1];
}

export function approvalProgress(invoice: Invoice): {
  step: ApprovalStep;
  state: Outcome | "active" | "stopped" | "pending";
  assignee?: string;
}[] {
  const current = currentApprovalStep(invoice);
  return approvalOrder.slice(0, invoice.band).map((step, index) => {
    const decision = invoice.decisions[index];
    const state = decision?.action === "approve" ? "approved" : decision?.action === "reject" ? "rejected"
      : step === current ? "active" : invoice.outcome?.status === "rejected" ? "stopped" : "pending";
    return { step, state, assignee: step === current ? invoice.assignment?.name : undefined };
  });
}

export function visibleCases(cases: Invoice[], role: Role, supplierId: string) {
  if (role === "ap" || role === "controller") return cases;
  if (role === "supplier") return cases.filter(invoice => invoice.id === supplierId);
  return cases.filter(invoice => activeRole(invoice) === role || invoice.decisions.some(decision => decision.role === role));
}

export function allowed(invoice: Invoice, role: Role, action: Action) {
  const assignment = invoice.assignment;
  const bankChange = invoice.type === "Bank change";
  const decision = !!assignment && activeRole(invoice) === role && assignment.stage !== "coverage" && !ownerAway(invoice);
  return {
    assign: role === "ap" && !invoice.outcome && (!assignment || ["budget", "coverage", "delegate"].includes(assignment.stage)),
    request: role === "ap" || decision,
    coverage: role === "controller" && assignment?.stage === "coverage",
    phone: role === "ap" && bankChange && invoice.bank === "pending",
    bank: role === "controller" && bankChange && invoice.bank === "phone",
    approve: decision,
    reject: decision,
  }[action];
}

export const taskCount = (count: number) => `${count} assigned ${count === 1 ? "task" : "tasks"}`;

export function ownerOptions(invoice: Invoice, cases: Invoice[], pending = new Map<string, number>()) {
  const scoped = owners.filter(owner => owner.scope === invoice.scope);
  const workload = (owner: Owner) => owner.load + (pending.get(owner.id) ?? 0) + cases.filter(item => item.assignment?.owner === owner.id).length;
  const available = scoped.filter(owner => owner.available).sort((first, second) => workload(first) - workload(second));
  const primary = scoped[0];
  return { primary, available, workload, suggested: primary?.available ? primary : available[0] };
}

function log(invoice: Invoice, title: string, who: string, why: string, batch?: string) {
  invoice.events.push({ title, who, why, when: new Date().toISOString(), batch });
}

function createRequest(invoice: Invoice, recipient: Recipient, reason: string, who: string, batch?: string) {
  const request = { key: crypto.randomUUID(), recipient, reason };
  invoice.requests.push(request);
  log(invoice, batch ? "Evidence requested in bulk" : "Evidence requested", who, `${recipient}: ${reason}`, batch);
  return request.key;
}

function recordDecision(invoice: Invoice, role: Role, action: "approve" | "reject", note: string) {
  const assignment = invoice.assignment!;
  invoice.decisions.push({ role, action, note });
  log(invoice, action === "approve" ? "Approval recorded" : "Bill rejected", assignment.name, note);

  if (action === "approve") {
    const next = nextApprovalStep(invoice);
    if (next) {
      const name = entityRole(invoice, next);
      invoice.assignment = { stage: next, name };
      log(invoice, "Next approval requested", "Approval workflow", `The amount requires approval from the ${roles[next].toLowerCase()}.`);
      return `Approval recorded. Sent to ${name}.`;
    }
  }

  invoice.outcome = { status: action === "approve" ? "approved" : "rejected", note, when: new Date().toISOString() };
  invoice.assignment = null;
  return action === "approve" ? "All required approvals are recorded." : "Invoice moved to Rejected.";
}

export function updateCase(cases: Invoice[], id: string, role: Role, action: Action, input: {
  note: string;
  owner?: string;
  recipient: Recipient;
  expectedAssignment?: Invoice["assignment"];
}): { message: string; requestId?: string } {
  const invoice = cases.find(item => item.id === id);
  if (!invoice || !allowed(invoice, role, action)) throw new Error("The invoice changed. Review its latest stage before continuing.");
  if ((action === "approve" || action === "reject") && input.expectedAssignment &&
    (invoice.assignment?.stage !== input.expectedAssignment.stage ||
      invoice.assignment.owner !== input.expectedAssignment.owner ||
      invoice.assignment.name !== input.expectedAssignment.name)) {
    throw new Error("The assignee changed. Close this dialog and review the updated approval before continuing.");
  }
  const note = input.note.trim();
  const who = role === "ap" ? roles.ap : invoice.assignment?.name ?? entityRole(invoice, role);
  if (action !== "assign" && !note) throw new Error("Enter a reason before continuing.");

  switch (action) {
    case "assign": {
      const { available } = ownerOptions(invoice, cases);
      const owner = available.find(item => item.id === input.owner);
      if (available.length && !owner) throw new Error("Choose an available budget owner.");
      const name = owner?.name ?? entityRole(invoice, "controller");
      invoice.assignment = owner ? { stage: "budget", owner: owner.id, name } : { stage: "coverage", name };
      log(invoice, owner ? "Approval requested" : "Controller coverage requested", who,
        `${name}. ${note || (owner ? `Available budget owner in ${invoice.scope}.` : "No available budget owner in the purchase scope.")}`);
      return { message: owner ? `Approval request recorded for ${name}.` : "Finance now has a coverage request." };
    }
    case "request":
      return { message: "Evidence link created.", requestId: createRequest(invoice, input.recipient, note, who) };
    case "coverage":
      invoice.assignment = { stage: "delegate", name: `${entityRole(invoice, "controller")} · acting budget owner` };
      log(invoice, "Budget-owner delegation recorded", who, note);
      return { message: "Coverage recorded. The delegate can now review the bill." };
    case "phone":
      invoice.bank = "phone";
      log(invoice, "Supplier phone check logged", roles.ap, note);
      return { message: "Phone check recorded. A second person still needs to approve." };
    case "bank":
      invoice.bank = "confirmed";
      log(invoice, "Bank change approved", entityRole(invoice, "controller"), note);
      return { message: "Bank change approved in the demo." };
    case "approve":
    case "reject":
      return { message: recordDecision(invoice, role, action, note) };
  }
}

export function findEvidence(cases: Invoice[], key: string) {
  for (const invoice of cases) {
    const request = invoice.requests.find(item => item.key === key);
    if (request) return { invoice, request };
  }
  return undefined;
}

export function attachEvidence(cases: Invoice[], key: string, proof: Proof) {
  const match = findEvidence(cases, key);
  if (!match || match.request.proof) throw new Error("This request has already been answered or is unavailable.");
  const { invoice, request } = match;
  request.proof = proof;
  log(invoice, "Evidence submitted", request.recipient, `${proof.name} was uploaded for the request: ${request.reason}`);
}

export const followUp: Record<Issue, string> = {
  "Bank change": "Call the supplier using the contact information already on file and confirm the change.",
  "Possible duplicate": "Check the previous payment and ask the supplier to withdraw the duplicate if confirmed.",
  "Missing PO": "Ask the supplier for a clearer bill and ask the buyer for the purchase order.",
  Mismatch: "Ask the supplier for a corrected bill or supporting evidence.",
  "Approval delay": "Confirm the reason with the buyer before asking the supplier to resubmit.",
};

const drafts: Record<string, string> = {
  cpe: "Please explain the price difference and provide an updated invoice showing the applicable withholding tax.",
  northgate: "Please share the delivery record for the remaining 20 units or provide a corrected invoice for the 40 received.",
  brightwater: "Please explain how this invoice differs from INV 20991A and share the related order or shipment reference.",
  smith: "Please send a clear copy of the bill showing the invoice number, date, total, and purchase order reference if available.",
  meghna: "Please share the purchase or delivery reference while the approval request is reassigned.",
  vantage: "Please provide a written explanation of the change. We will confirm the request by calling the supplier contact already on file.",
  kowalczyk: "Please confirm the agreed invoice currency and share the purchase order or written agreement that supports it.",
};

export function evidenceDraft(invoice: Invoice) {
  const reference = invoice.ref === "Not found" ? invoice.supplier : `Invoice ${invoice.ref}`;
  return `${reference}. ${drafts[invoice.id] ?? followUp[invoice.type]}`;
}

export const paymentRisk = (invoice: Invoice) =>
  (invoice.type === "Bank change" && invoice.bank !== "confirmed" && invoice.outcome?.status !== "rejected")
  || (invoice.type === "Possible duplicate" && !invoice.outcome);

export function nextStep(invoice: Invoice, cases: Invoice[], role: Role) {
  if (invoice.outcome?.status === "rejected") return followUp[invoice.type];
  if (invoice.type === "Bank change" && invoice.bank !== "confirmed") {
    if (invoice.bank === "phone") return role === "controller"
      ? "Review the supplier phone check before approving the bank change."
      : "Finance can review the recorded phone check and confirm the bank change.";
    return role === "ap" ? "Call the known supplier contact before using any new bank details."
      : "AP needs to call the known supplier contact before the bank change can move forward.";
  }
  if (invoice.outcome) return "Review the recorded resolution and attachments before using this case as a reference.";
  if (invoice.type === "Possible duplicate") return "Compare the bill with INV 20991A and check the earlier payment before making a decision.";
  if (invoice.assignment?.stage === "coverage") return role === "controller"
    ? "Check for documented delegation before accepting coverage."
    : "Finance is reviewing authorized budget-owner coverage.";
  const { available } = ownerOptions(invoice, cases);
  if (ownerAway(invoice) && available.length) return `Consider ${available[0].name}, an available owner in the same purchasing scope.`;
  if (ownerAway(invoice) || (!invoice.assignment && !available.length)) return "Confirm the purchasing scope and ask Finance to review authorized coverage.";
  if (invoice.requests.some(request => !request.proof)) return "Check for the requested proof before following up again.";
  if (invoice.requests.some(request => request.proof)) return "Open the submitted proof and check it against the invoice and order.";
  if (invoice.assignment) return `Review the evidence with ${invoice.assignment.name} before recording the next decision.`;
  return followUp[invoice.type];
}

function proposeRoute(invoice: Invoice, cases: Invoice[], pending?: Map<string, number>) {
  if (invoice.outcome) return { skip: "The invoice already has a decision." };
  if (invoice.assignment && invoice.assignment.stage !== "budget") return { skip: "An approval or coverage step is already in progress." };
  const { primary, available, suggested: owner, workload } = ownerOptions(invoice, cases, pending);
  if (invoice.assignment && available.some(item => item.id === invoice.assignment?.owner)) return { skip: `Already assigned to ${invoice.assignment.name}.` };
  if (!owner) return { skip: "No available owner in this scope. Open the case to request authorized Finance coverage." };
  return {
    owner,
    why: owner === primary ? `Primary owner for ${invoice.scope}.`
      : `Available backup for ${invoice.scope} with ${taskCount(workload(owner))}.`,
  };
}

export function suggestedRouting(cases: Invoice[]) {
  return cases.filter(invoice => statusOf(invoice) === "needs" && !paymentRisk(invoice)
    && !invoice.requests.some(request => !request.proof) && proposeRoute(invoice, cases).owner);
}

export interface BulkRow {
  invoice: Invoice;
  skip?: string;
  owner?: Owner;
  why?: string;
}

export interface BatchResult {
  code: string;
  action: BulkAction;
  rows: { id: string; label: string; skip?: string; summary?: string; key?: string }[];
}

export function planBulk(cases: Invoice[], action: BulkAction, ids: string[], recipient: Recipient): BulkRow[] {
  const pending = new Map<string, number>();
  return ids.flatMap(id => {
    const invoice = cases.find(item => item.id === id);
    if (!invoice) return [];
    if (action === "route") {
      const proposal = proposeRoute(invoice, cases, pending);
      if (proposal.owner) pending.set(proposal.owner.id, (pending.get(proposal.owner.id) ?? 0) + 1);
      return [{ invoice, ...proposal }];
    }
    if (action === "proof" && invoice.requests.some(request => request.recipient === recipient && !request.proof)) {
      return [{ invoice, skip: `An open request for ${recipient.toLowerCase()} proof already exists.` }];
    }
    return [{ invoice }];
  });
}

export const bulkKey = (rows: BulkRow[]) =>
  JSON.stringify(rows.map(row => [row.invoice.id, statusOf(row.invoice), row.skip, row.owner?.id, row.why]));

export function applyBulk(rows: BulkRow[], action: BulkAction, recipient: Recipient, note: string, reasons: Record<string, string>): BatchResult {
  const ready = rows.filter(row => !row.skip);
  if (!ready.length) throw new Error("The selection has no eligible invoices.");
  if (action === "note" && !note.trim()) throw new Error("Enter an internal note.");
  if (action === "proof" && ready.some(row => !reasons[row.invoice.id]?.trim())) throw new Error("Enter a request for each invoice marked ready.");
  const code = crypto.randomUUID().slice(0, 8);
  return {
    code, action,
    rows: rows.map(({ invoice, skip, owner, why }) => {
      const row = { id: invoice.id, label: `${invoice.ref} · ${invoice.supplier}` };
      if (skip) return { ...row, skip };
      if (action === "route" && owner) {
        invoice.assignment = { stage: "budget", owner: owner.id, name: owner.name };
        log(invoice, "Approval requested in bulk", roles.ap, `${owner.name}. ${why}${note.trim() ? ` ${note.trim()}` : ""}`, code);
        return { ...row, summary: `Routed to ${owner.name}` };
      }
      if (action === "proof") {
        const key = createRequest(invoice, recipient, reasons[invoice.id].trim(), roles.ap, code);
        return { ...row, summary: `Link created for ${recipient.toLowerCase()}`, key };
      }
      log(invoice, "Internal note added in bulk", roles.ap, note.trim(), code);
      return { ...row, summary: "Internal note added" };
    }),
  };
}

const fileTypes: Record<string, string> = { txt: "text/plain", pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

export function validateProofFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!Object.hasOwn(fileTypes, extension) || !file.size || file.size > 1024 * 1024) {
    throw new Error("Choose a non-empty text, PDF, JPG, or PNG file up to 1 MB.");
  }
  return fileTypes[extension];
}

export async function readProof(file: File, invoice: Invoice): Promise<Proof> {
  const type = validateProofFile(file);
  let review = "Manual review needed. The demo reads text files for automated checks.";
  if (type === "text/plain") {
    const text = (await file.text()).toLowerCase();
    const checks = [
      { label: "invoice number", passed: invoice.ref !== "Not found" && text.includes(invoice.ref.toLowerCase()) },
      { label: "supplier name", passed: text.includes(invoice.supplier.split(" ").slice(0, 2).join(" ").toLowerCase()) },
      { label: "enough detail", passed: text.trim().split(/\s+/).length >= 12 },
    ];
    const missed = checks.filter(check => !check.passed).map(check => check.label);
    const flags = /bypass|skip verification|do not call|ignore (the )?approval/.test(text);
    review = `${3 - missed.length}/3 basic checks matched. ${missed.length ? `Missing ${missed.join(", ")}. ` : ""}${flags ? "Possible request to skip checks. " : ""}${!missed.length && !flags ? "Ready for a person to review." : "Ask for more detail or investigate before accepting."}`;
  }
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(new Blob([file], { type }));
  });
  return { name: file.name, data, review };
}
