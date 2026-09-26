import { ChevronsLeft, ChevronsRight, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import type { Frame, RendererProps } from "./engine";
import { cn } from "../lib/utils";

interface Props<I, S> {
  frames: Frame<S>[];
  input: I;
  Renderer: ComponentType<RendererProps<I, S>>;
  title?: string;
  caption?: string;
  /** Show controls compactly (used in gallery cards). */
  compact?: boolean;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

export function VizPlayer<I, S>({ frames, input, Renderer, title, caption, compact }: Props<I, S>) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = frames.length;
  const frame = frames[Math.min(index, total - 1)];

  const step = useCallback((d: number) => setIndex((i) => Math.max(0, Math.min(total - 1, i + d))), [total]);

  useEffect(() => {
    if (!playing) return;
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

  if (!frame) return null;

  return (
    <figure className={cn("not-prose my-6 overflow-hidden rounded-xl border border-line bg-elev", compact && "my-0")} data-testid="viz">
      {title && <figcaption className="border-b border-line px-4 py-2 text-sm font-medium">{title}</figcaption>}
      <div className="relative min-h-[160px] overflow-x-auto px-3 py-4 sm:px-4" tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
          if (e.key === " ") {
            e.preventDefault();
            setPlaying((p) => !p);
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
        <Ctl onClick={() => setIndex(0)} label="First step"><SkipBack className="h-4 w-4" /></Ctl>
        <Ctl onClick={() => step(-1)} label="Previous step"><ChevronsLeft className="h-4 w-4" /></Ctl>
        <Ctl
          onClick={() => {
            if (index >= total - 1) setIndex(0);
            setPlaying((p) => !p);
          }}
          label={playing ? "Pause" : "Play"}
          primary
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Ctl>
        <Ctl onClick={() => step(1)} label="Next step"><ChevronsRight className="h-4 w-4" /></Ctl>
        <Ctl onClick={() => setIndex(total - 1)} label="Last step"><SkipForward className="h-4 w-4" /></Ctl>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={index}
          onChange={(e) => {
            setPlaying(false);
            setIndex(Number(e.target.value));
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
