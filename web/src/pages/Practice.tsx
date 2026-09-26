import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useCurriculum, useProblems, useProgress } from "../lib/queries";
import { PageTitle, Spinner } from "../components/ui";
import { cn, difficultyColor, titleCase } from "../lib/utils";

export default function Practice() {
  const [params, setParams] = useSearchParams();
  const pattern = params.get("pattern") ?? undefined;
  const list = params.get("list") ?? undefined;
  const difficulty = params.get("difficulty") ?? undefined;
  const [hideSolved, setHideSolved] = useState(false);
  const q = useProblems({ pattern, list, difficulty });
  const curriculum = useCurriculum();
  const progress = useProgress();
  const solved = new Set(progress.data?.solved_problem_slugs ?? []);
  const set = (k: string, v?: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  };
  const problems = (q.data ?? []).filter((p) => !hideSolved || !solved.has(p.slug));
  return (
    <div>
      <PageTitle
        title="Practice"
        subtitle="The Ascend 150: classic interview problems organised by the pattern that solves them. Learn the pattern in its lesson, then apply it here. Original statements; runs in your browser."
        actions={
          progress.data && (
            <span className="text-sm text-muted">
              {progress.data.problems_solved} / {progress.data.problems_total} solved
            </span>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Chip active={!list} onClick={() => set("list")} label="All" />
        <Chip active={list === "core-75"} onClick={() => set("list", "core-75")} label="Core 75" />
        <Chip active={list === "ascend-150"} onClick={() => set("list", "ascend-150")} label="Ascend 150" />
        <span className="mx-1 border-l border-line" />
        {["easy", "medium", "hard"].map((d) => (
          <Chip key={d} active={difficulty === d} onClick={() => set("difficulty", difficulty === d ? undefined : d)} label={titleCase(d)} />
        ))}
        {progress.data && (
          <label className="ml-auto flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={hideSolved} onChange={(e) => setHideSolved(e.target.checked)} /> Hide solved
          </label>
        )}
      </div>
      <div className="mb-6 flex flex-wrap gap-1.5">
        <Chip active={!pattern} onClick={() => set("pattern")} label="All patterns" small />
        {curriculum.data?.patterns.map((p) => (
          <Chip key={p.slug} active={pattern === p.slug} onClick={() => set("pattern", pattern === p.slug ? undefined : p.slug)} label={`${p.title} (${p.problem_count})`} small />
        ))}
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : (
        <ol className="divide-y divide-line rounded-xl border border-line bg-elev">
          {problems.map((p) => (
            <li key={p.slug}>
              <Link to={`/practice/${p.slug}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elev-2" data-testid="problem-row">
                <span className={cn("w-5 shrink-0", solved.has(p.slug) ? "text-success" : "text-transparent")}>
                  <CheckCircle2 className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                <span className="hidden gap-1 sm:flex">
                  {p.patterns.map((pt) => (
                    <span key={pt} className="rounded bg-elev-2 px-1.5 py-0.5 text-[10px] text-muted">
                      {titleCase(pt)}
                    </span>
                  ))}
                </span>
                <span className={cn("w-16 text-right text-xs", difficultyColor(p.difficulty))}>{p.difficulty}</span>
              </Link>
            </li>
          ))}
          {problems.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No problems match these filters.</li>}
        </ol>
      )}
    </div>
  );
}

function Chip({ active, onClick, label, small }: { active: boolean; onClick: () => void; label: string; small?: boolean }) {
  return (
    <button onClick={onClick} className={cn("rounded-full border", small ? "px-2.5 py-0.5 text-xs" : "px-3 py-1 text-sm", active ? "border-accent bg-accent/10 text-fg" : "border-line text-muted hover:text-fg")}>
      {label}
    </button>
  );
}
