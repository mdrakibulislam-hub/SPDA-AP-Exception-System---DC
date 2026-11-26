import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@SPDA-AP-Exception-System---DC/ui/components/dropdown-menu";
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { caseActionLabel, caseActionOrder, CaseDialog, ReassignInAp } from "./case-actions";
import { DialogActions, WorkspaceDialog, errorMessage } from "./dialog";
import { EvidenceLink } from "./evidence";
import {
  activeRole, allowed, applyBulk, bulkKey, evidenceDraft, ownerAway, paymentRisk, planBulk, roles, statuses, statusOf,
  type Action, type BatchResult, type BulkAction, type BulkRow, type Invoice, type Recipient, type Role, type Status,
} from "./model";
import { approvalCutoff, formatCutoff, formatPeriod, invoiceAccounting } from "./month-end";
import { useWorkspace } from "./workspace";
import { invoiceIssueLabel, invoiceIssueSummary } from "./presentation";
import "./queue.css";

const actions: Record<BulkAction, [label: string, title: string, submit: string]> = {
  route: ["Route to owners", "Review bulk routing", "Send approval requests"],
  proof: ["Request evidence", "Review bulk evidence requests", "Create upload links"],
  note: ["Add internal note", "Review bulk note", "Save notes"],
};

class QueueChanged extends Error {
  constructor(readonly rows: BulkRow[]) {
    super("The queue changed while this was open. Review the updated preview before continuing.");
  }
}

function BulkDialog({ ids, action, close, done }: {
  ids: string[];
  action: BulkAction;
  close: () => void;
  done: (result: BatchResult) => void;
}) {
  const { cases, role, commit } = useWorkspace();
  const [recipient, setRecipient] = useState<Recipient>("Supplier");
  const [rows, setRows] = useState(() => planBulk(cases, action, ids, "Supplier"));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const ready = rows.filter(row => !row.skip);
  const [, title, submit] = actions[action];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || role !== "ap") return;
    const form = new FormData(event.currentTarget);
    const note = String(form.get("note") ?? "");
    setSaving(true);
    setError("");
    try {
      const result = await commit(draft => {
        const current = planBulk(draft, action, ids, recipient);
        if (bulkKey(current) !== bulkKey(rows)) throw new QueueChanged(current);
        return applyBulk(current, action, recipient, note, Object.fromEntries(current.map(({ invoice }) =>
          [invoice.id, drafts[invoice.id] ?? evidenceDraft(invoice)])));
      });
      done(result);
    } catch (failure) {
      if (failure instanceof QueueChanged) setRows(failure.rows);
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkspaceDialog title={title} close={close}>
      <form onSubmit={handleSubmit}>
        {action === "proof" ? <>
          <label className="spda-field">Send links to <select value={recipient} onChange={event => {
            const next = event.target.value as Recipient;
            setRecipient(next);
            setRows(planBulk(cases, action, ids, next));
            setError("");
          }}><option>Supplier</option><option>Second reviewer</option></select></label>
          <p className="spda-muted">Check the editable draft for each invoice. Each recipient gets a separate link.</p>
        </> : <>
          {action === "route" && <p className="spda-muted">Check the assignee and purchasing scope. Approval requirements and payment holds still apply.</p>}
          <label className="spda-field">{action === "route" ? "Assignment note (optional)" : "Internal note"}
            <textarea name="note" required={action === "note"} rows={3} />
          </label>
        </>}
        <p className="spda-preview-count" role="status">{ready.length} ready · {rows.length - ready.length} skipped</p>
        <ul className="spda-list spda-preview" tabIndex={0} aria-label="Invoice preview">
          {[...rows.filter(row => row.skip), ...ready].map(({ invoice, skip, owner, why }) => <li key={invoice.id}>
            <strong>{invoice.ref} · {invoice.supplier}</strong>
            {skip ? <p className="spda-muted">Skip · {skip}</p> : owner ? <p><strong>{owner.name}</strong> · {why}</p>
              : action === "proof" ? <label className="spda-field">Evidence request for {invoice.ref}
                <textarea required rows={3} value={drafts[invoice.id] ?? evidenceDraft(invoice)}
                  onChange={event => setDrafts({ ...drafts, [invoice.id]: event.target.value })} />
              </label> : <p className="spda-muted">Add to decision timeline</p>}
          </li>)}
        </ul>
        {error && <p className="spda-error" role="alert">{error}</p>}
        <DialogActions close={close} submit={submit} disabled={!ready.length || saving} />
      </form>
    </WorkspaceDialog>
  );
}

