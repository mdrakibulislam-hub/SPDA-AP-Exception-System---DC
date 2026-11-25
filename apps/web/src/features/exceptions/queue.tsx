import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@SPDA-AP-Exception-System---DC/ui/components/dropdown-menu";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { caseActionLabel, caseActionOrder, CaseDialog } from "./case-actions";
import { DialogActions, WorkspaceDialog, errorMessage } from "./dialog";
import { EvidenceLink } from "./evidence";
import {
  allowed, applyBulk, bulkKey, evidenceDraft, ownerAway, paymentRisk, planBulk, roles, statuses, statusOf,
  type Action, type BatchResult, type BulkAction, type BulkRow, type Invoice, type Recipient, type Role, type Status,
} from "./model";
import { approvalCutoff, formatCutoff, formatPeriod, invoiceAccounting } from "./month-end";
import { useWorkspace } from "./workspace";
import "./queue.css";

const supplierPhotos = import.meta.glob<string>("./suppliers/*.webp", { eager: true, query: "?url", import: "default" });

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

function QueueCard({ invoice, role, selected, select, openAction }: {
  invoice: Invoice;
  role: Role;
  selected: boolean;
  select: (checked: boolean) => void;
  openAction: (action: Action, trigger: HTMLButtonElement | null) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const photo = supplierPhotos[`./suppliers/${invoice.id}.webp`];
  const initials = invoice.supplier.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const quickActions = caseActionOrder.filter(action => allowed(invoice, role, action));
  const showIssue = role !== "supplier";
  const accounting = invoiceAccounting(invoice);
  const cutoff = !invoice.outcome ? approvalCutoff(accounting.period, invoice.entity) : undefined;

  return <li className="spda-queue-card" data-selected={selected}>
    <div className="spda-queue-identity">
      {role === "ap" && <label className="spda-check spda-queue-check">
        <input type="checkbox" checked={selected} aria-label={`Select ${invoice.supplier} · ${invoice.ref}`}
          onChange={event => select(event.target.checked)} />
      </label>}
      <span className="spda-queue-photo" aria-hidden="true">
        {initials}
        {photo && <img src={photo} alt="" width={144} height={144} onError={event => { event.currentTarget.hidden = true; }} />}
      </span>
      <div className="spda-queue-details">
        <h2>{invoice.supplier}</h2>
        <p className="spda-queue-meta">
          <span>{invoice.ref === "Not found" ? "No invoice number" : `Invoice ${invoice.ref}`}</span>
          <span>{invoice.entity}</span>
        </p>
        {showIssue && <>
          <p className="spda-queue-meta">
            {accounting.period === accounting.originalPeriod
              ? <span>Accounting period · {formatPeriod(accounting.period)}</span>
              : <span className="spda-queue-type">Moved to {formatPeriod(accounting.period)}</span>}
            {cutoff && <span>Approve by <time dateTime={cutoff}>{formatCutoff(cutoff)}</time></span>}
          </p>
          <div className="spda-queue-issue">
            <span className="spda-queue-type" data-risk={paymentRisk(invoice)}>{invoice.type}</span>
            <p>{invoice.issue}</p>
          </div>
          {invoice.assignment && <p className="spda-queue-context"><strong>Assigned to</strong> {invoice.assignment.name}{ownerAway(invoice) ? " · away" : ""}</p>}
          {invoice.outcome && <p className="spda-queue-context"><strong>Decision note</strong> {invoice.outcome.note}</p>}
        </>}
      </div>
    </div>
    <div className="spda-queue-tools">
      <span className="spda-amount"><span className="sr-only">Amount </span>{invoice.amount}</span>
      <div className="spda-queue-card-actions">
        {quickActions.length > 0 && <DropdownMenu>
          <DropdownMenuTrigger ref={trigger} render={<Button type="button" variant="outline" />} className="spda-queue-quick"
            aria-label={`Quick actions for ${invoice.supplier}`}>
            Quick actions <ChevronDown size={15} aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="spda-queue-menu">
            {quickActions.map(action => <DropdownMenuItem key={action} onClick={() => openAction(action, trigger.current)}>
              {caseActionLabel(action, invoice)}
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>}
        <Link className="spda-link-button" to="/exceptions/$invoiceId" params={{ invoiceId: invoice.id }}
          aria-label={`View invoice for ${invoice.supplier}`}>
          View <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </div>
  </li>;
}

export function QueueScreen({ status }: { status: Status }) {
  const { role, visible, suggestedIds, setSuggestedIds } = useWorkspace();
  const [selected, setSelected] = useState(() => new Set(suggestedIds));
  const [operation, setOperation] = useState<{ action: BulkAction; ids: string[] }>();
  const [quickAction, setQuickAction] = useState<{ id: string; action: Action; trigger: HTMLButtonElement | null }>();
  const activeStatusLink = useRef<HTMLAnchorElement>(null);
  const [result, setResult] = useState<BatchResult>();
  const shown = visible.filter(invoice => statusOf(invoice) === status);
  const canSelect = role === "ap";
  const selectedIds = shown.filter(invoice => selected.has(invoice.id)).map(invoice => invoice.id);
  const allSelected = shown.length > 0 && selectedIds.length === shown.length;
  const title = role === "ap" ? "Exceptions" : role === "supplier" ? "My invoices" : `${roles[role]} queue`;
  const actionInvoice = quickAction && visible.find(invoice => invoice.id === quickAction.id);

  useEffect(() => {
    if (suggestedIds.length) setSuggestedIds([]);
  }, [suggestedIds, setSuggestedIds]);

  function handleResult(batch: BatchResult) {
    setResult(batch);
    setSelected(new Set());
    setOperation(undefined);
    const updated = batch.rows.filter(row => !row.skip).length;
    toast.success(`Updated ${updated} of ${batch.rows.length} selected cases.`);
  }

  return (
    <>
      <h1 className="sr-only">{title}</h1>
      <nav className="spda-status-nav" aria-label="Invoice status">
        {Object.entries(statuses).map(([value, label]) => <Link key={value} to="/exceptions" search={{ status: value as Status }}
          activeOptions={{ exact: true }} aria-current={status === value ? "page" : undefined} ref={status === value ? activeStatusLink : undefined}>
          {label}<span>{visible.filter(invoice => statusOf(invoice) === value).length}</span>
        </Link>)}
      </nav>
      {result && canSelect && <BatchSummary key={result.code} result={result} />}
      {shown.length ? <section className="spda-queue" aria-label={statuses[status]}>
        {canSelect && <div className="spda-bulk">
          <label className="spda-check">
            <input type="checkbox" aria-label={`Select all cases in ${statuses[status]}`} checked={allSelected}
              ref={element => { if (element) element.indeterminate = selectedIds.length > 0 && !allSelected; }}
              onChange={event => setSelected(new Set(event.target.checked ? shown.map(invoice => invoice.id) : []))} />
            <span role="status">{selectedIds.length ? `${selectedIds.length} selected` : `Select all ${shown.length}`}</span>
          </label>
          <div className="spda-actions" role="group" aria-label="Bulk actions">
            {(Object.keys(actions) as BulkAction[]).map(action => <Button key={action} type="button" variant="outline"
              disabled={!selectedIds.length} onClick={() => setOperation({ action, ids: selectedIds })}>{actions[action][0]}</Button>)}
          </div>
        </div>}
        <ul className="spda-queue-cards spda-list" role="list">
          {shown.map(invoice => <QueueCard key={invoice.id} invoice={invoice} role={role}
            selected={canSelect && selected.has(invoice.id)}
            select={checked => setSelected(previous => {
              const next = new Set(previous);
              if (checked) next.add(invoice.id);
              else next.delete(invoice.id);
              return next;
            })}
            openAction={(action, trigger) => setQuickAction({ id: invoice.id, action, trigger })} />)}
        </ul>
      </section> : <div className="spda-panel spda-empty">No {role === "supplier" ? "invoices" : "exceptions"} in this stage.</div>}
      {operation && <BulkDialog action={operation.action} ids={operation.ids} close={() => setOperation(undefined)} done={handleResult} />}
      {quickAction && actionInvoice && <CaseDialog invoice={actionInvoice} action={quickAction.action}
        draft={quickAction.action === "request" ? evidenceDraft(actionInvoice) : undefined}
        restoreFocus={() => quickAction.trigger?.isConnected ? quickAction.trigger : activeStatusLink.current}
        close={() => setQuickAction(undefined)} />}
    </>
  );
}
