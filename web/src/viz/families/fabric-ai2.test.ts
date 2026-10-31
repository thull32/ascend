import { describe, expect, it } from "vitest";
import type { Frame } from "../engine";
import type { FabHeader, FabricState } from "./fabric-core";
import { scenarios } from "./fabric-scenarios-ai2";

const run = (name: string): Frame<FabricState>[] => scenarios[name]!({});
const fields = (h: FabHeader | undefined) => Object.fromEntries((h?.fields ?? []).map((f) => [f.k, f.v]));
const header = (f: Frame<FabricState>, name: string) => f.state.headers?.stack.find((h) => h.name === name);
const table = (f: Frame<FabricState>, title: string) => f.state.tables.find((t) => t.title.startsWith(title));
const node = (f: Frame<FabricState>, id: string) => f.state.nodes.find((n) => n.id === id)!;
const last = <T>(xs: T[]) => xs[xs.length - 1]!;
const series = (f: Frame<FabricState>, name: string) => f.state.chart!.series.find((s) => s.name === name)!.points;

describe("ai2 pack", () => {
  it("every scenario runs 8-25 frames by default", () => {
    for (const [name, gen] of Object.entries(scenarios)) {
      const n = gen({}).length;
      expect(n, name).toBeGreaterThanOrEqual(8);
      expect(n, name).toBeLessThanOrEqual(25);
    }
  });
});

describe("ib-credit-flow", () => {
  const frames = run("ib-credit-flow");
  const credit = (f: Frame<FabricState>) => Object.fromEntries(table(f, "VL 0 credit state")!.rows.map((r) => [r[0]!, r[2]!]));

  it("charges 65 blocks for a 4,122-byte packet", () => {
    expect(frames[1]!.state.vars["packet size"]).toBe("4,122 B = 65 blocks");
    expect(fields(header(frames[1]!, "LRH (local route header)")).PktLen).toBe("1,030 words");
  });

  it("sends three packets on 256 credits, holds the fourth, then sends it when FCCL rises to 321", () => {
    const blocked = frames.find((f) => f.tag === "blocked")!;
    const checks = table(blocked, "srv1's test")!.rows;
    expect(checks.map((r) => r[1])).toEqual([
      "(256 − (0 + 65)) mod 4096 = 191",
      "(256 − (65 + 65)) mod 4096 = 126",
      "(256 − (130 + 65)) mod 4096 = 61",
      "(256 − (195 + 65)) mod 4096 = 4,092",
    ]);
    expect(last(checks)[2]).toBe("> 2,048: wait");
    expect(credit(blocked)["credits left"]).toBe("61");
    expect(blocked.state.packets).toHaveLength(0);

    const raised = frames.find((f) => f.tag === "credit")!;
    expect(credit(raised)["FCCL: credit limit"]).toBe("321");
    expect(fields(header(raised, "Flow control packet")).FCCL).toBe("321");
    const resumed = frames[frames.indexOf(raised) + 1]!;
    expect(last(table(resumed, "srv1's test")!.rows)).toEqual(["packet 4", "(321 − (195 + 65)) mod 4096 = 61", "≤ 2,048: send"]);
    expect(credit(resumed)["FCTBS: blocks sent"]).toBe("260");
  });

  it("caps a 100 m link at buffer / round trip", () => {
    const rows = table(frames.find((f) => f.tag === "distance")!, "Credit round trip")!.rows;
    expect(rows.map((r) => r[3])).toEqual(["400 Gb/s", "400 Gb/s", "131 Gb/s"]);
  });
});

describe("pfc-pause", () => {
  const frames = run("pfc-pause");
  const pg = series(last(frames), "PG3 from srv1").map((v) => v ?? 0);

  it("crosses XOFF at 4 μs, peaks inside headroom at 115 KB and resumes at XON 80 KB", () => {
    expect(pg[20]).toBe(100); // point every 0.2 μs: index 20 = 4.0 μs
    expect(Math.max(...pg)).toBe(115);
    expect(pg[30]).toBe(80); // 6.0 μs
    expect(Math.max(...pg)).toBeLessThan(150);
    expect(Math.min(...pg.slice(30))).toBe(65);
  });

  it("pauses priority 3 only, for 65,535 quanta, and resumes with time 0", () => {
    const pause = frames.find((f) => f.tag === "frame")!;
    const pfc = fields(header(pause, "PFC"));
    expect(pfc["class-enable vector"]).toBe("0x0008 (priority 3 only)");
    expect(pfc["time[3]"]).toBe("65,535 quanta");
    expect(fields(header(pause, "Ethernet (MAC control)"))).toMatchObject({ "dst MAC": "01:80:c2:00:00:01", EtherType: "0x8808 (MAC control)" });
    expect(pause.note).toContain("83.9 μs");
    const xon = frames.find((f) => f.tag === "resume")!;
    expect(fields(header(xon, "PFC"))["time[3]"]).toBe("0 (resume)");
  });

  it("keeps the egress busy and drops nothing over the cycle", () => {
    const rows = Object.fromEntries(table(frames.find((f) => f.tag === "cycle")!, "What")!.rows.map((r) => [r[0]!, r[1]!]));
    expect(rows["PAUSE (XOFF) sent per port"]).toBe("2, at 4.0 and 8.0 μs");
    expect(rows["resume (XON) sent per port"]).toBe("2, at 6.0 and 10.0 μs");
    expect(rows["lowest egress queue to srv3"]).toBe("130 KB");
    expect(frames.every((f) => f.state.packets.every((p) => !p.lost))).toBe(true);
  });
});

