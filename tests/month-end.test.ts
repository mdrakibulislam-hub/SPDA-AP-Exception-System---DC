import { describe, expect, test } from "bun:test";

import { seedCases, type Invoice } from "../apps/web/src/features/exceptions/model";
import { applyMonthEnd, approvalCutoff } from "../apps/web/src/features/exceptions/month-end";

function invoiceFor(entity: Invoice["entity"]): Invoice {
  const invoice = seedCases(new Date(2026, 10, 26, 12)).find(sample => sample.entity === entity)!;
  return { ...invoice, accounting: { originalPeriod: "2026-11", period: "2026-11" } };
}

describe("month-end close", () => {
  test("finds the third working day using each entity's weekend", () => {
    expect(approvalCutoff("2026-01", "Bangladesh")).toBe("2026-02-03");
    expect(approvalCutoff("2026-01", "UK")).toBe("2026-02-04");
    expect(approvalCutoff("2026-12", "US")).toBe("2027-01-05");
  });

  test("includes the full cutoff day in each entity's time zone", () => {
    const bangladesh = invoiceFor("Bangladesh");
    const us = invoiceFor("US");
    expect(applyMonthEnd([bangladesh, us], new Date("2026-12-03T17:59:59Z"))).toBe(false);
    expect(applyMonthEnd([bangladesh, us], new Date("2026-12-03T18:00:00Z"))).toBe(true);
    expect(bangladesh.accounting?.period).toBe("2026-12");
    expect(us.accounting?.period).toBe("2026-11");
    expect(applyMonthEnd([us], new Date("2026-12-04T05:00:00Z"))).toBe(true);
    expect(us.accounting?.period).toBe("2026-12");
  });

  test("rolls a partially approved case and keeps its next approver", () => {
    const invoice = invoiceFor("UK");
    invoice.decisions = [{ role: "budget", action: "approve", note: "Reviewed delivery records." }];
    invoice.assignment = { stage: "head", name: "UK department head" };
    applyMonthEnd([invoice], new Date("2026-12-04T08:30:00Z"));
    expect(invoice.accounting?.period).toBe("2026-12");
    expect(invoice.assignment?.stage).toBe("head");
    expect(invoice.decisions).toHaveLength(1);
  });

  test("uses final decision time to reconcile historical invoices", () => {
    const onTime = invoiceFor("UK");
    onTime.outcome = { status: "approved", when: "2026-12-03T23:59:59Z", note: "Approved." };
    const late = invoiceFor("UK");
    late.outcome = { status: "approved", when: "2026-12-04T00:00:00Z", note: "Approved." };
    const rejected = invoiceFor("UK");
    rejected.outcome = { status: "rejected", when: "2026-12-03T14:00:00Z", note: "Rejected." };

    applyMonthEnd([onTime, late, rejected], new Date("2027-02-15T12:00:00Z"));

    expect(onTime.accounting?.period).toBe("2026-11");
    expect(late.accounting?.period).toBe("2026-12");
    expect(rejected.accounting?.period).toBe("2026-11");
  });

  test("backfills a legacy case, logs each missed cutoff, and safely retries", () => {
    const invoice = invoiceFor("UK");
    invoice.opened = new Date(2026, 10, 1, 12).toISOString();
    delete invoice.accounting;
    const now = new Date("2027-01-06T12:00:00Z");

    expect(applyMonthEnd([invoice], now)).toBe(true);
    expect(invoice.accounting).toEqual({ originalPeriod: "2026-11", period: "2027-01" });
    const moves = invoice.events.filter(event => event.who === "Month-end close");
    expect(moves.map(event => event.title)).toEqual(["Moved to December 2026", "Moved to January 2027"]);
    expect(moves[0]?.when).toBe(now.toISOString());
    expect(moves[0]?.why).toContain("Dec 3, 2026");
    expect(applyMonthEnd([invoice], now)).toBe(false);
    expect(invoice.events.filter(event => event.who === "Month-end close")).toHaveLength(2);
  });
});