function BatchSummary({ result }: { result: BatchResult }) {
  const updated = result.rows.filter(row => !row.skip).length;
  return <details className="spda-panel spda-batch-result" open={result.action === "proof"}>
    <summary>Batch result · {updated} updated, {result.rows.length - updated} skipped</summary>
    <p className="spda-muted">Batch {result.code}</p>
    <ul className="spda-list">
      {result.rows.map(row => <li key={row.id}>
        <Link to="/exceptions/$invoiceId" params={{ invoiceId: row.id }}>{row.label}</Link>
        <p className="spda-muted">{row.skip ? `Skipped · ${row.skip}` : row.summary}</p>
        {row.key && <EvidenceLink requestId={row.key} />}
      </li>)}
    </ul>
  </details>;
}

type QueueTab = Status | "requested" | "pending" | "invoices";

const tabIcons: Record<QueueTab, string> = {
  needs: "alert02", assigned: "user-check01", requested: "ai-content-generator01",
  approved: "checkmark-circle02", rejected: "minus-sign-circle", pending: "alert02", invoices: "ai-content-generator01",
};

function matchesTab(invoice: Invoice, tab: QueueTab, role: Role) {
  if (tab === "requested") return invoice.requests.some(request => !request.proof && (role !== "supplier" || request.recipient === "Supplier"));
  if (tab === "pending") return !invoice.outcome && activeRole(invoice) !== role;
  if (tab === "invoices") return !invoice.outcome;
  if (tab === "assigned" && role !== "ap" && role !== "supplier") return !!invoice.assignment && activeRole(invoice) === role;
  return statusOf(invoice) === tab;
}

