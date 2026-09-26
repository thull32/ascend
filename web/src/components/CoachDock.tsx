// A slide-over coach panel available on every page for signed-in learners.
// Pages call `useCoachDock().open(context, seed)` to start a conversation
// grounded in the current lesson/problem (and the code in the editor).
import { MessageSquare, Send, Square, X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { api, ApiError, streamPost } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCoachStatus } from "../lib/queries";
import type { ChatMessage, CoachContext, Conversation } from "../lib/types";
import { cn } from "../lib/utils";
import { Markdown } from "./Markdown";
import { Button } from "./ui";

interface DockState {
  open: (context?: CoachContext, seed?: string) => void;
  close: () => void;
  isOpen: boolean;
  /** Solo interview mode locks the coach out. */
  setLocked: (locked: boolean) => void;
}

const Ctx = createContext<DockState | null>(null);

export function useCoachDock(): DockState {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCoachDock outside provider");
  return c;
}

export function CoachDockProvider({ children }: { children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [context, setContext] = useState<CoachContext | undefined>();
  const [seed, setSeed] = useState<string | undefined>();
  const value = useMemo<DockState>(
    () => ({
      isOpen,
      open: (ctx, s) => {
        if (locked) return;
        setContext(ctx);
        setSeed(s);
        setOpen(true);
      },
      close: () => setOpen(false),
      setLocked,
    }),
    [isOpen, locked],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {isOpen && !locked && <Dock context={context} seed={seed} onClose={() => setOpen(false)} />}
    </Ctx.Provider>
  );
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

/** Reusable streaming chat hook: used by the dock, the coach page and interviews. */
export function useStreamingChat(send: (content: string, onDelta: (t: string) => void, signal: AbortSignal) => Promise<void>) {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const submit = useCallback(
    async (content: string) => {
      if (!content.trim() || busy) return;
      setError(null);
      setBusy(true);
      setTurns((t) => [...t, { role: "user", content }, { role: "assistant", content: "", streaming: true }]);
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        await send(
          content,
          (delta) =>
            setTurns((t) => {
              const last = t[t.length - 1];
              if (!last || last.role !== "assistant") return t;
              return [...t.slice(0, -1), { ...last, content: last.content + delta }];
            }),
          ctrl.signal,
        );
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          setError(e instanceof ApiError ? e.message : "The coach is unavailable right now.");
        }
      } finally {
        setTurns((t) => {
          const last = t[t.length - 1];
          if (!last || last.role !== "assistant") return t;
          if (!last.content) return t.slice(0, -2).concat(t[t.length - 2] ? [t[t.length - 2]!] : []);
          return [...t.slice(0, -1), { ...last, streaming: false }];
        });
        setBusy(false);
        abort.current = null;
      }
    },
    [busy, send],
  );

  const stop = useCallback(() => abort.current?.abort(), []);
  return { turns, setTurns, busy, error, submit, stop };
}

function Dock({ context, seed, onClose }: { context?: CoachContext; seed?: string; onClose: () => void }) {
  const { user } = useAuth();
  const status = useCoachStatus();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [input, setInput] = useState(seed ?? "");
  const listRef = useRef<HTMLDivElement>(null);

  const send = useCallback(
    async (content: string, onDelta: (t: string) => void, signal: AbortSignal) => {
      let c = conv;
      if (!c) {
        c = await api.post<Conversation>("/coach/conversations", { context: { kind: context?.kind, slug: context?.slug } });
        setConv(c);
      }
      await streamPost(`/coach/conversations/${c.id}/messages`, { content, context }, { onDelta, onError: (m) => onDelta(`\n\n> ${m}`) }, signal);
    },
    [conv, context],
  );
  const chat = useStreamingChat(send);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chat.turns]);

  if (!user) return null;
  const enabled = status.data?.enabled ?? true;

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-elev shadow-2xl animate-fade-in" role="dialog" aria-label="AI coach">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <MessageSquare className="h-4 w-4 text-accent" />
        <span className="font-medium">Coach</span>
        {context?.kind && <span className="rounded bg-elev-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">{context.kind}</span>}
        <Link to={conv ? `/coach/${conv.id}` : "/coach"} className="ml-auto text-xs text-muted hover:text-fg">
          Open full view
        </Link>
        <button onClick={onClose} className="rounded p-1 hover:bg-elev-2" aria-label="Close coach">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {!enabled && <p className="text-sm text-muted">The AI coach is not configured on this deployment.</p>}
        {chat.turns.length === 0 && enabled && (
          <p className="text-sm text-muted">Ask anything about this {context?.kind ?? "topic"}. The coach gives hints and questions, not full solutions.</p>
        )}
        {chat.turns.map((t, i) => (
          <ChatBubble key={i} turn={t} />
        ))}
        {chat.error && <p className="text-sm text-danger">{chat.error}</p>}
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void chat.submit(input);
          setInput("");
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void chat.submit(input);
              setInput("");
            }
          }}
          rows={2}
          placeholder={enabled ? "Ask the coach…" : "Coach unavailable"}
          disabled={!enabled}
          className="flex-1 resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        {chat.busy ? (
          <Button type="button" variant="secondary" onClick={chat.stop} aria-label="Stop">
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button type="submit" disabled={!enabled || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        )}
      </form>
    </aside>
  );
}

export function ChatBubble({ turn, labels }: { turn: ChatTurn; labels?: { user: string; assistant: string } }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[92%] rounded-xl px-3.5 py-2.5 text-sm", isUser ? "bg-accent-strong text-white" : "bg-elev-2")}>
        {labels && <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">{isUser ? labels.user : labels.assistant}</div>}
        {isUser ? (
          <div className="whitespace-pre-wrap">{turn.content}</div>
        ) : (
          <Markdown source={turn.content || (turn.streaming ? "…" : "")} className="prose-ascend prose prose-sm max-w-none" />
        )}
      </div>
    </div>
  );
}

export function ChatHistoryToTurns(messages: ChatMessage[]): ChatTurn[] {
  return messages.map((m) => ({ role: m.role, content: m.content }));
}
