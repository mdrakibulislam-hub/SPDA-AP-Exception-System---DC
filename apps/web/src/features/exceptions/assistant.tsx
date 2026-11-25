import { Button } from "@SPDA-AP-Exception-System---DC/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, CalendarDays, ListChecks, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { answerAssistant, applyAssistantReview, type ActionReceipt, type ActionReview, type AssistantReply } from "./assistant-model";
import { errorMessage, WorkspaceDialog } from "./dialog";
import type { Workspace } from "./workspace";
import "./assistant.css";

type Message =
  | { kind: "user"; text: string }
  | ({ kind: "assistant"; receipt?: ActionReceipt[] } & AssistantReply);

const prompts = [
  { text: "Today’s exceptions", icon: ListChecks },
  { text: "Summarize the queue", icon: ListChecks },
  { text: "Last 7 days", icon: CalendarDays },
];

function Mascot({ small = false }: { small?: boolean }) {
  return <span className="spda-assistant-mascot" data-small={small} aria-hidden="true">
    <span className="spda-assistant-receipt"><i /><i /><b /></span>
    <Sparkles className="spda-assistant-sparkle" />
  </span>;
}

function CaseList({ items, close, numbered = false }: {
  items: ActionReceipt[];
  close: () => void;
  numbered?: boolean;
}) {
  const List = numbered ? "ol" : "ul";
  return <List className="spda-assistant-cases" data-numbered={numbered}>
    {items.map(({ id, title, detail, evidenceKey }) => <li key={`${id}:${detail}`}>
      <Link to="/exceptions/$invoiceId" params={{ invoiceId: id }} onClick={close}>{title}</Link>
      <p>{detail}</p>
      {evidenceKey && <Link to="/evidence/$requestId" params={{ requestId: evidenceKey }} onClick={close}>Open evidence link <ArrowRight size={13} aria-hidden="true" /></Link>}
    </li>)}
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
    const transcript = log.current;
    const lastReply = transcript?.lastElementChild;
    if (!open || !transcript || !lastReply) return;
    const reply = lastReply.getBoundingClientRect();
    transcript.scrollTop = reply.height > transcript.clientHeight - 32
      ? transcript.scrollTop + reply.top - transcript.getBoundingClientRect().top - 16
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
      <Mascot /><span className="spda-assistant-label">Ask assistant</span>
    </button>
    {open && <WorkspaceDialog drawer title="AP assistant" close={close}
      headerAction={<Button type="button" variant="ghost" size="icon" aria-label="Close assistant" onClick={close}><X size={19} /></Button>}>
      <div className="spda-assistant-log" role="log" aria-label="Conversation" ref={log} tabIndex={0}>
        {messages.length === 0 && <div className="spda-assistant-welcome">
          <Mascot />
          <h3>How can I help?</h3>
          <p>Check your exception queue, get a weekly recap, or choose a next step for an invoice.</p>
        </div>}
        {messages.map((message, index) => <article key={index} className="spda-assistant-message" data-sender={message.kind}
          aria-label={message.kind === "user" ? "You" : "AP assistant"}>
          {message.kind === "assistant" && <Mascot small />}
          <div className="spda-assistant-bubble">
            <p>{message.text}</p>
            {message.kind === "assistant" && <>
              {message.cases && <CaseList items={message.cases} close={close} numbered />}
              {message.receipt && <CaseList items={message.receipt} close={close} />}
              {message.review && <>
                <CaseList items={message.review.rows} close={close} />
                {reviewIndex === index && <div className="spda-assistant-review">
                  <Button type="button" variant="outline" disabled={saving} onClick={discard}>Discard</Button>
                  <Button type="button" disabled={saving} onClick={() => void apply(message.review!)}>{saving ? "Applying…" : "Apply actions"}</Button>
                </div>}
              </>}
            </>}
          </div>
        </article>)}
      </div>
      <footer className="spda-assistant-footer">
        <div className="spda-assistant-prompts" role="group" aria-label="Suggested prompts">
          {prompts.map(({ text, icon: Icon }) => <Button type="button" variant="outline" key={text} disabled={saving} onClick={() => send(text)}>
            <Icon size={14} aria-hidden="true" />{text}
          </Button>)}
          {role === "ap" && <Button type="button" variant="outline" disabled={saving} onClick={() => send(routingPrompt)}>
            <Sparkles size={14} aria-hidden="true" />{routingPrompt}
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
          <Button type="submit" size="icon" aria-label="Send message" disabled={!input.trim() || saving}><ArrowUp size={17} /></Button>
        </form>
        <p className="spda-assistant-footnote">Responses use the workspace’s sample data and rules.</p>
      </footer>
    </WorkspaceDialog>}
  </>;
}
