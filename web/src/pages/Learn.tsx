import { Link } from "react-router";
import { useCurriculum, useProgress } from "../lib/queries";
import { PageTitle, Progress, Spinner } from "../components/ui";
import { formatHours } from "../lib/utils";
import { TrackIcon } from "../components/TrackIcon";

export default function Learn() {
  const curriculum = useCurriculum();
  const progress = useProgress();
  if (!curriculum.data) return <Spinner className="mt-20" />;
  const phases = new Map<number, typeof curriculum.data.tracks>();
  for (const t of curriculum.data.tracks) phases.set(t.phase, [...(phases.get(t.phase) ?? []), t]);
  return (
    <div>
      <PageTitle title="Curriculum" subtitle={`${curriculum.data.lesson_count} lessons across ${curriculum.data.tracks.length} tracks. Everything a senior engineer at a top-tier company is expected to know, in the order it should be learned.`} />
      {[...phases.entries()].map(([phase, tracks]) => (
        <section key={phase} className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Phase {phase}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tracks.map((t) => {
              const tp = progress.data?.per_track.find((x) => x.track_slug === t.slug);
              return (
                <Link key={t.slug} to={`/learn/${t.slug}`} className="flex flex-col rounded-xl border border-line bg-elev p-4 hover:border-accent/60" data-testid="track-card">
                  <div className="flex items-center gap-2">
                    <TrackIcon name={t.icon} className="h-5 w-5 text-accent" />
                    <span className="font-medium">{t.title}</span>
                  </div>
                  <p className="mt-2 flex-1 text-sm text-muted">{t.description}</p>
                  <p className="mt-3 text-xs text-muted">
                    {t.modules.length} modules · {t.lesson_count} lessons · {formatHours(t.estimated_hours)}
                  </p>
                  {tp && <Progress value={tp.completed} max={t.lesson_count} className="mt-2" />}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
