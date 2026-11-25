import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, CircleAlert, Paperclip, Sparkles } from "lucide-react";
import { useState } from "react";

import { caseActionLabel, caseActionOrder, CaseDialog } from "./case-actions";
import { EvidenceLink } from "./evidence";
import { allowed, evidenceDraft, followUp, nextStep, ownerAway, statusOf, type Action } from "./model";
import { StatusBadge, useWorkspace } from "./workspace";

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function CaseScreen({ invoiceId }: { invoiceId: string }) {
  const { cases, visible, role } = useWorkspace();
  const [dialog, setDialog] = useState<{ action: Action; draft?: string }>();
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
        </dl>
      </section>
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
            {caseActionOrder.filter(action => allowed(invoice, role, action)).map(action => (
              <Button type="button" key={action} variant={["assign", "approve", "coverage"].includes(action) ? "default" : "outline"}
                onClick={() => setDialog({ action, draft: action === "request" && invoice.outcome?.status === "rejected" ? followUp[invoice.type] : undefined })}>
                {caseActionLabel(action, invoice)}
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
