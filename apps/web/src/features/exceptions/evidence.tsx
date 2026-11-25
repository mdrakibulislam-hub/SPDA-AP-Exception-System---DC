import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import { Paperclip } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { errorMessage } from "./dialog";
import { attachEvidence, findEvidence, readProof } from "./model";
import { useWorkspace } from "./workspace";

export function EvidenceLink({ requestId, supplier = false }: { requestId: string; supplier?: boolean }) {
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
        {supplier ? "Open upload form" : "Preview upload form"}
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

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!match || submitting) return;
    const file = new FormData(event.currentTarget).get("file");
    if (!(file instanceof File)) return;
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
        <h1>Send supporting evidence</h1>
        <p><strong>{match.invoice.ref}</strong> · {match.invoice.supplier}</p>
        <p>{match.request.reason}</p>
        {match.request.proof ? <p role="status" className="spda-assist">Document received. AP can review it now.</p>
          : <form onSubmit={upload}>
            <label className="spda-field">Choose a file <input type="file" name="file" accept=".txt,.pdf,.jpg,.jpeg,.png" required /></label>
            <p className="spda-muted">Text, PDF, or image up to 1 MB. Use sample material in the same browser profile that created the request.</p>
            {error && <p className="spda-error" role="alert">{error}</p>}
            <Button type="submit" disabled={submitting}>{submitting ? "Saving file…" : "Submit proof"}</Button>
          </form>}
      </> : <>
        <h1>Evidence request unavailable</h1>
        <p>Open the request link in the same browser profile that created it.</p>
      </>}
    </section>
  </main>;
}
