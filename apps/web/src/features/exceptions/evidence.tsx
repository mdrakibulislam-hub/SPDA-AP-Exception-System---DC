import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import { Check, Copy, FileText, Link2, X } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { errorMessage } from "./dialog";
import { attachEvidence, findEvidence, readProof, validateProofFile } from "./model";
import { useWorkspace } from "./workspace";
import { invoiceIssueLabel } from "./presentation";
import "./evidence.css";

export function EvidenceRequestToast({ url, supplier, dismiss }: { url: string; supplier: string; dismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); }
    catch { setShowLink(true); }
  }
  return <div className="spda-request-toast" role="status" aria-label="Evidence request created">
    <span className="spda-request-toast-icon" aria-hidden="true"><Link2 size={20} /></span>
    <div className="spda-request-toast-copy">
      <div><a href={url} target="_blank" rel="noopener" aria-label="Open evidence upload page" title={url}>{url.replace(/^https?:\/\//, "")}</a>
        <button type="button" onClick={copy} aria-label={copied ? "Request link copied" : "Copy request link"}>{copied ? <Check size={14} /> : <Copy size={14} />}</button></div>
      <p title={supplier}>{copied ? "Request link copied" : supplier}</p>
      {showLink && <input aria-label="Request link" readOnly value={url} autoFocus onFocus={event => event.currentTarget.select()} />}
    </div>
    <button className="spda-request-toast-close" type="button" onClick={dismiss} aria-label="Dismiss evidence request confirmation"><X size={14} /></button>
  </div>;
}

export function EvidenceLink({ requestId, supplier = false, label }: { requestId: string; supplier?: boolean; label?: string }) {
  const router = useRouter();
  const [showLink, setShowLink] = useState(false);
  const path = router.buildLocation({ to: "/evidence/$requestId", params: { requestId } }).href;
  const url = new URL(path, window.location.href).href;

  async function copy() {
    try { await navigator.clipboard.writeText(url); toast.success("Request link copied."); }
    catch { setShowLink(true); }
  }

  return <div className="spda-evidence-link-group">
    <div className="spda-actions">
      <Link className={`spda-button spda-evidence-open${supplier ? " spda-evidence-open-primary" : ""}`} to="/evidence/$requestId" params={{ requestId }} target="_blank" rel="noopener">
        <span className="spda-evidence-link-icon" aria-hidden="true"><img src="/design/supplier-upload-small.svg" alt="" /></span>
        {label ?? (supplier ? "Upload evidence" : "Preview upload form")}
      </Link>
      {!supplier && <Button className="spda-button" type="button" variant="outline" onClick={copy}><Copy size={16} aria-hidden="true" />Copy request link</Button>}
    </div>
    {showLink && <label className="spda-evidence-copy-label">Request link<input className="spda-input" readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>}
  </div>;
}

export function EvidenceScreen({ requestId }: { requestId: string }) {
  const { cases, commit } = useWorkspace();
  const match = findEvidence(cases, requestId);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const fileId = useId();

  function choose(next: File | null) {
    setError(""); setFile(null); setProgress(0);
    if (!next) return;
    try { validateProofFile(next); setFile(next); }
    catch (failure) {
      if (input.current) input.current.value = "";
      setError(errorMessage(failure));
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!match || !file || submitting) return;
    setError(""); setSubmitting(true); setProgress(15);
    try {
      const proof = await readProof(file, match.invoice);
      setProgress(80);
      await commit(draft => attachEvidence(draft, requestId, proof));
      setProgress(100);
      toast.success("Evidence submitted.");
    } catch (failure) { setError(errorMessage(failure)); setProgress(0); }
    finally { setSubmitting(false); }
  }

  const initials = match?.invoice.supplier.match(/[\p{L}\p{N}]+/gu)?.slice(0, 2).map(word => word[0]).join("").toUpperCase();
  const requester = match?.invoice.events.findLast(event => /^Evidence requested/.test(event.title)
    && event.why === `${match.request.recipient}: ${match.request.reason}`)?.who;

  return <main className="spda-evidence-page">
    <div className="spda-evidence-content">
      <div className="spda-evidence-brand"><img src="/design/supplier-upload-attachment.svg" alt="" /><span>SPDA Supply</span></div>
      <section className="spda-evidence-card" aria-labelledby="evidence-title">
        {match ? <>
          <h1 id="evidence-title">{match.request.proof ? "Evidence received" : "Upload evidence"}</h1>
          <div className="spda-evidence-identity">
            <span className="spda-evidence-initials" aria-hidden="true">{initials}</span>
            <div><h2>{match.invoice.supplier}</h2><div className="spda-evidence-invoice-meta">
              <span>{match.invoice.ref === "Not found" ? "Invoice number unavailable" : `Invoice ${match.invoice.ref}`}</span>
              <span className="spda-evidence-type">{match.invoice.type === "Bank change" && <img src="/design/supplier-upload-bank.svg" alt="" />}{match.invoice.type === "Bank change" ? "Bank AC Change" : invoiceIssueLabel(match.invoice)}</span>
            </div></div>
          </div>
          <div className="spda-evidence-request"><h2>{requester ? `Requested by ${requester}` : "Supporting evidence requested"}</h2><p>{match.request.reason}</p></div>
          {match.request.proof ? <div className="spda-evidence-receipt" role="status">
            <span className="spda-evidence-receipt-icon"><Check size={24} aria-hidden="true" /></span>
            <div><h2>Document received</h2><p>Your evidence is attached to the invoice and ready for review.</p><a href={match.request.proof.data} download={match.request.proof.name}><FileText size={16} aria-hidden="true" />{match.request.proof.name}</a></div>
          </div> : <form onSubmit={upload} className="spda-evidence-form">
            <div className="spda-evidence-file-field">
              <label htmlFor={fileId} className="spda-evidence-field-title">Choose a file</label>
              <label className="spda-evidence-dropzone" htmlFor={fileId} data-dragging={dragging} data-disabled={submitting}
                onDragOver={event => { event.preventDefault(); if (!submitting) setDragging(true); }}
                onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
                onDrop={event => {
                  event.preventDefault(); setDragging(false);
                  if (submitting) return;
                  if (event.dataTransfer.files.length > 1) { choose(null); setError("Choose one file for this evidence request."); return; }
                  choose(event.dataTransfer.files[0] ?? null);
                }}>
                <input id={fileId} ref={input} className="spda-evidence-file-input" type="file" name="file" accept=".txt,.pdf,.jpg,.jpeg,.png" disabled={submitting} aria-describedby="evidence-file-help" onChange={event => choose(event.target.files?.[0] ?? null)} />
                <span className="spda-evidence-upload-icon" aria-hidden="true"><img src="/design/supplier-upload-upload01.svg" alt="" /></span>
                <span className="spda-evidence-drop-copy"><strong>Drag or click to upload the file</strong><span>Choose one supporting document for this invoice</span></span>
                <span className="spda-button spda-evidence-browse">Browse File</span>
              </label>
              <p className="spda-evidence-file-help" id="evidence-file-help">TXT, PDF, JPG, or PNG up to 1 MB.</p>
            </div>
            {file && <div className="spda-evidence-selected-file" role="status">
              <FileText size={20} aria-hidden="true" /><div><strong>{file.name}</strong><span>{Math.max(1, Math.ceil(file.size / 1024))} KB · {submitting ? "Preparing evidence…" : "Ready to submit"}</span></div>
              <Button className="spda-button" type="button" variant="ghost" size="icon" aria-label="Remove file" disabled={submitting} onClick={() => { if (input.current) input.current.value = ""; choose(null); input.current?.focus(); }}><X size={16} aria-hidden="true" /></Button>
            </div>}
            {submitting && <div className="spda-evidence-progress"><progress max={100} value={progress} aria-label="Evidence submission progress" /><span>{progress < 80 ? "Reading file…" : "Saving evidence…"}</span></div>}
            {error && <p className="spda-error" role="alert">{error}</p>}
            <div className="spda-actions spda-evidence-form-actions">
              <Button className="spda-button spda-evidence-submit" type="submit" disabled={submitting || !file}>{submitting ? "Submitting evidence…" : "Submit the evidence"}</Button>
            </div>
          </form>}
        </> : <div className="spda-evidence-unavailable"><h1 id="evidence-title">Evidence request unavailable</h1><p>Open this request in the same browser profile that created it, or ask your accounts payable team for a new link.</p></div>}
      </section>
    </div>
    <footer className="spda-evidence-footer">For questions about this request, contact your accounts payable team.</footer>
  </main>;
}
