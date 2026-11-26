import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { answerAssistant, applyAssistantReview, type ActionReceipt, type ActionReview, type AssistantReply } from "./assistant-model";
import { errorMessage, WorkspaceDialog } from "./dialog";
import { statuses, statusOf, type Invoice } from "./model";
import { invoiceIssueLabel, invoiceIssueSummary } from "./presentation";
import type { Workspace } from "./workspace";
import "./assistant.css";

type Message =
  | { kind: "user"; text: string }
  | ({ kind: "assistant"; receipt?: ActionReceipt[] } & AssistantReply);

const prompts = ["Today's exceptions", "Summarize the queue", "Last 7 days"];

function Mascot({ launcher = false, welcome = false }: { launcher?: boolean; welcome?: boolean }) {
  return <span className="spda-assistant-mascot" data-launcher={launcher} data-welcome={welcome} aria-hidden="true">
    <img className="spda-assistant-face" src={launcher ? "/design/assistant-launcher-face.svg" : "/design/assistant-avatar.svg"} alt="" />
    {launcher && <span className="spda-assistant-sparkle"><img src="/design/detail-vector.svg" alt="" /></span>}
  </span>;
}

function CaseList({ items, close, numbered = false, invoices }: {
  items: ActionReceipt[];
  close: () => void;
  numbered?: boolean;
  invoices?: Invoice[];
}) {
  const List = numbered ? "ol" : "ul";
  return <List className="spda-assistant-cases" data-numbered={numbered}>
    {items.map(({ id, title, detail, evidenceKey }) => {
      const isSummary = numbered && Object.values(statuses).some(status =>
        detail.startsWith(`${status} · `) || detail.startsWith(`${status} • `));
      const invoice = isSummary ? invoices?.find(item => item.id === id) : undefined;
      const label = invoice ? invoiceIssueLabel(invoice) : "";
      const summary = invoice ? invoiceIssueSummary(invoice) : "";
      const displayTitle = invoice
        ? `${invoice.ref === "Not found" ? "Invoice not found" : invoice.ref} - ${invoice.supplier}`
        : title.replace(" · ", " - ");
      const displayDetail = invoice
        ? `${statuses[statusOf(invoice)]} • ${summary.toLowerCase().startsWith(label.toLowerCase()) ? summary : `${label}. ${summary}`}`
        : detail.replace(" · ", " • ");
      return <li key={`${id}:${detail}`}>
        <Link className="spda-assistant-case-title" to="/exceptions/$invoiceId" params={{ invoiceId: id }} onClick={close}>
          {displayTitle}
        </Link>
        <p>{displayDetail}</p>
        {evidenceKey && <Link className="spda-assistant-evidence" to="/evidence/$requestId" params={{ requestId: evidenceKey }} onClick={close}>Open evidence link <ArrowRight size={13} aria-hidden="true" /></Link>}
      </li>;
    })}
  </List>;
}

