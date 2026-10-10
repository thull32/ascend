import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render } from "@testing-library/react";
import { MAX_FRAMES, type Family, type Frame } from "../engine";
import { treeFamily, type TreeState } from "./tree";
import { heapFamily } from "./heap";
import { trieFamily } from "./trie";

function run<I, S>(family: Family<I, S>, algo: string, raw: Record<string, unknown>): Frame<S>[] {
  const gen = family.algorithms[algo];
  if (!gen) throw new Error(`missing ${algo}`);
  const base = (family.examples[algo] ?? {}) as Record<string, unknown>;
  const input = family.normalise ? family.normalise({ ...base, ...raw }) : ({ ...base, ...raw } as I);
  return gen(input);
}

function check<S>(frames: Frame<S>[]) {
  expect(frames.length).toBeGreaterThan(0);
  expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
  for (const fr of frames) {
    expect(typeof fr.note).toBe("string");
    expect(fr.note.trim().length).toBeGreaterThan(0);
    // Snapshots must be independent plain data.
    expect(() => JSON.stringify(fr.state)).not.toThrow();
  }
}

/** Render the family's Renderer on the first, a middle and the last frame (jsdom smoke test). */
function renderFrames<I, S>(family: Family<I, S>, frames: Frame<S>[], input: I) {
  for (const idx of [0, Math.floor(frames.length / 2), frames.length - 1]) {
    const frame = frames[idx]!;
    const { container, unmount } = render(createElement(family.Renderer, { frame, input, index: idx, total: frames.length }));
    expect(container.innerHTML.length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toContain("NaN");
    unmount();
  }
}

const big = Array.from({ length: 31 }, (_, i) => ((i * 7919) % 97) + 1);
const chain = Array.from({ length: 40 }, (_, i) => i);

describe("tree family", () => {
  const algos = Object.keys(treeFamily.algorithms);
  it("lists every catalogue algorithm", () => {
    for (const a of ["bst-insert", "bst-search", "bst-delete", "inorder", "preorder", "postorder", "level-order", "height", "diameter", "lca", "validate-bst", "avl-insert", "invert", "serialize"]) expect(algos).toContain(a);
  });
  for (const algo of algos) {
    it(`${algo}: example and edge inputs`, () => {
      check(run(treeFamily, algo, {}));
      check(run(treeFamily, algo, { values: [] }));
      check(run(treeFamily, algo, { values: [5], target: 5, a: 5, b: 5 }));
      check(run(treeFamily, algo, { values: [4, 4, 4, 4], target: 4, a: 4, b: 4 }));
      check(run(treeFamily, algo, { values: big, target: 12, a: big[3], b: big[20] }));
      check(run(treeFamily, algo, { values: chain, target: 39 }));
      check(run(treeFamily, algo, { levelOrder: [8, 3, 10, 1, 6, null, 14, null, null, 4, 7], target: 6, a: 4, b: 7 }));
      check(run(treeFamily, algo, { level_order: [5, 1, 4, null, null, 3, 6], target: 99, a: 1, b: 42 }));
      check(run(treeFamily, algo, { values: "garbage", target: "x" }));
    });
  }
  it("renders every algorithm's example without errors", () => {
    for (const algo of algos) {
      const input = treeFamily.normalise!({ ...treeFamily.examples[algo] });
      renderFrames(treeFamily, treeFamily.algorithms[algo]!(input), input);
    }
  });
  it("bst-insert builds a chain from sorted input", () => {
    const frames = run(treeFamily, "bst-insert", { values: [1, 2, 3, 4] });
    const last = frames[frames.length - 1]!.state;
    expect(last.nodes.filter(Boolean).length).toBe(4);
    expect(last.vars.height).toBe(3);
  });
  it("levelOrder wins over the example values, and user values win over the example levelOrder", () => {
    const a = treeFamily.normalise!({ ...treeFamily.examples["bst-search"], levelOrder: [1, null, 2] });
    expect(a.values).toEqual([]);
    expect(a.levelOrder).toEqual([1, null, 2]);
    const b = treeFamily.normalise!({ ...treeFamily.examples["validate-bst"], values: [10, 5, 15, 6, 20] });
    expect(b.levelOrder).toBeUndefined();
    expect(b.values).toEqual([10, 5, 15, 6, 20]);
  });
  it("validate-bst rejects a deep violation and accepts a BST", () => {
    const bad = run(treeFamily, "validate-bst", { values: [], levelOrder: [10, 5, 15, 3, 7, 12, 20] });
    expect(bad[bad.length - 1]!.state.vars.valid).toBe(true);
    const bad2 = run(treeFamily, "validate-bst", { values: [], levelOrder: [10, 5, 15, null, 12] });
    expect(bad2[bad2.length - 1]!.state.vars.valid).toBe(false);
  });
  it("serialize round-trips the tree", () => {
    const frames = run(treeFamily, "serialize", { values: [8, 3, 10, 1, 6] });
    const last = frames[frames.length - 1]!.state;
    expect(last.nodes.filter(Boolean).map((n) => n!.val).sort((x, y) => x - y)).toEqual([1, 3, 6, 8, 10]);
  });
  it("bst-delete with two children keeps in-order sorted", () => {
    const frames = run(treeFamily, "bst-delete", { values: [8, 3, 10, 1, 6, 14, 4, 7, 13], target: 3 });
    expect(frames[frames.length - 1]!.state.vars.inorder).toEqual([1, 4, 6, 7, 8, 10, 13, 14]);
  });
  it("avl-insert on sorted input stays balanced (height in edges by default, nodes on request)", () => {
    const frames = run(treeFamily, "avl-insert", { values: [1, 2, 3, 4, 5, 6, 7] });
    expect(frames[frames.length - 1]!.state.vars.height).toBe(2);
    const nodes = run(treeFamily, "avl-insert", { values: [1, 2, 3, 4, 5, 6, 7], heightUnit: "nodes" });
    expect(nodes[nodes.length - 1]!.state.vars.height).toBe(3);
    expect(nodes[nodes.length - 1]!.state.labels[0]).toBe("h1 b0");
  });
  it("avl-insert draws the whole tree in every frame, including right after a rotation", () => {
    const frames = run(treeFamily, "avl-insert", { values: [10, 20, 30, 40, 50, 25] });
    const shape = (st: TreeState, id: number | null = st.root): string => {
      if (id === null) return "·";
      const n = st.nodes[id]!;
      return n.left === null && n.right === null ? String(n.val) : `${n.val}(${shape(st, n.left)}, ${shape(st, n.right)})`;
    };
    const rotations = frames.filter((f) => f.tag === "rotate" && f.note.includes("rotation done"));
    expect(rotations.map((f) => shape(f.state))).toEqual(["20(10, 30)", "20(10, 40(30, 50))", "30(20(10, 25), 40(·, 50))"]);
    // Every created node is reachable from the root in every frame.
    for (const f of frames) {
      const seen = new Set<number>();
      const walk = (id: number | null) => {
        if (id === null) return;
        seen.add(id);
        walk(f.state.nodes[id]!.left);
        walk(f.state.nodes[id]!.right);
      };
      walk(f.state.root);
      expect(seen.size).toBe(f.state.nodes.filter(Boolean).length);
    }
    // The leaf is attached in its own frame.
    expect(shape(frames.find((f) => f.tag === "insert" && f.note.includes("attach 20"))!.state)).toBe("10(·, 20)");
  });
  it("traversal output readouts show values, not node ids", () => {
    const ino = run(treeFamily, "inorder", { values: [8, 3, 10, 1, 6, 14, 4, 7, 13] });
    expect(ino[ino.length - 1]!.state.readouts[1]!.values).toEqual([1, 3, 4, 6, 7, 8, 10, 13, 14]);
    const lvl = run(treeFamily, "level-order", { values: [8, 3, 10, 1, 6, 14, 4, 7, 13] });
    expect(lvl[lvl.length - 1]!.state.readouts[1]!.values).toEqual([8, 3, 10, 1, 6, 14, 4, 7, 13]);
  });
  it("iterative inorder pops the keys in order from an explicit stack", () => {
    const frames = run(treeFamily, "inorder", { values: [5, 3, 6, 2, 4, 1], iterative: true });
    const pops = frames.filter((f) => f.tag === "visit");
    expect(pops.map((f) => f.state.readouts[1]!.values.at(-1))).toEqual([1, 2, 3, 4, 5, 6]);
    expect(frames.filter((f) => f.tag === "push").map((f) => f.state.readouts[0]!.values.at(-1))).toEqual([5, 3, 2, 1, 4, 6]);
  });
  it("bst-search reports floor and ceiling on a miss", () => {
    const frames = run(treeFamily, "bst-search", { values: [30, 10, 50, 20, 40, 60], target: 45 });
    const last = frames[frames.length - 1]!.state;
    expect(last.vars.floor).toBe(40);
    expect(last.vars.ceiling).toBe(50);
  });
  it("bst-insert with thenInorder reads the keys back sorted", () => {
    const frames = run(treeFamily, "bst-insert", { values: [50, 30, 70, 20, 40, 60, 80, 35], thenInorder: true });
    expect(frames[frames.length - 1]!.state.readouts[0]!.values).toEqual([20, 30, 35, 40, 50, 60, 70, 80]);
  });
  it("validate-bst rejects the lesson's broken tree given by levelOrder", () => {
    const frames = run(treeFamily, "validate-bst", { values: [], levelOrder: [10, 5, 15, null, null, 6, 20] });
    expect(frames[frames.length - 1]!.state.vars.valid).toBe(false);
    expect(frames.find((f) => f.tag === "violation")!.state.vars.at).toBe(6);
  });
  it("lca on a non-BST runs bottom-up", () => {
    const frames = run(treeFamily, "lca", { values: [], levelOrder: [4, -3, 6, 8, -5, null, null, 7, null, null, 9, -1, null, null, 10], a: 7, b: 10 });
    expect(frames[frames.length - 1]!.state.vars.lca).toBe(-3);
    expect(frames.some((f) => f.tag === "hit")).toBe(true);
  });
  it("diameter counts heights in edges (+ 2) or nodes", () => {
    const lo = [4, -3, 6, 8, -5, null, null, 7, null, null, 9, -1, null, null, 10];
    const edges = run(treeFamily, "diameter", { values: [], levelOrder: lo });
    expect(edges[edges.length - 1]!.state.vars.diameter).toBe(6);
    const root = edges.filter((f) => f.state.vars.at === 4).at(-1)!;
    expect(root.state.vars.returns).toBe(4);
    expect(root.state.vars["path through"]).toBe(5);
    const nodes = run(treeFamily, "diameter", { values: [], levelOrder: lo, heightUnit: "nodes" });
    expect(nodes[nodes.length - 1]!.state.vars.diameter).toBe(6);
    expect(nodes.filter((f) => f.state.vars.at === 4).at(-1)!.state.vars.returns).toBe(5);
  });
  it("serialize links each decoded node to its parent as soon as it is created", () => {
    for (const order of ["preorder", "level"]) {
      const frames = run(treeFamily, "serialize", { values: [8, 3, 10, 1, 6, 14], order });
      const enc = frames.findIndex((f) => f.tag === "encoded");
      for (const f of frames.slice(enc + 1)) {
        let reach = 0;
        const walk = (id: number | null) => {
          if (id === null) return;
          reach++;
          walk(f.state.nodes[id]!.left);
          walk(f.state.nodes[id]!.right);
        };
        walk(f.state.root);
        expect(reach).toBe(f.state.nodes.filter(Boolean).length);
      }
      expect(frames[frames.length - 1]!.state.nodes.filter(Boolean).length).toBe(6);
    }
    const level = run(treeFamily, "serialize", { values: [], levelOrder: [1, 2, 3, null, null, 4, 5], order: "level" });
    expect(level.find((f) => f.tag === "encoded")!.state.vars.encoded).toBe("1,2,3,#,#,4,5,#,#,#,#");
  });
});

describe("heap family", () => {
  const algos = Object.keys(heapFamily.algorithms);
  it("lists every catalogue algorithm", () => {
    for (const a of ["push-pop", "heapify", "heap-sort", "top-k", "two-heaps-median"]) expect(algos).toContain(a);
  });
  for (const algo of algos) {
    it(`${algo}: example and edge inputs`, () => {
      check(run(heapFamily, algo, {}));
      check(run(heapFamily, algo, { values: [], operations: [] }));
      check(run(heapFamily, algo, { values: [7], k: 1 }));
      check(run(heapFamily, algo, { values: [2, 2, 2, 2, 2], k: 2 }));
      check(run(heapFamily, algo, { values: big, k: 5, kind: "max" }));
      check(run(heapFamily, algo, { values: chain, kind: "min", k: 100 }));
      check(run(heapFamily, algo, { operations: [["push", 5], ["pop"], ["pop"], "push 3", { op: "push", value: 9 }, 4, ["push", "x"]] }));
      check(run(heapFamily, algo, { values: "nope", k: "abc", kind: 3 }));
    });
  }
  it("renders every algorithm's example without errors", () => {
    for (const algo of algos) {
      const input = heapFamily.normalise!({ ...heapFamily.examples[algo] });
      renderFrames(heapFamily, heapFamily.algorithms[algo]!(input), input);
    }
  });
  it("heap-sort sorts ascending with a max-heap and handles duplicates", () => {
    const frames = run(heapFamily, "heap-sort", { values: [5, 2, 9, 1, 5, 6] });
    expect(frames[frames.length - 1]!.state.heaps[0]!.values).toEqual([1, 2, 5, 5, 6, 9]);
  });
  it("push-pop pops in priority order", () => {
    const frames = run(heapFamily, "push-pop", { kind: "min", values: [5, 3, 8, 1, 9, 2] });
    const out = frames[frames.length - 1]!.state.readouts[1]!.values;
    expect(out).toEqual([1, 2, 3, 5, 8, 9]);
  });
  it("top-k keeps the k largest", () => {
    const frames = run(heapFamily, "top-k", { values: [3, 2, 1, 5, 6, 4], k: 2, kind: "min" });
    expect([...frames[frames.length - 1]!.state.heaps[0]!.values].sort()).toEqual([5, 6]);
  });
  it("two-heaps-median tracks the running median", () => {
    const frames = run(heapFamily, "two-heaps-median", { values: [5, 15, 1, 3] });
    expect(frames[frames.length - 1]!.state.readouts[1]!.values).toEqual([5, 10, 5, 4]);
    for (const f of frames) {
      expect(f.state.vars["low size"]).toBe(f.state.heaps[0]!.size);
      expect(f.state.vars["high size"]).toBe(f.state.heaps[1]!.size);
    }
  });
  it("push-pop counters and the popped list match the heap drawn in every frame", () => {
    const frames = run(heapFamily, "push-pop", { kind: "min", operations: [["push", 4], ["push", 5], ["push", 6], ["pop"], ["push", 7], ["pop"], ["push", 8]] });
    let peak = 0;
    for (const f of frames) {
      peak = Math.max(peak, f.state.heaps[0]!.size);
      expect(f.state.vars.size).toBe(f.state.heaps[0]!.size);
      expect(f.state.vars.peak).toBe(peak);
    }
    const firstPop = frames.find((f) => f.tag === "pop")!;
    expect(firstPop.state.readouts[1]!.values).toEqual([4]);
    expect(firstPop.state.vars.size).toBe(2);
  });
  it("top-k labels the root with a proper ordinal and a live size", () => {
    const frames = run(heapFamily, "top-k", { values: [4, 9, 1, 7, 3, 8, 2, 6], k: 3, kind: "min" });
    const last = frames[frames.length - 1]!.state;
    expect(last.vars["3rd largest (root)"]).toBe(7);
    expect(Object.keys(last.vars).some((k) => k.includes("3th"))).toBe(false);
    for (const f of frames.slice(0, -1)) expect(f.state.vars.size).toBe(f.state.heaps[0]!.size);
  });
  it("lazy push-pop discards a stale entry instead of returning it", () => {
    const frames = run(heapFamily, "push-pop", {
      kind: "min",
      lazy: true,
      operations: [["push", 7, "A"], ["push", 3, "B"], ["push", 9, "C"], ["push", 3, "A"], ["pop"], ["pop"], ["push", 1, "D"], ["pop"], ["pop"], ["pop"]],
    });
    const last = frames[frames.length - 1]!.state;
    expect(last.readouts[1]!.values).toEqual(["3 (B)", "3 (A)", "1 (D)", "9 (C)"]);
    expect(last.readouts[2]!.values).toEqual(["7 (A)"]);
    expect(frames.some((f) => f.note.includes("is stale"))).toBe(true);
  });
});

describe("trie family", () => {
  const algos = Object.keys(trieFamily.algorithms);
  it("lists every catalogue algorithm", () => {
    for (const a of ["insert-search", "prefix-autocomplete", "word-break"]) expect(algos).toContain(a);
  });
  const manyOps = Array.from({ length: 40 }, (_, i) => ["insert", `w${i}abcdefghijk`]);
  for (const algo of algos) {
    it(`${algo}: example and edge inputs`, () => {
      check(run(trieFamily, algo, {}));
      check(run(trieFamily, algo, { operations: [], words: [], text: "" }));
      check(run(trieFamily, algo, { operations: [["insert", "a"], ["search", "a"], ["prefix", ""]], words: ["a"], text: "a" }));
      check(run(trieFamily, algo, { operations: [["insert", "aa"], ["insert", "aa"], ["delete", "aa"], ["delete", "aa"]], words: ["aa", "aa"], text: "aaaa" }));
      check(run(trieFamily, algo, { operations: manyOps, words: manyOps.map((o) => o[1]), text: "w1abcdefghijkw2abcdefghijkzzz" }));
      check(run(trieFamily, algo, { operations: "nope", words: 12, text: 5 }));
      check(run(trieFamily, algo, { operations: [{ op: "insert", word: "Cat!" }, "dog", "search cat", { op: "startsWith", prefix: "ca" }] }));
    });
  }
  it("renders every algorithm's example without errors", () => {
    for (const algo of algos) {
      const input = trieFamily.normalise!({ ...trieFamily.examples[algo] });
      renderFrames(trieFamily, trieFamily.algorithms[algo]!(input), input);
    }
  });
  it("insert-search distinguishes prefix from key", () => {
    const frames = run(trieFamily, "insert-search", { operations: [["insert", "car"], ["insert", "cart"], ["search", "car"], ["search", "ca"], ["prefix", "ca"], ["search", "dot"]] });
    const results = frames[frames.length - 2]!.state.readouts[1]!.values;
    expect(results).toEqual(["+car", "+cart", "car: yes", "ca: no", "ca*: yes", "dot: no"]);
  });
  it("prefix-autocomplete returns sorted suggestions", () => {
    const frames = run(trieFamily, "prefix-autocomplete", {});
    const done = frames.filter((f) => f.tag === "result").pop()!;
    expect(done.state.vars.suggestions).toEqual(["net", "netflix", "network"]);
  });
  it("word-break segments the text", () => {
    const frames = run(trieFamily, "word-break", { words: ["apple", "pen"], text: "applepenapple" });
    expect(frames[frames.length - 1]!.state.vars.segmentation).toBe("apple | pen | apple");
    const no = run(trieFamily, "word-break", { words: ["cats", "dog"], text: "catsandog" });
    expect(no[no.length - 1]!.state.vars["dp[n]"]).toBe(false);
  });
});
