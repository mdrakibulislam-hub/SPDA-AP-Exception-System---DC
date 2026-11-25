import { localDate, type Invoice } from "./model";

type Entity = Invoice["entity"];

const calendars = {
  US: { timeZone: "America/New_York", weekend: [0, 6] },
  UK: { timeZone: "Europe/London", weekend: [0, 6] },
  Bangladesh: { timeZone: "Asia/Dhaka", weekend: [5, 6] },
} satisfies Record<Entity, { timeZone: string; weekend: number[] }>;

const calendarFormatters = Object.fromEntries(
  Object.entries(calendars).map(([entity, { timeZone }]) => [
    entity,
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }),
  ]),
);

const periodFormat = new Intl.DateTimeFormat("en", { timeZone: "UTC", month: "long", year: "numeric" });
const cutoffFormat = new Intl.DateTimeFormat("en", { timeZone: "UTC", dateStyle: "medium" });

function entityDay(value: Date, entity: Entity) {
  const parts = calendarFormatters[entity]!.formatToParts(value);
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)!.value).join("-");
}

export function approvalCutoff(period: string, entity: Entity) {
  const day = new Date(`${period}-01T00:00:00Z`);
  day.setUTCMonth(day.getUTCMonth() + 1);
  let workingDays = 0;
  while (true) {
    if (!calendars[entity].weekend.includes(day.getUTCDay())) workingDays++;
    if (workingDays === 3) return day.toISOString().slice(0, 10);
    day.setUTCDate(day.getUTCDate() + 1);
  }
}

export function formatPeriod(period: string) {
  return periodFormat.format(new Date(`${period}-01T00:00:00Z`));
}

export function formatCutoff(cutoff: string) {
  return cutoffFormat.format(new Date(`${cutoff}T00:00:00Z`));
}

export function invoiceAccounting(invoice: Invoice) {
  if (invoice.accounting) return invoice.accounting;
  // Legacy sample invoices used the case's opening month as the original period.
  const period = localDate(new Date(invoice.opened)).slice(0, 7);
  return { originalPeriod: period, period };
}

export function applyMonthEnd(cases: Invoice[], now = new Date()) {
  const todayByEntity = new Map<Entity, string>();
  let changed = false;

  for (const invoice of cases) {
    const { originalPeriod, period: previousPeriod } = invoiceAccounting(invoice);
    let today = todayByEntity.get(invoice.entity);
    if (!today) {
      today = entityDay(now, invoice.entity);
      todayByEntity.set(invoice.entity, today);
    }
    const decisionDay = invoice.outcome && entityDay(new Date(invoice.outcome.when), invoice.entity);
    const pendingThrough = decisionDay && decisionDay < today ? decisionDay : today;
    let period = previousPeriod;

    for (let cutoff = approvalCutoff(period, invoice.entity); cutoff < pendingThrough; cutoff = approvalCutoff(period, invoice.entity)) {
      const next = cutoff.slice(0, 7);
      invoice.events.push({
        title: `Moved to ${formatPeriod(next)}`,
        who: "Month-end close",
        when: now.toISOString(),
        why: `The invoice was still awaiting final approval after the ${formatCutoff(cutoff)} cutoff for ${formatPeriod(period)}.`,
      });
      period = next;
    }

    if (!invoice.accounting || period !== previousPeriod) {
      invoice.accounting = { originalPeriod, period };
      changed = true;
    }
  }

  return changed;
}
