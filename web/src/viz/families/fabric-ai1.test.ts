import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import type { FabHeader, FabricInput, FabricState } from "./fabric-core";
import { fabricFamily } from "./fabric";
import { scenarios } from "./fabric-scenarios-ai1";

const run = (name: string, input: Record<string, unknown> = {}): Frame<FabricState>[] => scenarios[name]!(fabricFamily.normalise!({ ...input }) as FabricInput);
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const table = (f: Frame<FabricState>, title: string) => f.state.tables.find((t) => t.title.startsWith(title));
const series = (f: Frame<FabricState>, name: string) => f.state.chart!.series.find((s) => s.name === name)!.points as number[];

describe("ai1 pack", () => {
  it("registers all six scenarios in the family", () => {
    for (const name of ["training-step", "incast", "parallelism-traffic", "ring-allreduce", "scale-up-vs-out", "rdma-write"]) {
      expect(fabricFamily.algorithms[name], name).toBe(scenarios[name]);
      const n = run(name).length;
      expect(n, name).toBeGreaterThanOrEqual(8);
      expect(n, name).toBeLessThanOrEqual(25);
    }
  });
});

describe.each([
  ["incast", { senders: 4 }],
  ["incast", { senders: 5 }],
  ["ring-allreduce", { gpus: 3 }],
  ["ring-allreduce", { gpus: 5 }],
  ["ring-allreduce", { gpus: 6 }],
] as [string, Record<string, unknown>][])("%s %o", (name, input) => {
  const frames = run(name, input);
  it("has complete, distinct notes and valid references", () => {
    expect(frames.length).toBeGreaterThanOrEqual(8);
    expect(frames.length).toBeLessThanOrEqual(25);
    for (const f of frames) {
      expect(f.note).not.toMatch(/undefined|NaN|\[object/);
      expect(/[.!?)]$/.test(f.note.trim()), f.note).toBe(true);
      const ids = new Set(f.state.nodes.map((n) => n.id));
      for (const p of f.state.packets) expect(ids.has(p.from) && ids.has(p.to)).toBe(true);
      for (const l of f.state.links) expect(ids.has(l.a) && ids.has(l.b)).toBe(true);
    }
    expect(new Set(frames.map((f) => f.note)).size).toBe(frames.length);
  });
});

describe("training-step", () => {
  const frames = run("training-step");
  const done = last(frames);

  it("takes 370 ms healthy and 440 ms with one 200G link, compute unchanged", () => {
    expect(done.state.vars["step 1"]).toBe("370 ms");
    expect(done.state.vars["step 2"]).toBe("440 ms (+70 ms)");
    expect(done.state.vars["GPU idle in step 1"]).toBe("70 ms (18.9%)");
    expect(done.state.vars["GPU idle in step 2"]).toBe("140 ms (31.8%)");
    const timeline = table(done, "Step timeline")!.rows;
    expect(timeline.map((r) => [r[1], r[2], r[3]])).toEqual([
      ["forward", "0", "100"],
      ["backward", "100", "300"],
      ["all-reduce", "300", "370"],
      ["forward + backward", "370", "670"],
      ["all-reduce", "670", "810"],
    ]);
  });

  it("charts the GPU idle while its link runs at full rate, then at half rate", () => {
    const gpu = series(done, "srv001 GPU computing");
    const link = series(done, "srv001 link, % of 400G");
    expect(gpu).toHaveLength(81);
    expect(link.slice(30, 37)).toEqual(Array(7).fill(100));
    expect(link.slice(67, 81)).toEqual(Array(14).fill(50));
    expect(gpu.slice(67, 81)).toEqual(Array(14).fill(0));
  });

  it("identifies the straggler as the only saturated port", () => {
    const counters = table(done, "rail1-leaf1.sjc port counters")!;
    const full = counters.rows.filter((r) => r[3] === "100%");
    expect(full).toEqual([["srv005", "200G", "200 Gb/s", "100%"]]);
    expect(counters.rows.filter((r) => r[3] === "50%")).toHaveLength(7);
    const slow = frames.find((f) => f.tag === "straggler")!;
    const widths = Object.fromEntries(slow.state.links.map((l) => [l.a, l.width]));
    expect(widths["srv005.gpu0"]).toBe(1);
    expect(widths["srv001.gpu0"]).toBe(0.5);
  });
});

