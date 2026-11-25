import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DialogActions, WorkspaceDialog, errorMessage } from "./dialog";
import { EvidenceLink } from "./evidence";
import {
  applyBulk, bulkKey, evidenceDraft, planBulk, roles, statuses, statusOf,
  type BatchResult, type BulkAction, type BulkRow, type Recipient, type Status,
} from "./model";
import { PageTitle, useWorkspace } from "./workspace";

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

export function QueueScreen({ status }: { status: Status }) {
  const { role, visible, suggestedIds, setSuggestedIds } = useWorkspace();
  const [selected, setSelected] = useState(() => new Set(suggestedIds));
  const [operation, setOperation] = useState<{ action: BulkAction; ids: string[] }>();
  const [result, setResult] = useState<BatchResult>();
  const shown = visible.filter(invoice => statusOf(invoice) === status);
  const canSelect = role === "ap";
  const selectedIds = shown.filter(invoice => selected.has(invoice.id)).map(invoice => invoice.id);
  const allSelected = shown.length > 0 && selectedIds.length === shown.length;
  const title = role === "ap" ? "Exceptions" : role === "supplier" ? "My invoices" : `${roles[role]} queue`;

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
      <PageTitle title={title} description={role === "supplier" ? "Track the status of your sample invoice and open requests." : "Check what is holding each invoice and route the next step."} />
      <nav className="spda-status-nav" aria-label="Invoice status">
        {Object.entries(statuses).map(([value, label]) => <Link key={value} to="/exceptions" search={{ status: value as Status }}
          activeOptions={{ exact: true }} aria-current={status === value ? "page" : undefined}>
          {label}<span>{visible.filter(invoice => statusOf(invoice) === value).length}</span>
        </Link>)}
      </nav>
      {result && canSelect && <BatchSummary key={result.code} result={result} />}
      {shown.length ? <section className="spda-panel spda-queue">
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
        <ul className="spda-list spda-case-list">
          {shown.map(invoice => <li key={invoice.id}>
            {canSelect && <label className="spda-check spda-check-row">
              <input type="checkbox" checked={selected.has(invoice.id)} aria-label={`Select ${invoice.supplier} · ${invoice.ref}`}
                onChange={event => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(invoice.id);
                  else next.delete(invoice.id);
                  setSelected(next);
                }} />
            </label>}
            <Link to="/exceptions/$invoiceId" params={{ invoiceId: invoice.id }} className="spda-case-row">
              <div>
                <strong>{invoice.ref}</strong>
                <p>{invoice.supplier}</p>
                {role !== "supplier" && <small>{invoice.outcome?.note || invoice.assignment?.name || invoice.issue}</small>}
              </div>
              <span className="spda-amount">{invoice.amount}</span>
              <span className="spda-row-open"><ArrowUpRight size={16} aria-hidden="true" /></span>
            </Link>
          </li>)}
        </ul>
      </section> : <div className="spda-panel spda-empty">No {role === "supplier" ? "invoices" : "exceptions"} in this stage.</div>}
      {operation && <BulkDialog action={operation.action} ids={operation.ids} close={() => setOperation(undefined)} done={handleResult} />}
    </>
  );
}
