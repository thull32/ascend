import { Check, Lock, Star, StarOff } from "lucide-react";
import { Link } from "react-router";
import { useAuth } from "../lib/auth";
import { useRoadmap, useSetModulePreference } from "../lib/queries";
import { PageTitle, Progress, Spinner } from "../components/ui";
import { cn, formatHours } from "../lib/utils";
import type { RoadmapModule } from "../lib/types";

export default function RoadmapPage() {
  const { user } = useAuth();
  const roadmap = useRoadmap();
  const setPref = useSetModulePreference();
  if (!roadmap.data) return <Spinner className="mt-20" />;
  const r = roadmap.data;
  return (
    <div className="mx-auto max-w-4xl">
      <PageTitle
        title="Your roadmap"
        subtitle={
          user
            ? `${formatHours(r.remaining_hours)} remaining at ${user.weekly_hours} h/week ≈ ${Math.ceil(r.weeks_at_current_pace)} weeks. Mark modules you already know as confident; star the ones you need first.`
            : "The full path, foundations to senior craft. Sign in to personalise it and track progress."
        }
      />
      <ol className="space-y-8">
        {r.phases.map((phase) => (
          <li key={phase.phase}>
            <h2 className="mb-3 flex items-center gap-3 text-lg font-semibold">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/20 text-sm text-accent">{phase.phase}</span>
              {phase.title}
            </h2>
            <ol className="space-y-2 border-l border-line pl-5">
              {phase.modules.map((m) => (
                <ModuleRow key={m.slug} m={m} canEdit={!!user} onPref={(preference) => setPref.mutate({ slug: m.slug, preference })} />
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ModuleRow({ m, canEdit, onPref }: { m: RoadmapModule; canEdit: boolean; onPref: (p: "normal" | "confident" | "priority") => void }) {
  const done = m.completed === m.lesson_count;
  const skipped = m.preference === "confident";
  return (
    <li className={cn("relative rounded-xl border border-line bg-elev p-4", skipped && "opacity-60", m.preference === "priority" && "border-accent/60")} data-testid="roadmap-module">
      <span className={cn("absolute -left-[27px] top-5 h-3 w-3 rounded-full border-2 border-bg", done ? "bg-success" : m.completed > 0 ? "bg-accent" : "bg-line")} />
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link to={`/learn/${m.slug}`} className="font-medium hover:text-accent">
            {m.title}
          </Link>
          <p className="text-xs text-muted">
            {m.track_title} · {m.lesson_count} lessons · {formatHours(m.estimated_hours)}
          </p>
          <p className="mt-1 text-sm text-muted">{m.description}</p>
          {m.locked_by.length > 0 && !skipped && (
            <p className="mt-1 flex items-center gap-1 text-xs text-warn">
              <Lock className="h-3 w-3" /> Suggested first: {m.locked_by.join(", ")}
            </p>
          )}
        </div>
        {canEdit && (
          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => onPref(m.preference === "priority" ? "normal" : "priority")}
              className={cn("rounded-md p-1.5 hover:bg-elev-2", m.preference === "priority" ? "text-accent" : "text-muted")}
              title={m.preference === "priority" ? "Remove priority" : "Prioritise"}
              aria-label="Toggle priority"
            >
              {m.preference === "priority" ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
            </button>
            <button
              onClick={() => onPref(skipped ? "normal" : "confident")}
              className={cn("rounded-md px-2 py-1 text-xs hover:bg-elev-2", skipped ? "text-success" : "text-muted")}
              title="I already know this"
            >
              <Check className="mr-1 inline h-3.5 w-3.5" />
              {skipped ? "Confident" : "I know this"}
            </button>
          </div>
        )}
      </div>
      {!skipped && <Progress value={m.completed} max={m.lesson_count} className="mt-3" />}
      {!skipped && !done && m.first_incomplete_lesson && (
        <Link to={`/learn/${m.first_incomplete_lesson}`} className="mt-2 inline-block text-xs text-accent">
          {m.completed > 0 ? "Continue" : "Start"} →
        </Link>
      )}
    </li>
  );
}
