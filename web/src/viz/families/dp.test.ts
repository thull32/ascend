import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { dpFamily, type DpInput } from "./dp";

const CATALOGUE = ["fibonacci", "climbing-stairs", "coin-change", "house-robber", "lis", "lcs", "edit-distance", "knapsack-01", "unique-paths", "min-path-sum", "word-break", "palindrome-substrings", "max-subarray"];

const norm = (raw: Record<string, unknown>) => dpFamily.normalise!(raw);
const run = (algo: string, raw: Record<string, unknown>) => dpFamily.algorithms[algo]!(norm({ ...(dpFamily.examples[algo] ?? {}), ...raw }));

function check(frames: ReturnType<typeof run>) {
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
  for (const fr of frames) {
    expect(typeof fr.note).toBe("string");
    expect(fr.note.trim().length).toBeGreaterThan(0);
    expect(fr.state.rows.length + fr.state.tables.length).toBeGreaterThanOrEqual(0);
  }
}

const edges: Record<string, Record<string, unknown>[]> = {
  fibonacci: [{ n: 0 }, { n: 1 }, { n: 30 }, { n: "nope" }],
  "climbing-stairs": [{ n: 0 }, { n: 1 }, { n: 30 }],
  "coin-change": [{ coins: [], amount: 5 }, { coins: [2], amount: 3 }, { coins: [5, 5, 5], amount: 30 }, { coins: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000], amount: 30 }, { coins: [7], amount: 0 }],
  "house-robber": [{ values: [] }, { values: [5] }, { values: [3, 3, 3, 3] }, { values: Array.from({ length: 40 }, (_, i) => i) }],
  lis: [{ values: [] }, { values: [7] }, { values: [4, 4, 4, 4] }, { values: Array.from({ length: 40 }, (_, i) => (i * 7) % 13) }],
  lcs: [{ a: "", b: "" }, { a: "a", b: "a" }, { a: "aaaa", b: "aaaa" }, { a: "abcdefghijklmnop", b: "ponmlkjihgfedcba" }],
  "edit-distance": [{ a: "", b: "abc" }, { a: "a", b: "" }, { a: "same", b: "same" }, { a: "abcdefghijklmnop", b: "ponmlkjihgfedcba" }],
  "knapsack-01": [{ weights: [], values: [], capacity: 5 }, { weights: [3], values: [4], capacity: 2 }, { weights: [2, 2, 2], values: [3, 3, 3], capacity: 4 }, { weights: [1, 2, 3, 4, 5, 6, 7, 8], values: [1, 2, 3, 4, 5, 6, 7, 8], capacity: 50 }],
  "unique-paths": [{ rows: 1, cols: 1 }, { grid: [[0, 1], [0, 0]] }, { rows: 20, cols: 20 }, { grid: Array.from({ length: 8 }, () => new Array(8).fill(0)) }],
  "min-path-sum": [{ grid: [[7]] }, { grid: [[1, 2, 3]] }, { grid: [[1], [2], [3]] }, { grid: Array.from({ length: 8 }, () => new Array(8).fill(1)) }],
  "word-break": [{ s: "", words: ["a"] }, { s: "a", words: ["a"] }, { s: "aaaa", words: ["a"] }, { s: "leetcode", words: ["leet", "cod"] }, { s: "abcdefghijklmnopqrstuvwxyz", words: ["abc", "def", "ghi", "jkl", "mno", "pqr", "stu", "vwx", "yz"] }, { s: "x", words: [] }],
  "palindrome-substrings": [{ a: "" }, { a: "a" }, { a: "aaaa" }, { a: "abcdefghijklmnop" }],
  "max-subarray": [{ values: [] }, { values: [-1] }, { values: [2, 2, 2] }, { values: Array.from({ length: 40 }, (_, i) => (i % 2 ? -3 : 5)) }],
};

