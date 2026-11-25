import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, Paperclip, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { caseActionLabel, caseActionOrder, CaseDialog, ReassignInAp } from "./case-actions";
import { EvidenceLink } from "./evidence";
import { activeRole, allowed, approvalProgress, evidenceDraft, followUp, nextStep, ownerAway, roles, statusOf, type Action } from "./model";
import { approvalCutoff, formatCutoff, formatPeriod, invoiceAccounting } from "./month-end";
import { StatusBadge, useWorkspace } from "./workspace";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const approvalActions: Action[] = ["coverage", "approve", "reject"];
const reassignAction = { action: "assign" } as const;
const stepLabels = { pending: "Pending", active: "Awaiting decision", approved: "Approved", rejected: "Rejected", stopped: "Stopped" };

export function CaseScreen({ invoiceId, reassign, closeReassignment }: { invoiceId: string; reassign?: boolean; closeReassignment: () => void }) {
  const { cases, visible, role, setRole } = useWorkspace();
  const [dialog, setDialog] = useState<{ action: Action; draft?: string }>();
  const approvalHeading = useRef<HTMLHeadingElement>(null);
  const invoice = visible.find(item => item.id === invoiceId);
  const supplier = role === "supplier";
  if (!invoice) return <>
    <h1 className="sr-only">Invoice unavailable</h1>
    <p className="spda-panel">This invoice is outside the selected role’s queue or the link has changed.</p>
    <Link className="spda-link-button" to="/exceptions" search={{ status: role === "ap" || supplier ? "needs" : "assigned" }}>Open your queue</Link>
  </>;

  const status = statusOf(invoice);
  const lastEvent = invoice.events.at(-1);
  const requests = invoice.requests.filter(request => !supplier || request.recipient === "Supplier");
  const waiting = requests.filter(request => !request.proof).length;
  const canRequest = allowed(invoice, role, "request");
  const reviewer = activeRole(invoice);
  const isAway = ownerAway(invoice);
  const canDecide = allowed(invoice, role, "approve");
  const currentDialog = dialog ?? (reassign && isAway && allowed(invoice, role, "assign") ? reassignAction : undefined);
  const accounting = invoiceAccounting(invoice);
  const cutoff = !invoice.outcome ? approvalCutoff(accounting.period, invoice.entity) : undefined;

  return (
    <>
      <Link to="/exceptions" search={{ status }} className="spda-back"><ArrowLeft size={16} aria-hidden="true" /> Back to queue</Link>
      <h1 className="sr-only">Invoice details for {invoice.supplier}</h1>
      <section className="spda-panel" aria-label="Invoice summary">
        <dl className="spda-case-facts">
          <div><dt>Supplier</dt><dd>{invoice.supplier}</dd></div>
          <div><dt>Invoice number</dt><dd>{invoice.ref}</dd></div>
          <div><dt>Amount</dt><dd>{invoice.amount}</dd></div>
          <div><dt>Status</dt><dd><StatusBadge status={status} /></dd></div>
          {!supplier && <>
            <div><dt>Accounting period</dt><dd>{formatPeriod(accounting.period)}</dd></div>
            {cutoff && <div><dt>Approval cutoff</dt><dd><time dateTime={cutoff}>{formatCutoff(cutoff)}</time></dd></div>}
          </>}
        </dl>
        {!supplier && accounting.period !== accounting.originalPeriod &&
          <p className="spda-muted">Moved from {formatPeriod(accounting.originalPeriod)} to {formatPeriod(accounting.period)} after a month-end cutoff.</p>}
      </section>
      {!supplier && <>
        <section className="spda-panel">
          <h2>Exception details</h2>
          <p>{invoice.type === "Approval delay" && !isAway && <strong>Original issue · </strong>}{invoice.issue}</p>
          <dl className="spda-case-facts">
            <div><dt>Entity</dt><dd>{invoice.entity}</dd></div>
            <div><dt>Exception type</dt><dd>{invoice.type}</dd></div>
            <div><dt>Invoice reading confidence</dt><dd>{invoice.score}</dd></div>
            {invoice.assignment && <div><dt>Assigned to</dt><dd>{invoice.assignment.name}{isAway ? " · away" : ""}</dd></div>}
          </dl>
          {invoice.type === "Bank change" && <div className="spda-bank-notice">
            <CircleAlert size={17} aria-hidden="true" />
            <span>{invoice.bank === "confirmed" ? "Bank change confirmed."
              : invoice.bank === "phone" ? "Payment on hold. The phone check is recorded and a second person must approve."
              : "Payment on hold for the bank change."}</span>
          </div>}
          <div className="spda-actions">
            {caseActionOrder.filter(action => !approvalActions.includes(action) && !(canDecide && action === "request") &&
              allowed(invoice, role, action)).map(action => (
              <Button type="button" key={action} variant={action === "assign" ? "default" : "outline"}
                onClick={() => setDialog({ action, draft: action === "request" && invoice.outcome?.status === "rejected" ? followUp[invoice.type] : undefined })}>
                {caseActionLabel(action, invoice)}
              </Button>
            ))}
          </div>
        </section>
        <section className="spda-panel" aria-labelledby="approval-heading">
          <h2 id="approval-heading" ref={approvalHeading} tabIndex={-1}>Approval workflow</h2>
          <ol className="spda-approval-steps">
            {approvalProgress(invoice).map(({ step, state, assignee }) => (
              <li key={step} aria-current={state === "active" ? "step" : undefined} data-state={state}>
                <strong>{roles[step]}</strong>
                <span>{state === "active" && isAway ? "Approver away" : state === "active" && invoice.assignment?.stage === "coverage"
                  ? "Coverage requested" : stepLabels[state]}</span>
                {assignee && <small>{assignee}</small>}
              </li>
            ))}
          </ol>
          {waiting > 0 && <p className="spda-muted">{waiting} evidence {waiting === 1 ? "request is" : "requests are"} waiting for a response.</p>}
          {isAway && <p className="spda-decision-effect">Approval can continue once AP assigns an available budget owner.</p>}
          <div className="spda-actions">
            {isAway && role !== "ap" && <ReassignInAp invoiceId={invoice.id} />}
            {reviewer && reviewer !== role && !isAway && <Button type="button" variant="outline" onClick={() => setRole(reviewer, invoice.id)}>
              Preview as {roles[reviewer].toLowerCase()}
            </Button>}
            {approvalActions.filter(action => allowed(invoice, role, action)).map(action => (
              <Button type="button" key={action} variant={action === "reject" ? "outline" : "default"} onClick={() => setDialog({ action })}>
                {caseActionLabel(action, invoice)}
              </Button>
            ))}
            {canDecide && <Button type="button" variant="outline" onClick={() => setDialog({ action: "request" })}>Request evidence</Button>}
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
      {currentDialog && <CaseDialog invoice={invoice} action={currentDialog.action} draft={dialog?.draft} close={() => {
        setDialog(undefined);
        if (reassign) closeReassignment();
      }} restoreFocus={reassign || approvalActions.includes(currentDialog.action) ? () => approvalHeading.current : undefined} />}
    </>
  );
}
