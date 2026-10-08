import { ArrowRight, Flame, Trophy } from "lucide-react";
import { Link, Navigate } from "react-router";
import { useAuth } from "../lib/auth";
import { useCurriculum, useProgress, useRoadmap } from "../lib/queries";
import { Card, PageTitle, Progress, Spinner } from "../components/ui";
import { formatHours } from "../lib/utils";

export default function Dashboard() {
  const { user } = useAuth();
  const progress = useProgress();
  const roadmap = useRoadmap();
  const curriculum = useCurriculum();
  if (user && !user.onboarded) return <Navigate to="/onboarding" replace />;
  if (!progress.data || !roadmap.data || !curriculum.data) return <Spinner className="mt-20" />;
  const p = progress.data;
  const r = roadmap.data;
  const tracks = curriculum.data.tracks;
  return (
    <div>
      <PageTitle title={`Hi ${user?.display_name}.`} subtitle={`Target: ${user?.target_level ?? "senior"} at ${user?.target_company ?? "a top-tier company"} · ${user?.weekly_hours} h/week`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="text-sm font-medium text-muted">Up next</h2>
          {r.next_lesson ? (
            <>
              <p className="mt-1 text-xs text-muted">{r.next_lesson.module_title}</p>
              <p className="text-lg font-semibold">{r.next_lesson.title}</p>
              <Link to={`/learn/${r.next_lesson.slug}`} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-accent-strong px-4 py-2 text-sm font-medium text-white hover:bg-accent" data-testid="continue">
                Continue <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <p className="mt-1">You have finished the reading roadmap. Review your quiz results and try unfamiliar problems or a mock interview to check your readiness.</p>
          )}
          <p className="mt-4 text-xs text-muted">
            {formatHours(r.remaining_hours)} remaining · about {Math.ceil(r.weeks_at_current_pace)} weeks at your pace
          </p>
        </Card>
        <Card>
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-1 text-2xl font-semibold">
                <Flame className="h-5 w-5 text-warn" /> {p.streak_days}
              </div>
              <div className="text-xs text-muted">day streak</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-2xl font-semibold">
                <Trophy className="h-5 w-5 text-accent" /> {p.xp}
              </div>
              <div className="text-xs text-muted">XP</div>
            </div>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <Stat label="Lessons read" value={`${p.lessons_completed} / ${p.lessons_total}`} />
            <Stat label="Problems solved" value={`${p.problems_solved} / ${p.problems_total}`} />
            <Stat label="Quizzes passed" value={String(p.quizzes_passed)} />
          </dl>
        </Card>
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold">Reading progress by track</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tracks.map((t) => {
          const tp = p.per_track.find((x) => x.track_slug === t.slug);
          return (
            <Link key={t.slug} to={`/learn/${t.slug}`} className="rounded-xl border border-line bg-elev p-4 hover:border-accent/60">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">{t.title}</span>
                <span className="text-xs text-muted">
                  {tp?.completed ?? 0}/{t.lesson_count}
                </span>
              </div>
              <Progress value={tp?.completed ?? 0} max={t.lesson_count} className="mt-2" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