describe("dp family", () => {
  it("implements every catalogue algorithm with a label and example", () => {
    for (const name of CATALOGUE) {
      expect(dpFamily.algorithms[name], name).toBeTypeOf("function");
      expect(dpFamily.labels?.[name], name).toBeTypeOf("string");
      expect(dpFamily.examples[name], name).toBeTruthy();
    }
  });

  for (const name of Object.keys(dpFamily.algorithms)) {
    it(`${name}: example and edge inputs produce valid frames`, () => {
      check(run(name, {}));
      for (const raw of edges[name] ?? []) check(dpFamily.algorithms[name]!(norm(raw)));
      // Empty raw input (no example merged) must still produce a frame, never throw.
      check(dpFamily.algorithms[name]!(norm({})));
    });
  }

  it("normalise accepts the field aliases used by lessons", () => {
    const a = norm({ nums: [1, 2], target: 9, dict: ["x"], text: "hello", W: 4, m: 2, columns: 3 });
    expect(a.values).toEqual([1, 2]);
    expect(a.amount).toBe(9);
    expect(a.words).toEqual(["x"]);
    expect(a.s).toBe("hello");
    expect(a.capacity).toBe(4);
    expect(a.rows).toBe(2);
    expect(a.cols).toBe(3);
    const b: DpInput = norm({ a: "x".repeat(50), values: "1, 2, 3", grid: [[1, "2"], [3, "bad"]] });
    expect(b.a?.length).toBe(12);
    expect(b.values).toEqual([1, 2, 3]);
    expect(b.grid).toEqual([[1, 2], [3, 0]]);
  });

  it("final frames carry the reconstructed answers", () => {
    const last = (algo: string, raw: Record<string, unknown>) => run(algo, raw).at(-1)!;
    expect(last("fibonacci", { n: 10 }).note).toContain("F(10) = 55");
    expect(last("climbing-stairs", { n: 7 }).note).toContain("21 ways");
    expect(last("coin-change", { coins: [1, 3, 4], amount: 6 }).note).toContain("3 + 3");
    expect(last("coin-change", { coins: [2], amount: 3 }).note).toContain("−1");
    expect(last("house-robber", { values: [2, 7, 9, 3, 1] }).note).toContain("Best loot 12");
    expect(last("lis", { values: [10, 9, 2, 5, 3, 7, 101, 18] }).note).toContain("LIS length 4");
    expect(last("lcs", { a: "AGGTAB", b: "GXTXAYB" }).note).toContain('"GTAB"');
    expect(last("edit-distance", { a: "horse", b: "ros" }).note).toContain("Edit distance 3");
    expect(last("knapsack-01", { weights: [1, 3, 4, 5], values: [1, 4, 5, 7], capacity: 7 }).note).toContain("Best value 9");
    expect(last("unique-paths", { rows: 3, cols: 4 }).note).toContain("10 unique path");
    expect(last("min-path-sum", { grid: [[1, 3, 1], [1, 5, 1], [4, 2, 1]] }).note).toContain("Minimum path sum 7");
    expect(last("word-break", { s: "catsanddog", words: ["cat", "cats", "and", "sand", "dog"] }).note).toContain("cats | and | dog");
    expect(last("palindrome-substrings", { a: "babad" }).note).toContain('"bab"');
    expect(last("max-subarray", { values: [-2, 1, -3, 4, -1, 2, 1, -5, 4] }).note).toContain("sum 6");
  });

  it("every fill frame states the transition with numbers", () => {
    const frames = run("lcs", { a: "abcde", b: "ace" });
    const fills = frames.filter((fr) => fr.tag === "match" || fr.tag === "mismatch");
    expect(fills.length).toBe(15);
    for (const fr of fills) {
      expect(fr.state.formula).toMatch(/^dp\[\d+\]\[\d+\] = .* = \d+$/);
      const active = Object.values(fr.state.tables[0]!.tones).filter((t) => t === "active");
      const reads = Object.values(fr.state.tables[0]!.tones).filter((t) => t === "compare");
      expect(active.length).toBe(1);
      expect(reads.length).toBeGreaterThanOrEqual(1);
    }
  });
});
