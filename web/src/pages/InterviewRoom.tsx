// The interview room: interviewer chat, timer, editor (coding), optional
// assistant panel (assisted mode), and the final evaluation.
import { Bot, Clock, Send, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router";
import { api, streamPost } from "../lib/api";
import { ChatBubble, useCoachDock, useStreamingChat, type ChatTurn } from "../components/CoachDock";
import { CodeRunner } from "../components/Exercise";
import { Markdown } from "../components/Markdown";
import { useProblem } from "../lib/queries";
import type { Evaluation, Interview } from "../lib/types";
import { Button, ErrorBox, Spinner } from "../components/ui";
import { cn } from "../lib/utils";
import type { Language } from "../components/CodeEditor";

export default function InterviewRoom() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["interview", id], queryFn: () => api.get<Interview>(`/interviews/${id}`) });
  const interview = q.data;
  const problem = useProblem(interview?.kind === "coding" && interview.problem_slug ? interview.problem_slug : "");
  const dock = useCoachDock();
  const codeRef = useRef<{ code: string; language: Language } | null>(null);
  const [input, setInput] = useState("");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Lock the global coach for solo interviews.
  useEffect(() => {
    const solo = interview?.status === "active" && interview.assistant_mode === "solo";
    dock.setLocked(solo);
    return () => dock.setLocked(false);
  }, [interview?.status, interview?.assistant_mode, dock]);

  const sendTurn = useCallback(
    async (content: string, onDelta: (t: string) => void, signal: AbortSignal) => {
      await streamPost(`/interviews/${id}/turns`, { content, code: codeRef.current?.code }, { onDelta, onError: (m) => onDelta(`\n\n> ${m}`) }, signal);
    },
    [id],
  );
  const chat = useStreamingChat(sendTurn);

  const assistantHistory = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const sendAssistant = useCallback(
    async (content: string, onDelta: (t: string) => void, signal: AbortSignal) => {
      const history = [...assistantHistory.current, { role: "user" as const, content }];
      let reply = "";
      await streamPost(
        `/interviews/${id}/assistant`,
        { messages: history },
        {
          onDelta: (t) => {
            reply += t;
            onDelta(t);
          },
          onError: (m) => onDelta(`\n\n> ${m}`),
        },
        signal,
      );
      assistantHistory.current = [...history, { role: "assistant", content: reply }];
    },
    [id],
  );
  const assistant = useStreamingChat(sendAssistant);

  // Seed the transcript from the server once.
  const seeded = useRef(false);
  useEffect(() => {
    if (interview && !seeded.current) {
      seeded.current = true;
      const turns: ChatTurn[] = interview.transcript
        .filter((e) => e.role === "interviewer" || e.role === "candidate")
        .map((e) => ({ role: e.role === "interviewer" ? "assistant" : "user", content: e.content }));
      chat.setTurns(turns);
      const at: ChatTurn[] = interview.transcript
        .filter((e) => e.role === "assistant" || e.role === "candidate_to_assistant")
        .map((e) => ({ role: e.role === "assistant" ? "assistant" : "user", content: e.content }));
      assistant.setTurns(at);
      assistantHistory.current = at.map((t) => ({ role: t.role, content: t.content }));
      // Kick off: the interviewer opens the conversation.
      if (interview.status === "active" && turns.length === 0) void chat.submit("Hello, I'm ready to begin.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interview]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [chat.turns]);

  const finish = useMutation({
    mutationFn: () => api.post<Interview>(`/interviews/${id}/finish`, { code: codeRef.current?.code }),
    onSuccess: (i) => qc.setQueryData(["interview", id], i),
  });

  if (!interview) return <Spinner className="mt-20" />;
  if (interview.status !== "active") return <Report interview={interview} />;
  const isCoding = interview.kind === "coding";
  const assisted = interview.assistant_mode === "assisted";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-2">
        <span className="text-sm font-medium capitalize">{interview.kind.replace("_", " ")} interview</span>
        <span className={cn("rounded px-1.5 py-0.5 text-[10px] uppercase", assisted ? "bg-accent/20 text-accent" : "bg-elev-2 text-muted")}>{assisted ? "AI-assisted" : "Solo"}</span>
        <Timer startedAt={interview.started_at} minutes={interview.duration_minutes} />
        <div className="ml-auto flex gap-2">
          {assisted && (
            <Button variant="secondary" onClick={() => setAssistantOpen((v) => !v)}>
              <Bot className="h-4 w-4" /> Assistant
            </Button>
          )}
          <Button variant="danger" onClick={() => finish.mutate()} disabled={finish.isPending} data-testid="finish-interview">
            {finish.isPending ? "Grading…" : "End & get feedback"}
          </Button>
        </div>
      </header>
      {finish.error ? <ErrorBox error={finish.error} className="m-3" /> : null}
      <div className={cn("grid min-h-0 flex-1", isCoding ? "lg:grid-cols-[minmax(320px,2fr)_3fr]" : "lg:grid-cols-1", assistantOpen && "lg:grid-cols-[minmax(320px,2fr)_3fr_minmax(280px,2fr)]")}>
        <section className="flex min-h-0 flex-col border-r border-line">
          <div className="border-b border-line p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">The question</p>
            <Markdown source={interview.prompt} className="prose-ascend prose prose-sm max-h-40 max-w-none overflow-y-auto" />
          </div>
          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-3" data-testid="interview-transcript">
            {chat.turns.map((t, i) => (
              <ChatBubble key={i} turn={t} labels={{ user: "You", assistant: "Interviewer" }} />
            ))}
            {chat.error && <p className="text-sm text-danger">{chat.error}</p>}
          </div>
          <form
            className="flex items-end gap-2 border-t border-line p-2"
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
              placeholder="Talk to the interviewer: clarify, explain your approach, walk through your code…"
              className="flex-1 resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
              data-testid="interview-input"
            />
            {chat.busy ? (
              <Button type="button" variant="secondary" onClick={chat.stop}>
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </form>
        </section>
        {isCoding && (
          <section className="min-h-0 overflow-y-auto p-3">
            {problem.data ? (
              <CodeRunner
                targetKind="problem"
                targetSlug={`interview:${interview.id}:${problem.data.slug}`}
                entry={Object.fromEntries(Object.entries(problem.data.signatures).map(([k, v]) => [k, v.name]))}
                languages={Object.keys(problem.data.signatures)}
                starter={Object.fromEntries(Object.entries(problem.data.signatures).map(([k, v]) => [k, v.starter]))}
                tests={problem.data.tests}
                hints={[]}
                timeLimitMs={problem.data.time_limit_ms}
                height="min(60vh, 520px)"
                onCodeChange={(code, language) => {
                  codeRef.current = { code, language };
                }}
                noCoach
              />
            ) : (
              <Spinner />
            )}
          </section>
        )}
        {assistantOpen && assisted && (
          <aside className="flex min-h-0 flex-col border-l border-line">
            <div className="border-b border-line px-3 py-2 text-xs text-muted">
              <Bot className="mr-1 inline h-3.5 w-3.5" /> Your AI pair-programmer. It will write code if asked. Everything you ask it is visible to the grader.
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {assistant.turns.map((t, i) => (
                <ChatBubble key={i} turn={t} labels={{ user: "You", assistant: "Assistant" }} />
              ))}
              {assistant.error && <p className="text-sm text-danger">{assistant.error}</p>}
            </div>
            <form
              className="flex items-end gap-2 border-t border-line p-2"
              onSubmit={(e) => {
                e.preventDefault();
                void assistant.submit(assistantInput);
                setAssistantInput("");
              }}
            >
              <textarea value={assistantInput} onChange={(e) => setAssistantInput(e.target.value)} rows={2} placeholder="Ask the assistant…" className="flex-1 resize-none rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent" data-testid="assistant-input" />
              <Button type="submit" disabled={assistant.busy || !assistantInput.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </aside>
        )}
      </div>
    </div>
  );
}

function Timer({ startedAt, minutes }: { startedAt: string; minutes: number }) {
  const end = useMemo(() => new Date(startedAt).getTime() + minutes * 60_000, [startedAt, minutes]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, end - now);
  const m = Math.floor(left / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <span className={cn("flex items-center gap-1 font-mono text-sm", left < 5 * 60_000 && "text-danger")} data-testid="timer">
      <Clock className="h-4 w-4" /> {m}:{String(s).padStart(2, "0")}
      {left === 0 && <span className="ml-1 text-xs">time's up — end when ready</span>}
    </span>
  );
}

function Report({ interview }: { interview: Interview }) {
  const ev = interview.evaluation as Evaluation | { summary: string } | null;
  const full = ev && "dimensions" in ev ? ev : null;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <p className="text-xs uppercase tracking-wide text-muted">
        {interview.kind.replace("_", " ")} · {interview.assistant_mode} · {interview.status}
      </p>
      <h1 className="mt-1 text-2xl font-semibold">Interview report</h1>
      <p className="mt-2 text-sm text-muted">{interview.prompt}</p>
      {full ? (
        <div className="mt-6 space-y-6" data-testid="evaluation">
          <div className="flex items-center gap-6 rounded-xl border border-line bg-elev p-5">
            <div>
              <div className="text-4xl font-semibold">{full.overall_score}</div>
              <div className="text-xs text-muted">/ 100</div>
            </div>
            <div>
              <div className="text-lg font-medium capitalize">{full.verdict.replace(/_/g, " ")}</div>
              <p className="text-sm text-muted">{full.summary}</p>
            </div>
          </div>
          <section>
            <h2 className="mb-2 font-semibold">Dimensions</h2>
            <ul className="space-y-2">
              {full.dimensions.map((d) => (
                <li key={d.name} className="rounded-lg border border-line bg-elev p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{d.name}</span>
                    <span className="font-mono text-sm">{d.score}/5</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">{d.notes}</p>
                </li>
              ))}
            </ul>
          </section>
          <div className="grid gap-4 sm:grid-cols-2">
            <section>
              <h2 className="mb-2 font-semibold text-success">Strengths</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {full.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-2 font-semibold text-warn">Improve</h2>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {full.improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          </div>
          <section>
            <h2 className="mb-2 font-semibold">Next steps</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {full.next_steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted">{ev?.summary ?? "No evaluation was produced for this interview."}</p>
      )}
      <details className="mt-8">
        <summary className="cursor-pointer text-sm text-muted">Transcript ({interview.transcript.length} entries)</summary>
        <div className="mt-3 space-y-2">
          {interview.transcript.map((e, i) => (
            <div key={i} className="rounded-lg border border-line p-2 text-sm">
              <span className="mr-2 text-[10px] uppercase text-muted">{e.role.replace(/_/g, " ")}</span>
              <span className="whitespace-pre-wrap">{e.content}</span>
            </div>
          ))}
        </div>
      </details>
      {interview.final_code && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-muted">Final code</summary>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-code p-3 text-xs">{interview.final_code}</pre>
        </details>
      )}
      <Link to="/interviews" className="mt-8 inline-block text-sm text-accent">
        ← Back to interviews
      </Link>
    </div>
  );
}
