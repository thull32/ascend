import { describe, expect, it } from "vitest";
import { MAX_FRAMES } from "../engine";
import type { SystemInput, SystemState } from "./system-core";
import { scenariosB } from "./system-scenarios-b";

type F = { state: SystemState; note: string; tag?: string };
const run = (name: string, input: SystemInput = {}): F[] => scenariosB[name]!(input) as F[];
const node = (f: F, id: string) => f.state.nodes.find((n) => n.id === id || n.label === id)!;
const find = (frames: F[], re: RegExp) => frames.find((f) => re.test(f.note))!;
const rows = (f: F) => f.state.table!.rows;

/** Every mode and parameter the lessons use, plus edge cases. */
const INPUTS: Record<string, SystemInput[]> = {
  "token-bucket": [{}, { requests: 12 }, { capacity: 10, refill: 6, requests: 17 }, { capacity: 5, refill: 12, requests: 10 }, { mode: "retry-budget" }, { capacity: 3, refill: 20, unit: "min", keys: ["a", "a", "a", "a", "b", "a"], times: [0, 0, 0, 0, 0, 20] }],
  "circuit-breaker": [{}, { requests: 1 }, { contract: true }, { mode: "spend", requests: 16 }, { caller: "Gateway", dependency: "Redis", timeoutMs: 2, openFor: 10 }],
  canary: [{}, { requests: 20 }, { requests: 5 }],
  cdc: [{}, { requests: 2 }, { sink: "cache" }, { sink: "seat-map" }, { sink: "nope" }],
  "kafka-partitions": [{}, { nodes: 2 }, { keys: ["imp-51", "imp-07", "imp-51", "imp-93", "imp-07", "imp-22"] }, { keys: ["only"] }, { mode: "lag" }, { mode: "idempotent" }],
  "message-queue": [{}, { requests: 3 }, { requests: 4 }, { requests: 10, flavor: "lease" }],
  pubsub: [{}, { flavor: "log" }, { flavor: "presence" }],
  backpressure: [{}, { mode: "reject" }, { mode: "spool", requests: 8 }, { mode: "spool", requests: 4 }, { mode: "spool", requests: 12 }],
  "retry-backoff": [{}, { requests: 6 }, { requests: 5, deadlineMs: 1000, attemptMs: 120 }],
  mapreduce: [{}, { nodes: 2 }],
  "stream-windowing": [{}, { size: 60 }, { requests: 5 }],
  "lru-cache": [{}, { capacity: 2, keys: ["1", "2", "1", "3", "4", "3", "4"] }],
  "lfu-cache": [{}],
};

