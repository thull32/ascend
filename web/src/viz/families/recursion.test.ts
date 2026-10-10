import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { recursionFamily } from "./recursion";

const CATALOGUE = ["factorial", "fibonacci", "hanoi", "permutations", "subsets", "combinations", "n-queens", "binary-search-recursive", "merge-sort-tree", "flood-fill"];

const norm = (raw: Record<string, unknown>) => recursionFamily.normalise!(raw);
const run = (algo: string, raw: Record<string, unknown>) => recursionFamily.algorithms[algo]!(norm({ ...(recursionFamily.examples[algo] ?? {}), ...raw }));

function check(frames: ReturnType<typeof run>) {
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
  expect(frames.some((fr) => fr.tag === "limit"), "input caps must keep every input under MAX_FRAMES").toBe(false);
  for (const fr of frames) {
    expect(typeof fr.note).toBe("string");
    expect(fr.note.trim().length).toBeGreaterThan(0);
    expect(Array.isArray(fr.state.nodes)).toBe(true);
    expect(Array.isArray(fr.state.stack)).toBe(true);
    // Every node's parent must already exist (the tree is built up in order).
    for (const n of fr.state.nodes) if (n.parent !== null) expect(n.parent).toBeLessThan(n.id);
  }
}

const edges: Record<string, Record<string, unknown>[]> = {
  factorial: [{ n: 0 }, { n: 1 }, { n: 12 }, { n: "nope" }],
  fibonacci: [{ n: 0 }, { n: 1 }, { n: 10 }, { n: -5 }],
  hanoi: [{ n: 0 }, { n: 1 }, { n: 6 }],
  permutations: [{ values: [] }, { values: [1] }, { values: [2, 2, 2] }, { values: [1, 2, 3, 4, 5, 6] }, { values: "abc" }],
  subsets: [{ values: [] }, { values: [1] }, { values: [1, 1, 1] }, { values: [1, 2, 3, 4, 5, 6, 7] }],
  combinations: [{ values: [], k: 2 }, { n: 1, k: 1 }, { n: 4, k: 0 }, { n: 4, k: 9 }, { n: 6, k: 3 }, { values: [1, 1, 1, 1], k: 2 }],
  "n-queens": [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 5 }, { n: 6 }, { n: 20 }],
  "binary-search-recursive": [{ values: [] }, { values: [4], target: 4 }, { values: [3, 3, 3, 3], target: 3 }, { values: Array.from({ length: 40 }, (_, i) => i * 2), target: 41 }, { values: [1, 2, 3] }],
  "merge-sort-tree": [{ values: [] }, { values: [1] }, { values: [5, 5, 5, 5] }, { values: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] }],
  "flood-fill": [{ grid: [] }, { grid: [[1]] }, { grid: [[1, 1], [1, 1]], color: 1 }, { grid: Array.from({ length: 6 }, () => new Array(6).fill(1)) }, { grid: [[1, 0], [0, 1]], start: [1, 1], color: 9 }, { grid: [[1, 1, 1], [0, 0, 1], [1, 1, 1], [1, 0, 0], [1, 1, 1]], start: [0, 0] }],
};

describe("recursion family", () => {
  it("implements every catalogue algorithm with a label and example", () => {
    for (const name of CATALOGUE) {
      expect(recursionFamily.algorithms[name], name).toBeTypeOf("function");
      expect(recursionFamily.labels?.[name], name).toBeTypeOf("string");
      expect(recursionFamily.examples[name], name).toBeTruthy();
    }
  });

  for (const name of Object.keys(recursionFamily.algorithms)) {
    it(`${name}: example and edge inputs produce valid frames`, () => {
      check(run(name, {}));
      for (const raw of edges[name] ?? []) check(recursionFamily.algorithms[name]!(norm(raw)));
      check(recursionFamily.algorithms[name]!(norm({})));
    });
  }

  it("normalise accepts the field aliases used by lessons", () => {
    const a = norm({ items: [3, 1, 2], discs: 4, choose: 2, key: 7, image: [[1, 0], [0, 1]], sr: 1, sc: 0, newColor: 5 });
    expect(a.values).toEqual([3, 1, 2]);
    expect(a.n).toBe(4);
    expect(a.k).toBe(2);
    expect(a.target).toBe(7);
    expect(a.grid).toEqual([[1, 0], [0, 1]]);
    expect(a.start).toEqual([1, 0]);
    expect(a.color).toBe(5);
    expect(norm({ values: "abc" }).values).toEqual(["a", "b", "c"]);
    expect(norm({ values: ["1", "x"] }).values).toEqual([1, "x"]);
  });

  it("builds the call tree incrementally with results written on return", () => {
    const frames = run("factorial", { n: 5 });
    const last = frames.at(-1)!;
    expect(last.note).toContain("factorial(5) = 120");
    expect(last.state.nodes.length).toBe(5);
    expect(last.state.nodes[0]!.result).toBe("120");
    expect(last.state.nodes[4]!.result).toBe("1");
    expect(last.state.stack).toEqual([]);
    const deepest = Math.max(...frames.map((fr) => fr.state.stack.length));
    expect(deepest).toBe(5);
    // Exactly one active frame while the stack is non-empty.
    for (const fr of frames) if (fr.state.stack.length > 0) expect(fr.state.nodes.filter((n) => n.tone === "active").length).toBe(1);
  });

  it("final frames state the answers", () => {
    const last = (algo: string, raw: Record<string, unknown>) => run(algo, raw).at(-1)!;
    expect(last("fibonacci", { n: 6 }).note).toContain("fib(6) = 8 took 25 calls");
    expect(last("hanoi", { n: 3 }).note).toContain("7 = 2^3 − 1 moves");
    expect(last("permutations", { values: [1, 2, 3] }).state.results.length).toBe(6);
    expect(last("subsets", { values: [1, 2, 3] }).state.results.length).toBe(8);
    expect(last("combinations", { values: [1, 2, 3, 4], k: 2 }).state.results.length).toBe(6);
    expect(last("n-queens", { n: 4 }).note).toContain("[1, 3, 0, 2]");
    expect(last("n-queens", { n: 3 }).note).toContain("No 3-queens solution");
    expect(last("binary-search-recursive", { values: [2, 5, 8, 12, 16, 23, 38, 56, 72, 91], target: 23 }).note).toContain("Found 23 at index 5");
    const ms = last("merge-sort-tree", { values: [38, 27, 43, 3, 9, 82, 10, 5] });
    expect(ms.state.rows[0]!.values).toEqual([3, 5, 9, 10, 27, 38, 43, 82]);
    const ff = last("flood-fill", {});
    expect(ff.note).toContain("9 cell(s) recoloured");
    expect(ff.state.board!.cells[0]![0]).toBe(2);
    expect(ff.state.board!.cells[0]![4]).toBe(1);
  });

  it("n-queens shows the board and hanoi shows the pegs", () => {
    const q = run("n-queens", { n: 4 });
    expect(q.every((fr) => fr.state.board && fr.state.board.cells.length === 4)).toBe(true);
    expect(q.at(-1)!.state.board!.cells.map((r) => r.indexOf("♛"))).toEqual([1, 3, 0, 2]);
    const h = run("hanoi", { n: 3 });
    expect(h.at(-1)!.state.pegs!.discs).toEqual([[], [], [3, 2, 1]]);
  });
});

