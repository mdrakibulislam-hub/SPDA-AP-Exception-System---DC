import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, Paperclip, Sparkles } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DialogActions, WorkspaceDialog, errorMessage } from "./dialog";
import { EvidenceLink } from "./evidence";
import {
  allowed, evidenceDraft, followUp, nextStep, ownerAway, ownerOptions, statusOf, taskCount,
  updateCase, type Action, type Invoice, type Recipient,
} from "./model";
import { PageTitle, StatusBadge, useWorkspace } from "./workspace";

const actions: Record<Action, [label: string, title: string, description: string, submit: string]> = {
  assign: ["Assign budget owner", "Assign a budget owner", "", "Send approval request"],
  request: ["Request evidence", "Request supporting evidence", "Create one link for the person who needs to upload proof.", "Create link"],
  approve: ["Approve", "Approve this bill", "Record what was checked or resolved.", "Record approval"],
  reject: ["Reject", "Reject this bill", "Explain why the bill was rejected so AP can follow up.", "Record rejection"],
  coverage: ["Record authorized coverage", "Record authorized coverage", "Record the reference that shows who delegated this budget to the controller.", "Confirm delegation"],
  phone: ["Log phone check", "Log supplier phone check", "Use a known supplier contact and record what they confirmed.", "Record phone check"],
  bank: ["Approve bank change", "Approve the bank change", "Review the separate phone check and give a reason for confirming the change.", "Confirm bank change"],
};
const actionOrder: Action[] = ["assign", "coverage", "approve", "reject", "request", "phone", "bank"];
const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

