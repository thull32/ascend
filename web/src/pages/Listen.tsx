import { Check, Copy, Headphones, ListChecks, Pause, Play, Podcast, Rewind, FastForward, SkipForward } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { api } from "../lib/api";
import { formatDuration, heardSet, markHeard, savedPosition, savePosition, useAudio, type Episode } from "../lib/audio";
import { Badge, Button, Card, EmptyState, ErrorBox, PageTitle, Spinner } from "../components/ui";
import { cn } from "../lib/utils";

const SPEEDS = [1, 1.15, 1.3, 1.5, 1.75, 2];
const SPEED_KEY = "ascend.audio.speed";

function loadSpeed(): number {
  try {
    const v = Number(localStorage.getItem(SPEED_KEY));
    return SPEEDS.includes(v) ? v : 1;
  } catch {
    return 1;
  }
}

export default function Listen() {
  const audioQ = useAudio();
  const [params] = useSearchParams();
  const episodes = useMemo(() => audioQ.data?.episodes ?? [], [audioQ.data]);
  const [current, setCurrent] = useState<Episode | null>(null);
  const [heard, setHeard] = useState(heardSet);

  // /listen?play=<lesson slug or episode name> starts that episode.
  useEffect(() => {
    const want = params.get("play");
    if (want && !current) {
      const e = episodes.find((x) => x.name === want || x.lesson === want);
      if (e) setCurrent(e);
    }
  }, [params, episodes, current]);

  const groups = useMemo(() => {
    const m = new Map<string, Episode[]>();
    for (const e of episodes) m.set(e.module_title, [...(m.get(e.module_title) ?? []), e]);
    return [...m.entries()];
  }, [episodes]);

  const next = (e: Episode) => episodes[episodes.findIndex((x) => x.name === e.name) + 1] ?? null;

  if (audioQ.isLoading) return <Spinner className="mt-20" />;

  return (
    <div className={cn("mx-auto max-w-3xl", current && "pb-56")}>
      <PageTitle
        title="Listen"
        subtitle="Lessons rewritten for listening, for runs, drives and walks, plus spoken quizzes. What needs a screen goes on each episode's desk list."
      />
      {audioQ.error ? <ErrorBox error={audioQ.error} /> : null}
      <FeedCard hasFeed={!!audioQ.data?.has_feed} />
      {episodes.length === 0 && !audioQ.isLoading ? (
        <EmptyState title="No episodes yet" body="Audio editions are being recorded; they appear here as they are published." />
      ) : null}
      {groups.map(([module, list]) => (
        <section key={module} className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">{module}</h2>
          <ul className="space-y-2">
            {list.map((e) => (
              <EpisodeRow key={e.name} e={e} playing={current?.name === e.name} heard={heard.has(e.name)} onPlay={() => setCurrent(e)} />
            ))}
          </ul>
        </section>
      ))}
      {current && (
        <Player
          key={current.name}
          episode={current}
          onEnded={() => {
            markHeard(current.name);
            setHeard(heardSet());
            setCurrent(next(current));
          }}
          onNext={() => setCurrent(next(current))}
        />
      )}
    </div>
  );
}