describe("ecn-dcqcn", () => {
  const frames = run("ecn-dcqcn");
  const srv1 = (f: Frame<FabricState>) => table(f, "Sender NICs")!.rows[0]!;

  it("marks ECT(0) packets CE and answers with a CNP on priority 6", () => {
    expect(fields(header(frames.find((f) => f.tag === "send")!, "IPv4")).ECN).toBe("10 (ECT(0), ECN-capable)");
    expect(fields(header(frames.filter((f) => f.tag === "send")[1]!, "IPv4")).ECN).toBe("11 (CE, congestion experienced)");
    const cnp = frames.find((f) => f.tag === "cnp")!;
    expect(fields(header(cnp, "IB BTH")).opcode).toBe("0x81 (CNP)");
    expect(fields(header(cnp, "IPv4")).DSCP).toBe("48 → priority 6 (strict)");
    expect(fields(header(cnp, "IPv4")).dst).toBe("10.200.1.1");
  });

  it("cuts 400 → 200 → 100, then recovers by halving the gap and adds 40 Mb/s", () => {
    const rc = frames.filter((f) => ["cut", "recover", "increase"].includes(f.tag ?? "")).map((f) => srv1(f)[1]);
    expect(rc).toEqual(["200 Gb/s", "100 Gb/s", "150 Gb/s", "196.88 Gb/s", "198.46 Gb/s"]);
    const inc = frames.find((f) => f.tag === "increase")!;
    expect(srv1(inc)[2]).toBe("200.04 Gb/s");
    expect(srv1(inc)[3]).toBe("0.9768");
    expect(srv1(inc)[4]).toBe("2");
  });

  it("charts the total into srv3's port: 400, 800, 400, 200, then back near 400", () => {
    const total = series(last(frames), "total into srv3's port").map((v) => v ?? 0);
    expect(total).toHaveLength(85);
    expect(total[0]).toBe(400);
    expect(Math.max(...total)).toBe(800);
    expect(total[10]).toBe(400); // 50 μs: after the first cut
    expect(total[18]).toBe(200); // 90 μs: after the second cut
    expect(last(total)).toBeCloseTo(396.92, 2);
    expect(series(last(frames), "srv2").slice(0, 4)).toEqual([null, null, null, null]);
  });

  it("builds a 450 KB standing queue that drains at 97 μs", () => {
    const standing = frames.find((f) => f.tag === "standing")!;
    expect(table(standing, "rail1-leaf1 egress")!.rows[0]).toEqual(["queue depth", "450 KB"]);
    expect(frames.find((f) => f.tag === "drained")!.note).toContain("t = 97 μs");
  });
});

describe("pfc-deadlock", () => {
  const frames = run("pfc-deadlock");

  it("spreads pauses upstream and stalls the victim flow with no drops", () => {
    const victim = frames.find((f) => f.tag === "victim")!;
    const pauses = table(victim, "PFC pauses")!.rows.map((r) => r[1]);
    expect(pauses).toEqual(["rail1-leaf1 pauses srv1", "rail1-leaf1 pauses ai-spine1", "ai-spine1 pauses rail1-leaf2", "rail1-leaf2 pauses srv65", "rail1-leaf2 pauses srv66"]);
    expect(table(victim, "RDMA flows")!.rows[2]).toEqual(["srv66 → srv5", "rail1-leaf2 → ai-spine1 → rail1-leaf1", "0 Gb/s, waiting"]);
    expect(victim.state.vars.drops).toBe(0);
  });

  it("tells the story in order: failure, micro-loop, mutual pause, deadlock, watchdog", () => {
    const tags = frames.map((f) => f.tag);
    const order = ["failure", "loop", "pause", "deadlock", "watchdog", "recover"].map((t) => tags.lastIndexOf(t));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const failure = frames.find((f) => f.tag === "failure")!;
    expect(failure.state.links.find((l) => l.a === "ai-spine1.sjc" && l.b === "rail1-leaf1.sjc")?.down ?? failure.state.links.find((l) => l.b === "ai-spine1.sjc" && l.a === "rail1-leaf1.sjc")?.down).toBe(true);
  });

  it("shows the cycle: each switch pausing the other on the same link", () => {
    const dl = frames.find((f) => f.tag === "deadlock")!;
    expect(table(dl, "PFC pauses")!.rows.map((r) => r[1])).toEqual(["rail1-leaf2 pauses ai-spine1", "ai-spine1 pauses rail1-leaf2"]);
    expect(table(dl, "Who waits")!.rows).toHaveLength(4);
    const wd = frames.find((f) => f.tag === "watchdog")!;
    expect(table(wd, "PFC pauses")!.rows.filter((r) => r[2] === "storm detected")).toHaveLength(2);
  });
});

