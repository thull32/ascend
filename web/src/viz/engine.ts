// The visualisation engine.
//
// Every visualiser is a pure function from an input spec to a list of
// frames. A frame is a full snapshot of the structure plus a one-sentence
// explanation, so the player can scrub backwards for free and the renderer
// never needs to diff. Generators are eager but capped (MAX_FRAMES) so a
// pathological input cannot freeze the page.
//
// Adding a family: implement `Family<I, S>` in `families/<name>.tsx` and
// register it in `registry.ts`. Adding an algorithm to a family: add a
// generator to that family's `algorithms` map. The content guide's catalogue
// must match the registry (see `catalogue()`).
import type { ComponentType } from "react";

export const MAX_FRAMES = 600;

export interface Frame<S> {
  state: S;
  /** One sentence shown under the canvas explaining this step. */
  note: string;
  /** Optional short label (e.g. "compare", "swap") for the timeline. */
  tag?: string;
}

export interface VizSpec {
  type: string;
  algorithm?: string;
  scenario?: string;
  title?: string;
  caption?: string;
  [key: string]: unknown;
}

export type Generator<I, S> = (input: I) => Frame<S>[];

export interface RendererProps<I, S> {
  frame: Frame<S>;
  input: I;
  /** Frame index and total, for renderers that show a timeline. */
  index: number;
  total: number;
}

export interface Family<I = Record<string, unknown>, S = unknown> {
  name: string;
  description: string;
  algorithms: Record<string, Generator<I, S>>;
  /** Human labels for the gallery. */
  labels?: Record<string, string>;
  Renderer: ComponentType<RendererProps<I, S>>;
  /** Example inputs per algorithm for the gallery / playground. */
  examples: Record<string, I>;
  /** Normalise loose JSON from content into a valid input (fill defaults). */
  normalise?: (raw: Record<string, unknown>) => I;
}

/** Builder that enforces the frame cap and gives generators a tiny DSL. */
export class Frames<S> {
  private frames: Frame<S>[] = [];
  constructor(private readonly snapshot: () => S) {}
  push(note: string, tag?: string): void {
    if (this.frames.length >= MAX_FRAMES) {
      if (this.frames.length === MAX_FRAMES) this.frames.push({ state: this.snapshot(), note: "Stopped: frame limit reached. Try a smaller input.", tag: "limit" });
      return;
    }
    this.frames.push({ state: this.snapshot(), note, tag });
  }
  get full(): boolean {
    return this.frames.length > MAX_FRAMES;
  }
  done(): Frame<S>[] {
    return this.frames;
  }
}

export const clone = <T>(v: T): T => (typeof structuredClone === "function" ? structuredClone(v) : (JSON.parse(JSON.stringify(v)) as T));

export function algorithmOf(spec: VizSpec): string {
  return String(spec.algorithm ?? spec.scenario ?? "");
}