describe("system scenarios B", () => {
  it.each(Object.keys(scenariosB))("%s survives every input", (name) => {
    for (const input of INPUTS[name] ?? [{}]) {
      const frames = run(name, input);
      expect(frames.length).toBeGreaterThan(3);
      expect(frames.length).toBeLessThanOrEqual(MAX_FRAMES);
      for (const f of frames) expect(f.note).not.toMatch(/undefined|NaN/);
    }
  });

  it("token bucket: a refill capped at capacity says so instead of claiming 5 tokens in 6 s (155)", () => {
    const f = find(run("token-bucket", { requests: 12 }), /Request #12/);
    expect(f.note).toContain("6s since t=3s would earn 6 tokens, but the bucket holds at most 5");
    expect(f.note).not.toMatch(/5 tokens refilled since/);
  });

  it("token bucket: capacity and refill follow the input (Ascend's 10 tokens, one per 6 s)", () => {
    const frames = run("token-bucket", { capacity: 10, refill: 6, requests: 17 });
    const last = frames[frames.length - 3]!;
    expect(rows(last).filter((r) => r[3] === "accept").length).toBe(14);
    expect(rows(last)[10]).toEqual([11, 0, 0, "reject", 0]);
    expect(rows(last)[12]).toEqual([13, 12, 2, "accept", 1]);
  });

  it("token bucket: keyed buckets are independent", () => {
    const frames = run("token-bucket", { capacity: 3, refill: 20, unit: "min", keys: ["a", "a", "a", "a", "b", "a"], times: [0, 0, 0, 0, 0, 20] });
    const t = rows(frames[frames.length - 1]!);
    expect(t.map((r) => r[4])).toEqual(["accept", "accept", "accept", "reject", "accept", "accept"]);
    expect(t[4]![3]).toBe(3);
  });

  it("token bucket: retry budget follows gRPC retryThrottling (129)", () => {
    const frames = run("token-bucket", { mode: "retry-budget" });
    const t = rows(frames[frames.length - 1]!);
    expect(t.slice(0, 6).map((r) => r[3])).toEqual([9, 8, 7, 6, 5, 4]);
    expect(String(t[4]![4])).toMatch(/^no/);
    expect(find(frames, /51 successes/).note).toContain("5.1");
  });

  it("circuit breaker: shed calls are numbered and the probe count is honest (101, 117, 125)", () => {
    const frames = run("circuit-breaker", { requests: 15 });
    const t = rows(frames[frames.length - 1]!);
    expect(t[5]![0]).toBe("6–20");
    expect(t.slice(-2).map((r) => r[0])).toEqual([21, 22]);
    const close = find(frames, /CLOSES/);
    expect(close.note).toContain("two probe calls");
    expect(close.note).not.toContain("one probe call");
  });

  it("circuit breaker: labels and timeout follow the input (116, 117)", () => {
    const frames = run("circuit-breaker", { caller: "Gateway", dependency: "Redis", timeoutMs: 2 });
    expect(node(frames[0]!, "dep").label).toBe("Redis");
    expect(frames.some((f) => /Payments/.test(f.note))).toBe(false);
    expect(find(frames, /starts timing out/).note).toContain("2 ms timeout");
  });

  it("circuit breaker: a 4xx is not counted, a 5xx is (150)", () => {
    const frames = run("circuit-breaker", { contract: true });
    const four = frames.find((f) => f.tag === "4xx")!;
    expect(node(four, "breaker").state).toContain("0/3");
    const five = frames.find((f) => f.tag === "5xx")!;
    expect(node(five, "breaker").state).toContain("2/3");
  });

  it("circuit breaker: spend mode trips on the daily total (150)", () => {
    const frames = run("circuit-breaker", { mode: "spend" });
    const trip = frames.find((f) => f.tag === "trip")!;
    expect(node(trip, "breaker").state).toMatch(/^OPEN · \$502/);
  });

  it("canary: the failing stage's table and message agree, arrows carry their own counts (100, 125, 148, 151)", () => {
    for (const requests of [10, 20]) {
      const frames = run("canary", { requests });
      const fail = find(frames, /gate fails/);
      const canaryRow = rows(fail)[1]!;
      expect(fail.state.messages[0]!.label).toContain(`${canaryRow[3]}/${canaryRow[2]} errors`);
      const stage1 = frames.find((f) => f.tag === "stage")!;
      expect(stage1.state.messages.map((m) => m.label)).toEqual([`${requests * 0.9} req`, `${requests * 0.1} req`]);
    }
    expect(node(run("canary")[0]!, "stable").state).not.toContain("0.1%");
  });

  it("cdc: the confirmed LSN never contradicts the crash, and the sink follows the input (99, 103, 147)", () => {
    const frames = run("cdc", { sink: "cache" });
    const lastEmit = frames.find((f) => /not yet confirmed/.test(f.note))!;
    expect(lastEmit.state.vars["confirmed LSN"]).toBe(3);
    expect(find(frames, /crashes right there/).note).toContain("last confirmed LSN, 3");
    expect(node(frames[0]!, "sink").label).toBe("Cache");
    expect(frames.some((f) => /an DELETE|search/i.test(f.note))).toBe(false);
    expect(frames.some((f) => /a DELETE on users/.test(f.note))).toBe(true);
  });

  it("kafka: every consumer that commits has read records, and the resume offset was committed (98, 145)", () => {
    for (const input of [{}, { keys: ["imp-51", "imp-07", "imp-51", "imp-93", "imp-07", "imp-22"] }, { keys: ["aZ3kP9x", "q8Lm2Tt", "aZ3kP9x", "x1Yb7Qe", "aZ3kP9x", "Pz04nWc"] }]) {
      const frames = run("kafka-partitions", input);
      for (const f of frames.filter((x) => /commit offset (\d+)/.test(x.state.messages[0]?.label ?? ""))) {
        const off = Number(/commit offset (\d+)/.exec(f.state.messages[0]!.label)![1]);
        expect(off).toBeGreaterThan(0);
      }
      const rb = frames.find((f) => f.tag === "rebalance")!;
      expect(rb.note).toMatch(/resumes P\d from the last committed offset, \d+/);
    }
    const t = rows(run("kafka-partitions")[7]!);
    expect(t.every((r) => r[2] !== 0)).toBe(true);
  });

  it("kafka lag mode: lag grows while one consumer is alone", () => {
    const frames = run("kafka-partitions", { mode: "lag" });
    const lags = frames.map((f) => rows(f).reduce((a, r) => a + Number(r[3]), 0));
    expect(Math.max(...lags)).toBe(26);
  });

  it("message queue: depth grows when the producer outpaces the workers (98)", () => {
    const frames = run("message-queue", { requests: 12 });
    const grow = frames.find((f) => f.tag === "backlog")!;
    expect(grow.state.vars["depth trend"]).toBe("4 → 8");
    expect(run("message-queue", { flavor: "lease" }).some((f) => /visibility/.test(f.note))).toBe(false);
  });

  it("backpressure: the buffer readout matches its table (80, 98)", () => {
    for (const f of run("backpressure", { requests: 20 })) {
      const n = node(f, "buf").state!;
      const m = /^(\d+)\/8/.exec(n);
      if (m && f.state.table) expect(Number(m[1])).toBe(f.state.table.rows.length);
    }
  });

  it("backpressure reject mode: overflow is rejected at the edge, never dropped silently (101)", () => {
    const frames = run("backpressure", { mode: "reject", requests: 20 });
    expect(frames[1]!.state.messages.map((m) => m.label)).toEqual(["8 admitted", "12 × 503 + Retry-After"]);
  });

  it("backpressure spool mode: the requested batch count is respected, 429s spool to disk, the oldest is dropped when full", () => {
    const frames = run("backpressure", { mode: "spool", requests: 8 });
    const pushed = new Set(frames.flatMap((f) => f.state.messages.map((m) => m.label)).join(" ").match(/b\d+/g));
    expect([...pushed].sort()).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8"]);
    expect(frames.find((f) => f.tag === "429")!.state.table!.rows).toEqual([[1, "b2", "waiting to retry"]]);
    const drop = frames.find((f) => f.tag === "drop")!;
    expect(drop.state.table!.rows[0]).toEqual(["—", "b2", "dropped (oldest)"]);
    expect(frames[frames.length - 1]!.state.vars).toMatchObject({ accepted: 7, spooled: 0, dropped: 1 });
    expect(run("backpressure", { mode: "spool", requests: 4 }).some((f) => f.tag === "drop")).toBe(false);
  });

  it("kafka idempotent mode: PID and epoch, a duplicate retry, OutOfOrderSequence and a fenced zombie (111)", () => {
    const frames = run("kafka-partitions", { mode: "idempotent" });
    const t = rows(frames[frames.length - 1]!);
    expect(t.map((r) => r[3])).toEqual(["append", "append", "append, acked", "duplicate: answers offset 103, writes nothing", "B4 rejected: OutOfOrderSequence", "append both", "epoch bumped to 1; epoch 0 fenced", "rejected: ProducerFenced"]);
    expect(t[5]![5]).toBe("0–2, 3–4, 5–7, 8–9, 10");
    expect(node(frames.find((f) => f.tag === "fenced")!, "P1").state).toBe("FENCED");
  });

  it("pubsub presence flavour: only gateways with a viewer receive the change (118)", () => {
    const frames = run("pubsub", { flavor: "presence" });
    expect(frames.some((f) => /Billing|orders/.test(f.note + JSON.stringify(f.state.nodes)))).toBe(false);
    const online = frames.find((f) => f.tag === "fan-out")!;
    expect(online.state.messages.map((m) => m.to)).toEqual(["GA", "GB"]);
  });

  it("bulkhead: the slow dependency and its latencies are inputs; defaults are unchanged (96)", () => {
    const frames = run("bulkhead", { slow: "Recommendations", slowMs: 500, normalMs: 5 });
    expect(frames[0]!.state.nodes.map((n) => n.label)).toEqual(["Users", "API gateway", "Payments", "Recommendations", "Search"]);
    expect(frames[1]!.note).toContain("calls that took 5 ms now hang for 500 ms");
    expect(frames.some((f) => /Search/.test(f.note) || /8 s/.test(f.note))).toBe(false);
    expect(run("bulkhead", { nodes: 3 })[1]!.note).toContain("calls that took 50 ms now hang for 8 s");
  });

  it("bulkhead: a recovered dependency is not drawn in danger (80)", () => {
    const frames = run("bulkhead", { nodes: 3 });
    const sizing = frames.find((f) => f.tag === "sizing")!;
    expect(node(sizing, "search").tone).toBeUndefined();
  });

  it("retry: no attempt starts that cannot finish inside the deadline (101)", () => {
    const frames = run("retry-backoff", { requests: 5, deadlineMs: 1000, attemptMs: 120 });
    const t = rows(frames[frames.length - 1]!);
    expect(t.length).toBe(4);
    expect(find(frames, /DEADLINE_EXCEEDED/).note).toContain("at 932 ms");
  });

  it("LRU and LFU: capacity is an input and the default sequence is not truncated (83, 87, 107)", () => {
    const lru = run("lru-cache", { capacity: 2, keys: ["1", "2", "1", "3", "4", "3", "4"] });
    expect(rows(lru[lru.length - 1]!).map((r) => r[1])).toEqual(["4", "3"]);
    const lfu = run("lfu-cache");
    expect(lfu.filter((f) => /is evicted/.test(f.note)).length).toBe(4);
  });

  it("mapreduce: the combiner does something and the failure happens before the job ends (121, 144)", () => {
    const frames = run("mapreduce", { nodes: 3 });
    expect(rows(frames.find((f) => f.tag === "combine")!)[2]).toEqual(["M3", "(the,4) (ran,1)"]);
    expect(rows(frames.find((f) => f.tag === "partition")!).find((r) => r[0] === "the")).toEqual(["the", 321, 1, "reducer 1"]);
    const crash = frames.findIndex((f) => f.tag === "crash");
    const reduce = frames.findIndex((f) => f.tag === "reduce");
    expect(crash).toBeGreaterThan(0);
    expect(crash).toBeLessThan(reduce);
    expect(rows(frames[reduce]!).find((r) => r[0] === "the")![1]).toBe(6);
  });

  it("windowing: one-minute windows and an honest session rule (124, 146)", () => {
    const frames = run("stream-windowing", { size: 60 });
    expect(frames[0]!.note).toContain("size 1 min");
    expect(find(frames, /Session windows/).note).toContain("at most 24 s apart");
  });

  it("watermarks: the on-time reason and the larger bound's cost are stated correctly (124, 146)", () => {
    const frames = run("watermarks");
    expect(frames[4]!.note).toContain("has not passed the window's end (10)");
    expect(frames[4]!.note).not.toMatch(/≥ watermark/);
    expect(find(frames, /larger bound/).note).toContain("4 s later");
  });

  it("leaky bucket: max added latency is (size − 1) ÷ rate (133)", () => {
    const frames = run("leaky-bucket");
    expect(frames[frames.length - 1]!.state.vars["max added latency"]).toBe("3 s ((bucket size − 1) ÷ leak rate)");
  });

  it("blue-green: one colour is live and the other idle (152)", () => {
    for (const f of run("blue-green")) expect(String(f.state.vars.idle).split(" ")[0]).not.toBe(String(f.state.vars.live).split(" ")[0]);
  });

  it("strangler fig: the facade label follows the routing table (100)", () => {
    const frames = run("strangler-fig", { requests: 8 });
    const flip = frames.find((f) => /Step 1/.test(f.note))!;
    expect(node(flip, "facade").state).toBe("1 → new · 3 → legacy");
  });

  it("service mesh: hops cost about a millisecond and retries are on an idempotent GET (100, 135)", () => {
    const frames = run("service-mesh", { nodes: 4 });
    expect(frames.some((f) => /1–2 ms|localhost\. iptables|\/charge/.test(f.note + f.state.messages.map((m) => m.label).join(" ")))).toBe(false);
    expect(find(frames, /retry policy/).note).toContain("GET");
  });

  it("pubsub log flavour: views are consumer groups with offsets over one log (143)", () => {
    const frames = run("pubsub", { flavor: "log" });
    expect(rows(frames[3]!).find((r) => r[0] === "Warehouse")).toEqual(["Warehouse", 3, 2, "a row per play"]);
  });
});
