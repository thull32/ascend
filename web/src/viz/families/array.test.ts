import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { arrayFamily, type ArrayInput } from "./array";

const run = (algo: string, raw: Record<string, unknown>) => arrayFamily.algorithms[algo]!(arrayFamily.normalise!(raw));
const last = <T>(xs: T[]) => xs[xs.length - 1]!;

describe("array family", () => {
  it("every algorithm runs its example and an empty input", () => {
    for (const [name, gen] of Object.entries(arrayFamily.algorithms)) {
      for (const input of [arrayFamily.examples[name]!, { values: [] } as ArrayInput]) {
        const frames = gen(input);
        expect(frames.length, name).toBeGreaterThan(0);
        expect(frames.length, name).toBeLessThanOrEqual(MAX_FRAMES + 1);
        for (const f of frames) expect(f.note.trim().length, name).toBeGreaterThan(0);
      }
    }
  });

  it("merge sort splits like a[:len // 2]: the shorter half on the left", () => {
    const frames = run("merge-sort", { values: [38, 27, 43, 3, 9, 82, 10] });
    expect(frames[1]!.note).toContain("Split [0, 6] into [0, 2] and [3, 6]");
    expect(last(frames).state.values).toEqual([3, 9, 10, 27, 38, 43, 82]);
  });

  it("counting sort turns counts into starting positions and places stably", () => {
    const frames = run("counting-sort", { values: [4, 2, 2, 8, 3, 3, 1] });
    const prefix = frames.filter((f) => f.tag === "prefix");
    expect(prefix).toHaveLength(9);
    expect(last(prefix).state.aux!.values).toEqual([0, 0, 1, 3, 5, 6, 6, 6, 6]);
    const place = frames.filter((f) => f.tag === "place");
    expect(place).toHaveLength(7);
    expect(place[0]!.note).toContain("out[5]");
    expect(last(frames).state.aux2!.values).toEqual([1, 2, 2, 3, 3, 4, 8]);
  });

  it("prefix sums: the leading-zero form, its query, and no unrelated query by default", () => {
    const lz = run("prefix-sum", { values: [3, 1, 4, 1, 5, 9, 2, 6], leadingZero: true, query: [3, 5] });
    expect(last(lz).state.aux!.values).toEqual([0, 3, 4, 8, 9, 14, 23, 25, 31]);
    expect(last(lz).note).toContain("P[6] − P[3] = 23 − 8 = 15");
    const plain = run("prefix-sum", { values: [0, 5, 0, 0, -5, 0, 3, 0] });
    expect(plain.some((f) => f.tag === "query")).toBe(false);
    expect(last(plain).note).toContain("0, 5, 5, 5, 0, 0, 3, 3");
    const peak = run("prefix-sum", { values: [0, 1, 1, 1, 0, 0, -1, -1, -1], peak: true });
    expect(last(peak).tag).toBe("peak");
    expect(last(peak).state.vars.peak).toBe(3);
  });

  it("prefix sums count subarrays summing to k and divisible by mod", () => {
    const k = run("prefix-sum", { values: [3, 4, 7, 2, -3, 1, 4, 2], k: 7 });
    expect(last(k).state.vars.count).toBe(4);
    expect(k.filter((f) => f.tag === "hit")).toHaveLength(4);
    const m = run("prefix-sum", { values: [4, 5, 0, -2, -3, 1], mod: 5 });
    expect(last(m).state.vars.total).toBe(7);
    expect(last(m).state.aux2!.values).toEqual([0, 4, 4, 4, 2, 4, 0]);
  });

  it("kadane's tags agree with its notes, and the first frame starts the run", () => {
    const frames = run("kadane", { values: [-2, 1, -3, 4, -1, 2, 1, -5, 4] });
    expect(frames[1]!.tag).toBe("start");
    for (const f of frames) {
      if (f.tag === "restart") expect(f.note).toContain("restart");
      if (f.tag === "extend") expect(f.note).toContain("extend");
    }
    expect(last(frames).note).toContain("6 over [3, 6]");
  });

  it("dutch flag: values, pointers and regions in every frame describe the same moment", () => {
    for (const values of [[1, 2, 0, 2, 1, 0, 2, 1, 0], [2, 0, 2, 1, 1, 0, 1, 2], [2, 0, 2, 1, 1, 0]]) {
      const frames = run("dutch-flag", { values });
      for (const f of frames) {
        const { lo, mid, hi } = f.state.pointers as { lo: number; mid: number; hi: number };
        const a = f.state.values;
        a.forEach((v, i) => {
          if (i < lo) expect(v, f.note).toBe(0);
          else if (i < mid) expect(v, f.note).toBe(1);
          else if (i > hi) expect(v, f.note).toBe(2);
        });
      }
      const end = last(frames).state.pointers as { mid: number; hi: number };
      expect(end.hi).toBe(end.mid - 1);
    }
    expect((last(run("dutch-flag", { values: [1, 2, 0, 2, 1, 0, 2, 1, 0] })).state.pointers as { hi: number }).hi).toBe(5);
  });

  it("two pointers can trace the closest-pair loop to the end", () => {
    const frames = run("two-pointers-sum", { values: [1, 3, 4, 6, 8, 11, 14], target: 15, closest: true });
    expect(frames).toHaveLength(8);
    expect(last(frames).state.vars).toMatchObject({ best: 15, iterations: 6 });
  });

  it("first-true can phrase probes as a named predicate over candidate values", () => {
    const frames = run("binary-search-first-true", { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], target: 4, predicate: "feasible" });
    expect(frames[1]!.note).toContain("feasible(6)");
    expect(last(frames).note).toContain("4 is the smallest candidate");
  });

  it("monotonic stack does not call equal values decreasing", () => {
    const frames = run("monotonic-stack-next-greater", { values: [2, 1, 2, 4] });
    expect(frames.some((f) => f.note.includes("2 > 2"))).toBe(false);
    expect(frames.some((f) => f.note.includes("2 = 2"))).toBe(true);
  });
});
