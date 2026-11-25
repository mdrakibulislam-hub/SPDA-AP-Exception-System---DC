import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DialogActions, WorkspaceDialog, errorMessage } from "./dialog";
import { ownerOptions, taskCount, updateCase, type Action, type Invoice, type Recipient } from "./model";
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

  return <WorkspaceDialog title={title} close={close} restoreFocus={restoreFocus}>
    <form onSubmit={save}>
      <p className="spda-muted">{invoice.supplier} · {invoice.ref === "Not found" ? "No invoice number" : invoice.ref}</p>
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
