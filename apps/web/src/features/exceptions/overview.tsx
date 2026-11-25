import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";

import { allowed, nextStep, ownerAway, ownerOptions, paymentRisk, suggestedRouting } from "./model";
import { useWorkspace } from "./workspace";

export function OverviewScreen() {
  const { cases, role, visible, setSuggestedIds } = useWorkspace();
  if (role === "supplier") return <>
    <h1 className="sr-only">AI overview</h1>
    <Link to="/exceptions" search={{ status: "needs" }} className="spda-link-button">Open My invoices</Link>
  </>;

  const active = visible.filter(invoice => !invoice.outcome);
  const groups = [
    { title: "Payment risks to check", items: visible.filter(paymentRisk) },
    { title: "Approver coverage", items: active.filter(invoice => invoice.assignment?.stage === "coverage"
      || ownerAway(invoice) || (!invoice.assignment && ownerOptions(invoice, cases).available.length === 0)) },
    { title: "Evidence to follow up", items: active.filter(invoice => invoice.requests.length > 0) },
    { title: "Awaiting your decision", items: active.filter(invoice => allowed(invoice, role, "approve")) },
  ].filter(group => group.items.length > 0);
  const ready = role === "ap" ? suggestedRouting(cases) : [];

  return (
    <>
      <h1 className="sr-only">AI overview</h1>
      {ready.length > 0 && <section className="spda-panel spda-assist">
        <h2><Sparkles size={17} aria-hidden="true" /> Suggested bulk routing · {ready.length}</h2>
        <p>These invoices need attention and have an available budget owner. Review the selection before routing.</p>
        <Link to="/exceptions" search={{ status: "needs" }} className="spda-link-button"
          onClick={() => setSuggestedIds(ready.map(invoice => invoice.id))}>Review suggested cases <ArrowRight size={15} aria-hidden="true" /></Link>
      </section>}
      {groups.map(({ title, items }) => <section className="spda-panel" key={title}>
        <h2>{title} · {items.length}</h2>
        <ul className="spda-list spda-overview-list">
          {items.map(invoice => <li key={invoice.id}>
            <Link to="/exceptions/$invoiceId" params={{ invoiceId: invoice.id }}>
              <strong>{invoice.ref} · {invoice.supplier}</strong>
              <span className="spda-amount">{invoice.amount}</span>
              <small>{nextStep(invoice, cases, role)}</small>
            </Link>
          </li>)}
        </ul>
      </section>)}
      {!groups.length && <div className="spda-panel spda-empty">No payment, coverage, or evidence follow-ups surfaced in this view.</div>}
    </>
  );
}
