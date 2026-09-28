import { Component, useMemo, type ComponentType, type ErrorInfo, type ReactNode } from "react";
import { algorithmOf, type Family, type Frame, type RendererProps, type VizSpec } from "./engine";
import { getFamily } from "./registry";
import { VizPlayer } from "./VizPlayer";

/** Entry point for ```viz fences inside Markdown. */
export default function VizBlock({ source }: { source: string }) {
  const spec = useMemo<VizSpec | null>(() => parseSpec(source), [source]);
  if (!spec) return <Warn>Visualisation block is not a valid JSON object.</Warn>;
  return <VizFromSpec spec={spec} />;
}

/** Parses a block's source; anything but a JSON object is rejected. */
export function parseSpec(source: string): VizSpec | null {
  try {
    const value: unknown = JSON.parse(source);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as VizSpec) : null;
  } catch {
    return null;
  }
}

/** Resolves a spec to frames exactly as the page does (shared with tests). */
export function runSpec(spec: VizSpec): { frames: Frame<unknown>[]; input: unknown } | { error: string } {
  if (typeof spec.type !== "string") return { error: "Visualisation block has no \"type\"." };
  const family = getFamily(spec.type) as Family<Record<string, unknown>, unknown> | undefined;
  const algo = algorithmOf(spec);
  if (!family) return { error: `Unknown visualisation type "${spec.type}".` };
  const gen = family.algorithms[algo];
  if (!gen) return { error: `Unknown ${spec.type} algorithm "${algo}". Known: ${Object.keys(family.algorithms).join(", ")}.` };
  const { type: _t, algorithm: _a, scenario: _s, title: _ti, caption: _c, ...rest } = spec;
  void _t; void _a; void _s; void _ti; void _c;
  const base = family.examples[algo] ?? {};
  const raw = { ...base, ...rest };
  // Normalising runs inside the try too: it reads author-supplied fields, and
  // an unexpected shape must become a warning box, not an exception that
  // takes the page down.
  try {
    const input = family.normalise ? family.normalise(raw) : raw;
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
  return (
    <VizErrorBoundary>
      <VizPlayer frames={result.frames} input={result.input} Renderer={family.Renderer as ComponentType<RendererProps<unknown, unknown>>} title={spec.title ?? family.labels?.[algo] ?? `${family.name}: ${algo}`} caption={spec.caption} compact={compact} />
    </VizErrorBoundary>
  );
}

/** A renderer that throws on an unexpected frame shows a warning in place of
 *  the visualisation; without a boundary React unmounts the whole page. */
class VizErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("visualisation render failed", error, info.componentStack);
  }
  override render() {
    return this.state.error ? <Warn>Visualisation failed to render: {this.state.error}</Warn> : this.props.children;
  }
}

function Warn({ children }: { children: ReactNode }) {
  return <div className="not-prose my-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">{children}</div>;
}
