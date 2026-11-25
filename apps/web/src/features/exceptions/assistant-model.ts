import {
  allowed, applyBulk, evidenceDraft, localDate, ownerOptions, paymentRisk,
  planBulk, statuses, statusOf, suggestedRouting, updateCase,
  type Invoice, type Recipient, type Role,
} from "./model";

export type AssistantCase = {
  id: string;
  title: string;
  detail: string;
};

type AssistantAction = { id: string } & (
  | { kind: "route"; ownerId: string }
  | { kind: "proof"; recipient: Recipient }
  | { kind: "note"; note: string }
);

export type ActionReview = {
  actions: AssistantAction[];
  rows: AssistantCase[];
  version: string;
};

export type AssistantReply = {
  text: string;
  cases?: AssistantCase[];
  review?: ActionReview;
  suggestions?: string[];
};

export type ActionReceipt = AssistantCase & { evidenceKey?: string };

type AssistantContext = {
  cases: Invoice[];
  visible: Invoice[];
  role: Role;
  recentIds: string[];
  currentId?: string;
  now?: Date;
};

const routeVerb = "(?:route|assign|send|take|move|reassign)";
const actionVerb = `${routeVerb}|request|ask for|add|note`;
const statementBreak = new RegExp(
  `[;\\n]+|[, ]+\\b(?:and then|then)\\s+|(?:,\\s*|\\s+and\\s+)(?=(?:${actionVerb})\\b)`,
  "i",
);
const routePattern = new RegExp(`^${routeVerb}\\s+(.+?)\\s+to\\s+(.+)$`, "i");
const actionPattern = new RegExp(`^(?:${actionVerb})\\b`, "i");
const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;
const invoiceName = (invoice: Invoice) => `${invoice.ref === "Not found" ? "" : `${invoice.ref} · `}${invoice.supplier}`;
const proofDraft = (invoice: Invoice, recipient: Recipient) => recipient === "Supplier"
  ? evidenceDraft(invoice)
  : `Please independently review ${invoiceName(invoice)} and share supporting evidence. ${invoice.issue}`;

function caseSummary(invoice: Invoice): AssistantCase {
  return {
    id: invoice.id,
    title: invoiceName(invoice),
    detail: `${statuses[statusOf(invoice)]} · ${invoice.type}. ${invoice.issue}`,
  };
}

function stripRequestPrefix(text: string) {
  return text.trim().replace(/^(?:(?:please|(?:can|could|would) you|i want you to)\s+)+/i, "");
}

function resolveCases(text: string, context: AssistantContext) {
  const recent = context.recentIds.flatMap(id => context.visible.filter(invoice => invoice.id === id));
  const reference = (part: string) => {
    const name = normalize(part.replace(/^(?:the )?(?:case|invoice)\s+(?=.)/i, ""));
    if (/^(?:this|current)(?: case| invoice)?$/.test(name)) {
      return context.visible.find(invoice => invoice.id === context.currentId);
    }
    if (/^(?:that(?: one| case| invoice)?|it)$/.test(name)) return recent.length === 1 ? recent[0] : undefined;

    const exact = context.visible.filter(invoice =>
      [invoice.id, invoice.ref, invoice.supplier].some(value => normalize(value) === name));
    if (exact.length === 1) return exact[0];

    const number = /^(\d+)$/.exec(name);
    const ordinal = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"].indexOf(name);
    if (number) return recent[Number(number[1]) - 1];
    if (ordinal >= 0) return recent[ordinal];

    const prefix = context.visible.filter(invoice => name.length >= 3 && normalize(invoice.supplier).startsWith(name));
    return prefix.length === 1 ? prefix[0] : undefined;
  };

  if (/^(?:all|all of them|all (?:listed |these )?(?:cases|invoices)|these|those|them)$/.test(normalize(text))) {
    if (!recent.length) throw new Error("Ask for a list of exceptions first, or name the invoices you want to update.");
    return recent;
  }
  const single = reference(text);
  if (single) return [single];

  const parts = text.split(/\s*,\s*|\s+and\s+/i).filter(Boolean);
  const matched = parts.map(part => {
    const invoice = reference(part);
    if (!invoice) throw new Error(`I couldn’t match “${part}” to one invoice. Use its reference, supplier name, or number in the latest list.`);
    return invoice;
  });
  return [...new Map(matched.map(invoice => [invoice.id, invoice])).values()];
}

function splitActions(input: string) {
  return input.split(statementBreak).flatMap(statement => {
    const command = stripRequestPrefix(statement);
    const route = routePattern.exec(command);
    if (!route) return command ? [command] : [];
    const [firstOwner, ...more] = route[2]!.split(/\s*(?:,|\band\b)\s*(?=[^,]+?\s+to\s+)/i);
    return [`route ${route[1]} to ${firstOwner}`, ...more.map(group => `route ${group}`)];
  });
}

