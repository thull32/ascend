import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { fnv1a, hashKey, hashTableFamily, movedFraction, type HashInput, type HashOp } from "./hash-table";

const keys = Array.from({ length: 40 }, (_, i) => `k${i}`);
const manySet: HashOp[] = keys.map((k, i) => ["set", k, i] as HashOp);
const same: HashOp[] = Array.from({ length: 40 }, () => ["set", "x", 1] as HashOp);
const mixed: HashOp[] = keys.slice(0, 14).flatMap((k, i) => [["set", k, i], ["get", k], ["delete", k]] as HashOp[]);
const edges: Record<string, HashInput[]> = {
  chaining: [{ buckets: 1, operations: [] }, { buckets: 1, operations: manySet }, { buckets: 3, operations: same }, { buckets: 16, operations: mixed }, { buckets: 5, operations: [["get", "nope"], ["delete", "nope"], ["frob", "x"], { op: "set", key: "o", value: 9 }, { op: "get", key: "o" }] }],
  "open-addressing": [{ buckets: 1, operations: [] }, { buckets: 1, operations: [["set", "a", 1], ["set", "b", 2], ["get", "b"], ["delete", "a"], ["get", "b"], ["set", "b", 3]] }, { buckets: 16, operations: manySet }, { buckets: 4, operations: same }, { buckets: 8, operations: mixed }, { buckets: 3, operations: [["set", "a", 1], ["set", "b", 2], ["set", "c", 3], ["delete", "b"], ["get", "c"], ["set", "d", 4], ["get", "zzz"]] }],
  resize: [{ buckets: 1, operations: [] }, { buckets: 1, operations: manySet }, { buckets: 2, operations: same }, { buckets: 16, operations: mixed }, { buckets: 2, operations: manySet.slice(0, 10), loadFactor: 0.5 }],
};

