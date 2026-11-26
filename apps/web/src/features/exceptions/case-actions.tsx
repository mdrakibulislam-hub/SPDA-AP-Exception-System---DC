import { useNavigate, useRouter } from "@tanstack/react-router";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { DialogActions, WorkspaceDialog, errorMessage } from "./dialog";
import { EvidenceRequestToast } from "./evidence";
import { nextApprovalStep, ownerOptions, roles, taskCount, updateCase, type Action, type Invoice, type Recipient } from "./model";
import { useWorkspace } from "./workspace";

const actions: Record<Action, [label: string, title: string, description: string, submit: string]> = {
  assign: ["Assign", "Assign a Budget Owner", "", "Add Assignee"],
  request: ["Request evidence", "Request for evidence", "Create a link for the person who needs to upload evidence.", "Request"],
  approve: ["Approve", "Approve this bill", "", "Approve the bill"],
  reject: ["Reject", "Reject this bill", "This moves the case to Rejected and makes your reason available to AP for follow-up.", "Reject the bill"],
  coverage: ["Record authorized coverage", "Record authorized coverage", "Record the reference that authorizes the controller to act as budget owner.", "Confirm delegation"],
  phone: ["Log phone check", "Log supplier phone check", "Call the supplier contact already on file and record what they confirmed.", "Record phone check"],
  bank: ["Approve bank change", "Approve the bank change", "Review the separate phone check and give a reason for confirming the change.", "Confirm bank change"],
};
export const caseActionOrder: Action[] = ["assign", "coverage", "approve", "reject", "request", "phone", "bank"];

export function caseActionLabel(action: Action, invoice: Invoice) {
  return action === "assign" && invoice.assignment ? "Change assignee" : actions[action][0];
}

export function ReassignInAp({ invoiceId }: { invoiceId: string }) {
  const { setRole } = useWorkspace();
  const navigate = useNavigate();
  return <button type="button" className="spda-button" onClick={() => {
    setRole("ap", invoiceId);
    void navigate({ to: "/exceptions/$invoiceId", params: { invoiceId }, search: { reassign: true } });
  }}>Reassign in AP</button>;
}

