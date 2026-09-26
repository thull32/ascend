import { BookOpen, Eye, MessageSquare } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useProblem, useProgress } from "../lib/queries";
import { Badge, Button, Crumbs, Spinner } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { CodeRunner } from "../components/Exercise";
import { Comments } from "../components/Comments";
import { useCoachDock } from "../components/CoachDock";
import { cn, difficultyColor, titleCase } from "../lib/utils";
import NotFound from "./NotFound";

export default function ProblemPage() {
  const { slug = "" } = useParams();
  const q = useProblem(slug);
  const { user } = useAuth();
  const progress = useProgress();
  const dock = useCoachDock();
  const [solution, setSolution] = useState<string | null>(null);
  const [tab, setTab] = useState<"problem" | "solution">("problem");
  if (q.isLoading) return <Spinner className="mt-20" />;
  if (!q.data) return <NotFound />;
  const p = q.data;
  const solved = progress.data?.solved_problem_slugs.includes(slug);
  const visibleTests = p.tests.filter((t) => !t.hidden);

  const loadSolution = async () => {
    if (solution === null) setSolution((await api.get<{ solution: string }>(`/problems/${slug}/solution`)).solution);
    setTab("solution");
  };

  return (
    <div className="mx-auto max-w-7xl">
      <Crumbs items={[{ to: "/practice", label: "Practice" }, { label: p.title }]} />
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{p.title}</h1>
            {solved && <Badge className="text-success">solved</Badge>}
          </div>
          <div className="mb-4 flex flex-wrap gap-1.5">
            <Badge className={cn(difficultyColor(p.difficulty))}>{p.difficulty}</Badge>
            {p.patterns.map((pt) => (
              <Link key={pt} to={`/practice?pattern=${pt}`}>
                <Badge>{titleCase(pt)}</Badge>
              </Link>
            ))}
            {p.lesson && (
              <Link to={`/learn/${p.lesson}`} className="inline-flex items-center gap-1 text-xs text-accent">
                <BookOpen className="h-3.5 w-3.5" /> Learn the pattern
              </Link>
            )}
          </div>
          <div className="mb-3 flex gap-1 border-b border-line">
            <button onClick={() => setTab("problem")} className={cn("px-3 py-1.5 text-sm", tab === "problem" ? "border-b-2 border-accent text-fg" : "text-muted")}>
              Problem
            </button>
            {user && (
              <button onClick={loadSolution} className={cn("flex items-center gap-1 px-3 py-1.5 text-sm", tab === "solution" ? "border-b-2 border-accent text-fg" : "text-muted")}>
                <Eye className="h-3.5 w-3.5" /> Editorial
              </button>
            )}
          </div>
          {tab === "problem" ? (
            <>
              <Markdown source={p.statement} className="prose-ascend prose prose-sm max-w-none" />
              <h3 className="mb-2 mt-6 text-sm font-semibold">Sample tests</h3>
              <ul className="space-y-1 font-mono text-xs">
                {visibleTests.map((t, i) => (
                  <li key={i} className="rounded-md bg-code px-2 py-1.5">
                    <span className="text-muted">in </span>
                    {JSON.stringify(t.args).slice(0, 160)}
                    <br />
                    <span className="text-muted">out </span>
                    {JSON.stringify(t.expected).slice(0, 160)}
                  </li>
                ))}
                <li className="text-muted">+ {p.tests.length - visibleTests.length} hidden</li>
              </ul>
            </>
          ) : solution === null ? (
            <Spinner />
          ) : (
            <Markdown source={solution} className="prose-ascend prose prose-sm max-w-none" />
          )}
          {user && (
            <Button variant="ghost" className="mt-4" onClick={() => dock.open({ kind: "problem", slug }, "Can you give me a hint for this problem without revealing the solution?")}>
              <MessageSquare className="h-4 w-4" /> Ask the coach for a hint
            </Button>
          )}
        </section>
        <section className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <CodeRunner
            targetKind="problem"
            targetSlug={slug}
            entry={Object.fromEntries(Object.entries(p.signatures).map(([k, v]) => [k, v.name]))}
            languages={Object.keys(p.signatures)}
            starter={Object.fromEntries(Object.entries(p.signatures).map(([k, v]) => [k, v.starter]))}
            tests={p.tests}
            hints={p.hints}
            timeLimitMs={p.time_limit_ms}
            coachContext={{ kind: "problem", slug }}
            height="420px"
          />
        </section>
      </div>
      <Comments kind="problem" slug={slug} />
    </div>
  );
}
