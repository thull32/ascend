import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { linkedListFamily, type ListInput } from "./linked-list";

const big = Array.from({ length: 20 }, (_, i) => i + 1);
const edges: Record<string, ListInput[]> = {
  traverse: [{ values: [] }, { values: [7] }, { values: [3, 3, 3] }, { values: big }],
  reverse: [{ values: [] }, { values: [7] }, { values: [3, 3, 3] }, { values: big }],
  "cycle-detect": [{ values: [] }, { values: [7], cycleAt: 0 }, { values: [1, 2, 3] }, { values: [3, 3, 3], cycleAt: 2 }, { values: big, cycleAt: 0 }, { values: big, cycleAt: 19 }, { values: big, cycleAt: 99 }],
  middle: [{ values: [] }, { values: [7] }, { values: [1, 2] }, { values: big }],
  "merge-sorted": [{ values: [], values2: [] }, { values: [1], values2: [] }, { values: [], values2: [2] }, { values: [2, 2], values2: [2, 2] }, { values: big, values2: big }],
  "remove-nth-from-end": [{ values: [], n: 1 }, { values: [7], n: 1 }, { values: [1, 2, 3], n: 3 }, { values: [1, 2, 3], n: 9 }, { values: big, n: 20 }, { values: big, n: 0 }],
  "insert-sorted": [{ values: [], target: 5 }, { values: [7], target: 5 }, { values: [7], target: 9 }, { values: [3, 3, 3], target: 3 }, { values: big, target: 100 }, { values: big }],
};

describe("linked-list family", () => {
  for (const [name, gen] of Object.entries(linkedListFamily.algorithms)) {
    it(`${name}: example and edge inputs produce well-formed frames`, () => {
      const example = linkedListFamily.examples[name];
      expect(example).toBeDefined();
      expect(linkedListFamily.labels?.[name]).toBeTruthy();
      for (const input of [example!, ...(edges[name] ?? [])]) {
        const frames = gen(linkedListFamily.normalise!(input as unknown as Record<string, unknown>));
        expect(frames.length).toBeGreaterThan(0);
        expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
        for (const fr of frames) {
          expect(fr.note.trim().length).toBeGreaterThan(0);
          expect(Array.isArray(fr.state.rows)).toBe(true);
        }
      }
    });
  }

  it("reverse ends with every link flipped", () => {
    const frames = linkedListFamily.algorithms.reverse!({ values: [1, 2, 3] });
    const last = frames[frames.length - 1]!.state;
    const ids = last.rows[0]!.nodes.map((n) => n.id);
    expect(last.next[ids[2]!]).toBe(ids[1]);
    expect(last.next[ids[1]!]).toBe(ids[0]);
    expect(last.next[ids[0]!]).toBeNull();
    expect(last.pointers.head).toBe(ids[2]);
  });

  it("cycle-detect finds the entry node", () => {
    const frames = linkedListFamily.algorithms["cycle-detect"]!({ values: [1, 2, 3, 4, 5, 6], cycleAt: 2 });
    const last = frames[frames.length - 1]!;
    expect(last.note).toContain("They meet at 3:");
    expect(last.state.pointers.entry).toBe(last.state.rows[0]!.nodes[2]!.id);
  });

  it("cycle-detect notes name nodes by label, not by drawing position", () => {
    // Find the Duplicate on [1, 3, 4, 2, 2]: labels are array indices; the tail (4) links to label 2, drawn at position 3.
    const frames = linkedListFamily.algorithms["cycle-detect"]!({ values: [0, 1, 3, 2, 4], cycleAt: 3 });
    expect(frames[0]!.note).toContain("The tail (4) points back to 2,");
    const last = frames.at(-1)!;
    expect(last.note).toContain("They meet at 2:");
    expect(last.note).not.toMatch(/index|position/);
    for (const f of frames) expect(f.note).not.toMatch(/node 3 \(value 2\)/);
  });

  it("merge-sorted produces a sorted merged row", () => {
    const frames = linkedListFamily.algorithms["merge-sorted"]!({ values: [1, 4, 5], values2: [1, 3, 4] });
    const merged = frames[frames.length - 1]!.state.rows[2]!.nodes.map((n) => Number(n.label));
    expect(merged).toEqual([1, 1, 3, 4, 4, 5]);
  });

  it("remove-nth-from-end removes the right node", () => {
    const frames = linkedListFamily.algorithms["remove-nth-from-end"]!({ values: [1, 2, 3, 4, 5], n: 2 });
    const labels = frames[frames.length - 1]!.state.rows[0]!.nodes.map((n) => n.label);
    expect(labels).toEqual(["dummy", "1", "2", "3", "5"]);
  });

  it("insert-sorted places the value in order", () => {
    const frames = linkedListFamily.algorithms["insert-sorted"]!({ values: [2, 5, 9, 14], target: 7 });
    const labels = frames[frames.length - 1]!.state.rows[0]!.nodes.map((n) => n.label);
    expect(labels).toEqual(["2", "5", "7", "9", "14"]);
  });

  it("middle: fast follows twice as many next pointers as slow, including the one off the end", () => {
    const frames = linkedListFamily.algorithms.middle!({ values: [1, 2, 3, 4, 5, 6] });
    const steps = frames.filter((f) => f.tag === "step");
    expect(steps.map((f) => f.note.match(/fast has followed (\d+) next pointers, slow (\d+)/)!.slice(1).map(Number))).toEqual([[2, 1], [4, 2], [6, 3]]);
    expect(steps.at(-1)!.state.pointers.fast).toBeNull();
    expect(steps.at(-1)!.note).toContain("fast → null");
  });

  it("normalise tolerates junk and caps length", () => {
    const n = linkedListFamily.normalise!({ values: ["a", 1, null, 2, ...Array(100).fill(3)], cycleAt: "1", n: "2", target: "x" });
    expect(n.values.length).toBe(20);
    expect(n.cycleAt).toBe(1);
    expect(n.n).toBe(2);
    expect(n.target).toBeUndefined();
  });
});
