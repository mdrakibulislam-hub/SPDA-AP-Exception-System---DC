import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { CircleAlert, Paperclip, X } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { caseActionLabel, CaseDialog, ReassignInAp } from "./case-actions";
import { DialogActions, errorMessage, WorkspaceDialog } from "./dialog";
import { EvidenceLink } from "./evidence";
import { allowed, approvalProgress, ownerAway, roles, statuses, statusOf, type Action, type Invoice } from "./model";
import { approvalCutoff, formatCutoff, formatPeriod, invoiceAccounting } from "./month-end";
import { useWorkspace } from "./workspace";
import { invoiceIssueLabel } from "./presentation";
import "./case.css";

const timeFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const approvalActions: Action[] = ["coverage", "approve", "reject"];
const approvalOrder = ["budget", "head", "controller"] as const;
const reassignAction = { action: "assign" } as const;

function DesignIcon({ name, size = 16 }: { name: string; size?: number }) {
  return <span className="spda-case-icon" style={{ width: size, height: size }} aria-hidden="true"><img src={`/design/detail-${name}.svg`} alt="" /></span>;
}

function Fact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return <div className="spda-case-fact"><span className="spda-case-fact-icon"><DesignIcon name={icon} /></span><div><dt>{label}</dt><dd>{children}</dd></div></div>;
}

function supplierTimeline(invoice: Invoice) {
  return invoice.events.filter(event => event.title === "Exception opened"
    || event.title === "Supplier note added"
    || (event.title === "Evidence submitted" && event.who === "Supplier")
    || (/^Evidence requested/.test(event.title) && event.why.startsWith("Supplier:"))
    || event.title === "Bill rejected" || event.title === "Approval recorded");
}

function NoteDialog({ invoice, close }: { invoice: Invoice; close: () => void }) {
  const { role, commit } = useWorkspace();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const supplier = role === "supplier";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const note = String(new FormData(event.currentTarget).get("note") ?? "").trim();
    if (!note) { setError("Enter a note before continuing."); return; }
    setSaving(true);
    setError("");
    try {
      await commit(draft => {
        const current = draft.find(item => item.id === invoice.id);
        if (!current) throw new Error("This invoice is no longer available.");
        current.events.push({ title: supplier ? "Supplier note added" : "Internal note added", who: roles[role], when: new Date().toISOString(), why: note });
      });
      toast.success("Note added to the invoice.");
      close();
    } catch (failure) { setError(errorMessage(failure)); }
    finally { setSaving(false); }
  }

  return <WorkspaceDialog title={supplier ? "Add a note" : "Add internal note"} close={close}>
    <form onSubmit={save} className="spda-case-note-form">
      <p className="spda-muted">{invoice.supplier} · {invoice.ref}</p>
      <label className="spda-case-note-label">{supplier ? "Message to the accounts payable team" : "Internal note"}<textarea className="spda-textarea" name="note" autoFocus rows={5} required placeholder="Write your note here…" /></label>
      {error && <p className="spda-error" role="alert">{error}</p>}
      <DialogActions close={close} submit="Add note" disabled={saving} />
    </form>
  </WorkspaceDialog>;
}

