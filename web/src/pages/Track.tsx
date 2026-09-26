import { Link, useParams } from "react-router";
import { useProgress, useTrack } from "../lib/queries";
import { Crumbs, PageTitle, Progress, Spinner } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { formatHours } from "../lib/utils";
import NotFound from "./NotFound";

export default function TrackPage() {
  const { track = "" } = useParams();
  const q = useTrack(track);
  const progress = useProgress();
  if (q.isLoading) return <Spinner className="mt-20" />;
  if (!q.data) return <NotFound />;
  const t = q.data;
  const done = new Set(progress.data?.completed_slugs ?? []);
  return (
    <div className="mx-auto max-w-4xl">
      <Crumbs items={[{ to: "/learn", label: "Curriculum" }, { label: t.title }]} />
      <PageTitle title={t.title} subtitle={`${t.modules.length} modules · ${t.lesson_count} lessons · ${formatHours(t.estimated_hours)}`} />
      <Markdown source={t.intro} className="prose-ascend prose max-w-none mb-8" />
      <ol className="space-y-3">
        {t.modules.map((m, i) => {
          const completed = m.lessons.filter((l) => done.has(l.slug)).length;
          return (
            <li key={m.slug} className="rounded-xl border border-line bg-elev p-4">
              <div className="flex items-baseline justify-between gap-3">
                <Link to={`/learn/${m.slug}`} className="font-medium hover:text-accent">
                  {i + 1}. {m.title}
                </Link>
                <span className="text-xs text-muted">
                  {m.lessons.length} lessons · {formatHours(m.estimated_hours)}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{m.description}</p>
              {m.prerequisites.length > 0 && <p className="mt-1 text-xs text-muted">After: {m.prerequisites.map((p) => p.split("/").slice(-1)[0]).join(", ")}</p>}
              {progress.data && <Progress value={completed} max={m.lessons.length} className="mt-3" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
