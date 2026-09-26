import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { memoryFamily, type MemoryInput } from "./memory";

const check = (algo: string, input: MemoryInput) => {
  const frames = memoryFamily.algorithms[algo]!(input);
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
  for (const fr of frames) expect(fr.note.trim().length).toBeGreaterThan(0);
  return frames;
};

describe("memory family", () => {
  const algos = Object.keys(memoryFamily.algorithms);
  it("implements the catalogue", () => {
    expect(algos.sort()).toEqual(["cache-lines", "call-stack", "dynamic-array-growth", "gc-mark-sweep", "ownership-borrowing", "reference-counting", "stack-heap", "virtual-memory-paging"].sort());
    for (const a of algos) {
      expect(memoryFamily.examples[a]).toBeDefined();
      expect(memoryFamily.labels?.[a]).toBeDefined();
    }
  });
  for (const algo of algos) {
    it(`${algo}: example and edge inputs`, () => {
      check(algo, memoryFamily.examples[algo]!);
      check(algo, {});
      check(algo, { values: [], n: 0 });
      check(algo, { values: [1], n: 1 });
      check(algo, { values: [3, 3, 3, 3], n: 8 });
      check(algo, { values: Array.from({ length: 40 }, (_, i) => i * 7), n: 1000 });
    });
  }
  it("snapshots are independent between frames", () => {
    const frames = check("stack-heap", { values: [1, 2] });
    expect(frames[0]!.state.stack.length).toBe(1);
    expect(frames[frames.length - 1]!.state.stack.length).toBe(0);
    expect(frames[0]!.state.heap).not.toBe(frames[1]!.state.heap);
  });
  it("paging counts hits and faults", () => {
    const frames = check("virtual-memory-paging", { values: [0, 0, 0], n: 1 });
    const last = frames[frames.length - 1]!.state.vars;
    expect(last.hits).toBe(2);
    expect(last.faults).toBe(1);
  });
  it("normalise tolerates loose input", () => {
    const n = memoryFamily.normalise!;
    expect(n({ values: ["1", "x"], n: "4" })).toEqual({ values: [1], n: 4 });
    expect(n({})).toEqual({ values: undefined, n: undefined });
    expect(n({ depth: 3 }).n).toBe(3);
  });
});