export function CaseScreen({ invoiceId, reassign, closeReassignment }: { invoiceId: string; reassign?: boolean; closeReassignment: () => void }) {
  const { visible, role } = useWorkspace();
  const [dialog, setDialog] = useState<{ action: Action; draft?: string }>();
  const [noteOpen, setNoteOpen] = useState(false);
  const approvalHeading = useRef<HTMLHeadingElement>(null);
  const invoice = visible.find(item => item.id === invoiceId);
  const supplier = role === "supplier";

  if (!invoice) return <div className="spda-case-page"><div className="spda-case-unavailable">
    <h1>Invoice unavailable</h1><p>This invoice is outside the selected role’s queue or the link has changed.</p>
    <Link className="spda-button" to="/exceptions" search={{ status: role === "ap" || supplier ? "needs" : "assigned" }}>Open your queue</Link>
  </div></div>;

  const status = statusOf(invoice);
  const requests = invoice.requests.filter(request => !supplier || request.recipient === "Supplier");
  const pendingRequests = requests.filter(request => !request.proof);
  const canRequest = allowed(invoice, role, "request");
  const isAway = ownerAway(invoice);
  const canDecide = allowed(invoice, role, "approve");
  const currentDialog = dialog ?? (reassign && isAway && allowed(invoice, role, "assign") ? reassignAction : undefined);
  const accounting = invoiceAccounting(invoice);
  const cutoff = !invoice.outcome ? approvalCutoff(accounting.period, invoice.entity) : undefined;
  const progress = approvalProgress(invoice);
  const latestDecision = invoice.decisions.at(-1);
  const timeline = (supplier ? supplierTimeline(invoice) : invoice.events).toReversed();
  const initials = invoice.supplier.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const supplemental = (["coverage", "phone", "bank"] as Action[]).filter(action => allowed(invoice, role, action));

  function openAction(action: Action) {
    setDialog({ action });
  }

  return <div className="spda-case-page">
    <article className="spda-case-detail" data-supplier={supplier}>
      <Link to="/exceptions" search={{ status }} className="spda-case-back"><DesignIcon name="arrow-left02" />Back to queue</Link>
      <header className="spda-case-identity">
        <span className="spda-case-initials" aria-hidden="true">{initials}</span>
        <div className="spda-case-heading"><h1>{invoice.supplier}</h1><p>{invoice.ref === "Not found" ? "Invoice number unavailable" : `Invoice ${invoice.ref}`}</p></div>
        <span className="spda-case-amount"><span className="sr-only">Amount </span>{invoice.amount}</span>
      </header>

      <section className="spda-case-information" aria-label="Invoice information">
        <div className="spda-case-issue"><DesignIcon name="alert01" /><p>{invoice.type === "Approval delay" && !isAway && <strong>Original issue · </strong>}{invoice.issue}</p></div>
        <dl className="spda-case-metadata">
          <Fact icon="modern-tv-issue" label="Exception type">{invoiceIssueLabel(invoice)}</Fact>
          <Fact icon="calendar04" label="Accounting period">{formatPeriod(accounting.period)}</Fact>
          <Fact icon="clock01" label={cutoff ? "Approval cutoff" : "Invoice status"}>{cutoff ? <time dateTime={cutoff}>{formatCutoff(cutoff)}</time> : statuses[status]}</Fact>
          {!supplier && <>
            <Fact icon="location01" label="Entity">{invoice.entity}</Fact>
            <Fact icon="contact" label="Assigned to">{invoice.assignment ? <>{invoice.assignment.name}{isAway && <span className="spda-case-away"> · Away</span>}</> : invoice.outcome ? "Review complete" : "Not assigned"}</Fact>
            <Fact icon="ai-magic" label="Invoice reading confidence">{invoice.score}<span className="spda-muted">/1</span></Fact>
          </>}
        </dl>
      </section>

      <section className="spda-case-workflow" aria-labelledby="approval-heading">
        <h2 id="approval-heading" ref={approvalHeading} tabIndex={-1}>{supplier ? "Approval update" : "Approval workflow"}</h2>
        <ol className="spda-case-steps">
          {approvalOrder.map(step => {
            const entry = progress.find(item => item.step === step);
            const state = entry?.state ?? "not-required";
            const waiting = state === "active" && pendingRequests.length > 0;
            const label = state === "approved" ? "Approved" : state === "rejected" ? "Rejected" : state === "stopped" ? "Stopped" : state === "not-required" ? "Not required"
              : state === "active" && isAway ? "Approver away" : state === "active" && invoice.assignment?.stage === "coverage" ? "Coverage requested"
              : waiting ? "Requested evidence" : !invoice.assignment && step === "budget" && !invoice.outcome ? "Awaiting assignment" : "Awaiting decision";
            return <li key={step} data-state={state} data-waiting={waiting} aria-current={state === "active" ? "step" : undefined}>
              <span className="spda-case-step-icon" aria-hidden="true">{state === "rejected" || state === "stopped" ? <X size={22} /> : waiting ? <img src="/design/supplier-requested-evidence.svg" alt="" /> : <DesignIcon name={state === "approved" ? "check" : "hourglass"} size={24} />}</span>
              <div><span>{roles[step]}</span><strong>{label}</strong></div>
            </li>;
          })}
        </ol>
        {(latestDecision || invoice.outcome) && <div className="spda-case-decision-note" data-outcome={invoice.outcome?.status ?? latestDecision?.action}>
          <img className="spda-case-note-avatar" src="/design/detail-ellipse2.png" width={20} height={20} alt="" /><DesignIcon name="check-check" /><p>{invoice.outcome?.note ?? latestDecision?.note}</p>
        </div>}
        {isAway && !supplier && <p className="spda-case-status-note">Approval can continue once AP assigns an available budget owner.</p>}
        {supplier && !invoice.outcome && !pendingRequests.length && <p className="spda-case-status-note">{invoice.assignment ? "Your invoice is being reviewed. There are no documents waiting to be uploaded." : "Your invoice is waiting for review by the accounts payable team."}</p>}
        {!supplier && !invoice.assignment && !invoice.outcome && <p className="spda-case-status-note">Assign a budget owner to begin the approval workflow.</p>}
        {supplier && <div className="spda-actions spda-case-workflow-actions">
          {pendingRequests.length > 0 && <EvidenceLink requestId={pendingRequests[0]!.key} supplier label="Upload evidence" />}
          <Button className="spda-button" type="button" variant="outline" onClick={() => setNoteOpen(true)}><DesignIcon name="note-add" />Add note</Button>
        </div>}
        {!supplier && (canDecide || (isAway && role !== "ap")) && <div className="spda-actions spda-case-workflow-actions">
          {isAway && role !== "ap" && <ReassignInAp invoiceId={invoice.id} />}
          {canDecide && <><Button className="spda-button spda-button-primary" type="button" onClick={() => openAction("approve")}><DesignIcon name="action-approve" />Approve</Button><Button className="spda-button" type="button" variant="outline" onClick={() => openAction("reject")}><DesignIcon name="action-reject" />Reject</Button></>}
        </div>}
      </section>

      {!supplier && <div className="spda-actions spda-case-primary-actions">
        {allowed(invoice, role, "assign") && <Button className="spda-button" type="button" onClick={() => openAction("assign")}><DesignIcon name="contact" />{caseActionLabel("assign", invoice)}</Button>}
        {canRequest && <Button className="spda-button" type="button" variant="outline" onClick={() => openAction("request")}><DesignIcon name="ai-content-generator01" />Request evidence</Button>}
        <Button className="spda-button" type="button" variant="outline" onClick={() => setNoteOpen(true)}><DesignIcon name="note-add" />Add internal note</Button>
      </div>}

      {!supplier && (invoice.type === "Bank change" || supplemental.length > 0) && <section className="spda-case-verification" aria-label="Payment verification">
        <div><CircleAlert size={16} aria-hidden="true" /><p>{invoice.type === "Bank change" ? invoice.bank === "confirmed" ? "Bank change confirmed." : invoice.bank === "phone" ? "Payment on hold. The phone check is recorded and a second person must approve." : "Payment on hold. Call the known supplier contact before confirming new bank details." : "Record authorized delegation before reviewing this invoice on behalf of the budget owner."}</p></div>
        {supplemental.length > 0 && <div className="spda-actions">{supplemental.map(action => <Button className="spda-button" key={action} type="button" variant="outline" onClick={() => openAction(action)}>{caseActionLabel(action, invoice)}</Button>)}</div>}
      </section>}

      {requests.length > 0 && <section className="spda-case-documents" aria-labelledby="documents-heading">
        <h2 id="documents-heading">{supplier ? "Documents requested from you" : "Document requests and proof"}</h2>
        <ul>{requests.map(request => <li key={request.key}>
          <div className="spda-case-document-heading"><strong>{request.recipient}</strong><span data-submitted={!!request.proof}>{request.proof ? "Submitted" : "Waiting for evidence"}</span></div>
          <p>{request.reason}</p>
          {request.proof ? <><a className="spda-case-file" href={request.proof.data} download={request.proof.name}><Paperclip size={16} aria-hidden="true" />{request.proof.name}</a>{!supplier && <p className="spda-case-document-review">Document check · {request.proof.review}</p>}</> : <EvidenceLink requestId={request.key} supplier={supplier} label={supplier ? "Upload evidence" : "Preview upload form"} />}
        </li>)}</ul>
      </section>}

      <section className="spda-case-timeline" aria-labelledby="timeline-heading">
        <h2 id="timeline-heading">Decision timeline</h2>
        <ol>{timeline.map((event, index) => <li key={`${event.when}-${index}`}>
          <span className="spda-case-timeline-track" aria-hidden="true"><img src={`/design/detail-${index ? "ellipse5" : "ellipse3"}.svg`} alt="" /></span>
          <div className="spda-case-event">
            <img className="spda-case-event-avatar" src="/design/detail-ellipse4.png" width={56} height={56} alt="" />
            <div className="spda-case-event-body"><h3>{event.title}</h3><dl>
              <div><DesignIcon name="user02" /><dt>Who · </dt><dd>{event.who}</dd></div>
              <div><DesignIcon name="calendar5" /><dt>When · </dt><dd><time dateTime={event.when}>{timeFormat.format(new Date(event.when))}</time></dd></div>
              <div><DesignIcon name="note01" /><dt>Why · </dt><dd>{event.why}</dd></div>
              {!supplier && event.batch && <div><DesignIcon name="note01" /><dt>Batch · </dt><dd>{event.batch}</dd></div>}
            </dl></div>
          </div>
        </li>)}</ol>
      </section>

    </article>
    {currentDialog && <CaseDialog invoice={invoice} action={currentDialog.action} draft={dialog?.draft} close={() => { setDialog(undefined); if (reassign) closeReassignment(); }} restoreFocus={reassign || approvalActions.includes(currentDialog.action) ? () => approvalHeading.current : undefined} />}
    {noteOpen && <NoteDialog invoice={invoice} close={() => setNoteOpen(false)} />}
  </div>;
}
