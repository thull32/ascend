import { describe, expect, it } from "vitest";
import type { ConcurrencyInput, ConcurrencyState } from "./concurrency";
import { concurrencyFamily } from "./concurrency";

const run = (algo: string, input: Record<string, unknown> = {}) => {
  const raw = { ...(concurrencyFamily.examples[algo] ?? {}), ...input };
  return concurrencyFamily.algorithms[algo]!(concurrencyFamily.normalise!(raw) as ConcurrencyInput);
};
const queue = (s: ConcurrencyState, prefix: string) => s.queues.find((q) => q.label.startsWith(prefix))!.items;
const last = <T>(xs: T[]) => xs[xs.length - 1]!;

describe("event-loop", () => {
  it("queues cb as a macrotask in the same frame whose note says so", () => {
    const frames = run("event-loop");
    const f = frames.find((x) => x.note.includes("cb as a macrotask"))!;
    expect(queue(f.state, "macrotask")).toEqual(["cb"]);
  });

  it("queues onResponse as a microtask, never a macrotask", () => {
    const frames = run("event-loop");
    for (const f of frames) expect(queue(f.state, "macrotask")).not.toContain("onResponse");
    const io = frames.find((x) => x.tag === "io")!;
    expect(queue(io.state, "microtask")).toEqual(["onResponse"]);
    expect(frames[frames.indexOf(io) + 1]!.tag).toBe("microtask");
  });
});

describe("thread-pool", () => {
  it("never calls idle workers busy", () => {
    for (const f of run("thread-pool", { threads: 3, tasks: 6 })) {
      if (!f.note.includes("all workers busy")) continue;
      expect(f.state.shared.idle).toBe("–");
    }
  });

  it("uses the lesson's thread-creation cost", () => {
    expect(run("thread-pool")[0]!.note).toContain("78 µs");
  });
});

describe("semaphore", () => {
  it("names the blocked threads instead of claiming everyone holds a resource", () => {
    const frames = run("semaphore", { threads: 5, permits: 2 });
    expect(frames.some((f) => f.note.includes("everyone is using a resource"))).toBe(false);
    expect(frames[2]!.note).toContain("T3, T4 and T5 stay blocked");
  });
});

describe("producer-consumer", () => {
  it("never says consumers are busy elsewhere while threads sit parked", () => {
    for (const f of run("producer-consumer", { threads: 4, capacity: 3 })) expect(f.note).not.toMatch(/busy elsewhere/);
  });

  it("spsc mode uses no lock: each index has one writer and the ring wraps", () => {
    const frames = run("producer-consumer", { mode: "spsc" });
    expect(frames.every((f) => !("mutex" in f.state.shared))).toBe(true);
    const end = last(frames).state.shared;
    expect(end.tail).toBe(6);
    expect(end.head).toBe(2);
    expect(frames.some((f) => f.tag === "full")).toBe(true);
  });
});

describe("race-condition with a quota", () => {
  it("lets two exports through a limit of one remaining", () => {
    const done = last(run("race-condition", { quota: { used: 9, limit: 10 } }));
    expect(done.state.vars["exports allowed"]).toBe(11);
    expect(done.state.shared['used["u1"]']).toBe(10);
  });
});

describe("dining-philosophers", () => {
  it("numbers philosophers and forks from 0, as the classic statement does", () => {
    const frames = run("dining-philosophers", { threads: 5 });
    expect(frames[0]!.state.threads.map((t) => t.id)).toEqual(["P0", "P1", "P2", "P3", "P4"]);
    expect(frames.find((f) => f.tag === "fix")!.note).toContain("P4 changes behaviour: it now reaches for F0 before F4");
  });
});

describe("false-sharing", () => {
  it("uses the lesson's measured transfer cost", () => {
    expect(run("false-sharing").some((f) => f.note.includes("about 35 ns"))).toBe(true);
  });
});