export function WorkspaceAssistant({ currentId, workspace }: {
  currentId?: string;
  workspace: Pick<Workspace, "cases" | "visible" | "role" | "commit">;
}) {
  const { cases, visible, role, commit } = workspace;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [reviewIndex, setReviewIndex] = useState<number>();
  const [saving, setSaving] = useState(false);
  const applying = useRef(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openAssistant = () => setOpen(true);
    window.addEventListener("spda:open-assistant", openAssistant);
    return () => window.removeEventListener("spda:open-assistant", openAssistant);
  }, []);

  useEffect(() => {
    const transcript = log.current;
    const lastReply = transcript?.lastElementChild;
    if (!open || !transcript || !lastReply) return;
    const reply = lastReply.getBoundingClientRect();
    const previous = lastReply.previousElementSibling;
    const start = previous?.getAttribute("data-sender") === "user" ? previous : lastReply;
    transcript.scrollTop = reply.height > transcript.clientHeight - 32
      ? transcript.scrollTop + start.getBoundingClientRect().top - transcript.getBoundingClientRect().top - 40
      : transcript.scrollHeight;
  }, [open, messages]);

  const close = () => setOpen(false);

  function send(value: string) {
    const text = value.trim();
    if (!text || applying.current) return;
    const reply = answerAssistant(text, { cases, visible, role, currentId, recentIds });
    if (reply.cases) setRecentIds(reply.cases.map(item => item.id));
    if (reply.review) setReviewIndex(messages.length + 1);
    setMessages(previous => [...previous, { kind: "user", text }, { kind: "assistant", ...reply }]);
    setInput("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(input);
  }

  async function apply(review: ActionReview) {
    if (applying.current) return;
    applying.current = true;
    setSaving(true);
    try {
      const receipt = await commit(draft => applyAssistantReview(draft, role, review));
      setReviewIndex(undefined);
      setMessages(previous => [...previous, {
        kind: "assistant",
        text: `Applied ${receipt.length} ${receipt.length === 1 ? "action" : "actions"}.`,
        receipt,
      }]);
    } catch (error) {
      setMessages(previous => [...previous, { kind: "assistant", text: errorMessage(error) }]);
    } finally {
      applying.current = false;
      setSaving(false);
    }
  }

  function discard() {
    setReviewIndex(undefined);
    setMessages(previous => [...previous, { kind: "assistant", text: "Draft discarded." }]);
  }

  const lastMessage = messages.at(-1);
  const routingPrompt = (lastMessage?.kind === "assistant" ? lastMessage.suggestions?.[0] : undefined) ?? "Suggest routing";

  return <>
    <button type="button" className="spda-assistant-launcher" aria-label="Ask assistant" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen(true)}>
      <Mascot launcher /><span className="spda-assistant-label">Ask Assistant</span>
    </button>
    {open && <WorkspaceDialog drawer title="AP assistant" close={close}
      headerAction={<Button type="button" className="spda-assistant-close" variant="ghost" size="icon" aria-label="Close assistant" onClick={close}>
        <img src="/design/assistant-multiplication-sign.svg" alt="" />
      </Button>}>
      <div className="spda-assistant-log" role="log" aria-label="Conversation" ref={log} tabIndex={0}>
        {messages.length === 0 && <div className="spda-assistant-welcome">
          <Mascot launcher welcome />
          <h3>How can I help today?</h3>
          <p>Check your exception queue, get a weekly recap, or<br />choose a next step for an invoice.</p>
        </div>}
        {messages.map((message, index) => <article key={index} className="spda-assistant-message" data-sender={message.kind}
          aria-label={message.kind === "user" ? "You" : "AP assistant"}>
          {message.kind === "assistant" && <Mascot />}
          <div className="spda-assistant-bubble">
            <p className={message.kind === "assistant" && message.cases?.length ? "spda-assistant-response-summary" : undefined}>{message.text}</p>
            {message.kind === "assistant" && <>
              {message.cases && <CaseList items={message.cases} close={close} numbered invoices={visible} />}
              {message.receipt && <CaseList items={message.receipt} close={close} />}
              {message.review && <>
                <CaseList items={message.review.rows} close={close} />
                {reviewIndex === index && <div className="spda-assistant-review">
                  <Button type="button" className="spda-assistant-discard" variant="outline" disabled={saving} onClick={discard}>Discard</Button>
                  <Button type="button" className="spda-assistant-apply" disabled={saving} onClick={() => void apply(message.review!)}>{saving ? "Applying…" : "Apply actions"}</Button>
                </div>}
              </>}
            </>}
          </div>
        </article>)}
      </div>
      <footer className="spda-assistant-footer">
        <div className="spda-assistant-prompts" role="group" aria-label="Suggested prompts">
          {prompts.map(text => <Button type="button" variant="outline" key={text} disabled={saving} onClick={() => send(text)}>
            {text}
          </Button>)}
          {role === "ap" && <Button type="button" variant="outline" disabled={saving} onClick={() => send(routingPrompt)}>
            {routingPrompt}
          </Button>}
        </div>
        <form className="spda-assistant-composer" onSubmit={submit}>
          <textarea aria-label="Message" value={input} onChange={event => setInput(event.target.value)}
            rows={2} maxLength={2000} placeholder="Ask a question or give an instruction…"
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                send(input);
              }
            }} />
          <Button type="submit" className="spda-assistant-send" size="icon" aria-label="Send message" disabled={!input.trim() || saving}>
            <img src="/design/assistant-arrow-turn-backward.svg" alt="" />
          </Button>
        </form>
      </footer>
    </WorkspaceDialog>}
  </>;
}