function QueueCard({ invoice, role, selected, select, openAction }: {
  invoice: Invoice;
  role: Role;
  selected: boolean;
  select: (checked: boolean) => void;
  openAction: (action: Action, trigger: HTMLButtonElement | null) => void;
}) {
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const primaryTrigger = useRef<HTMLButtonElement>(null);
  const initials = invoice.supplier.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const accounting = invoiceAccounting(invoice);
  const moved = accounting.period !== accounting.originalPeriod;
  const moveNote = [...invoice.events].reverse().find(event => event.who === "Month-end close")?.why
    ?? `Awaited final approval after ${formatCutoff(approvalCutoff(accounting.originalPeriod, invoice.entity))}.`;
  const isAway = ownerAway(invoice);
  const needsReassignment = isAway && role !== "ap" && role !== "supplier";
  const availableActions = caseActionOrder.filter(action => allowed(invoice, role, action));
  const primaryAction = availableActions.includes("approve") ? "approve" : availableActions.includes("assign") ? "assign" : availableActions[0];
  const otherActions = availableActions.filter(action => action !== primaryAction);
  const openRequest = role === "supplier" ? invoice.requests.find(request => request.recipient === "Supplier" && !request.proof) : undefined;
  const issue = invoice.type === "Approval delay" && !isAway ? "The original budget owner was unavailable." : invoiceIssueSummary(invoice);
  const context = invoice.outcome ? invoice.outcome.note : needsReassignment ? "Waiting for AP to reassign" : issue;

  return <li className="spda-queue-card" data-selected={selected}>
    <div className="spda-queue-avatar" data-selectable={role === "ap"}>
      <span aria-hidden="true">{initials}</span>
      {role === "ap" && <label className="spda-queue-check">
        <input type="checkbox" checked={selected} aria-label={`Select ${invoice.supplier} · ${invoice.ref}`} onChange={event => select(event.target.checked)} />
      </label>}
    </div>
    <div className="spda-queue-details">
      <h2 title={invoice.supplier}>{invoice.supplier}</h2>
      <p className="spda-queue-meta">
        <span>Invoice {invoice.ref}</span>
        <i aria-hidden="true" /><span>{invoice.entity}</span>
        {role !== "supplier" && <><i aria-hidden="true" /><span>AI score: {invoice.score}</span></>}
        {moved && <><i aria-hidden="true" /><span className="spda-queue-moved">Moved to {formatPeriod(accounting.period)}
          <span className="spda-queue-info" tabIndex={0} role="note" aria-label={`${moveNote} Accounting period: ${formatPeriod(accounting.period)}.`} title={moveNote}>
            <img src="/design/queue-card-info.svg" alt="" width={16} height={16} />
          </span>
        </span></>}
      </p>
      <div className="spda-queue-issue">
        <span className="spda-queue-type" data-type={invoice.type} data-risk={paymentRisk(invoice)}>{role === "supplier" ? statuses[statusOf(invoice)] : invoiceIssueLabel(invoice)}</span>
        <p title={context}>{role === "supplier" ? openRequest ? openRequest.reason : invoice.assignment ? `Assigned to ${invoice.assignment.name}` : invoice.outcome?.note ?? "Awaiting invoice review" : context}</p>
      </div>
    </div>
    <div className="spda-queue-tools">
      <span className="spda-queue-amount"><span className="sr-only">Amount </span>{invoice.amount}</span>
      <div className="spda-queue-card-actions">
        {needsReassignment ? <ReassignInAp invoiceId={invoice.id} /> : primaryAction ? <div className="spda-queue-split">
          <button ref={primaryTrigger} type="button" className="spda-queue-primary" onClick={() => openAction(primaryAction, primaryTrigger.current)}>
            {primaryAction === "assign" ? invoice.assignment ? "Reassign" : "Assign" : caseActionLabel(primaryAction, invoice)}
          </button>
          {otherActions.length > 0 && <DropdownMenu>
            <DropdownMenuTrigger ref={menuTrigger} className="spda-queue-more" aria-label={`More actions for ${invoice.supplier}`}>
              <img src="/design/queue-card-arrow-down01.svg" alt="" width={16} height={16} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="spda-queue-menu">
              {otherActions.map(action => <DropdownMenuItem key={action} variant={action === "reject" ? "destructive" : "default"} onClick={() => openAction(action, menuTrigger.current)}>
                {caseActionLabel(action, invoice)}
              </DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>}
        </div> : openRequest ? <Link className="spda-button spda-queue-upload" to="/evidence/$requestId" params={{ requestId: openRequest.key }}>Upload evidence</Link> : null}
        <Link className="spda-queue-view" to="/exceptions/$invoiceId" params={{ invoiceId: invoice.id }} aria-label={`View invoice for ${invoice.supplier}`}>
          <img src="/design/queue-card-view.svg" alt="" width={16} height={16} />
        </Link>
      </div>
    </div>
  </li>;
}

export function QueueScreen({ status }: { status: Status }) {
  const { role, visible, suggestedIds, setSuggestedIds, setRole } = useWorkspace();
  const search = useRouterState({ select: state => state.location.search as Record<string, unknown> });
  const query = typeof search.q === "string" ? search.q.trim().toLowerCase() : "";
  const reviewer = role !== "ap" && role !== "supplier";
  const [localTab, setLocalTab] = useState<QueueTab>(role === "supplier" && (status === "needs" || status === "assigned") ? "invoices" : reviewer && status === "needs" ? "assigned" : status);
  const activeTab = localTab;
  const [selected, setSelected] = useState(() => new Set(suggestedIds));
  const [operation, setOperation] = useState<{ action: BulkAction; ids: string[] }>();
  const [quickAction, setQuickAction] = useState<{ id: string; action: Action; trigger: HTMLButtonElement | null }>();
  const activeTabButton = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState<BatchResult>();
  const canSelect = role === "ap";
  const filtered = visible.filter(invoice => !query || `${invoice.supplier} ${invoice.ref} ${invoice.entity} ${invoice.type} ${invoice.issue}`.toLowerCase().includes(query));
  const shown = filtered.filter(invoice => matchesTab(invoice, activeTab, role));
  const selectedIds = shown.filter(invoice => selected.has(invoice.id)).map(invoice => invoice.id);
  const allSelected = shown.length > 0 && selectedIds.length === shown.length;
  const title = role === "ap" ? "Exceptions" : role === "supplier" ? "My invoices" : `${roles[role]} queue`;
  const actionInvoice = quickAction && visible.find(invoice => invoice.id === quickAction.id);
  const tabs: { value: QueueTab; label: string }[] = role === "supplier"
    ? [{ value: "invoices", label: "Invoices" }, { value: "requested", label: "Requested" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]
    : reviewer ? [{ value: "assigned", label: "Assigned" }, { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]
      : [{ value: "needs", label: "Needs Attention" }, { value: "assigned", label: "Assigned" }, { value: "requested", label: "Requested" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }];

  useEffect(() => {
    if (suggestedIds.length) setSuggestedIds([]);
  }, [suggestedIds, setSuggestedIds]);

  function handleResult(batch: BatchResult) {
    setResult(batch);
    setSelected(new Set());
    setOperation(undefined);
    toast.success(`Updated ${batch.rows.filter(row => !row.skip).length} of ${batch.rows.length} selected cases.`);
  }

  return <div className="spda-queue-screen">
    <h1 className="sr-only">{title}</h1>
    <nav className="spda-queue-tabs" aria-label="Invoice status">
      {tabs.map(tab => <button key={tab.value} type="button" ref={activeTab === tab.value ? activeTabButton : undefined}
        aria-current={activeTab === tab.value ? "page" : undefined} onClick={() => { setLocalTab(tab.value); setSelected(new Set()); }}>
        <img src={`/design/queue-tabs-${tabIcons[tab.value]}.svg`} alt="" width={16} height={16} />
        {tab.label}<span>{visible.filter(invoice => matchesTab(invoice, tab.value, role)).length}</span>
      </button>)}
    </nav>
    <div className="spda-queue-content">
      {result && canSelect && <BatchSummary key={result.code} result={result} />}
      {canSelect && shown.length > 0 && <div className="spda-queue-bulk" data-active={selectedIds.length > 0}>
        <label className="spda-queue-select-all">
          <input type="checkbox" aria-label={`Select all ${shown.length} visible invoices`} checked={allSelected}
            ref={element => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected; }}
            onChange={event => setSelected(new Set(event.target.checked ? shown.map(invoice => invoice.id) : []))} />
          <span role="status">{selectedIds.length ? `${selectedIds.length} selected` : "Select all"}</span>
        </label>
        {selectedIds.length > 0 && <div className="spda-actions" role="group" aria-label="Bulk actions">
          {(Object.keys(actions) as BulkAction[]).map(action => <button key={action} type="button" className="spda-button" onClick={() => setOperation({ action, ids: selectedIds })}>{actions[action][0]}</button>)}
        </div>}
      </div>}
      {shown.length ? <ul className="spda-queue-cards" aria-label={tabs.find(tab => tab.value === activeTab)?.label}>
        {shown.map(invoice => <QueueCard key={invoice.id} invoice={invoice} role={role} selected={canSelect && selected.has(invoice.id)}
          select={checked => setSelected(previous => { const next = new Set(previous); if (checked) next.add(invoice.id); else next.delete(invoice.id); return next; })}
          openAction={(action, trigger) => setQuickAction({ id: invoice.id, action, trigger })} />)}
      </ul> : <div className="spda-queue-empty">
        <p>{query ? `No invoices match “${String(search.q)}”.` : `No ${role === "supplier" ? "invoices" : "exceptions"} in this stage.`}</p>
        {reviewer && !visible.length && <Link className="spda-button" to="/exceptions" search={{ status: "needs" }} onClick={() => setRole("ap")}>Open AP queue</Link>}
      </div>}
    </div>
    {operation && <BulkDialog action={operation.action} ids={operation.ids} close={() => setOperation(undefined)} done={handleResult} />}
    {quickAction && actionInvoice && <CaseDialog invoice={actionInvoice} action={quickAction.action}
      draft={quickAction.action === "request" ? evidenceDraft(actionInvoice) : undefined}
      restoreFocus={() => quickAction.trigger?.isConnected ? quickAction.trigger : activeTabButton.current}
      close={() => setQuickAction(undefined)} />}
  </div>;
}
