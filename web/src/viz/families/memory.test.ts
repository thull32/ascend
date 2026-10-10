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

describe("memory generator fixes", () => {
  const run = (algo: string, raw: Record<string, unknown>) => memoryFamily.algorithms[algo]!(memoryFamily.normalise!({ ...memoryFamily.examples[algo], ...raw }));
  const peak = (frames: ReturnType<typeof run>) => Math.max(...frames.map((fr) => fr.state.stack.length));
  it("call-stack factorial honours the base case and reports depth consistently", () => {
    const f0 = run("call-stack", { n: 4, base: 0 });
    expect(peak(f0)).toBe(6);
    expect(f0.find((fr) => fr.tag === "base")!.note).toContain("6 frames, main plus 5 factorial calls");
    const f1 = run("call-stack", { n: 3, base: 1, name: "fact" });
    expect(peak(f1)).toBe(4);
    expect(f1.find((fr) => fr.tag === "base")!.note).toContain("fact(1) hits the base case");
    for (const fr of [...f0, ...f1]) expect(fr.note).not.toMatch(/would overflow if N/);
    expect(f1.at(-1)!.note).toContain("The peak, 4 frames");
  });
  it("call-stack ways(6) memoises: 13, 4 hits, 11 calls, 7 frames at the peak", () => {
    const frames = run("call-stack", { fn: "ways", n: 6 });
    const last = frames.at(-1)!;
    expect(last.note).toContain("ways(6) = 13: 7 states computed, 4 memo hits, 11 calls");
    expect(peak(frames)).toBe(7);
    expect(frames.some((fr) => fr.state.stack.some((s) => s.name.startsWith("factorial")))).toBe(false);
  });
  it("call-stack reverse relinks the list on the way back up", () => {
    const frames = run("call-stack", { fn: "reverse", values: [1, 2, 3, 4] });
    expect(peak(frames)).toBe(5);
    const last = frames.at(-1)!.state;
    expect(last.vars["from 4"]).toBe("4 → 3 → 2 → 1");
    expect(last.heap.find((o) => o.label === "Node 1")!.fields[1]!.value).toBe("null");
  });
  it("call-stack calls freezes one profiler sample at the deepest point", () => {
    const frames = run("call-stack", { fn: "calls", calls: ["serve", "handle_order"], sample: true });
    const sample = frames.find((fr) => fr.tag === "sample")!;
    expect(sample.state.stack.map((s) => s.name)).toEqual(["main()", "serve()", "handle_order()"]);
    expect(sample.note).toContain("main;serve;handle_order");
  });
  it("stack-heap does not claim the stack grows upward", () => {
    for (const fr of run("stack-heap", {})) expect(fr.note).not.toContain("grows upward");
  });
  it("ownership-borrowing really reallocates on push", () => {
    const frames = run("ownership-borrowing", {});
    const before = frames.find((fr) => fr.tag === "borrow-mut")!.state;
    const after = frames.find((fr) => fr.tag === "mutate")!.state;
    const addr = (st: typeof before) => st.heap.find((o) => o.id === st.stack[0]!.fields.find((f) => f.name === "s")!.ptr)!.addr;
    expect(addr(after)).not.toBe(addr(before));
    expect(after.heap.find((o) => o.addr === addr(before))!.freed).toBe(true);
  });
  it("reference-counting speaks the lesson's language", () => {
    const py = run("reference-counting", { lang: "python" }).map((fr) => fr.note).join(" ");
    expect(py).toContain("del b");
    expect(py).not.toContain("new Obj()");
    const rs = run("reference-counting", { lang: "rust" }).map((fr) => fr.note).join(" ");
    expect(rs).toContain("Rc::clone");
    expect(rs).toContain("Weak");
    expect(run("reference-counting", {})[0]!.note).toContain("new Obj()");
  });
  it("cache-lines default: the strided phase misses on every access", () => {
    const frames = run("cache-lines", {});
    const last = frames.at(-1)!.state.vars;
    expect(last.hits).toBe(14);
    expect(last.misses).toBe(8);
  });
  it("dynamic-array-growth in a GC runtime keeps the aliased block alive instead of dangling", () => {
    const frames = run("dynamic-array-growth", { gc: true });
    for (const fr of frames) expect(fr.note).not.toMatch(/dangling|undefined behaviour/);
    const stale = frames.find((fr) => fr.tag === "stale")!;
    expect(stale.state.heap.find((o) => o.id === "blk0")!.freed).toBeUndefined();
  });
  it("paging does not quote a speed ratio the lessons contradict", () => {
    expect(run("virtual-memory-paging", {}).at(-1)!.note).not.toContain("thousands");
  });
});

describe("stack-heap with threads", () => {
  const run = (raw: Record<string, unknown>) => memoryFamily.algorithms["stack-heap"]!(memoryFamily.normalise!({ ...memoryFamily.examples["stack-heap"], ...raw }));
  it("gives each thread its own stack over one shared heap", () => {
    const frames = run({ values: [4, 8, 15], threads: 2 });
    const busiest = frames.find((fr) => fr.tag === "write")!.state;
    const byThread = (t: number) => busiest.stack.filter((fr) => (fr.thread ?? 1) === t).map((fr) => fr.name);
    expect(byThread(1)).toEqual(["main()", "print(list)"]);
    expect(byThread(2)).toEqual(["worker(p)", "sum(p)"]);
    // Frames on both threads point at the same heap node.
    const targets = new Set(busiest.stack.flatMap((fr) => fr.fields.map((f) => f.ptr)).filter(Boolean));
    expect([...targets]).toEqual(["node2"]);
    expect(busiest.heap.find((o) => o.id === "node2")!.fields[0]!.value).toBe("16");
    const exited = frames.find((fr) => fr.tag === "exit")!.state;
    expect(exited.stack.some((fr) => fr.thread === 2)).toBe(false);
    expect(exited.heap.length).toBe(3);
  });
  it("supports three threads and stays single-threaded by default", () => {
    expect(run({ threads: 3 }).filter((fr) => fr.tag === "spawn").length).toBe(2);
    expect(run({}).every((fr) => fr.state.stack.every((s) => s.thread === undefined))).toBe(true);
  });
});