describe("recursion generator fixes", () => {
  it("factorial with base 0 recurses to fact(0): six frames for n = 5", () => {
    const frames = run("factorial", { n: 5, base: 0 });
    expect(Math.max(...frames.map((fr) => fr.state.stack.length))).toBe(6);
    expect(frames.at(-1)!.state.nodes.at(-1)!.label).toBe("fact(0)");
    expect(frames.at(-1)!.note).toContain("factorial(5) = 120 after 6 calls");
  });
  it("fibonacci takes a name and base values: ways(6) = 13", () => {
    const frames = run("fibonacci", { n: 6, name: "ways", bases: [1, 1] });
    expect(frames.at(-1)!.note).toContain("ways(6) = 13 took 25 calls");
    expect(frames.every((fr) => fr.state.nodes.every((nd) => nd.label.startsWith("ways(")))).toBe(true);
    const base0 = frames.at(-1)!.state.nodes.find((nd) => nd.label === "ways(0)")!;
    expect(base0.result).toBe("1");
  });
  it("combinations does not count pruned branches as calls", () => {
    const frames = run("combinations", { values: [1, 2, 3, 4], k: 2 });
    const last = frames.at(-1)!;
    const pruned = last.state.nodes.filter((nd) => nd.result === "pruned");
    expect(pruned.length).toBeGreaterThan(0);
    expect(last.state.vars.calls).toBe(last.state.nodes.length - pruned.length);
    expect(last.note).toContain(`from ${last.state.nodes.length - pruned.length} calls`);
  });
  it("notes name values, not indices, and avoid placeholder symbols", () => {
    expect(run("subsets", { values: [1, 2, 3] }).some((fr) => /element \d/.test(fr.note))).toBe(false);
    const merge = run("merge-sort-tree", { values: [38, 27, 43, 3] });
    expect(merge.some((fr) => fr.note.includes("∅"))).toBe(false);
    expect(merge.find((fr) => fr.tag === "split")!.note).toContain("level 0");
    expect(run("hanoi", { n: 3 }).some((fr) => / 1 (smaller )?discs/.test(fr.note))).toBe(false);
  });
});

describe("recursion generator fixes, part 2", () => {
  it("n-queens reports the column first, as the lesson's check does", () => {
    const notes = run("n-queens", { n: 4 }).map((fr) => fr.note);
    expect(notes).toContain("(2, 2) is attacked by the queen at (1, 2): same column. Skip.");
    expect(notes).toContain("(3, 1) is attacked by the queen at (2, 1): same column. Skip.");
    expect(notes).toContain("(3, 3) is attacked by the queen at (1, 3): same column. Skip.");
  });
  it("merge-sort-tree with split even-odd shows the FFT's parity split", () => {
    const frames = run("merge-sort-tree", { values: ["a0", "a1", "a2", "a3", "a4", "a5", "a6", "a7"], split: "even-odd" });
    const last = frames.at(-1)!;
    expect(last.state.nodes[1]!.label).toBe("[a0,a2,a4,a6]");
    expect(last.state.nodes.some((nd) => nd.label === "[a1,a3,a5,a7]")).toBe(true);
    expect(last.state.vars.butterflies).toBe(12);
    expect(frames.some((fr) => fr.note.includes("Merge"))).toBe(false);
  });
});
