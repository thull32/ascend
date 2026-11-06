import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ErrorBox, PageTitle, Spinner } from "../../components/ui";
import { fmt, useAdminContent, type ContentReport, type LessonStats } from "../../lib/admin";
import { cn, difficultyColor } from "../../lib/utils";
import { inputClass, Section, Select, Stat, Table, Td } from "./common";

const rate = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

export default function Content() {
  const q = useAdminContent();
  const [filter, setFilter] = useState("");
  if (q.error) return <ErrorBox error={q.error} />;
  if (!q.data) return <Spinner className="mt-16" />;
  const c = q.data;
  return (
    <div>
      <PageTitle
        title="Content"
        subtitle={
          <>
            The curriculum this build serves and how learners use it. Lessons, quizzes and problems are Markdown in <code>content/</code>, validated in CI and shipped with each deploy, so they are edited in the
            repository, not here. Build {c.version.slice(0, 12)}.
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Tracks" value={c.tracks.length} sub={`${c.tracks.reduce((s, t) => s + t.modules.length, 0)} modules`} />
        <Stat label="Lessons" value={fmt(c.lessons)} />
        <Stat label="Quiz questions" value={fmt(c.quiz_questions)} />
        <Stat label="Exercises" value={fmt(c.exercises)} />
        <Stat label="Problems" value={fmt(c.problems)} />
      </div>
      <div className="mt-6">
        <input className={cn(inputClass, "w-full sm:w-80")} placeholder="Filter lessons and problems" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter content" />
      </div>
      <Section title="Tracks">
        <div className="space-y-2">
          {c.tracks.map((t) => (
            <TrackRow key={t.slug} track={t} filter={filter.trim().toLowerCase()} />
          ))}
        </div>
      </Section>
      <Problems c={c} filter={filter.trim().toLowerCase()} />
    </div>
  );
}

function TrackRow({ track, filter }: { track: ContentReport["tracks"][number]; filter: string }) {
  const [open, setOpen] = useState(false);
  const lessons = track.modules.flatMap((m) => m.lessons);
  const completed = lessons.reduce((s, l) => s + l.completed, 0);
  const started = lessons.reduce((s, l) => s + l.started, 0);
  const match = (l: LessonStats) => !filter || l.title.toLowerCase().includes(filter) || l.slug.includes(filter);
  const matching = lessons.filter(match).length;
  if (filter && matching === 0) return null;
  const expanded = open || (!!filter && matching > 0);
  return (
    <div className="rounded-xl border border-line bg-elev">
      <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen((v) => !v)} aria-expanded={expanded}>
        {expanded ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
        <span className="font-medium">{track.title}</span>
        <span className="text-xs text-muted">
          phase {track.phase} · {track.modules.length} modules · {track.lesson_count} lessons · {Math.round(track.estimated_hours)} h
        </span>
        <span className="ml-auto text-xs text-muted tabular-nums">
          {fmt(started)} starts · {fmt(completed)} completions
        </span>
      </button>
      {expanded && (
        <div className="space-y-4 border-t border-line p-4">
          {track.modules.map((m) => {
            const rows = m.lessons.filter(match);
            if (rows.length === 0) return null;
            return (
              <div key={m.slug}>
                <h3 className="mb-2 text-sm font-medium">
                  {m.title} <span className="text-xs font-normal text-muted">· {Math.round(m.estimated_hours * 10) / 10} h</span>
                </h3>
                <Table head={["Lesson", "Has", "Started", "Completed", "Completion", "Quiz attempts", "Quiz average", "Exercise runs", "Comments"]}>
                  {rows.map((l) => (
                    <tr key={l.slug}>
                      <Td>
                        <Link className="hover:text-accent" to={`/learn/${l.slug}`}>
                          {l.title}
                        </Link>
                        <div className="text-xs text-muted">
                          <span className={difficultyColor(l.difficulty)}>{l.difficulty}</span> · {l.minutes} min
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-xs text-muted">
                        {[l.quiz_questions > 0 && `${l.quiz_questions} q`, l.exercises > 0 && `${l.exercises} ex`, l.has_viz && "viz"].filter(Boolean).join(" · ") || "—"}
                      </Td>
                      <Td className="tabular-nums">{fmt(l.started)}</Td>
                      <Td className="tabular-nums">{fmt(l.completed)}</Td>
                      <Td className="tabular-nums text-muted">{rate(l.completed, l.started)}</Td>
                      <Td className="tabular-nums">
                        {fmt(l.quiz_attempts)}
                        {l.quiz_learners > 0 && <span className="text-xs text-muted"> · {l.quiz_learners} learners</span>}
                      </Td>
                      <Td className={cn("tabular-nums", l.quiz_avg != null && l.quiz_avg < 0.6 && "text-warn")}>{l.quiz_avg != null ? `${Math.round(l.quiz_avg * 100)}%` : "—"}</Td>
                      <Td className="tabular-nums">{fmt(l.exercise_attempts)}</Td>
                      <Td className="tabular-nums">{fmt(l.comments)}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

type ProblemSort = "order" | "attempts" | "solve_rate" | "solvers";

function Problems({ c, filter }: { c: ContentReport; filter: string }) {
  const [sort, setSort] = useState<ProblemSort>("order");
  const rows = useMemo(() => {
    const list = c.problem_stats.filter((p) => !filter || p.title.toLowerCase().includes(filter) || p.slug.includes(filter) || p.patterns.some((x) => x.includes(filter)));
    const solve = (p: (typeof list)[number]) => (p.learners > 0 ? p.solvers / p.learners : -1);
    if (sort === "attempts") return [...list].sort((a, b) => b.attempts - a.attempts);
    if (sort === "solvers") return [...list].sort((a, b) => b.solvers - a.solvers);
    if (sort === "solve_rate") return [...list].sort((a, b) => solve(a) - solve(b));
    return list;
  }, [c.problem_stats, filter, sort]);
  return (
    <Section
      title="Problems"
      actions={<Select<ProblemSort> label="Sort" value={sort} onChange={setSort} options={[["order", "Curriculum order"], ["attempts", "Most attempts"], ["solvers", "Most solvers"], ["solve_rate", "Hardest (lowest solve rate)"]]} />}
    >
      <Table head={["Problem", "Patterns", "Tests", "Attempts", "Learners", "Solved by", "Solve rate", "Comments"]}>
        {rows.map((p) => (
          <tr key={p.slug}>
            <Td>
              <Link className="hover:text-accent" to={`/practice/${p.slug}`}>
                {p.title}
              </Link>
              <div className="text-xs">
                <span className={difficultyColor(p.difficulty)}>{p.difficulty}</span>
                {p.has_walkthrough && <span className="text-muted"> · walkthrough</span>}
              </div>
            </Td>
            <Td className="text-xs text-muted">{p.patterns.join(", ")}</Td>
            <Td className="tabular-nums">{p.tests}</Td>
            <Td className="tabular-nums">{fmt(p.attempts)}</Td>
            <Td className="tabular-nums">{fmt(p.learners)}</Td>
            <Td className="tabular-nums">{fmt(p.solvers)}</Td>
            <Td className="tabular-nums text-muted">{rate(p.solvers, p.learners)}</Td>
            <Td className="tabular-nums">{fmt(p.comments)}</Td>
          </tr>
        ))}
      </Table>
    </Section>
  );
}
