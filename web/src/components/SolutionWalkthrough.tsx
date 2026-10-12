import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { Frame, RendererProps } from "../viz/engine";
import { VizPlayer, type Narration } from "../viz/VizPlayer";
import { cn } from "../lib/utils";

/** One executed line of a problem's solution (scripts/trace_solution.py). */
export interface TraceFrame {
  line: number;
  stack: string[];
  /** The current function's variables before the line runs, formatted. */
  vars: Record<string, string>;
  /** On a function's last frame: what it returns. */
  ret?: string;
}

export interface SolutionTrace {
  problem: string;
  code: string;
  args: unknown;
  result: string;
  frames: TraceFrame[];
}

interface WalkthroughResponse {
  trace: SolutionTrace;
  narration: { name: string; title: string; duration: number; cues: Narration["cues"] } | null;
}

interface Step {
  frame: TraceFrame;
  /** Variables whose value differs from the previous step in the same call. */
  changed: string[];
}

export function traceSteps(trace: SolutionTrace): Frame<Step>[] {
  return trace.frames.map((f, i) => {
    const prev = trace.frames[i - 1];
    const sameCall = prev && prev.stack.join(">") === f.stack.join(">");
    const changed = sameCall ? Object.keys(f.vars).filter((k) => prev.vars[k] !== f.vars[k]) : [];
    const note = f.ret !== undefined ? `${f.stack.at(-1)} returns ${f.ret}` : `Line ${f.line} is about to run`;
    return { state: { frame: f, changed }, note };
  });
}

function TraceView({ frame, input }: RendererProps<string[], Step>) {
  const { frame: f, changed } = frame.state;
  const codeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Keep the current line in view inside the code pane, not the page.
    const box = codeRef.current;
    const row = box?.querySelector<HTMLElement>("[data-current]");
    if (box && row && (row.offsetTop < box.scrollTop || row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight)) {
      box.scrollTo({ top: row.offsetTop - box.clientHeight / 3, behavior: "smooth" });
    }
  }, [f.line]);
  const vars = Object.entries(f.vars);
  return (
    <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div ref={codeRef} className="relative max-h-80 overflow-auto rounded-md border border-line bg-bg font-mono text-xs leading-5">
        {input.map((text, i) => (
          <div
            key={i}
            data-current={i + 1 === f.line ? "" : undefined}
            className={cn("flex whitespace-pre pr-3", i + 1 === f.line && (f.ret !== undefined ? "bg-emerald-500/15" : "bg-accent/20"))}
          >
            <span className={cn("w-8 shrink-0 select-none pr-2 text-right text-muted", i + 1 === f.line && "text-fg")}>{i + 1}</span>
            <span>{text || " "}</span>
          </div>
        ))}
      </div>
      <div className="min-w-0 space-y-2 text-xs">
        <div className="truncate text-muted" title={f.stack.join(" › ")}>
          {f.stack.map((fn, i) => (
            <span key={i}>
              {i > 0 && " › "}
              <span className={cn("font-mono", i === f.stack.length - 1 && "text-fg")}>{fn}</span>
            </span>
          ))}
        </div>
        {vars.length === 0 ? (
          <p className="text-muted">No variables yet.</p>
        ) : (
          <table className="w-full table-fixed border-collapse font-mono">
            <tbody>
              {vars.map(([k, v]) => (
                <tr key={k} className={cn("border-b border-line/60", changed.includes(k) && "bg-amber-500/15")}>
                  <td className="w-1/3 truncate py-0.5 pr-2 align-top text-muted" title={k}>
                    {k}
                  </td>
                  <td className="break-words py-0.5 align-top">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {f.ret !== undefined && (
          <p className="font-mono">
            <span className="text-muted">returns </span>
            <span className="text-emerald-500">{f.ret}</span>
          </p>
        )}
      </div>
    </div>
  );
}

/** The solution run step by step on one example, narrated when its audio
 * is published. Renders nothing for problems without a walkthrough. */
export function SolutionWalkthrough({ slug }: { slug: string }) {
  const q = useQuery({
    queryKey: ["problem-walkthrough", slug],
    queryFn: () =>
      api.get<WalkthroughResponse>(`/problems/${slug}/walkthrough`).catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }),
    staleTime: Infinity,
  });
  const data = q.data;
  const frames = useMemo(() => (data ? traceSteps(data.trace) : []), [data]);
  const lines = useMemo(() => (data ? data.trace.code.replace(/\n$/, "").split("\n") : []), [data]);
  const narration = useMemo<Narration | undefined>(
    () =>
      data?.narration
        ? { src: `/api/audio/play/${encodeURIComponent(data.narration.name)}`, cues: data.narration.cues, duration: data.narration.duration }
        : undefined,
    [data],
  );
  if (!data || frames.length === 0) return null;
  return (
    <div className="not-prose mb-6">
      <VizPlayer<string[], Step>
        frames={frames}
        input={lines}
        Renderer={TraceView}
        title="Walk through the solution"
        caption={`On ${describeArgs(data.trace.args)}, it returns ${data.trace.result}. Highlighted: the line about to run; amber: what the last line changed.`}
        narration={narration}
      />
    </div>
  );
}

function describeArgs(args: unknown): string {
  const text = JSON.stringify(args, (_k, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Record<string, unknown>;
      if ("$list" in o) return `list ${JSON.stringify(o.$list)}`;
      if ("$tree" in o) return `tree ${JSON.stringify(o.$tree)}`;
      if ("$graph" in o) return `graph ${JSON.stringify(o.$graph)}`;
    }
    return v;
  });
  const shown = text.replace(/"(list|tree|graph) (\[[^"]*\])"/g, "$1 $2").replace(/\\"/g, '"');
  return shown.length > 160 ? `${shown.slice(0, 159)}…` : shown;
}

/** Exported for tests. */
export const TraceViewForTest = TraceView;