describe("incast", () => {
  const frames = run("incast");
  const done = last(frames);

  it("drops half of a 6:1 burst in the lossy class and resends more under go-back-N", () => {
    expect(done.state.vars["lossy: dropped"]).toBe("3 MB (50%)");
    expect(done.state.vars["lossy: delivered"]).toBe("3 MB");
    expect(done.state.vars["lossy: resent"]).toBe("3.6 MB");
    const drop = frames.find((f) => f.tag === "drop")!;
    expect(drop.state.packets.filter((p) => p.lost)).toHaveLength(5);
    const lossy = series(done, "lossy class");
    expect(Math.max(...lossy)).toBe(2);
    expect(lossy[2]).toBe(2); // 8 us
    expect(lossy[15]).toBe(0); // 60 us
  });

  it("pauses every sender in the PFC class, holds the queue at 6 x XOFF and drops nothing", () => {
    const pause = frames.find((f) => f.tag === "pause")!;
    expect(pause.state.packets).toHaveLength(6);
    expect(pause.state.packets.every((p) => p.from === "rail1-leaf1.sjc" && p.label === "PAUSE p3")).toBe(true);
    const pfc = series(done, "PFC class");
    expect(pfc).toHaveLength(31); // 0..120 us
    expect(Math.max(...pfc)).toBe(1.2);
    expect(last(pfc)).toBe(0);
    const summary = table(done, "the same incast")!.rows;
    expect(summary[0]).toEqual(["dropped", "3 MB", "0 MB"]);
    expect(summary[2]).toEqual(["senders paused", "never", "83% of the burst"]);
  });

  it("scales with `senders` and falls back to six on bad input", () => {
    const four = last(run("incast", { senders: 4 }));
    expect(four.state.vars["lossy: dropped"]).toBe("1 MB (25%)");
    expect(four.state.nodes.filter((n) => n.state === "done")).toHaveLength(4);
    expect(last(run("incast", { senders: "lots" })).state.vars.senders).toBe(6);
    expect(last(run("incast", { senders: 2 })).state.vars.senders).toBe(4);
  });
});

describe("parallelism-traffic", () => {
  const frames = run("parallelism-traffic");

  it("keeps TP and DP on NVLink and puts only PP on the rails", () => {
    for (const tag of ["tp", "dp"]) {
      for (const f of frames.filter((x) => x.tag === tag)) for (const p of f.state.packets) expect(p.to.startsWith("nvswitch."), `${tag} ${p.from}→${p.to}`).toBe(true);
    }
    const pp = frames.filter((f) => f.tag === "pp" && f.state.packets.length > 0);
    expect(pp).toHaveLength(3);
    for (const f of pp) {
      expect(f.state.packets).toHaveLength(8);
      for (const p of f.state.packets) {
        const gpu = p.from.startsWith("srv") ? p.from : p.to;
        const rail = p.from.startsWith("rail") ? p.from : p.to;
        expect(rail).toBe(`rail${Number(gpu.slice(-1)) + 1}-leaf1.sjc`);
        expect(p.label).toBe("10 MiB");
      }
    }
  });

  it("totals bytes per GPU per step", () => {
    const summary = frames.find((f) => f.tag === "summary")!;
    expect(table(summary, "bytes per GPU per step")!.rows.map((r) => [r[0], r[1], r[2]])).toEqual([
      ["TP all-reduce", "37.5 GiB", "NVLink"],
      ["PP handoff", "80 MiB out + 80 MiB in", "network"],
      ["PP all-gather", "240 MiB", "NVLink"],
      ["DP all-reduce", "2.9 GiB", "NVLink"],
    ]);
    expect(summary.state.vars["per GPU per step: network"]).toBe("160 MiB");
    expect(summary.note).toContain("99.6%");
  });
});

describe("ring-allreduce", () => {
  const sums = (n: number) => Array.from({ length: n }, (_, c) => String(Array.from({ length: n }, (_, r) => (c + 1) * 10 ** r).reduce((a, b) => a + b, 0)));

  it("follows the textbook schedule: rank r owns chunk (r+1) mod n after reduce-scatter", () => {
    for (const n of [3, 4, 6]) {
      const frames = run("ring-allreduce", { gpus: n });
      expect(frames.filter((f) => f.tag === "reduce-scatter" && f.state.packets.length > 0)).toHaveLength(n - 1);
      expect(frames.filter((f) => f.tag === "all-gather")).toHaveLength(n - 1);
      const afterRs = frames.find((f) => f.tag === "reduce-scatter" && f.state.packets.length === 0)!;
      const rows = table(afterRs, "one sample element")!.rows;
      const total = sums(n);
      rows.forEach((row, r) => expect(row[1 + ((r + 1) % n)]).toBe(total[(r + 1) % n]));
      for (const row of table(last(frames), "one sample element")!.rows) expect(row.slice(1)).toEqual(total);
    }
  });

  it("sends 2(n-1)/n of the vector per rank and reports busbw = link rate", () => {
    const done = last(run("ring-allreduce"));
    expect(done.state.vars["sent per rank"]).toBe("600 MB = 2(n−1)/n × 400 MB");
    expect(done.state.vars.elapsed).toBe("12 ms");
    expect(done.state.vars["algorithm bandwidth"]).toBe("33.3 GB/s");
    expect(done.state.vars["bus bandwidth"]).toBe("50 GB/s");
    const step1 = run("ring-allreduce").find((f) => f.tag === "reduce-scatter")!;
    expect(table(step1, "reduce-scatter step 1")!.rows[0]).toEqual(["rank 0 → 1", "0", "1", "10 + 1 = 11"]);
    expect(run("ring-allreduce", { gpus: "x" })).toHaveLength(run("ring-allreduce").length);
  });
});