describe("hash-table family", () => {
  it("hashKey is deterministic and matches Java's String.hashCode", () => {
    expect(hashKey("")).toBe(0);
    expect(hashKey("a")).toBe(97);
    expect(hashKey("apple")).toBe(93029210);
    expect(hashKey("grape") % 8).toBe(hashKey("melon") % 8);
    expect(hashKey("apple")).toBe(hashKey("apple"));
    expect(hashKey("apple")).not.toBe(hashKey("grape"));
  });

  for (const [name, gen] of Object.entries(hashTableFamily.algorithms)) {
    it(`${name}: example and edge inputs produce well-formed frames`, () => {
      const example = hashTableFamily.examples[name];
      expect(example).toBeDefined();
      expect(hashTableFamily.labels?.[name]).toBeTruthy();
      for (const input of [example!, ...(edges[name] ?? [])]) {
        const frames = gen(hashTableFamily.normalise!(input as unknown as Record<string, unknown>));
        expect(frames.length).toBeGreaterThan(0);
        expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
        for (const fr of frames) {
          expect(fr.note.trim().length).toBeGreaterThan(0);
          expect(Array.isArray(fr.state.table.slots)).toBe(true);
        }
      }
    });
  }

  it("chaining: set/get/delete behave like a map and notes show the hash", () => {
    const frames = hashTableFamily.algorithms.chaining!({ buckets: 5, operations: [["set", "apple", 1], ["set", "apple", 2], ["get", "apple"], ["delete", "apple"], ["get", "apple"]] });
    expect(frames.some((f) => f.note.includes(`hash("apple") = ${hashKey("apple")}`) && f.note.includes(`mod 5 = ${hashKey("apple") % 5}`))).toBe(true);
    const gets = frames.filter((f) => f.tag === "get" || f.tag === "miss");
    expect(gets[0]!.state.vars.result).toBe("2");
    expect(gets[gets.length - 1]!.state.vars.result).toBe("absent");
    const last = frames[frames.length - 1]!.state;
    expect(last.table.slots.flat()).toHaveLength(0);
  });

  it("open-addressing: deletion leaves a tombstone and later keys stay reachable", () => {
    const frames = hashTableFamily.algorithms["open-addressing"]!({ buckets: 1, operations: [["set", "a", 1], ["delete", "a"], ["get", "a"], ["set", "b", 2], ["get", "b"]] });
    expect(frames.some((f) => f.tag === "delete" && f.state.table.slots[0]![0]!.tombstone)).toBe(true);
    const last = frames[frames.length - 1]!.state;
    expect(last.table.slots[0]![0]).toMatchObject({ key: "b", value: "2" });
    const getB = frames.filter((f) => f.tag === "get").at(-1)!;
    expect(getB.state.vars.result).toBe("2");
  });

  it("resize doubles the bucket count and keeps every key", () => {
    const frames = hashTableFamily.algorithms.resize!({ buckets: 4, operations: [["set", "a", 1], ["set", "b", 2], ["set", "c", 3], ["set", "d", 4], ["set", "e", 5]] });
    expect(frames.some((f) => f.tag === "grow" && f.state.old && f.state.table.slots.length === 8)).toBe(true);
    const last = frames[frames.length - 1]!.state;
    expect(last.table.slots.length).toBe(8);
    expect(last.old).toBeUndefined();
    expect(last.table.slots.flat().map((e) => e.key).sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("resize counts keys that changed bucket separately from keys rehashed", () => {
    // Java hashes 97..100 for a..d: mod 4 = 1,2,3,0 and mod 8 = 1,2,3,4, so only d moves.
    const frames = hashTableFamily.algorithms.resize!({ buckets: 4, operations: [["set", "a", 1], ["set", "b", 2], ["set", "c", 3], ["set", "d", 4], ["set", "e", 5]] });
    const done = frames.find((f) => f.tag === "resized")!;
    expect(done.state.vars).toMatchObject({ rehashed: 4, moved: 1 });
    expect(frames.filter((f) => f.tag === "moves").map((f) => f.state.hash!.key)).toEqual(["d"]);
    expect(frames.filter((f) => f.tag === "stays").map((f) => f.state.hash!.key).sort()).toEqual(["a", "b", "c"]);
  });

  it("resize with growth 1.25 goes from 4 to 5 buckets and moves most keys", () => {
    const input = hashTableFamily.normalise!({ buckets: 4, loadFactor: 1, growth: 1.25, hash: "fnv1a", operations: [1, 2, 3, 4, 5].map((i) => ["set", `user:${i}`, i]) });
    const frames = hashTableFamily.algorithms.resize!(input);
    const done = frames.find((f) => f.tag === "resized")!;
    expect(done.state.table.slots.length).toBe(5);
    expect(done.state.vars).toMatchObject({ rehashed: 5, moved: 4 });
    expect(done.note).toContain("about 80% of keys");
    expect(movedFraction(4, 8)).toBe(0.5);
    expect(movedFraction(4, 5)).toBe(0.8);
  });

  it("fnv1a matches the 32-bit FNV-1a values quoted in the hash tables lesson", () => {
    expect(fnv1a("melon")).toBe(1927437660);
    expect(fnv1a("lime")).toBe(132336572);
    expect(fnv1a("peach")).toBe(2698319462);
    const frames = hashTableFamily.algorithms["open-addressing"]!(hashTableFamily.normalise!({ buckets: 8, hash: "fnv1a", operations: [["set", "melon", 1], ["set", "lime", 2], ["set", "fig", 3], ["set", "pear", 4], ["set", "mango", 5]] }));
    const slots = frames.at(-1)!.state.table.slots.map((c) => c[0]?.key ?? null);
    expect(slots).toEqual(["mango", null, null, null, "melon", "lime", "fig", "pear"]);
  });

  it("append groups values under one entry", () => {
    const frames = hashTableFamily.algorithms.chaining!({ buckets: 6, operations: [["append", "aet", "eat"], ["append", "aet", "tea"], ["append", "ant", "tan"], ["get", "aet"]] });
    const last = frames.at(-1)!.state;
    expect(last.table.slots.flat().map((e) => [e.key, e.value])).toEqual(expect.arrayContaining([["aet", "[eat, tea]"], ["ant", "[tan]"]]));
    expect(last.table.slots.flat()).toHaveLength(2);
    expect(frames.find((f) => f.tag === "get")!.state.vars.result).toBe("[eat, tea]");
  });

  it("normalise clamps buckets and caps operations", () => {
    const n = hashTableFamily.normalise!({ buckets: 999, operations: Array(100).fill(["set", "a", 1]) });
    expect(n.buckets).toBe(16);
    expect(n.operations.length).toBe(40);
    expect(hashTableFamily.normalise!({ buckets: "x" }).buckets).toBe(8);
    expect(hashTableFamily.normalise!({}).operations).toEqual([]);
  });
});
