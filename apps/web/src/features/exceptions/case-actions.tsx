import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DialogActions, WorkspaceDialog, errorMessage } from "./dialog";
import { EvidenceLink } from "./evidence";
import { nextApprovalStep, ownerOptions, roles, taskCount, updateCase, type Action, type Invoice, type Recipient } from "./model";
import { useWorkspace } from "./workspace";

const actions: Record<Action, [label: string, title: string, description: string, submit: string]> = {
  assign: ["Assign budget owner", "Assign a budget owner", "", "Send approval request"],
  request: ["Request evidence", "Request supporting evidence", "Create one link for the person who needs to upload proof.", "Create link"],
  approve: ["Approve", "Approve this bill", "Record what was checked or resolved.", "Record approval"],
  reject: ["Reject", "Reject this bill", "Explain why the bill was rejected so AP can follow up.", "Record rejection"],
  coverage: ["Record authorized coverage", "Record authorized coverage", "Record the reference that shows who delegated this budget to the controller.", "Confirm delegation"],
  phone: ["Log phone check", "Log supplier phone check", "Use a known supplier contact and record what they confirmed.", "Record phone check"],
  bank: ["Approve bank change", "Approve the bank change", "Review the separate phone check and give a reason for confirming the change.", "Confirm bank change"],
};
export const caseActionOrder: Action[] = ["assign", "coverage", "approve", "reject", "request", "phone", "bank"];

export function caseActionLabel(action: Action, invoice: Invoice) {
  return action === "assign" && invoice.assignment ? "Change budget owner" : actions[action][0];
}

export function ReassignInAp({ invoiceId }: { invoiceId: string }) {
  const { setRole } = useWorkspace();
  const navigate = useNavigate();
  return <Button type="button" variant="outline" onClick={() => {
    setRole("ap", invoiceId);
    void navigate({ to: "/exceptions/$invoiceId", params: { invoiceId }, search: { reassign: true } });
  }}>Reassign in AP</Button>;
}

export function CaseDialog({ invoice, action, draft, close, restoreFocus }: {
  invoice: Invoice;
  action: Action;
  draft?: string;
  close: () => void;
  restoreFocus?: () => HTMLElement | null;
}) {
  const { cases, role, commit } = useWorkspace();
  const { primary, available, suggested, workload } = ownerOptions(invoice, cases);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState(suggested?.id ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expectedAssignment] = useState(invoice.assignment);
  const [created, setCreated] = useState<{ requestId: string; recipient: Recipient }>();
  const filtered = available.filter(item => `${item.name} ${item.scope}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = filtered.some(item => item.id === owner) ? owner : filtered[0]?.id ?? "";
  const assign = action === "assign";
  const [, title, description, submit] = actions[action];
  const next = nextApprovalStep(invoice);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const recipient = (fields.get("recipient") ?? "Supplier") as Recipient;
      const result = await commit(current => updateCase(current, invoice.id, role, action, {
        note: String(fields.get("note") ?? ""),
        recipient,
        owner: selected,
        expectedAssignment,
      }));
      if (result.requestId) {
        setCreated({ requestId: result.requestId, recipient });
      } else {
        toast.success(result.message);
        close();
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return <WorkspaceDialog title={created ? "Evidence request created" : title} close={close} restoreFocus={restoreFocus}>
    {created ? <div className="spda-request-receipt">
      <p role="status">The request for the {created.recipient.toLowerCase()} is ready. Open the upload page to try it or copy the request link.</p>
      <EvidenceLink requestId={created.requestId} label="Open evidence upload page" />
      <p className="spda-muted">Prototype links work in this browser profile.</p>
      <div className="spda-actions spda-dialog-actions"><Button type="button" autoFocus onClick={close}>Done</Button></div>
    </div> : <form onSubmit={save}>
      <p className="spda-muted">{invoice.supplier} · {invoice.ref === "Not found" ? "No invoice number" : invoice.ref}
        {(action === "approve" || action === "reject") && ` · ${invoice.amount}`}
      </p>
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
      {action === "approve" && <p className="spda-decision-effect">
        {next ? `This records your approval and hands the case to the ${roles[next].toLowerCase()}.`
          : "This records the final approval and moves the case to Approved."}
        {invoice.type === "Bank change" && invoice.bank !== "confirmed" && " The payment hold remains until the bank change is verified."}
      </p>}
      {action === "reject" && <p className="spda-decision-effect">This moves the case to Rejected and makes your reason available to AP for follow-up.</p>}
      {action === "request" && <label className="spda-field">Send link to <select name="recipient"><option>Supplier</option><option>Second reviewer</option></select></label>}
      <label className="spda-field">{assign ? "Assignment note (optional)" : action === "request" ? "What proof do you need?"
        : action === "approve" ? "Approval reason" : action === "reject" ? "Rejection reason" : "Reason"}
        <textarea name="note" required={!assign} rows={4} defaultValue={draft} />
      </label>
      {error && <p className="spda-error" role="alert">{error}</p>}
      <DialogActions close={close} submit={assign && !available.length ? "Request controller coverage" : submit}
        disabled={saving || (assign && available.length > 0 && !selected)} destructive={action === "reject"} />
    </form>}
  </WorkspaceDialog>;
}
