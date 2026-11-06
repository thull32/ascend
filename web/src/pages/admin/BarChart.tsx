import { useState } from "react";
import { cn } from "../../lib/utils";

export interface Bar {
  /** ISO date (or any label) for the x axis and the tooltip. */
  label: string;
  value: number;
}

/** A single-series column chart for daily counts: thin bars with rounded
 *  data-ends on a shared baseline, a recessive grid, a tooltip per column
 *  (the whole column is the hover target), and the numbers as a table for
 *  screen readers and anyone who wants them. One series, so no legend: the
 *  title names it. */
export function BarChart({ title, bars, format = (n) => n.toLocaleString(), height = 120, summable = true }: { title: string; bars: Bar[]; format?: (n: number) => string; height?: number; /** False for counts of distinct people, whose daily values do not add up. */ summable?: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...bars.map((b) => b.value));
  const top = niceCeil(max);
  const total = bars.reduce((s, b) => s + b.value, 0);
  const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : s);
  const shown = hover ?? bars.length - 1;

  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted">
          {bars[shown] ? (
            <>
              {day(bars[shown].label)}: <span className="font-medium text-fg tabular-nums">{format(bars[shown].value)}</span>
            </>
          ) : null}
          {summable && <span className="ml-2">· {format(total)} total</span>}
        </span>
      </figcaption>
      <div className="relative mt-3 flex" aria-hidden>
        {/* y axis: just the top value and zero */}
        <div className="flex w-8 shrink-0 flex-col justify-between pr-1 text-right text-[10px] text-muted tabular-nums" style={{ height }}>
          <span className="-translate-y-1/2">{format(top)}</span>
          <span className="translate-y-1/2">0</span>
        </div>
        <div className="relative flex-1" style={{ height }} onMouseLeave={() => setHover(null)}>
          <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line/60" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-line" />
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {bars.map((b, i) => (
              <div key={b.label} className="group relative flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)}>
                <div
                  className={cn("w-full max-w-4 rounded-t-[4px] bg-chart transition-opacity", hover !== null && hover !== i && "opacity-40")}
                  style={{ height: b.value > 0 ? `max(2px, ${(b.value / top) * 100}%)` : 0 }}
                />
                {hover === i && (
                  // Just above the bar, but never above the plot (where it would cover the caption).
                  <div
                    className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-line bg-elev px-2 py-1 text-xs shadow-lg"
                    style={{ bottom: `calc(min(${(b.value / top) * 100}%, 100% - 44px) + 6px)` }}
                  >
                    <div className="text-muted">{day(b.label)}</div>
                    <div className="font-medium tabular-nums">{format(b.value)}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ml-8 mt-1 flex justify-between text-[10px] text-muted" aria-hidden>
        <span>{bars[0] && day(bars[0].label)}</span>
        <span>{bars.at(-1) && day(bars.at(-1)!.label)}</span>
      </div>
      <details className="mt-2 text-xs text-muted">
        <summary className="cursor-pointer select-none hover:text-fg">Table</summary>
        <table className="mt-2 w-full text-left">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th className="font-medium">Day</th>
              <th className="text-right font-medium">{title}</th>
            </tr>
          </thead>
          <tbody>
            {bars.map((b) => (
              <tr key={b.label}>
                <td>{day(b.label)}</td>
                <td className="text-right tabular-nums text-fg">{format(b.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** The smallest 1, 2 or 5 × 10^n at or above `n`, so the axis top reads cleanly. */
export function niceCeil(n: number): number {
  if (n <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  for (const m of [1, 2, 5, 10]) if (m * p >= n) return m * p;
  return 10 * p;
}