describe("rail-optimized", () => {
  const frames = run("rail-optimized");
  const first = frames[0]!;

  it("cables GPU k of every server to rail k's leaf", () => {
    for (let k = 1; k <= 8; k++) {
      for (const srv of [1, 2]) {
        const g = `srv${srv}-gpu${k}`;
        const leaves = first.state.links.filter((l) => (l.a === g || l.b === g) && (l.a.endsWith("leaf1.sjc") || l.b.endsWith("leaf1.sjc"))).map((l) => (l.a === g ? l.b : l.a));
        expect(leaves).toEqual([`rail${k}-leaf1.sjc`]);
      }
    }
  });

  it("sizes 1,024 GPUs as 16 leaves and 8 spines", () => {
    const rows = Object.fromEntries(table(frames.find((f) => f.tag === "sizing")!, "Sizing")!.rows.map((r) => [r[0]!, r[1]!]));
    expect(rows.leaves).toBe("8 rails × 2 = 16");
    expect(rows.spines).toBe("16 × 64 uplinks ÷ 128 ports = 8");
  });

  it("same rail is one switch; cross rail is three direct or one after NVLink", () => {
    const hops = frames.filter((f) => f.tag === "hop");
    expect(hops.map((f) => [f.state.packets[0]!.from, f.state.packets[0]!.to])).toEqual([
      ["srv1-gpu3", "rail3-leaf1.sjc"],
      ["rail3-leaf1.sjc", "srv2-gpu3"],
    ]);
    const pxn = frames.filter((f) => f.tag === "pxn");
    expect(pxn[0]!.state.packets[0]!.to).toBe("srv1-nvswitch");
    expect(pxn[1]!.state.packets.map((p) => p.from)).toEqual(["srv1-gpu8", "rail8-leaf1.sjc"]);
    const rows = table(frames.find((f) => f.tag === "compare")!, "Switches crossed")!.rows.map((r) => r[2]);
    expect(rows).toEqual(["1", "3", "1 + NVLink", "3"]);
  });
});

describe("adaptive-routing", () => {
  const frames = run("adaptive-routing");

  it("static ECMP collides two flows on one spine and leaves one idle", () => {
    const ecmp = table(frames.find((f) => f.tag === "hash")!, "Static ECMP")!.rows.map((r) => r[3]!);
    const counts = ["ai-spine1", "ai-spine2", "ai-spine3", "ai-spine4"].map((s) => ecmp.filter((x) => x === s).length);
    expect(counts).toEqual([0, 2, 1, 1]);
    expect(frames.find((f) => f.tag === "slow")!.state.vars.delivered).toBe("1,200 of 1,600 Gb/s");
  });

  it("per-packet spraying gives every flow 400 Gb/s", () => {
    const spray = frames.find((f) => f.tag === "spray")!;
    expect(new Set(spray.state.packets.map((p) => p.to)).size).toBe(4);
    const done = last(frames);
    for (const f of ["A", "B", "C", "D"]) expect(last(series(done, `flow ${f}`))).toBe(400);
    expect(series(done, "flow A").slice(0, 3)).toEqual([200, 200, 200]);
    expect(done.state.vars.delivered).toBe("1,600 of 1,600 Gb/s");
  });

  it("delivers out of order, and the SuperNIC places each packet by offset", () => {
    const reorder = frames.find((f) => f.tag === "reorder")!;
    expect(table(reorder, "Flow A arriving")!.rows.map((r) => r[1])).toEqual(["1001", "1003", "1002", "1004"]);
    const placed = frames.find((f) => f.tag === "placed")!;
    expect(table(placed, "Flow A at a SuperNIC")!.rows.map((r) => r[2])).toEqual(["message start + 0 B", "message start + 8,192 B", "message start + 4,096 B", "message start + 12,288 B"]);
    expect(node(frames.find((f) => f.state.packets.some((p) => p.label.startsWith("NAK")))!, "receivers").state).toBe("plain NIC: NAK");
  });
});
