import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import { CircleCheck, Paperclip } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { errorMessage } from "./dialog";
import { attachEvidence, findEvidence, readProof, validateProofFile } from "./model";
import { useWorkspace } from "./workspace";

export function EvidenceLink({ requestId, supplier = false, label }: { requestId: string; supplier?: boolean; label?: string }) {
  const router = useRouter();
  const [showLink, setShowLink] = useState(false);
  const path = router.buildLocation({ to: "/evidence/$requestId", params: { requestId } }).href;
  const url = new URL(path, window.location.href).href;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Request link copied.");
    } catch {
      setShowLink(true);
    }
  }

  return <>
    <div className="spda-actions">
      <Link to="/evidence/$requestId" params={{ requestId }} target="_blank" rel="noopener">
        {label ?? (supplier ? "Open upload form" : "Preview upload form")}
      </Link>
      {!supplier && <Button type="button" variant="outline" onClick={copy}>Copy request link</Button>}
    </div>
    {showLink && <label className="spda-field">Request link <input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>}
  </>;
}

export function EvidenceScreen({ requestId }: { requestId: string }) {
  const { cases, commit } = useWorkspace();
  const match = findEvidence(cases, requestId);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function choose(next: File | null) {
    setError("");
    setFile(null);
    if (!next) return;
    try {
      validateProofFile(next);
      setFile(next);
    } catch (failure) {
      if (input.current) input.current.value = "";
      setError(errorMessage(failure));
    }
  }

  function useSample() {
    if (!match) return;
    if (input.current) input.current.value = "";
    const reference = match.invoice.ref === "Not found" ? "" : ` · Invoice ${match.invoice.ref}`;
    choose(new File([
      `${match.invoice.supplier}${reference}\nThis sample document demonstrates how a recipient can attach evidence for an invoice review.`,
    ], "sample-evidence.txt", { type: "text/plain" }));
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!match || !file || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const proof = await readProof(file, match.invoice);
      await commit(draft => attachEvidence(draft, requestId, proof));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="spda-portal">
    <section className="spda-panel">
      <p className="spda-portal-brand"><Paperclip size={18} aria-hidden="true" /> SPDA Supply</p>
      {match ? <>
        <h1>Upload evidence</h1>
        <p><strong>{match.invoice.ref}</strong> · {match.invoice.supplier}</p>
        <div className="spda-upload-request">
          <strong>Requested from {match.request.recipient.toLowerCase()}</strong>
          <p>{match.request.reason}</p>
        </div>
        {match.request.proof ? <div role="status" className="spda-upload-receipt spda-assist">
          <CircleCheck size={20} aria-hidden="true" />
          <div><strong>Document received</strong><p>{match.request.proof.name}</p><p className="spda-muted">The document is attached to the invoice for review.</p></div>
        </div>
          : <form onSubmit={upload}>
            <label className="spda-field">Choose a file <input ref={input} type="file" name="file" accept=".txt,.pdf,.jpg,.jpeg,.png"
              disabled={submitting} aria-describedby="evidence-file-help" onChange={event => choose(event.target.files?.[0] ?? null)} /></label>
            <p className="spda-muted" id="evidence-file-help">TXT, PDF, JPG, or PNG up to 1 MB.</p>
            {file && <div className="spda-upload-file" role="status">
              <Paperclip size={17} aria-hidden="true" /><span>{file.name} · {Math.ceil(file.size / 1024)} KB</span>
            </div>}
            {error && <p className="spda-error" role="alert">{error}</p>}
            <div className="spda-actions">
              <Button type="submit" disabled={submitting || !file}>{submitting ? "Saving file…" : "Submit proof"}</Button>
              <Button type="button" variant="outline" onClick={useSample} disabled={submitting}>Use sample file</Button>
              {file && <Button type="button" variant="ghost" disabled={submitting} onClick={() => {
                if (input.current) input.current.value = "";
                choose(null);
                input.current?.focus();
              }}>Remove file</Button>}
            </div>
            <p className="spda-muted">Prototype uploads stay in the browser profile that created the request.</p>
          </form>}
      </> : <>
        <h1>Evidence request unavailable</h1>
        <p>Open the request link in the same browser profile that created it.</p>
      </>}
    </section>
  </main>;
}
