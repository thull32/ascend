import { ChevronsLeft, ChevronsRight, Headphones, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { Frame, RendererProps } from "./engine";
import { cn } from "../lib/utils";

/** A narrated walkthrough: one MP3, and the frame each cue shows from its
 * start time. In narrated mode the audio drives the frames. */
export interface Narration {
  src: string;
  /** `to` makes a range cue: frames `frame`..`to` play evenly across it. */
  cues: { frame: number; to?: number | null; start: number }[];
  duration: number;
}

interface Props<I, S> {
  frames: Frame<S>[];
  input: I;
  Renderer: ComponentType<RendererProps<I, S>>;
  title?: string;
  caption?: string;
  /** Show controls compactly (used in gallery cards). */
  compact?: boolean;
  narration?: Narration;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

export function VizPlayer<I, S>({ frames, input, Renderer, title, caption, compact, narration }: Props<I, S>) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const [narrated, setNarrated] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const total = frames.length;
  const frame = frames[Math.min(index, total - 1)];
  const cues = narration?.cues ?? [];

  // In narrated mode, stepping moves between cues and seeks the narration.
  const seekToCue = useCallback(
    (k: number) => {
      const a = audio.current;
      const cue = cues[Math.max(0, Math.min(cues.length - 1, k))];
      if (!a || !cue) return;
      a.currentTime = cue.start;
      setIndex(Math.min(total - 1, cue.frame));
    },
    [cues, total],
  );
  const cueAt = (t: number) => {
    let k = 0;
    for (let i = 0; i < cues.length; i++) if (cues[i]!.start <= t + 0.05) k = i;
    return k;
  };

  const step = useCallback(
    (d: number) => {
      if (narrated) {
        seekToCue(cueAt(audio.current?.currentTime ?? 0) + d);
        return;
      }
      setIndex((i) => Math.max(0, Math.min(total - 1, i + d)));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [total, narrated, seekToCue],
  );

  useEffect(() => {
    if (audio.current) audio.current.playbackRate = speed;
  }, [speed, narrated]);

  useEffect(() => {
    if (!playing || narrated) return;
    if (index >= total - 1) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(() => setIndex((i) => i + 1), 900 / speed);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [playing, index, total, speed]);

  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [frames]);

  const togglePlay = () => {
    if (narrated) {
      const a = audio.current;
      if (!a) return;
      if (a.paused) void a.play();
      else a.pause();
      return;
    }
    if (index >= total - 1) setIndex(0);
    setPlaying((p) => !p);
  };

  if (!frame) return null;

  return (
    <figure className={cn("not-prose my-6 overflow-hidden rounded-xl border border-line bg-elev", compact && "my-0")} data-testid="viz">
      {(title || narration) && (
        <figcaption className="flex items-center gap-2 border-b border-line px-4 py-2 text-sm font-medium">
          <span className="min-w-0 flex-1">{title}</span>
          {narration && (
            <button
              onClick={() => {
                if (narrated) {
                  audio.current?.pause();
                  setNarrated(false);
                } else {
                  setPlaying(false);
                  setNarrated(true);
                  setIndex(cues[0]?.frame ?? 0);
                }
              }}
              className={cn("flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-normal", narrated ? "border-accent bg-accent-strong text-white" : "border-accent text-accent hover:bg-elev-2")}
              aria-pressed={narrated}
            >
              <Headphones className="h-3 w-3" /> {narrated ? "Narrated" : `Narrated walkthrough, ${Math.round(narration.duration / 60) || 1} min`}
            </button>
          )}
        </figcaption>
      )}
      {narration && narrated && (
        <audio
          ref={audio}
          src={narration.src}
          autoPlay
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            const t = e.currentTarget.currentTime;
            const k = cueAt(t);
            const cue = cues[k];
            if (!cue) return;
            let f = cue.frame;
            const to = cue.to ?? cue.frame;
            if (to > cue.frame) {
              // Spread the range across the cue's narration.
              const end = cues[k + 1]?.start ?? narration.duration;
              const p = Math.max(0, Math.min(1, (t - cue.start) / Math.max(0.1, end - cue.start)));
              f = cue.frame + Math.min(to - cue.frame, Math.floor(p * (to - cue.frame + 1)));
            }
            if (f !== index) setIndex(Math.min(total - 1, f));
          }}
        />
      )}
      <div className="relative min-h-[160px] overflow-x-auto px-3 py-4 sm:px-4" tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
          if (e.key === " ") {
            e.preventDefault();
            togglePlay();
          }
        }}
        aria-label="Visualisation canvas. Use arrow keys to step, space to play."
      >
        <Renderer frame={frame} input={input} index={index} total={total} />
      </div>
      <div className="border-t border-line px-4 py-2.5 text-sm" aria-live="polite">
        <span className="mr-2 rounded bg-elev-2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          {index + 1}/{total}
          {frame.tag ? ` · ${frame.tag}` : ""}
        </span>
        {frame.note}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-line px-2 py-1.5">
        <Ctl onClick={() => (narrated ? seekToCue(0) : setIndex(0))} label="First step"><SkipBack className="h-4 w-4" /></Ctl>
        <Ctl onClick={() => step(-1)} label="Previous step"><ChevronsLeft className="h-4 w-4" /></Ctl>
        <Ctl onClick={togglePlay} label={playing ? "Pause" : "Play"} primary>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Ctl>
        <Ctl onClick={() => step(1)} label="Next step"><ChevronsRight className="h-4 w-4" /></Ctl>
        <Ctl onClick={() => (narrated ? seekToCue(cues.length - 1) : setIndex(total - 1))} label="Last step"><SkipForward className="h-4 w-4" /></Ctl>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={index}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (narrated) {
              let k = 0;
              cues.forEach((c, i) => {
                if (c.frame <= v) k = i;
              });
              seekToCue(k);
              return;
            }
            setPlaying(false);
            setIndex(v);
          }}
          className="mx-2 min-w-[80px] flex-1 accent-[var(--accent)]"
          aria-label="Step"
        />
        <div className="flex gap-0.5">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={cn("rounded px-1.5 py-0.5 text-[11px]", s === speed ? "bg-elev-2 text-fg" : "text-muted hover:text-fg")}>
              {s}×
            </button>
          ))}
        </div>
      </div>
      {caption && <p className="border-t border-line px-4 py-2 text-xs text-muted">{caption}</p>}
    </figure>
  );
}

function Ctl({ children, onClick, label, primary }: { children: React.ReactNode; onClick: () => void; label: string; primary?: boolean }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn("rounded-md p-1.5 hover:bg-elev-2", primary && "bg-accent-strong text-white hover:bg-accent")}>
      {children}
    </button>
  );
}
