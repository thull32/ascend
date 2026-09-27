import { Plus, Send, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router";
import { api, streamPost } from "../lib/api";
import { ChatBubble, ChatHistoryToTurns, useStreamingChat } from "../components/CoachDock";
import { useCoachStatus } from "../lib/queries";
import type { ChatMessage, Conversation } from "../lib/types";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { cn, timeAgo } from "../lib/utils";

const STARTERS = [
  "What should I work on next, given my progress?",
  "Explain the difference between amortised and average-case complexity with an example.",
  "Give me a mock system-design question at the Netflix senior bar and critique my answer.",
  "I keep confusing BFS and DFS use cases. Quiz me.",
];

export default function CoachPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const status = useCoachStatus();
  const list = useQuery({ queryKey: ["conversations"], queryFn: () => api.get<Conversation[]>("/coach/conversations") });
  const detail = useQuery({
    queryKey: ["conversation", id],
    queryFn: () => api.get<{ conversation: Conversation; messages: ChatMessage[] }>(`/coach/conversations/${id}`),
    enabled: !!id,
  });
  const create = useMutation({
    mutationFn: () => api.post<Conversation>("/coach/conversations", { context: { kind: "general" } }),
    onSuccess: (c) => {
      localConv.current = null;
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate(`/coach/${c.id}`);
    },
  });
  const remove = useMutation({
    mutationFn: (cid: string) => api.delete(`/coach/conversations/${cid}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["conversations"] });
      navigate("/coach");
    },
  });
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const convId = useRef<string | undefined>(id);
  convId.current = id;
  // The conversation this page instance created and is streaming into. Its
  // turns live in local state; server history must not overwrite them.
  const localConv = useRef<string | null>(null);

  const send = useCallback(
    async (content: string, onDelta: (t: string) => void, signal: AbortSignal) => {
      let cid = convId.current;
      if (!cid) {
        const c = await api.post<Conversation>("/coach/conversations", { context: { kind: "general" } });
        cid = c.id;
        convId.current = cid;
        localConv.current = cid;
        void qc.invalidateQueries({ queryKey: ["conversations"] });
        navigate(`/coach/${c.id}`, { replace: true });
      }
      await streamPost(`/coach/conversations/${cid}/messages`, { content, context: { kind: "general" } }, { onDelta, onError: (m) => onDelta(`\n\n> ${m}`) }, signal);
      void qc.invalidateQueries({ queryKey: ["coach-status"] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    [navigate, qc],
  );
  const chat = useStreamingChat(send);

  // Hydrate turns from the server when switching conversations, but never
  // for the one being streamed into by this page.
  useEffect(() => {
    if (!id) {
      if (!chat.busy) chat.setTurns([]);
      return;
    }
    if (id === localConv.current) return;
    chat.setTurns(detail.data?.conversation.id === id ? ChatHistoryToTurns(detail.data.messages) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, id]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.turns]);

  const enabled = status.data?.enabled ?? true;
  const budget = status.data?.budget;

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-xl border border-line bg-elev p-3">
        <Button className="w-full" variant="secondary" onClick={() => create.mutate()}>
          <Plus className="h-4 w-4" /> New conversation
        </Button>
        <ul className="mt-3 max-h-[60vh] space-y-1 overflow-y-auto">
          {list.data?.map((c) => (
            <li key={c.id} className="group flex items-center">
              <Link to={`/coach/${c.id}`} className={cn("min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm", c.id === id ? "bg-elev-2 text-fg" : "text-muted hover:text-fg")}>
                <div className="truncate">{c.title}</div>
                <div className="text-[10px] text-muted">{timeAgo(c.updated_at)}</div>
              </Link>
              <button onClick={() => remove.mutate(c.id)} className="rounded p-1 text-muted opacity-0 hover:text-danger group-hover:opacity-100" aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        {budget && (
          <p className="mt-3 text-[11px] text-muted">
            Today: {budget.requests_used}/{budget.requests_limit} requests · {Math.round(budget.output_tokens_used / 1000)}k/{Math.round(budget.output_tokens_limit / 1000)}k tokens
          </p>
        )}
        {status.data && <p className="mt-1 text-[11px] text-muted">Model: {status.data.model}</p>}
      </aside>
      <section className="flex min-h-[70vh] flex-col rounded-xl border border-line bg-elev">
        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {!enabled && <p className="text-sm text-muted">The AI coach is not configured on this deployment (no API key).</p>}
          {detail.isLoading && <Spinner />}
          {detail.isError && (
            <div className="flex flex-wrap items-center gap-3">
              <ErrorBox error={detail.error} />
              <Button variant="secondary" onClick={() => void detail.refetch()}>
                Try again
              </Button>
            </div>
          )}
          {chat.turns.length === 0 && enabled && !detail.isLoading && !detail.isError && (
            <div>
              <p className="text-sm text-muted">Your coach knows the whole curriculum and your progress. Try:</p>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {STARTERS.map((s) => (
                  <li key={s}>
                    <button onClick={() => void chat.submit(s)} className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm hover:bg-elev-2">
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
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
            disabled={!enabled}
            placeholder="Ask anything about the curriculum, a concept, or your roadmap…"
            className="flex-1 resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
            data-testid="coach-input"
          />
          {chat.busy ? (
            <Button type="button" variant="secondary" onClick={chat.stop} aria-label="Stop generating">
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={!enabled || !input.trim()} aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          )}
        </form>
      </section>
    </div>
  );
}
