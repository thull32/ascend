import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import { stackQueueFamily, type Op, type SQInput } from "./stack-queue";

const manyPush: Op[] = Array.from({ length: 60 }, (_, i) => ["push", i] as Op);
const manyPop: Op[] = Array.from({ length: 60 }, () => ["pop"] as Op);
const alt: Op[] = Array.from({ length: 60 }, (_, i) => (i % 2 ? (["pop"] as Op) : (["push", i] as Op)));
const edges: Record<string, SQInput[]> = {
  "stack-ops": [{ operations: [] }, { operations: [["pop"]] }, { operations: [["push", 1], ["peek"], ["size"], ["frob"]] }, { operations: manyPush }, { operations: manyPop }],
  "queue-ops": [{ operations: [] }, { operations: [["dequeue"]] }, { operations: [["push", 1], ["pop"], ["peek"]] }, { operations: manyPush }, { operations: alt }],
  "deque-ops": [{ operations: [] }, { operations: [["popFront"], ["popBack"]] }, { operations: [["appendleft", 1], ["append", 2], ["popleft"], ["pop"], ["front"], ["back"]] }, { operations: manyPush }],
  "balanced-parentheses": [{ input: "" }, { input: "(" }, { input: ")" }, { input: "(]" }, { input: "a(b)c" }, { input: "(".repeat(40) + ")".repeat(40) }, { input: "((((((((((((((((((((((((((((((((((((((((" }],
  "queue-via-two-stacks": [{ operations: [] }, { operations: [["dequeue"]] }, { operations: [["push", 1], ["push", 2], ["pop"], ["peek"], ["pop"], ["pop"]] }, { operations: [...manyPush.slice(0, 30), ...manyPop.slice(0, 30)] }],
  "min-stack": [{ operations: [] }, { operations: [["getMin"], ["pop"], ["top"]] }, { operations: [["push", 2], ["push", 2], ["push", 2], ["getMin"], ["pop"], ["getMin"]] }, { operations: Array.from({ length: 60 }, (_, i) => ["push", 60 - i] as Op) }],
  "sliding-window-max": [{ values: [] }, { values: [5], k: 1 }, { values: [5], k: 3 }, { values: [2, 2, 2, 2], k: 2 }, { values: Array.from({ length: 40 }, (_, i) => 40 - i), k: 5 }, { values: Array.from({ length: 40 }, (_, i) => i), k: 40 }, { values: [1, 2], k: 0 }],
};

describe("stack-queue family", () => {
  for (const [name, gen] of Object.entries(stackQueueFamily.algorithms)) {
    it(`${name}: example and edge inputs produce well-formed frames`, () => {
      const example = stackQueueFamily.examples[name];
      expect(example).toBeDefined();
      expect(stackQueueFamily.labels?.[name]).toBeTruthy();
      for (const input of [example!, ...(edges[name] ?? [])]) {
        const frames = gen(stackQueueFamily.normalise!(input as unknown as Record<string, unknown>));
        expect(frames.length).toBeGreaterThan(0);
        expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES + 1);
        for (const fr of frames) {
          expect(fr.note.trim().length).toBeGreaterThan(0);
          expect(Array.isArray(fr.state.containers)).toBe(true);
        }
      }
    });
  }

  it("stack pops in LIFO order", () => {
    const frames = stackQueueFamily.algorithms["stack-ops"]!({ operations: [["push", 3], ["push", 7], ["pop"], ["pop"]] });
    expect(frames[frames.length - 1]!.state.output?.values).toEqual([7, 3]);
  });

  it("queue via two stacks dequeues in FIFO order and counts moves", () => {
    const frames = stackQueueFamily.algorithms["queue-via-two-stacks"]!({ operations: [["push", 1], ["push", 2], ["push", 3], ["pop"], ["push", 4], ["pop"], ["pop"], ["pop"]] });
    const last = frames[frames.length - 1]!.state;
    expect(last.output?.values).toEqual([1, 2, 3, 4]);
    expect(last.vars.moves).toBe(4);
  });

  it("balanced-parentheses verdicts", () => {
    const run = (input: string) => stackQueueFamily.algorithms["balanced-parentheses"]!({ input });
    expect(run("{[()]}").at(-1)!.state.vars.result).toBe(true);
    expect(run("{[()]}(]").at(-1)!.state.vars.result).toBe(false);
    expect(run("((").at(-1)!.state.vars.result).toBe(false);
    expect(run(")").at(-1)!.state.vars.result).toBe(false);
  });

  it("min-stack tracks the minimum through pops", () => {
    const frames = stackQueueFamily.algorithms["min-stack"]!({ operations: [["push", 5], ["push", 3], ["push", 7], ["getMin"], ["pop"], ["getMin"], ["pop"], ["getMin"]] });
    const mins = frames.filter((f) => f.tag === "getMin").map((f) => f.state.vars.min);
    expect(mins).toEqual([3, 3, 5]);
  });

  it("sliding-window-max computes the classic answer", () => {
    const frames = stackQueueFamily.algorithms["sliding-window-max"]!({ values: [1, 3, -1, -3, 5, 3, 6, 7], k: 3 });
    expect(frames[frames.length - 1]!.state.output?.values).toEqual([3, 3, 5, 5, 6, 7]);
  });

  it("normalise accepts alternate field names and caps sizes", () => {
    const n = stackQueueFamily.normalise!({ text: "(".repeat(100), ops: Array(100).fill(["push", 1]), values: Array(100).fill(1), k: "2" });
    expect(n.input?.length).toBe(40);
    expect(n.operations?.length).toBe(60);
    expect(n.values?.length).toBe(40);
    expect(n.k).toBe(2);
  });
});
