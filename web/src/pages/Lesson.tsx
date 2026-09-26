import { ArrowLeft, ArrowRight, CheckCircle2, List, MessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useAuth } from "../lib/auth";
import { useLesson, useProgress, useSetLessonStatus } from "../lib/queries";
import { Badge, Button, Crumbs, Spinner } from "../components/ui";
import { Markdown } from "../components/Markdown";
import { Comments } from "../components/Comments";
import { useCoachDock } from "../components/CoachDock";
import { cn, difficultyColor } from "../lib/utils";
import NotFound from "./NotFound";

export default function LessonPage() {
  const { track = "", module = "", lesson = "" } = useParams();
  const slug = `${track}/${module}/${lesson}`;
  const q = useLesson(slug);
  const { user } = useAuth();
  const progress = useProgress();
  const setStatus = useSetLessonStatus();
  const dock = useCoachDock();
  const [tocOpen, setTocOpen] = useState(false);

  // Mark "in progress" on first open; scroll to top on navigation.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setTocOpen(false);
  }, [slug]);
  useEffect(() => {
    if (user && q.data && progress.data && !progress.data.completed_slugs.includes(slug) && !progress.data.in_progress_slugs.includes(slug)) {
      setStatus.mutate({ slug, status: "in_progress" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, q.data?.summary.slug, progress.data?.completed_slugs.length]);

  if (q.isLoading) return <Spinner className="mt-20" />;
  if (!q.data) return <NotFound />;
  const l = q.data;
  const completed = progress.data?.completed_slugs.includes(slug) ?? false;

  return (
    <div className="mx-auto flex max-w-6xl gap-8">
      <article className="min-w-0 flex-1">
        <Crumbs items={[{ to: "/learn", label: "Curriculum" }, { to: `/learn/${l.track_slug}`, label: l.track_title }, { to: `/learn/${l.module_slug}`, label: l.module_title }, { label: l.summary.title }]} />
        <header className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{l.summary.title}</h1>
          <p className="mt-2 text-muted">{l.summary.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className={cn(difficultyColor(l.summary.difficulty))}>{l.summary.difficulty}</Badge>
            <Badge>{l.summary.minutes} min</Badge>
            {l.summary.tags.filter((t) => !t.startsWith("pattern:")).slice(0, 5).map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            <button className="ml-auto flex items-center gap-1 text-xs text-muted lg:hidden" onClick={() => setTocOpen((v) => !v)}>
              <List className="h-4 w-4" /> Contents
            </button>
          </div>
          {tocOpen && <Toc toc={l.toc} className="mt-3 lg:hidden" />}
        </header>

        <Markdown source={l.body} lessonSlug={slug} className="prose-ascend prose max-w-none" />

        {l.problems.length > 0 && (
          <section className="mt-10 rounded-xl border border-line bg-elev p-4">
            <h2 className="font-semibold">Practice this</h2>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {l.problems.map((p) => (
                <li key={p.slug}>
                  <Link to={`/practice/${p.slug}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm hover:bg-elev-2">
                    <span>{p.title}</span>
                    <span className={cn("text-xs", difficultyColor(p.difficulty))}>{p.difficulty}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-10 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {user ? (
            <Button variant={completed ? "secondary" : "primary"} onClick={() => setStatus.mutate({ slug, status: completed ? "in_progress" : "completed" })} data-testid="mark-complete">
              <CheckCircle2 className="h-4 w-4" /> {completed ? "Completed" : "Mark as complete"}
            </Button>
          ) : (
            <Link to="/login" className="text-sm text-accent">
              Sign in to track progress
            </Link>
          )}
          {user && (
            <Button variant="ghost" onClick={() => dock.open({ kind: "lesson", slug })}>
              <MessageSquare className="h-4 w-4" /> Ask the coach
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            {l.prev && (
              <Link to={`/learn/${l.prev.slug}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-sm hover:bg-elev-2">
                <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">{l.prev.title}</span>
                <span className="sm:hidden">Prev</span>
              </Link>
            )}
            {l.next && (
              <Link to={`/learn/${l.next.slug}`} className="inline-flex items-center gap-1 rounded-lg bg-accent-strong px-3 py-2 text-sm text-white hover:bg-accent" data-testid="next-lesson">
                <span className="hidden sm:inline">{l.next.title}</span>
                <span className="sm:hidden">Next</span> <ArrowRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </footer>

        <Comments kind="lesson" slug={slug} />
      </article>

      <aside className="sticky top-20 hidden h-[calc(100vh-6rem)] w-64 shrink-0 overflow-y-auto lg:block">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">In this lesson</p>
        <Toc toc={l.toc} />
        <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">{l.module_title}</p>
        <ol className="space-y-1">
          {l.siblings.map((s, i) => (
            <li key={s.slug}>
              <Link to={`/learn/${s.slug}`} className={cn("block truncate rounded px-2 py-1 text-sm", s.slug === slug ? "bg-elev-2 text-fg" : "text-muted hover:text-fg")}>
                {progress.data?.completed_slugs.includes(s.slug) ? "✓ " : `${i + 1}. `}
                {s.title}
              </Link>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

function Toc({ toc, className }: { toc: { level: number; text: string; id: string }[]; className?: string }) {
  return (
    <ul className={cn("space-y-1 text-sm", className)}>
      {toc.map((h) => (
        <li key={h.id} className={h.level === 3 ? "pl-3" : ""}>
          <a href={`#${h.id}`} className="block truncate text-muted hover:text-fg">
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
