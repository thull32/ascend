import { useMemo, type ComponentType } from "react";
import { algorithmOf, type Family, type Frame, type RendererProps, type VizSpec } from "./engine";
import { getFamily } from "./registry";
import { VizPlayer } from "./VizPlayer";

/** Entry point for ```viz fences inside Markdown. */
export default function VizBlock({ source }: { source: string }) {
  const spec = useMemo<VizSpec | null>(() => {
    try {
      return JSON.parse(source) as VizSpec;
    } catch {
      return null;
    }
  }, [source]);
  if (!spec) return <Warn>Visualisation block is not valid JSON.</Warn>;
  return <VizFromSpec spec={spec} />;
}

/** Resolves a spec to frames exactly as the page does (shared with tests). */
export function runSpec(spec: VizSpec): { frames: Frame<unknown>[]; input: unknown } | { error: string } {
  const family = getFamily(spec.type) as Family<Record<string, unknown>, unknown> | undefined;
  const algo = algorithmOf(spec);
  if (!family) return { error: `Unknown visualisation type "${spec.type}".` };
  const gen = family.algorithms[algo];
  if (!gen) return { error: `Unknown ${spec.type} algorithm "${algo}". Known: ${Object.keys(family.algorithms).join(", ")}.` };
  const { type: _t, algorithm: _a, scenario: _s, title: _ti, caption: _c, ...rest } = spec;
  void _t; void _a; void _s; void _ti; void _c;
  const base = family.examples[algo] ?? {};
  const raw = { ...base, ...rest };
  const input = family.normalise ? family.normalise(raw) : raw;
  try {
    const frames = gen(input);
    if (frames.length === 0) return { error: "Visualisation produced no steps." };
    return { frames, input };
  } catch (e) {
    return { error: `Visualisation failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export function VizFromSpec({ spec, compact }: { spec: VizSpec; compact?: boolean }) {
  const family = getFamily(spec.type) as Family<Record<string, unknown>, unknown> | undefined;
  const algo = algorithmOf(spec);
  const result = useMemo(() => runSpec(spec), [spec]);

  if ("error" in result || !family) return <Warn>{("error" in result && result.error) || "Unknown visualisation."}</Warn>;
  return <VizPlayer frames={result.frames} input={result.input} Renderer={family.Renderer as ComponentType<RendererProps<unknown, unknown>>} title={spec.title ?? family.labels?.[algo] ?? `${family.name}: ${algo}`} caption={spec.caption} compact={compact} />;
}

function Warn({ children }: { children: React.ReactNode }) {
  return <div className="not-prose my-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{children}</div>;
}