function EpisodeRow({ e, playing, heard, onPlay }: { e: Episode; playing: boolean; heard: boolean; onPlay: () => void }) {
  const [open, setOpen] = useState(false);
  const resume = savedPosition(e.name);
  return (
    <li className={cn("rounded-lg border border-line bg-elev-1 p-3", playing && "border-accent")}>
      <div className="flex items-center gap-3">
        <button onClick={onPlay} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white hover:bg-accent" aria-label={`Play ${e.title}`}>
          <Play className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{e.title}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{formatDuration(e.duration)}</span>
            {e.review ? <Badge>spoken quiz</Badge> : null}
            {e.fit === "partial" ? <Badge>partly visual</Badge> : null}
            {heard ? (
              <span className="flex items-center gap-1 text-emerald-500">
                <Check className="h-3 w-3" /> heard
              </span>
            ) : resume > 30 ? (
              <span>resume at {formatDuration(resume)}</span>
            ) : null}
          </div>
        </div>
        {e.desk.length > 0 && (
          <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-1 text-xs text-muted hover:text-fg" aria-expanded={open}>
            <ListChecks className="h-4 w-4" /> desk
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3 border-t border-line pt-3 text-sm">
          <p className="mb-1 text-xs text-muted">Needs a screen; do these at your desk:</p>
          <ul className="list-disc space-y-1 pl-5">
            {e.desk.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {e.lesson && (
            <Link to={`/learn/${e.track}/${e.module}/${e.lesson}`} className="mt-2 inline-block text-accent">
              Open the lesson →
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

function Player({ episode, onEnded, onNext }: { episode: Episode; onEnded: () => void; onNext: () => void }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [speed, setSpeed] = useState(loadSpeed);
  const chapter = [...episode.chapters].reverse().find((c) => time >= c.start);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = savedPosition(episode.name);
    a.playbackRate = speed;
    void a.play().catch(() => setPlaying(false));
    // Lock screen, headphones and car controls.
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: episode.title,
        artist: "Ascend",
        album: episode.module_title,
        artwork: [{ src: "/podcast-artwork.png", sizes: "1400x1400", type: "image/png" }],
      });
      const seek = (d: number) => {
        a.currentTime = Math.max(0, Math.min(a.duration || Infinity, a.currentTime + d));
      };
      navigator.mediaSession.setActionHandler("play", () => void a.play());
      navigator.mediaSession.setActionHandler("pause", () => a.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => seek(-15));
      navigator.mediaSession.setActionHandler("seekforward", () => seek(30));
      navigator.mediaSession.setActionHandler("nexttrack", onNext);
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) a.currentTime = d.seekTime;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode.name]);

  useEffect(() => {
    if (ref.current) ref.current.playbackRate = speed;
    try {
      localStorage.setItem(SPEED_KEY, String(speed));
    } catch {
      /* storage unavailable */
    }
  }, [speed]);

  const seek = (d: number) => {
    const a = ref.current;
    if (a) a.currentTime = Math.max(0, a.currentTime + d);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-elev-1/95 p-3 backdrop-blur">
      <audio
        ref={ref}
        src={`/api/audio/play/${encodeURIComponent(episode.name)}`}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(ev) => {
          const t = ev.currentTarget.currentTime;
          setTime(t);
          if (Math.floor(t) % 5 === 0) savePosition(episode.name, t);
          if ("mediaSession" in navigator && ev.currentTarget.duration) {
            try {
              navigator.mediaSession.setPositionState({ duration: ev.currentTarget.duration, position: t, playbackRate: ev.currentTarget.playbackRate });
            } catch {
              /* some browsers reject transient states */
            }
          }
        }}
        onEnded={onEnded}
      />
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center gap-2">
          <Headphones className="h-4 w-4 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{episode.title}</div>
            <div className="truncate text-xs text-muted">{chapter?.title ?? episode.module_title}</div>
          </div>
          <span className="text-xs tabular-nums text-muted">
            {formatDuration(time)} / {formatDuration(episode.duration)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.round(episode.duration)}
          value={Math.round(time)}
          onChange={(e) => {
            if (ref.current) ref.current.currentTime = Number(e.target.value);
          }}
          className="mt-2 w-full accent-[var(--color-accent,#7c9cff)]"
          aria-label="Position"
        />
        <div className="mt-1 flex items-center justify-center gap-3">
          <button onClick={() => seek(-15)} className="rounded-md p-2 text-muted hover:text-fg" aria-label="Back 15 seconds">
            <Rewind className="h-5 w-5" />
          </button>
          <button
            onClick={() => (playing ? ref.current?.pause() : void ref.current?.play())}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-strong text-white hover:bg-accent"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button onClick={() => seek(30)} className="rounded-md p-2 text-muted hover:text-fg" aria-label="Forward 30 seconds">
            <FastForward className="h-5 w-5" />
          </button>
          <button onClick={onNext} className="rounded-md p-2 text-muted hover:text-fg" aria-label="Next episode">
            <SkipForward className="h-5 w-5" />
          </button>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="rounded-md border border-line bg-bg px-2 py-1 text-xs" aria-label="Speed">
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </div>
        {episode.chapters.length > 1 && (
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1 text-xs">
            {episode.chapters.map((c) => (
              <button
                key={c.title}
                onClick={() => {
                  if (ref.current) ref.current.currentTime = c.start;
                }}
                className={cn("shrink-0 rounded-full border border-line px-2 py-0.5", chapter?.title === c.title ? "border-accent text-fg" : "text-muted")}
              >
                {c.title}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FeedCard({ hasFeed }: { hasFeed: boolean }) {
  const qc = useQueryClient();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const make = useMutation({
    mutationFn: () => api.post<{ url: string }>("/audio/feed"),
    onSuccess: (r) => {
      setUrl(r.url);
      void qc.invalidateQueries({ queryKey: ["audio"] });
    },
  });
  return (
    <Card className="mt-6 p-4">
      <div className="flex items-start gap-3">
        <Podcast className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">Listen in your podcast app</div>
          <p className="mt-1 text-muted">
            Your own private feed works in Apple Podcasts, Overcast, Pocket Casts and the rest: car controls, offline downloads, speed and chapters. Keep the address to yourself; anyone with it can listen.
          </p>
          {url ? (
            <>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-bg px-2 py-1 text-xs">{url}</code>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(url).then(() => setCopied(true));
                  }}
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
                <li>Apple Podcasts (iPhone): Library, then the ••• menu, then Follow a Show by URL.</li>
                <li>Overcast: the + button, then Add URL.</li>
                <li>Pocket Casts: Discover, then paste the address into search.</li>
              </ul>
              <p className="mt-2 text-xs text-muted">This address is shown once. Making a new one stops the old one working.</p>
            </>
          ) : (
            <Button className="mt-3" onClick={() => make.mutate()} disabled={make.isPending}>
              {hasFeed ? "Make a new feed address (replaces the old one)" : "Make my private feed address"}
            </Button>
          )}
          {make.error ? <ErrorBox error={make.error} className="mt-2" /> : null}
        </div>
      </div>
    </Card>
  );
}
