// Small SVG/HTML building blocks shared by family renderers so every
// visualisation reads as one system (same colours, same cell sizes).
import { cn } from "../lib/utils";

export type Tone = "default" | "active" | "compare" | "done" | "danger" | "muted" | "path" | "visited" | "frontier";

export const toneClass: Record<Tone, string> = {
  default: "border-line bg-elev-2 text-fg",
  active: "border-accent bg-accent/25 text-fg ring-2 ring-accent/50",
  compare: "border-warn bg-warn/20 text-fg",
  done: "border-success bg-success/20 text-fg",
  danger: "border-danger bg-danger/20 text-fg",
  muted: "border-line bg-transparent text-muted opacity-60",
  path: "border-accent bg-accent/40 text-fg",
  visited: "border-success/60 bg-success/10 text-fg",
  frontier: "border-warn bg-warn/15 text-fg",
};

export const toneFill: Record<Tone, string> = {
  default: "var(--bg-elev-2)",
  active: "color-mix(in srgb, var(--accent) 35%, var(--bg-elev-2))",
  compare: "color-mix(in srgb, var(--warn) 30%, var(--bg-elev-2))",
  done: "color-mix(in srgb, var(--success) 30%, var(--bg-elev-2))",
  danger: "color-mix(in srgb, var(--danger) 30%, var(--bg-elev-2))",
  muted: "transparent",
  path: "color-mix(in srgb, var(--accent) 55%, var(--bg-elev-2))",
  visited: "color-mix(in srgb, var(--success) 18%, var(--bg-elev-2))",
  frontier: "color-mix(in srgb, var(--warn) 22%, var(--bg-elev-2))",
};

export const toneStroke: Record<Tone, string> = {
  default: "var(--border)",
  active: "var(--accent)",
  compare: "var(--warn)",
  done: "var(--success)",
  danger: "var(--danger)",
  muted: "var(--border)",
  path: "var(--accent)",
  visited: "var(--success)",
  frontier: "var(--warn)",
};

/** A row of labelled cells (arrays, hash slots, DP rows). */
export function Cells({ values, tones, labels, pointers, size = "md" }: {
  values: (string | number | null)[];
  tones?: (Tone | undefined)[];
  /** Small text under each cell (index by default). */
  labels?: (string | number | null | undefined)[];
  /** Named pointers drawn above cells: { i: 2, j: 5 } */
  pointers?: Record<string, number | undefined>;
  size?: "sm" | "md";
}) {
  const ptrs = Object.entries(pointers ?? {}).filter(([, v]) => v !== undefined) as [string, number][];
  const w = size === "sm" ? "min-w-8 h-8 text-xs" : "min-w-10 h-10 text-sm";
  return (
    <div className="inline-flex flex-col">
      {ptrs.length > 0 && (
        <div className="flex gap-1">
          {values.map((_, i) => (
            <div key={i} className={cn("flex items-end justify-center text-[10px] font-semibold text-accent", size === "sm" ? "min-w-8" : "min-w-10")}>
              {ptrs.filter(([, v]) => v === i).map(([k]) => k).join(",")}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        {values.map((v, i) => (
          <div key={i} className={cn("flex items-center justify-center rounded-md border px-1 font-mono transition-colors", w, toneClass[tones?.[i] ?? "default"])}>
            {v === null ? "·" : v}
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {values.map((_, i) => (
          <div key={i} className={cn("text-center text-[10px] text-muted", size === "sm" ? "min-w-8" : "min-w-10")}>
            {labels ? (labels[i] ?? "") : i}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Key/value legend or variable readout: { lo: 0, hi: 7, mid: 3 } */
export function Vars({ vars }: { vars: Record<string, unknown> }) {
  const entries = Object.entries(vars).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-muted">
      {entries.map(([k, v]) => (
        <span key={k}>
          <span className="text-fg">{k}</span> = {typeof v === "string" ? v : JSON.stringify(v)}
        </span>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { tone: Tone; label: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-1.5">
          <span className={cn("inline-block h-3 w-3 rounded border", toneClass[it.tone])} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Simple bar chart used by sorting visualisers. */
export function Bars({ values, tones, max, height = 140 }: { values: number[]; tones?: (Tone | undefined)[]; max?: number; height?: number }) {
  const m = max ?? Math.max(1, ...values);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-col items-center justify-end gap-1" style={{ height }}>
          <div className={cn("w-5 rounded-t border transition-all sm:w-7", toneClass[tones?.[i] ?? "default"])} style={{ height: `${Math.max(4, (v / m) * (height - 24))}px` }} />
          <span className="font-mono text-[10px] text-muted">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** SVG helpers */
export function Arrow({ x1, y1, x2, y2, tone = "default", dashed, label }: { x1: number; y1: number; x2: number; y2: number; tone?: Tone; dashed?: boolean; label?: string }) {
  const id = `arrow-${tone}`;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <defs>
        <marker id={id} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={toneStroke[tone]} />
        </marker>
      </defs>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={toneStroke[tone]} strokeWidth={tone === "default" || tone === "muted" ? 1.5 : 2.5} strokeDasharray={dashed ? "4 3" : undefined} markerEnd={`url(#${id})`} opacity={tone === "muted" ? 0.4 : 1} />
      {label && (
        <text x={mx} y={my - 4} fontSize="10" textAnchor="middle" fill="var(--fg-muted)" style={{ paintOrder: "stroke", stroke: "var(--bg-elev)", strokeWidth: 3 }}>
          {label}
        </text>
      )}
    </g>
  );
}

export function Circle({ x, y, r = 16, label, tone = "default", sub }: { x: number; y: number; r?: number; label: string | number; tone?: Tone; sub?: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={toneFill[tone]} stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1.5 : 2.5} />
      <text x={x} y={y + 4} fontSize="12" textAnchor="middle" fill="var(--fg)" fontFamily="var(--font-mono)">
        {label}
      </text>
      {sub && (
        <text x={x} y={y + r + 12} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">
          {sub}
        </text>
      )}
    </g>
  );
}

export function Box({ x, y, w, h, label, tone = "default", sub }: { x: number; y: number; w: number; h: number; label: string; tone?: Tone; sub?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={8} fill={toneFill[tone]} stroke={toneStroke[tone]} strokeWidth={tone === "default" ? 1.5 : 2.5} />
      <text x={x + w / 2} y={y + h / 2 + (sub ? 0 : 4)} fontSize="11" textAnchor="middle" fill="var(--fg)" fontWeight={600}>
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + h / 2 + 13} fontSize="9" textAnchor="middle" fill="var(--fg-muted)">
          {sub}
        </text>
      )}
    </g>
  );
}