function parseActions(input: string, context: AssistantContext): AssistantAction[] {
  if (/^(?:route|assign)(?:\s+the)?\s+suggested(?:\s+(?:cases|invoices))?[.!?]?$/i.test(input)) {
    return suggestedRouting(context.visible).flatMap(invoice => {
      const owner = ownerOptions(invoice, context.cases).suggested;
      return owner ? [{ id: invoice.id, kind: "route", ownerId: owner.id }] : [];
    });
  }

  return splitActions(input).flatMap((statement): AssistantAction[] => {
    const route = routePattern.exec(statement);
    if (route) {
      const destination = normalize(route[2]!).replace(/^(?:the|its)\s+/, "").replace(/\s+for (?:approval|review)$/, "");
      return resolveCases(route[1]!, context).map(invoice => {
        const { available, suggested } = ownerOptions(invoice, context.cases);
        const owner = /^(?:(?:suggested|recommended|available)(?: budget)?(?: owner)?|budget owner)$/.test(destination)
          ? suggested
          : available.find(option =>
            [option.name, option.name.replace(/\bbudget\s+/, ""), option.id].some(name => normalize(name) === destination));
        if (!owner) {
          const options = available.map(option => option.name).join(", ");
          throw new Error(`${invoiceName(invoice)} needs an available owner in ${invoice.scope}. ${options ? `Available owners: ${options}.` : "There are no available owners in this scope. Open the case to request Finance coverage."}`);
        }
        return { id: invoice.id, kind: "route", ownerId: owner.id };
      });
    }

    const proof = /^(?:request|ask for)\s+(?:more\s+)?(?:proof|evidence|documents?)\s+(?:for|on)\s+(.+?)(?:\s+from\s+(?:the\s+)?(supplier|(?:a\s+)?second reviewer))?[.!?]?$/i.exec(statement);
    if (proof) {
      const recipient: Recipient = /second reviewer/i.test(proof[2] ?? "") ? "Second reviewer" : "Supplier";
      return resolveCases(proof[1]!, context).map(invoice => ({ id: invoice.id, kind: "proof", recipient }));
    }

    const note = /^(?:add\s+(?:an?\s+)?(?:internal\s+)?note\s+(?:to|for|on)|note)\s+(.+?):\s*(.+)$/i.exec(statement);
    if (note) {
      const content = note[2]!.trim().replace(/^["“](.+)["”]$/, "$1");
      if (content) return resolveCases(note[1]!, context).map(invoice => ({ id: invoice.id, kind: "note", note: content }));
    }

    throw new Error("Try “Route #1 to the suggested owner”, “Request evidence for #2”, or “Add a note to #3: Check the delivery record”. You can combine requests with “then”.");
  });
}

function reviewActions(cases: Invoice[], role: Role, actions: AssistantAction[]): ActionReview {
  if (role !== "ap") throw new Error("The AP specialist view can route invoices, request evidence, and add notes.");
  if (!actions.length) throw new Error("There are no cases ready for suggested routing.");

  const seen = new Set<string>();
  const versions: unknown[] = [];
  const rows = actions.map(action => {
    const key = `${action.kind}:${action.id}`;
    if (seen.has(key)) throw new Error("An invoice has two instructions for the same action. Specify one instruction per invoice and action.");
    seen.add(key);

    const invoice = cases.find(item => item.id === action.id);
    if (!invoice) throw new Error("An invoice is no longer in the workspace.");
    const title = invoiceName(invoice);
    const version = { key, assignment: invoice.assignment, outcome: invoice.outcome, bank: invoice.bank };
    versions.push(version);

    if (action.kind === "route") {
      const owner = ownerOptions(invoice, cases).available.find(option => option.id === action.ownerId);
      if (!allowed(invoice, role, "assign") || !owner || invoice.assignment?.owner === owner.id) {
        throw new Error(`${title} can’t be routed to that owner in its current stage.`);
      }
      return { id: invoice.id, title, detail: `Route to ${owner.name} · ${owner.scope}${paymentRisk(invoice) ? ". Payment risk still needs review." : ""}` };
    }
    if (action.kind === "proof") {
      const [row] = planBulk(cases, "proof", [action.id], action.recipient);
      if (row?.skip) throw new Error(`${title} already has an open evidence request for this recipient.`);
      const draft = proofDraft(invoice, action.recipient);
      versions.push(draft);
      return { id: invoice.id, title, detail: `Request evidence from ${action.recipient.toLowerCase()}. ${draft}` };
    }
    return { id: invoice.id, title, detail: `Add internal note · ${action.note}` };
  });
  return { actions, rows, version: JSON.stringify(versions) };
}