export function CaseDialog({ invoice, action, draft, close, restoreFocus }: {
  invoice: Invoice;
  action: Action;
  draft?: string;
  close: () => void;
  restoreFocus?: () => HTMLElement | null;
}) {
  const { cases, role, commit } = useWorkspace();
  const router = useRouter();
  const { available, suggested, workload } = ownerOptions(invoice, cases);
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expectedAssignment] = useState(invoice.assignment);
  const [recipient, setRecipient] = useState<Recipient>("Supplier");
  const [followUpAction, setFollowUpAction] = useState("");
  const ownerListId = useId();
  const noteId = useId();
  const searchInput = useRef<HTMLInputElement>(null);
  const filtered = available.filter(item => `${item.name} ${item.scope}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selectedOwner = available.find(item => item.id === owner);
  const assign = action === "assign";
  const [, title, description, submit] = actions[action];
  const next = nextApprovalStep(invoice);
  const initials = invoice.supplier.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const reasonLabel = assign ? "Note for Assignee" : action === "request" ? `Note for the ${recipient.toLowerCase()}*`
    : action === "approve" ? "Approval reason*" : action === "reject" ? "Rejection reason*" : "Reason*";
  const placeholder = assign ? "Add Note for Assignee" : action === "request" ? `Add note for the ${recipient.toLowerCase()}`
    : action === "approve" ? "Write down the approval reason here..." : action === "reject" ? "Write down the rejection reason here..." : "Add a reason...";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const fields = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const note = String(fields.get("note") ?? "").trim();
      const decisionNote = action === "reject" && followUpAction && note ? `${note}\nSuggested action: ${followUpAction}` : note;
      const result = await commit(current => updateCase(current, invoice.id, role, action, {
        note: decisionNote, recipient, owner, expectedAssignment,
      }));
      if (result.requestId) {
        const path = router.buildLocation({ to: "/evidence/$requestId", params: { requestId: result.requestId } }).href;
        const url = new URL(path, window.location.href).href;
        toast.custom(id => <EvidenceRequestToast url={url} supplier={invoice.supplier} dismiss={() => toast.dismiss(id)} />,
          { position: "bottom-center", duration: 10_000 });
      } else toast.success(result.message);
      close();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSaving(false);
    }
  }

  return <WorkspaceDialog title={title} close={close} restoreFocus={restoreFocus}>
    <form className="spda-case-form" data-action={action} onSubmit={save}>
      {!assign && action !== "request" && <div className="spda-dialog-invoice">
        <span className="spda-dialog-avatar" aria-hidden="true">{initials}</span>
        <div><p title={invoice.supplier}>{invoice.supplier}</p><span>{invoice.ref === "Not found" ? "No invoice number" : `Invoice ${invoice.ref}`}</span></div>
      </div>}
      {assign ? <>
        <div className="spda-owner-picker" onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOwnerOpen(false);
        }}>
          <div className="spda-owner-search">
            <img src="/design/assign-search01.svg" width={16} height={16} alt="" />
            <input ref={searchInput} className="spda-input" role="combobox" aria-label="Search budget owners" aria-expanded={ownerOpen}
              aria-controls={ownerListId} aria-autocomplete="list" value={ownerOpen ? search : selectedOwner?.name ?? ""}
              placeholder="Search Budget Owner..." onFocus={() => setOwnerOpen(true)}
              onChange={event => { setSearch(event.target.value); setOwner(""); setOwnerOpen(true); }}
              onKeyDown={event => {
                if (event.key === "Escape" && ownerOpen) { event.preventDefault(); event.stopPropagation(); setOwnerOpen(false); }
                if (event.key === "ArrowDown") {
                  event.preventDefault(); setOwnerOpen(true);
                  document.getElementById(ownerListId)?.querySelector<HTMLButtonElement>("button")?.focus();
                }
              }} />
          </div>
          {ownerOpen && <div id={ownerListId} className="spda-owner-options" role="listbox" aria-label="Available budget owners">
            <p>Available in {invoice.scope}</p>
            {filtered.length ? filtered.map(item => <button key={item.id} type="button" role="option" aria-selected={owner === item.id}
              onClick={() => { setOwner(item.id); setSearch(""); searchInput.current?.focus(); setOwnerOpen(false); }}
              onKeyDown={event => {
                const options = Array.from(document.getElementById(ownerListId)?.querySelectorAll<HTMLButtonElement>("button") ?? []);
                const current = options.indexOf(event.currentTarget);
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  options[(current + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length]?.focus();
                }
                if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); searchInput.current?.focus(); setOwnerOpen(false); }
              }}>
              <span className="spda-owner-avatar" aria-hidden="true">{item.name.split(" ").slice(0, 2).map(part => part[0]).join("")}</span>
              <span><strong>{item.name}</strong><small>{item.scope} <i /> {taskCount(workload(item))}</small></span>
              {item.id === suggested?.id && <span className="spda-owner-suggested">Suggested</span>}
            </button>) : <p className="spda-owner-no-results">No matching available owners.</p>}
          </div>}
        </div>
        {!available.length && <p className="spda-dialog-hint">No available budget owner in this scope. Request authorized Finance coverage.</p>}
      </> : action === "approve" || action === "reject" ? <div className="spda-decision-effect">
        <img src={`/design/${action}-info.svg`} alt="" width={16} height={16} />
        <p>{action === "reject" ? description : next ? `After your approval it gets sent to the ${roles[next].toLowerCase()} for the next approval.`
          : "This records the final approval and moves the case to Approved."}
          {action === "approve" && invoice.type === "Bank change" && invoice.bank !== "confirmed" && " The payment hold remains until the bank change is verified."}</p>
      </div> : action !== "request" && <p className="spda-dialog-hint">{description}</p>}
      <div className="spda-modal-field">
        <div className="spda-note-label">{action === "request" ? <>
          <span aria-hidden="true">Note for the&nbsp;</span>
          <select className="spda-note-recipient" aria-label="Evidence recipient" data-recipient={recipient} value={recipient} onChange={event => setRecipient(event.target.value as Recipient)}>
            <option value="Supplier">supplier</option><option value="Second reviewer">second reviewer</option>
          </select>
          <span aria-hidden="true">*</span>
          <label className="sr-only" htmlFor={noteId}>{reasonLabel}</label>
        </> : <label htmlFor={noteId}>{reasonLabel}</label>}</div>
        <span className="spda-note-input"><img src={`/design/${assign ? "assign" : action === "approve" || action === "reject" ? action : "request"}-note01.svg`} width={16} height={16} alt="" />
          <textarea id={noteId} className="spda-textarea" name="note" required={!assign} rows={4} defaultValue={action === "request" ? "" : draft} placeholder={placeholder} />
        </span>
      </div>
      {action === "reject" && <label className="spda-modal-field">Suggested action
        <select className="spda-select" value={followUpAction} onChange={event => setFollowUpAction(event.target.value)}>
          <option value="">Select an action for this rejection</option>
          <option value="Ask for more evidence">Ask for more evidence</option>
          <option value="Blacklist the supplier">Blacklist the supplier</option>
          <option value="Suggest a brief discussion">Suggest a brief discussion</option>
        </select>
      </label>}
      {error && <p className="spda-error" role="alert">{error}</p>}
      <DialogActions close={close} submit={assign && !available.length ? "Request controller coverage" : saving ? "Saving…" : submit}
        disabled={saving || (assign && available.length > 0 && !selectedOwner)} destructive={action === "reject"} />
    </form>
  </WorkspaceDialog>;
}
