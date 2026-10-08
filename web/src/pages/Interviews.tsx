import { Bot, Code2, MessagesSquare, Server, UserRound } from "lucide-react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router";
import { api } from "../lib/api";
import { useCoachStatus } from "../lib/queries";
import type { AssistantMode, Interview, InterviewKind } from "../lib/types";
import { Button, Card, ErrorBox, PageTitle } from "../components/ui";
import { cn, timeAgo } from "../lib/utils";

const KINDS: { kind: InterviewKind; title: string; body: string; icon: typeof Code2; minutes: number }[] = [
  { kind: "coding", title: "Coding", body: "One problem from the full practice collection, a live editor, and an interviewer who probes complexity, edge cases and trade-offs.", icon: Code2, minutes: 45 },
  { kind: "system_design", title: "System design", body: "A Netflix-scale design prompt. Requirements, estimates, architecture, deep dives, failure modes.", icon: Server, minutes: 45 },
  { kind: "behavioral", title: "Behavioural", body: "Senior-level STAR questions with follow-ups that test ownership, judgement and conflict handling.", icon: MessagesSquare, minutes: 30 },
];

export default function Interviews() {
  const status = useCoachStatus();
  const navigate = useNavigate();
  const list = useQuery({ queryKey: ["interviews"], queryFn: () => api.get<Interview[]>("/interviews") });
  const [kind, setKind] = useState<InterviewKind>("coding");
  const [mode, setMode] = useState<AssistantMode>("solo");
  const [difficulty, setDifficulty] = useState<string>("medium");
  const [language, setLanguage] = useState("python");
  const start = useMutation({
    mutationFn: () => api.post<Interview>("/interviews", { kind, assistant_mode: mode, difficulty: kind === "coding" ? difficulty : undefined, language: kind === "coding" ? language : undefined }),
    onSuccess: (i) => navigate(`/interviews/${i.id}`),
  });
  const enabled = status.data?.enabled ?? true;
  const active = list.data?.find((i) => i.status === "active");

  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle title="Mock interviews" subtitle="Timed, realistic rounds graded against the senior bar. Choose classic solo mode, or AI-assisted mode where you may use an AI pair-programmer and are graded on how you direct and verify it." />
      {!enabled && <ErrorBox error="Interviews need the AI coach, which is not configured on this deployment." className="mb-4" />}
      {active && (
        <Card className="mb-4 border-accent/60">
          <p className="text-sm">
            You have an interview in progress ({active.kind.replace("_", " ")}, {active.assistant_mode}).{" "}
            <Link to={`/interviews/${active.id}`} className="text-accent">
              Resume it
            </Link>{" "}
            or start a new one (the old one is marked abandoned).
          </p>
        </Card>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button key={k.kind} onClick={() => setKind(k.kind)} className={cn("rounded-xl border p-4 text-left", kind === k.kind ? "border-accent bg-accent/10" : "border-line bg-elev hover:bg-elev-2")} data-testid={`kind-${k.kind}`}>
            <k.icon className="mb-2 h-5 w-5 text-accent" />
            <div className="font-medium">{k.title}</div>
            <div className="mt-1 text-xs text-muted">{k.body}</div>
            <div className="mt-2 text-xs text-muted">{k.minutes} min</div>
          </button>
        ))}
      </div>
      <h2 className="mb-2 mt-6 text-sm font-medium">Mode</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => setMode("solo")} className={cn("rounded-xl border p-4 text-left", mode === "solo" ? "border-accent bg-accent/10" : "border-line bg-elev hover:bg-elev-2")} data-testid="mode-solo">
          <UserRound className="mb-2 h-5 w-5 text-accent" />
          <div className="font-medium">Solo (classic)</div>
          <div className="mt-1 text-xs text-muted">No AI help. The coach is locked for the duration. This is the traditional loop.</div>
        </button>
        <button onClick={() => setMode("assisted")} className={cn("rounded-xl border p-4 text-left", mode === "assisted" ? "border-accent bg-accent/10" : "border-line bg-elev hover:bg-elev-2")} data-testid="mode-assisted">
          <Bot className="mb-2 h-5 w-5 text-accent" />
          <div className="font-medium">AI-assisted</div>
          <div className="mt-1 text-xs text-muted">An AI pair-programmer is available in a side panel. You are graded on direction, verification and critique of its output, and the interviewer will ask you to justify what you accept.</div>
        </button>
      </div>
      {kind === "coding" && (
        <div className="mt-6 flex flex-wrap gap-6">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Difficulty</span>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2">
              <option value="easy">Easy (warm-up)</option>
              <option value="medium">Medium (typical senior screen)</option>
              <option value="hard">Hard (onsite)</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2">
              <option value="python">Python</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
            </select>
          </label>
        </div>
      )}
      {start.error ? <ErrorBox error={start.error} className="mt-4" /> : null}
      <Button className="mt-6" onClick={() => start.mutate()} disabled={!enabled || start.isPending} data-testid="start-interview">
        Start {KINDS.find((k) => k.kind === kind)?.title.toLowerCase()} interview
      </Button>

      <h2 className="mb-3 mt-10 text-lg font-semibold">History</h2>
      {list.data && list.data.length === 0 && <p className="text-sm text-muted">No interviews yet.</p>}
      {list.data && list.data.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line bg-elev">
        {list.data.map((i) => (
          <li key={i.id}>
            <Link to={`/interviews/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elev-2">
              <span className="w-28 text-sm capitalize">{i.kind.replace("_", " ")}</span>
              <span className="w-20 text-xs text-muted">{i.assistant_mode}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-muted">{i.prompt}</span>
              <span className="text-xs text-muted">{timeAgo(i.started_at)}</span>
              <span className={cn("w-16 text-right text-sm font-medium", i.status === "completed" ? "text-fg" : "text-muted")}>{i.status === "completed" ? `${i.score}/100` : i.status}</span>
            </Link>
          </li>
        ))}
      </ul>}
    </div>
  );
}