export function applyAssistantReview(cases: Invoice[], role: Role, review: ActionReview): ActionReceipt[] {
  if (reviewActions(cases, role, review.actions).version !== review.version) {
    throw new Error("The queue changed after you reviewed these actions. Ask again to see the latest details.");
  }
  return review.actions.map((action, index) => {
    const row = review.rows[index]!;
    if (action.kind === "route") {
      const detail = updateCase(cases, action.id, role, "assign", { owner: action.ownerId, note: "Routed from the AP assistant.", recipient: "Supplier" });
      return { ...row, detail };
    }

    const recipient = action.kind === "proof" ? action.recipient : "Supplier";
    const planned = planBulk(cases, action.kind, [action.id], recipient);
    const note = action.kind === "note" ? action.note : "";
    const reasons = action.kind === "proof" ? { [action.id]: proofDraft(planned[0]!.invoice, recipient) } : {};
    const [result] = applyBulk(planned, action.kind, recipient, note, reasons).rows;
    return { ...row, detail: result!.summary!, evidenceKey: result!.key };
  });
}

function weeklyInsight(context: AssistantContext, now: Date) {
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  const from = localDate(start);
  const to = localDate(now);
  const inWeek = (date: string) => {
    const day = localDate(new Date(date));
    return day >= from && day <= to;
  };
  const opened = context.visible.filter(invoice => inWeek(invoice.opened));
  const resolved = context.visible.filter(invoice => invoice.outcome && inWeek(invoice.outcome.when));
  const routed = context.visible.filter(invoice =>
    invoice.events.some(event => inWeek(event.when) && /^Approval requested/.test(event.title)));
  const risks = context.visible.filter(paymentRisk);
  const open = context.visible.filter(invoice => !invoice.outcome);
  const byType = opened.reduce((groups, invoice) => groups.set(invoice.type, (groups.get(invoice.type) ?? 0) + 1), new Map<string, number>());
  const leading = [...byType].sort((first, second) => second[1] - first[1]);
  const format = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
  return [
    `Last 7 days · ${format.format(start)} – ${format.format(now)}`,
    `• ${count(opened.length, "exception")} opened${leading.length ? ` (${leading.map(([type, total]) => `${type} × ${total}`).join(", ")})` : ""}.`,
    `• ${count(routed.length, "invoice")} routed for approval and ${count(resolved.length, "invoice")} resolved.`,
    `• ${open.length} open now, including ${count(risks.length, "payment risk")} to review.`,
  ].join("\n");
}

export function answerAssistant(input: string, context: AssistantContext): AssistantReply {
  const message = stripRequestPrefix(input);
  const query = normalize(message);
  const now = context.now ?? new Date();
  const open = context.visible.filter(invoice => !invoice.outcome);

  try {
    if (actionPattern.test(message)) {
      const review = reviewActions(context.cases, context.role, parseActions(message, context));
      return { text: `Review ${count(review.rows.length, "action")} before applying.`, review };
    }

    if (/\b(?:last|past|previous) (?:7|seven) days\b|\b(?:last week|weekly)\b/.test(query)) {
      return { text: weeklyInsight(context, now) };
    }

    if (/\b(?:suggest|recommend|show)\b.*\b(?:route|routing|owner|owners)\b|\bwho should\b.*\b(?:own|handle|review)\b/.test(query)) {
      if (context.role !== "ap") return { text: "Routing suggestions are available in the AP specialist view." };
      const ready = suggestedRouting(context.visible);
      return {
        text: ready.length ? `${count(ready.length, "case")} ready for budget-owner review.` : "There are no cases ready for suggested routing.",
        cases: ready.map(invoice => ({
          id: invoice.id,
          title: invoiceName(invoice),
          detail: ownerOptions(invoice, context.cases).suggested!.name,
        })),
        suggestions: ready.length ? ["Route suggested cases"] : undefined,
      };
    }

    if (/\btoday\b|\b(?:summary|summery|summari[sz]e|list|exceptions?|issues?|queue|backlog|pending|needs? attention)\b/.test(query)) {
      if (/\btoday\b/.test(query)) {
        const today = context.visible.filter(invoice => localDate(new Date(invoice.opened)) === localDate(now));
        const listed = [...new Set([...today, ...open])];
        return {
          text: `${count(today.length, "exception")} opened today. ${count(open.length, "case")} currently open.`,
          cases: listed.map(invoice => {
            const summary = caseSummary(invoice);
            return today.includes(invoice) ? { ...summary, detail: `Opened today · ${summary.detail}` } : summary;
          }),
        };
      }
      return {
        text: `${count(open.length, "open exception")} in your queue.`,
        cases: open.map(caseSummary),
      };
    }

    return {
      text: context.role === "ap"
        ? "Ask about today’s exceptions, the open queue, or the last 7 days. To change a case, try “Route #1 to the suggested owner” or “Request evidence for #2”. Numbers refer to the latest list."
        : "Ask about today’s exceptions, the open queue, or the last 7 days in your view.",
    };
  } catch (error) {
    return { text: error instanceof Error ? error.message : "I couldn’t prepare that request. Try again using the invoice reference." };
  }
}