describe("scale-up-vs-out", () => {
  const frames = run("scale-up-vs-out");
  const done = last(frames);

  it("compares 450 GB/s NVLink with a 50 GB/s NIC for the same 1 GiB", () => {
    const rows = table(done, "1 GiB from srv001 GPU0")!.rows;
    expect(rows[0]).toEqual(["bandwidth each way", "450 GB/s (NVLink 4)", "50 GB/s (400 Gb/s NIC)"]);
    expect(rows[1]).toEqual(["1 GiB takes", "2.4 ms", "21.5 ms"]);
  });

  it("sends the scale-up copy through the NVSwitch only and the scale-out copy through PCIe, NICs and the leaf", () => {
    const sends = frames.filter((f) => f.tag === "send").map((f) => `${f.state.packets[0]!.from}>${f.state.packets[0]!.to}`);
    expect(sends).toEqual([
      "srv001.gpu0>nvswitch.srv001",
      "nvswitch.srv001>srv001.gpu1",
      "srv001.gpu0>pcie.srv001",
      "pcie.srv001>srv001.nic0",
      "srv001.nic0>rail1-leaf1.sjc",
      "rail1-leaf1.sjc>srv002.nic0",
      "pcie.srv002>srv002.gpu0",
    ]);
  });

  it("charts the alpha-beta curves converging on the link rates", () => {
    const ab = frames.find((f) => f.tag === "alpha-beta")!;
    const nv = series(ab, "NVLink (α = 1 µs)");
    const net = series(ab, "network (α = 3 µs)");
    expect(nv).toHaveLength(11);
    expect(nv[5]).toBe(314.9); // 1 MiB
    expect(net[5]).toBe(43.7);
    expect(last(nv)).toBeCloseTo(449.8, 1);
    expect(last(net)).toBe(50);
  });
});

describe("rdma-write", () => {
  const frames = run("rdma-write");

  it("counts two syscalls and two copies on the TCP path", () => {
    const tcp = frames.filter((f) => table(f, "TCP path"));
    const rows = table(last(tcp), "TCP path")!.rows;
    expect(rows[0]).toEqual(["system calls", "2"]);
    expect(rows[1]).toEqual(["data copies by a CPU", "2"]);
  });

  it("never touches a kernel on the RDMA data path", () => {
    const start = frames.findIndex((f) => f.tag === "register");
    expect(start).toBeGreaterThan(0);
    for (const f of frames.slice(start)) for (const p of f.state.packets) expect(`${p.from} ${p.to}`).not.toContain("kernel");
  });

  it("builds RoCEv2 WRITE First and Last packets, routed by the leaf, then an ACK", () => {
    const sends = frames.filter((f) => f.state.headers && f.state.packets.length > 0);
    const first = sends[0]!;
    expect(fields(header(first, "UDP"))["dst port"]).toBe("4791 (RoCEv2)");
    expect(fields(header(first, "BTH"))).toMatchObject({ opcode: "0x06 RDMA WRITE First", "dest QP": "0x0001a7", PSN: "0x004e20", AckReq: "0" });
    expect(fields(header(first, "RETH"))).toMatchObject({ R_Key: "0x00a1b2c3", "DMA length": "1,048,576" });
    expect(fields(header(first, "IPv4")).TTL).toBe("64");
    expect(fields(header(sends[1]!, "IPv4")).TTL).toBe("63");
    const lastPkt = sends.find((f) => fields(header(f, "BTH")).opcode === "0x08 RDMA WRITE Last")!;
    expect(fields(header(lastPkt, "BTH"))).toMatchObject({ PSN: "0x004f1f", AckReq: "1" });
    expect(header(lastPkt, "RETH")).toBeUndefined();
    const ack = sends.filter((f) => fields(header(f, "BTH")).opcode === "0x11 Acknowledge");
    expect(ack).toHaveLength(2);
    expect(fields(header(ack[0]!, "BTH"))["dest QP"]).toBe("0x000112");
    expect(ack.map((f) => f.state.packets[0]!.to)).toEqual(["rail1-leaf1.sjc", "srv001.nic0"]);
  });

  it("ends with a polled completion and the tally", () => {
    const cqe = frames.find((f) => table(f, "completion queue entry"))!;
    expect(table(cqe, "completion queue entry")!.rows[1]).toEqual(["status", "IBV_WC_SUCCESS"]);
    const tally = table(last(frames), "moving 1 MiB")!.rows;
    expect(tally[1]).toEqual(["CPU copies of the data", "2", "0"]);
  });
});
