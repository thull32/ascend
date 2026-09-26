import { CheckCircle2, Circle } from "lucide-react";
import { Link, useParams } from "react-router";
import { useModule, useProgress } from "../lib/queries";
import { Badge, Crumbs, PageTitle, Spinner } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { cn, difficultyColor, formatHours } from "../lib/utils";
import NotFound from "./NotFound";

export default function ModulePage() {
  const { track = "", module = "" } = useParams();
  const q = useModule(track, module);
  const progress = useProgress();
  if (q.isLoading) return <Spinner className="mt-20" />;
  if (!q.data) return <NotFound />;
  const m = q.data;
  const done = new Set(progress.data?.completed_slugs ?? []);
  return (
    <div className="mx-auto max-w-4xl">
      <Crumbs items={[{ to: "/learn", label: "Curriculum" }, { to: `/learn/${m.track_slug}`, label: m.track_title ?? m.track_slug }, { label: m.title }]} />
      <PageTitle title={m.title} subtitle={`${m.lessons.length} lessons · ${formatHours(m.estimated_hours)}`} />
      <Markdown source={m.intro} className="prose-ascend prose max-w-none mb-8" />
      <ol className="divide-y divide-line rounded-xl border border-line bg-elev">
        {m.lessons.map((l, i) => (
          <li key={l.slug}>
            <Link to={`/learn/${l.slug}`} className="flex items-start gap-3 px-4 py-3 hover:bg-elev-2" data-testid="lesson-link">
              {done.has(l.slug) ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" />}
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {i + 1}. {l.title}
                </div>
                <div className="text-sm text-muted">{l.description}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <Badge className={cn(difficultyColor(l.difficulty))}>{l.difficulty}</Badge>
                  <Badge>{l.minutes} min</Badge>
                  {l.has_viz && <Badge>viz</Badge>}
                  {l.has_exercise && <Badge>exercise</Badge>}
                  {l.has_quiz && <Badge>quiz</Badge>}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