function CaseDialog({ invoice, action, draft, close }: { invoice: Invoice; action: Action; draft?: string; close: () => void }) {
  const { cases, role, commit } = useWorkspace();
  const { primary, available, suggested, workload } = ownerOptions(invoice, cases);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState(suggested?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const filtered = available.filter(item => `${item.name} ${item.scope}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = filtered.some(item => item.id === owner) ? owner : filtered[0]?.id ?? "";
  const assign = action === "assign";
  const [, title, description, submit] = actions[action];

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const message = await commit(current => updateCase(current, invoice.id, role, action, {
        note: String(fields.get("note") ?? ""),
        recipient: (fields.get("recipient") ?? "Supplier") as Recipient,
        owner: selected,
      }));
      toast.success(message);
      close();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return <WorkspaceDialog title={title} close={close}>
    <form onSubmit={save}>
      {assign ? <>
        <p className="spda-muted">Scope · {invoice.scope}</p>
        <p>{suggested ? <>
          <strong>{suggested.name}</strong> · {suggested === primary ? "Owner for this budget" : `Suggested backup with the same scope and ${taskCount(workload(suggested))}.`}
        </> : "No budget owner in this scope is available. Ask Finance to document authorized coverage."}</p>
        {available.length > 0 && <>
          <label className="spda-field">Search budget owners <input type="search" value={search} onChange={event => setSearch(event.target.value)}
            placeholder="Search by name or scope" /></label>
          <label className="spda-field">Budget owner <select value={selected} onChange={event => setOwner(event.target.value)} required>
            {filtered.length ? filtered.map(item => <option key={item.id} value={item.id}>{item.name} · {taskCount(workload(item))}</option>)
              : <option value="">No matching owners</option>}
          </select></label>
        </>}
      </> : <p className="spda-muted">{description}</p>}
      {action === "request" && <label className="spda-field">Send link to <select name="recipient"><option>Supplier</option><option>Second reviewer</option></select></label>}
      <label className="spda-field">{assign ? "Assignment note (optional)" : action === "request" ? "What proof do you need?" : "Reason"}
        <textarea name="note" required={!assign} rows={4} defaultValue={draft} />
      </label>
      {error && <p className="spda-error" role="alert">{error}</p>}
      <DialogActions close={close} submit={assign && !available.length ? "Request controller coverage" : submit}
        disabled={saving || (assign && available.length > 0 && !selected)} />
    </form>
  </WorkspaceDialog>;
}

export function CaseScreen({ invoiceId }: { invoiceId: string }) {
  const { cases, visible, role } = useWorkspace();
  const [dialog, setDialog] = useState<{ action: Action; draft?: string }>();
  const invoice = visible.find(item => item.id === invoiceId);
  const supplier = role === "supplier";
  if (!invoice) return <>
    <PageTitle title="Invoice unavailable" description="This invoice is outside the selected role’s queue or the link has changed." />
    <Link className="spda-link-button" to="/exceptions" search={{ status: role === "ap" || supplier ? "needs" : "assigned" }}>Open your queue</Link>
  </>;

  const status = statusOf(invoice);
  const lastEvent = invoice.events.at(-1);
  const requests = invoice.requests.filter(request => !supplier || request.recipient === "Supplier");
  const waiting = requests.filter(request => !request.proof).length;
  const canRequest = allowed(invoice, role, "request");

  return (
    <>
      <Link to="/exceptions" search={{ status }} className="spda-back"><ArrowLeft size={16} aria-hidden="true" /> Back to queue</Link>
      <PageTitle title={`${invoice.ref} · ${invoice.amount}`} description={invoice.supplier} actions={<StatusBadge status={status} />} />
      {!supplier && <>
        <section className="spda-panel">
          <h2>Exception details</h2>
          <p>{invoice.issue}</p>
          <dl className="spda-case-facts">
            <div><dt>Entity</dt><dd>{invoice.entity}</dd></div>
            <div><dt>Exception type</dt><dd>{invoice.type}</dd></div>
            <div><dt>Invoice reading confidence</dt><dd>{invoice.score}</dd></div>
            {invoice.assignment && <div><dt>Assigned to</dt><dd>{invoice.assignment.name}{ownerAway(invoice) ? " · away" : ""}</dd></div>}
          </dl>
          {invoice.type === "Bank change" && <div className="spda-bank-notice">
            <CircleAlert size={17} aria-hidden="true" />
            <span>{invoice.bank === "confirmed" ? "Bank change confirmed."
              : invoice.bank === "phone" ? "Payment on hold. The phone check is recorded and a second person must approve."
              : "Payment on hold for the bank change."}</span>
          </div>}
          <div className="spda-actions">
            {actionOrder.filter(action => allowed(invoice, role, action)).map(action => (
              <Button type="button" key={action} variant={["assign", "approve", "coverage"].includes(action) ? "default" : "outline"}
                onClick={() => setDialog({ action, draft: action === "request" && invoice.outcome?.status === "rejected" ? followUp[invoice.type] : undefined })}>
                {action === "assign" && invoice.assignment ? "Change budget owner" : actions[action][0]}
              </Button>
            ))}
          </div>
        </section>
        <details className="spda-panel spda-assist">
          <summary><Sparkles size={16} aria-hidden="true" /> AI case summary</summary>
          <dl>
            <dt>What needs checking</dt><dd>{invoice.issue}</dd>
            <dt>Latest timeline entry</dt><dd>{lastEvent?.title} · {lastEvent?.who}<br />{lastEvent?.why}</dd>
            <dt>Evidence</dt><dd>{requests.length - waiting} submitted · {waiting} waiting</dd>
            <dt>Suggested next step</dt><dd>{nextStep(invoice, cases, role)}</dd>
          </dl>
          {canRequest && <Button type="button" variant="outline" onClick={() => setDialog({ action: "request", draft: evidenceDraft(invoice) })}>Draft evidence request</Button>}
        </details>
        {invoice.outcome && <section className="spda-panel">
          <h2>{status === "approved" ? "Resolution note" : "Why it was rejected"}</h2>
          <p>{invoice.outcome.note}</p>
          {status === "rejected" && <p><strong>Suggested follow-up</strong> · {followUp[invoice.type]}</p>}
        </section>}
      </>}
      {requests.length > 0 && <section className="spda-panel">
        <h2>{supplier ? "Documents requested from you" : "Document requests and proof"}</h2>
        <ul className="spda-list spda-documents">
          {requests.map(request => <li key={request.key}>
            <strong>{request.recipient} · {request.proof ? "Submitted" : "Waiting for proof"}</strong>
            <p>{request.reason}</p>
            {request.proof ? <>
              <a className="spda-file-link" href={request.proof.data} download={request.proof.name}>
                <Paperclip size={16} aria-hidden="true" />{request.proof.name}
              </a>
              {!supplier && <p className="spda-muted"><strong>Document check preview</strong> · {request.proof.review}</p>}
            </> : <EvidenceLink requestId={request.key} supplier={supplier} />}
          </li>)}
        </ul>
      </section>}
      {supplier && !requests.length && <div className="spda-panel spda-empty">There are no document requests for this invoice.</div>}
      {!supplier && <section className="spda-panel">
        <h2>Decision timeline</h2>
        <ol className="spda-timeline">
          {invoice.events.toReversed().map((event, index) => <li key={`${event.when}-${index}`}>
            <strong>{event.title}</strong>
            <p className="spda-muted">Who · {event.who}</p>
            <p className="spda-muted">When · <time dateTime={event.when}>{timeFormat.format(new Date(event.when))}</time></p>
            {event.batch && <p className="spda-muted">Batch · {event.batch}</p>}
            <p>Why · {event.why}</p>
          </li>)}
        </ol>
      </section>}
      {dialog && <CaseDialog invoice={invoice} action={dialog.action} draft={dialog.draft} close={() => setDialog(undefined)} />}
    </>
  );
}
