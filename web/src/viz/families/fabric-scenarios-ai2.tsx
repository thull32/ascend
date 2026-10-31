// Scenario pack for the `fabric` family: AI fabrics: lossless Ethernet, InfiniBand and routing (module 07, part 2).
// Each scenario is a script over the `Fab` DSL in fabric-core.tsx (read its
// authoring guide first; fabric-scenarios-core.tsx has three reference
// scenarios). Export every generator in `scenarios` and a short gallery label
// in `labels`; fabric.test.ts picks them up automatically.
//
// Scenarios this pack must implement (from the track brief: name, what it
// shows, owner lesson). Run on the Meridian fabric; the default run (input {})
// is what the owning lesson uses. Document any optional input in the
// scenario's doc comment.
//
//   | `ib-credit-flow` | InfiniBand credit-based flow control: the sender only
//     transmits when the receiver has advertised buffer credits | 07-06 |
//   | `pfc-pause` | a switch egress queue filling past the XOFF threshold,
//     PAUSE sent upstream for one priority, drain, XON | 07-07 |
//   | `ecn-dcqcn` | ECN marking at a queue threshold, the receiver NIC sending
//     CNPs, the sender cutting its rate and recovering (rate chart) | 07-07 |
//   | `pfc-deadlock` | pauses spreading upstream, head-of-line blocking an
//     innocent flow, a cyclic buffer dependency, the PFC watchdog breaking it |
//     07-08 |
//   | `rail-optimized` | 8-GPU servers with GPU k of every server on rail k's
//     leaf; same-rail traffic one hop, cross-rail via NVLink then rail | 07-09 |
//   | `adaptive-routing` | static ECMP with a collision vs per-packet adaptive
//     spraying across spines and reordering absorbed at the NIC | 07-09 |
//
// Pack conventions for Meridian's San Jose AI back end (the brief fixes the
// cluster, not these details): every GPU NIC and fabric link runs at 400 Gb/s;
// GPUs and rails are numbered 1-8 (GPU k uses NIC k on rail k); rail k has two
// leaves, `railk-leaf1.sjc` for srv1-64 and `railk-leaf2.sjc` for srv65-128;
// the back-end spines are `ai-spine1.sjc`..`ai-spine8.sjc`; NIC k of server n
// has address 10.200.<k>.<n>; RoCE data uses DSCP 26 on lossless priority 3
// and CNPs use DSCP 48 on strict priority 6 (NVIDIA's defaults).

import type { Tone } from "../primitives";
import { Fab, fnv32, hex2, type Cell, type FabGen, type HeaderSpec } from "./fabric-core";

// ---------- shared ----------

/** Gb/s of every GPU NIC and back-end link (ConnectX-7 class). */
const LINE = 400;
/** Bytes per microsecond at 400 Gb/s: 400e9 / 8 / 1e6. */
const BYTES_PER_US = (LINE * 1e9) / 8 / 1e6;
/** A RoCEv2 RDMA WRITE Middle frame with a 4,096-byte payload: Ethernet 14 + IPv4 20 + UDP 8 + BTH 12 + 4,096 + ICRC 4 + FCS 4. */
const ROCE_FRAME = 14 + 20 + 8 + 12 + 4096 + 4 + 4;
const RAIL1_LEAF1 = "rail1-leaf1.sjc";
const RAIL1_LEAF2 = "rail1-leaf2.sjc";

/** NIC k of server n: 10.200.<k>.<n> (pack convention). */
const nicIp = (server: number, rail = 1): string => `10.200.${rail}.${server}`;
/** Host MACs for NICs, from the documentation range 00:00:5e:00:53:40 upwards (hosts use 00-7f). */
const nicMac = (i: number): string => `00:00:5e:00:53:${hex2(0x40 + i)}`;
/** RoCEv2 UDP source port: the NIC derives it from the queue pair (a stand-in hash). */
const roceSport = (qp: number): number => 49152 + (fnv32(`qp${qp.toString(16).padStart(6, "0")}`) % 16384);
const qpHex = (qp: number): string => `0x${qp.toString(16).padStart(6, "0")}`;
/** Fixed-point number with thousands separators ("1,600", "198.46"). */
const num = (n: number, digits = 0): string => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
/** Drop trailing zeros: 187.5, 193.75, 196.875. */
const trim = (n: number, digits = 3): string => n.toLocaleString("en-US", { maximumFractionDigits: digits });

interface RoceOpts {
  dstMac: string;
  srcMac: string;
  src: string;
  dst: string;
  sport: number;
  qp: number;
  psn: number;
  ecn: string;
}
/** A RoCEv2 RDMA WRITE Middle packet, outermost first. */
const roceStack = (o: RoceOpts): HeaderSpec[] => [
  { name: "Ethernet", size: 14, reader: "this link only", fields: { "dst MAC": o.dstMac, "src MAC": o.srcMac, EtherType: "0x0800 (IPv4)" } },
  {
    name: "IPv4",
    size: 20,
    reader: "every switch: DSCP picks the queue, ECN may be marked",
    fields: { src: o.src, dst: o.dst, DSCP: "26 → priority 3 (lossless)", ECN: o.ecn, protocol: "17 (UDP)" },
  },
  { name: "UDP", size: 8, reader: "ECMP hash (src port), NIC (dst port)", fields: { "src port": o.sport, "dst port": "4791 (RoCEv2)" } },
  { name: "IB BTH", size: 12, reader: "destination NIC only", fields: { opcode: "0x07 (RC RDMA WRITE Middle)", "dest QP": qpHex(o.qp), PSN: o.psn } },
  { name: "Payload", size: "4,096 B", reader: "written straight into GPU memory", fields: { data: "4,096 B of the transfer" } },
  { name: "ICRC + FCS", size: 8, reader: "destination NIC (ICRC), each link (FCS)", fields: { ICRC: "4 B, end to end", FCS: "4 B, this link" } },
];

// ---------- ib-credit-flow ----------

/**
 * `ib-credit-flow` (lesson 07-06). A hypothetical InfiniBand build of
 * Meridian's San Jose back end (the real one is RoCE): srv1's HCA sends RDMA
 * WRITE packets to srv3 through ib-leaf1.sjc (NDR, 400 Gb/s) while srv2's
 * traffic keeps srv3's link busy. Link-level flow control per virtual lane,
 * with the spec's real arithmetic: credits are 64-byte blocks, a 4,122-byte
 * packet costs 65; the receiver advertises FCCL = ABR + free blocks in flow
 * control packets (FCPs); the sender may transmit only if
 * (FCCL − (FCTBS + blocks)) mod 4096 ≤ 2048. The VL 0 buffer is 256 blocks
 * (16 KB), small for readability: three packets fit, the fourth waits for
 * credit; the switch forwards one and its FCP raises FCCL from 256 to 321.
 * Then: why the counters are absolute (ABR resynchronised from FCTBS), the
 * credit loop vs cable length (buffer/RTT caps throughput), and congestion
 * still spreading (FECN/BECN).
 *
 * Inputs: none. 11 frames.
 */
export const ibCreditFlow: FabGen = () => {
  const SW = "ib-leaf1.sjc";
  const H1 = "srv1-hca";
  const H2 = "srv2-hca";
  const H3 = "srv3-hca";
  const fab = new Fab(
    [
      { id: "sm", label: "subnet mgr", kind: "controller", x: 86, y: 0, tone: "muted" },
      { id: H2, label: "srv2 HCA", kind: "nic", x: 12, y: 20, state: "LID 0x0012" },
      { id: SW, kind: "switch", x: 50, y: 52, state: "NDR 400G" },
      { id: H1, label: "srv1 HCA", kind: "nic", x: 12, y: 90, state: "LID 0x0011" },
      { id: H3, label: "srv3 HCA", kind: "nic", x: 88, y: 64, state: "LID 0x0013" },
    ],
    [
      [H1, SW, { label: "VL 0", labelAt: 0.35 }],
      [H2, SW],
      [SW, H3],
      ["sm", SW, { dashed: true, tone: "muted" }],
    ],
    { height: 250 },
  );
  const bytes = 8 + 12 + 4096 + 4 + 2;
  const blocks = Math.ceil(bytes / 64);
  const BUF = 256;
  const mod = (n: number) => ((n % 4096) + 4096) % 4096;
  const c = { fctbs: 0, abr: 0, used: 0, fccl: 0 };
  const credits = () => mod(c.fccl - c.fctbs);
  const creditTable = () =>
    fab.table(0, {
      title: "VL 0 credit state, srv1 → ib-leaf1 (64-byte blocks)",
      head: ["counter", "kept by", "value"],
      rows: [
        ["FCTBS: blocks sent", "srv1 HCA", c.fctbs],
        ["ABR: blocks received", "ib-leaf1", c.abr],
        ["free VL 0 buffer", "ib-leaf1", `${BUF - c.used} of ${BUF}`],
        ["FCCL: credit limit", "ib-leaf1 → srv1", c.fccl],
        ["credits left", "FCCL − FCTBS", credits()],
      ],
      tones: [undefined, undefined, undefined, undefined, "active"],
    });
  const checks: Cell[][] = [];
  const checkTones: (Tone | undefined)[] = [];
  /** srv1's test before packet `pkt`; records it in table 1. */
  const check = (pkt: number): { v: number; ok: boolean } => {
    const v = mod(c.fccl - (c.fctbs + blocks));
    const ok = v <= 2048;
    checks.push([`packet ${pkt}`, `(${c.fccl} − (${c.fctbs} + ${blocks})) mod 4096 = ${num(v)}`, ok ? "≤ 2,048: send" : "> 2,048: wait"]);
    checkTones.fill(undefined);
    checkTones.push(ok ? "done" : "danger");
    fab.table(1, { title: "srv1's test before each packet", head: ["packet", "(FCCL − (FCTBS + 65)) mod 4096", "result"], rows: checks, tones: checkTones });
    return { v, ok };
  };
  const sendBlocks = () => {
    c.fctbs = mod(c.fctbs + blocks);
    c.abr = mod(c.abr + blocks);
    c.used += blocks;
  };
  const ibPacket = (psn: number): HeaderSpec[] => [
    { name: "LRH (local route header)", size: 8, reader: "each switch: DLID picks the port, VL the buffer", fields: { VL: 0, SL: 0, DLID: "0x0013 (srv3)", SLID: "0x0011 (srv1)", PktLen: "1,030 words" } },
    { name: "BTH (base transport header)", size: 12, reader: "srv3's HCA only", fields: { opcode: "0x07 (RC RDMA WRITE Middle)", "dest QP": "0x00004a", PSN: 1000 + psn } },
    { name: "Payload", size: "4,096 B", reader: "placed in srv3's memory", fields: { data: "4,096 B" } },
    { name: "ICRC + VCRC", size: 6, reader: "srv3 (ICRC), each link (VCRC)", fields: { ICRC: "4 B, end to end", VCRC: "2 B, this link" } },
  ];
  const fcpFromSwitch = (op: string, fccl: number): HeaderSpec => ({
    name: "Flow control packet",
    size: 6,
    tone: "path",
    reader: "srv1's HCA",
    fields: { Op: op, FCTBS: "0 (ib-leaf1's own sends to srv1)", VL: 0, FCCL: fccl, LPCRC: "2 B" },
    highlight: ["FCCL"],
  });

  fab.set({ link: "InfiniBand NDR, 400 Gb/s", "flow control": "credits per virtual lane (VL)" });
  fab.note(
    `A hypothetical InfiniBand build of Meridian's San Jose back end (the real one is RoCE): srv1, srv2 and srv3 each have a host channel adapter (HCA, InfiniBand's name for a NIC) on ib-leaf1.sjc, a 400 Gb/s NDR switch. The subnet manager has already given every port a 16-bit local ID (LID) and filled the switch's forwarding table, and takes no part in moving packets.`,
    "topology",
  );

  fab.headers(ibPacket(1), "built by srv1's HCA");
  fab.set({ "packet size": `${num(bytes)} B = ${blocks} blocks` });
  fab.note(
    `srv1's HCA builds one packet from the middle of a long RDMA WRITE to srv3: an 8-byte local route header (destination LID 0x0013, virtual lane 0, one of several separately buffered lanes on every link), a 12-byte base transport header, 4,096 bytes of data and 6 bytes of CRCs, ${num(bytes)} bytes in all. Link flow control counts buffer in 64-byte blocks, so this packet needs ${blocks} blocks (${num(bytes)} ÷ 64, rounded up).`,
    "packet",
  );

  c.fccl = mod(c.abr + (BUF - c.used));
  creditTable();
  fab.headers([fcpFromSwitch("1 (initialisation)", c.fccl)], "sent by ib-leaf1 to srv1");
  fab.send(
    SW,
    H1,
    `FCP: FCCL ${c.fccl}`,
    `Before srv1 may send on VL 0, ib-leaf1's port tells it how much buffer it has in a 6-byte flow control packet (FCP). FCCL, the flow control credit limit, is ABR, the adjusted count of blocks received so far (0), plus the free blocks (256, which is 16 KB, kept small here so the counts stay readable), so srv1 may send until its running total of blocks sent reaches 256.`,
    { tone: "path" },
  );

  check(1);
  sendBlocks();
  creditTable();
  fab.headers(ibPacket(1), "on the link srv1 → ib-leaf1");
  fab.state(SW, "buffering", "active");
  fab.packets(
    [
      { from: H1, to: SW, label: "packet 1 (65 blocks)" },
      { from: SW, to: H3, label: "srv2's data", tone: "muted" },
    ],
    `For packet 1, srv1 computes (FCCL − (FCTBS + 65)) mod 4096 = ${mod(256 - 65)}, which is at most 2,048, so the credit is there and the packet goes; FCTBS, the flow control total blocks sent on VL 0, becomes 65. srv3's link is busy with srv2's traffic, so ib-leaf1 keeps packet 1 in its VL 0 buffer.`,
    "send",
  );

  const v2 = check(2).v;
  sendBlocks();
  const v3 = check(3).v;
  sendBlocks();
  creditTable();
  fab.headers(ibPacket(3), "on the link srv1 → ib-leaf1");
  fab.packets(
    [
      { from: H1, to: SW, label: "packet 2", progress: 0.75 },
      { from: H1, to: SW, label: "packet 3", progress: 0.35 },
      { from: SW, to: H3, label: "srv2's data", tone: "muted" },
    ],
    `Packets 2 and 3 pass the same test with ${v2} and ${v3} blocks to spare, and FCTBS reaches ${c.fctbs}. They wait behind srv2's traffic too, so ${c.used} of ib-leaf1's ${BUF} blocks are now in use and only ${BUF - c.used} are free.`,
    "send",
  );

  const blocked = check(4);
  creditTable();
  fab.state(H1, "no credit", "compare");
  fab.headers(ibPacket(4), "packet 4, held in srv1's HCA");
  fab.set({ PortXmitWait: "counting" });
  fab.note(
    `For packet 4 the test gives (256 − (195 + 65)) mod 4096 = ${num(blocked.v)}, more than 2,048: only ${credits()} credits are left and the packet needs 65, so srv1 does not send it. Nothing is dropped and no pause message is needed; the port's PortXmitWait counter counts the time it has data ready and no credit.`,
    "blocked",
  );

  c.used -= blocks;
  c.fccl = mod(c.abr + (BUF - c.used));
  creditTable();
  fab.headers([fcpFromSwitch("0 (normal)", c.fccl)], "sent by ib-leaf1 to srv1");
  fab.state(SW, `${BUF - c.used} blocks free`, "done");
  fab.packets(
    [
      { from: SW, to: H3, label: "packet 1", tone: "done" },
      { from: SW, to: H1, label: `FCP: FCCL ${c.fccl}`, tone: "path" },
    ],
    `srv3's link frees up and ib-leaf1 forwards packet 1, releasing 65 blocks, so ${BUF - c.used} are free. Its next FCP raises the limit to FCCL = ABR + free = ${c.abr} + ${BUF - c.used} = ${c.fccl}, an absolute value rather than "65 more".`,
    "credit",
  );

  const again = check(4);
  sendBlocks();
  creditTable();
  fab.state(H1, "sending", "done");
  fab.unset("PortXmitWait");
  fab.headers(ibPacket(4), "on the link srv1 → ib-leaf1");
  fab.send(
    H1,
    SW,
    "packet 4",
    `srv1 runs the test again: (321 − (195 + 65)) mod 4096 = ${again.v}, so packet 4 goes and FCTBS reaches ${c.fctbs}. From now on srv1 sends exactly as fast as ib-leaf1 drains towards srv3, and the buffer cannot overflow, because nothing is sent without space already reserved for it at the other end.`,
  );

  c.abr = c.fctbs;
  creditTable();
  fab.headers(
    [{ name: "Flow control packet", size: 6, tone: "path", reader: "ib-leaf1", fields: { Op: "0 (normal)", FCTBS: `${c.fctbs} (srv1's blocks sent)`, VL: 0, FCCL: "(srv1's own receive buffer)", LPCRC: "2 B" }, highlight: ["FCTBS"] }],
    "sent by srv1 to ib-leaf1",
  );
  fab.send(
    H1,
    SW,
    `FCP: FCTBS ${c.fctbs}`,
    `Both ends send FCPs regularly, and the counters in them are running totals (12-bit, wrapping every 4,096 blocks, which is why the test works modulo 4,096). When ib-leaf1 receives srv1's FCP with FCTBS ${c.fctbs} it sets ABR to ${c.fctbs}, so a lost FCP or a packet discarded for a bad VCRC is corrected by the next FCP instead of leaking credit forever.`,
    { tone: "path" },
  );

  const cable = [3, 30, 100];
  fab.headers(undefined);
  fab.state(SW, "NDR 400G");
  fab.state(H1, "LID 0x0011");
  fab.tones([SW, H1], undefined);
  fab.table(1, {
    title: `Credit round trip vs cable length at 400 Gb/s (${BUF} blocks = 16 KB of credit)`,
    head: ["cable", "round trip", "bytes in flight", "best rate"],
    rows: cable.map((m) => {
      const rttNs = 2 * m * 5;
      const inflight = (rttNs * BYTES_PER_US) / 1000;
      const rate = Math.min(LINE, ((BUF * 64) / rttNs) * 8);
      return [`${m} m`, `${num(rttNs)} ns`, `${num(inflight)} B`, `${num(rate)} Gb/s`];
    }),
    tones: [undefined, undefined, "danger"],
  });
  fab.note(
    `Credit only comes back after a round trip, so to keep a link at 400 Gb/s the receiver needs buffer for everything in flight meanwhile: 50 bytes per nanosecond of round trip (ignoring processing time). With 16 KB a 3 m or 30 m cable runs at full rate, but a 100 m fibre (1 μs round trip, 50 KB in flight) is held to about ${num(((BUF * 64) / 1000) * 8)} Gb/s, which is why real switch ports have far more buffer per VL and long-haul InfiniBand needs deep-buffered range extenders.`,
    "distance",
  );

  fab.state(H1, "waits on VL 0", "compare");
  fab.state(SW, "FECN / BECN", "active");
  fab.set({ "lossless how": "by construction (credits)", "spreading limited by": "VLs + congestion control" });
  fab.note(
    `Credits make each link lossless by construction, where PFC (lesson 07-07) reacts after a threshold and must keep headroom for bytes already in flight. They do not stop congestion spreading: while srv3 is busy, srv1 is out of credit for everything it sends on VL 0 through this port, so InfiniBand also has several virtual lanes and end-to-end congestion control (the switch sets FECN, the receiver returns BECN, the sender slows down), the same idea as ECN and CNPs on RoCE.`,
    "done",
  );
  return fab.f.done();
};

// ---------- pfc-pause ----------

/**
 * `pfc-pause` (lesson 07-07). Small example in Meridian's San Jose back end:
 * the rail-1 NICs of srv1 and srv2 both write to srv3's NIC through
 * rail1-leaf1.sjc (2:1 incast, 400 Gb/s links, 50 m of fibre per host link).
 * The egress queue to srv3 fills, each queued packet is charged to the
 * ingress priority group (PG3) it arrived on, PG3 reaches XOFF (100 KB, a
 * fixed illustrative threshold), PFC PAUSE goes upstream for priority 3 only
 * (frame fields and quanta shown), headroom absorbs the 0.6 μs of bytes still
 * arriving (peak 115 KB), the PG drains to XON (80 KB) and XON resumes the
 * senders; the cycle repeats every 4 μs (chart of PG3 occupancy, 0.1 μs model
 * steps) with each sender averaging 200 Gb/s and nothing dropped.
 *
 * Inputs: none. 9 frames.
 */
export const pfcPause: FabGen = () => {
  const L = RAIL1_LEAF1;
  const fab = new Fab(
    [
      { id: L, kind: "leaf", x: 50, y: 0, state: "prio 3 lossless" },
      { id: "srv1", kind: "nic", x: 14, y: 100, state: "NIC1" },
      { id: "srv2", kind: "nic", x: 50, y: 100, state: "NIC1" },
      { id: "srv3", kind: "nic", x: 86, y: 100, state: "receiver" },
    ],
    [
      ["srv1", L, { label: "50 m" }],
      ["srv2", L],
      [L, "srv3"],
    ],
    { height: 210 },
  );
  // 0.1 μs model: each sender adds 5,000 B per tick to its PG while transmitting;
  // the egress port drains 5,000 B per tick in total, 2,500 from each PG.
  const TICK_US = 0.1;
  const IN = BYTES_PER_US * TICK_US;
  const OUT = IN / 2;
  const XOFF = 100_000;
  const XON = 80_000;
  const DELAY = 6; // ticks from a PFC decision to the senders' bytes stopping or starting at the switch
  const HEADROOM = 50_000;
  const END = 110;
  const pg: number[] = [];
  const events: { tick: number; kind: "XOFF" | "XON" }[] = [];
  {
    let v = 0;
    let sending = true;
    let paused = false;
    let stopAt = -1;
    let startAt = -1;
    for (let t = 0; t <= END; t++) {
      pg.push(v);
      if (!paused && v >= XOFF) {
        paused = true;
        events.push({ tick: t, kind: "XOFF" });
        stopAt = t + DELAY;
      } else if (paused && v <= XON) {
        paused = false;
        events.push({ tick: t, kind: "XON" });
        startAt = t + DELAY;
      }
      if (t === stopAt) sending = false;
      if (t === startAt) sending = true;
      v += (sending ? IN : 0) - OUT;
    }
  }
  const kb = (b: number) => `${num(b / 1000)} KB`;
  const us = (tick: number) => num(tick * TICK_US, 1);
  const firstXoff = events.find((e) => e.kind === "XOFF")!.tick;
  const firstXon = events.find((e) => e.kind === "XON")!.tick;
  const peak = pg[firstXoff + DELAY]!;
  const trough = pg[firstXon + DELAY]!;
  const period = events.filter((e) => e.kind === "XOFF")[1]!.tick - firstXoff;

  fab.chart({
    title: "rail1-leaf1 ingress buffer, priority 3, from srv1 (PG3)",
    unit: "KB",
    yMax: 160,
    xLabel: "time, 0.2 μs per point",
    series: [{ name: "PG3 from srv1", tone: "active" }],
    marks: [
      { y: XOFF / 1000, label: "XOFF 100 KB", tone: "danger" },
      { y: XON / 1000, label: "XON 80 KB", tone: "done" },
      { y: (XOFF + HEADROOM) / 1000, label: "XOFF + headroom 150 KB", tone: "compare" },
    ],
  });
  let shown = -2;
  const reveal = (tick: number) => {
    while (shown + 2 <= tick) {
      shown += 2;
      fab.point({ "PG3 from srv1": pg[shown]! / 1000 });
    }
  };
  const bufferTable = (tick: number, note?: string) =>
    fab.table(1, {
      title: `rail1-leaf1 buffer, priority 3, at t = ${us(tick)} μs`,
      head: ["counter", "bytes"],
      rows: [
        ["egress queue to srv3", kb(2 * pg[tick]!)],
        ["ingress PG3 from srv1", kb(pg[tick]!)],
        ["ingress PG3 from srv2", kb(pg[tick]!)],
        ["XOFF / XON / headroom", `${kb(XOFF)} / ${kb(XON)} / ${kb(HEADROOM)}`],
        ...(note ? [["state", note]] : []),
      ],
      tones: [undefined, pg[tick]! >= XOFF ? "danger" : "active", pg[tick]! >= XOFF ? "danger" : "active"],
    });

  reveal(0);
  fab.table(0, {
    title: "rail1-leaf1 QoS map (trusts DSCP)",
    head: ["DSCP", "priority", "treatment"],
    rows: [
      ["26", "3", "lossless: PFC on, never dropped"],
      ["48", "6", "strict priority, lossy (CNPs)"],
      ["0", "0", "lossy, may be dropped"],
    ],
    tones: ["active", undefined, undefined],
  });
  fab.note(
    `Meridian's San Jose back end, small example: the rail-1 NICs of srv1 and srv2 both send RDMA writes to srv3's NIC through rail1-leaf1.sjc, every link 400 Gb/s. Priority 3 is lossless, because one dropped RoCE packet makes the sender resend everything after it (go-back-N), so rail1-leaf1 may not drop it: when its buffer fills, priority flow control (PFC, IEEE 802.1Qbb) tells the senders to stop.`,
    "topology",
  );

  fab.headers(
    roceStack({ dstMac: fab.portMac(L, "srv1"), srcMac: nicMac(1), src: nicIp(1), dst: nicIp(3), sport: roceSport(0xd2), qp: 0x11c, psn: 7001, ecn: "10 (ECT(0))" }),
    "built by srv1's NIC",
  );
  fab.note(
    `Each RoCEv2 packet carries DSCP 26 in its IPv4 header, which rail1-leaf1 maps to priority 3, the lossless class; the RDMA payload rides in UDP to port 4791 in a ${num(ROCE_FRAME)}-byte frame. PFC acts only on a priority, never on a flow, a queue pair or a destination.`,
    "packet",
  );

  fab.headers(undefined);
  reveal(20);
  bufferTable(20);
  fab.state("srv1", "400 Gb/s", "active");
  fab.state("srv2", "400 Gb/s", "active");
  fab.state("srv3", "400 Gb/s in", "compare");
  fab.packets(
    [
      { from: "srv1", to: L, label: "RoCE, prio 3" },
      { from: "srv2", to: L, label: "RoCE, prio 3" },
      { from: L, to: "srv3", label: "400 Gb/s max", tone: "compare" },
    ],
    `At t = 0 both NICs send at 400 Gb/s into one 400 Gb/s port, so the egress queue to srv3 grows by 50 KB every microsecond: ${kb(2 * pg[20]!)} after 2 μs. The switch also charges every queued packet to the ingress port and priority it arrived on, its priority group (PG), so PG3 from srv1 and PG3 from srv2 hold ${kb(pg[20]!)} each.`,
  );

  reveal(firstXoff);
  bufferTable(firstXoff, "XOFF reached");
  fab.state(L, "XOFF", "danger");
  fab.packets(
    [
      { from: L, to: "srv1", label: "PFC PAUSE prio 3", tone: "danger", progress: 0.4 },
      { from: L, to: "srv2", label: "PFC PAUSE prio 3", tone: "danger", progress: 0.4 },
    ],
    `At t = ${us(firstXoff)} μs each ingress PG3 reaches the XOFF threshold of 100 KB (fixed here; real switches derive it from the free shared buffer), and rail1-leaf1 sends a PFC PAUSE out of both ingress ports. The PAUSE goes upstream to the senders, not to the receiver.`,
    "pause",
  );

  const quantaUs = (65535 * 512) / (LINE * 1e3);
  fab.headers(
    [
      { name: "Ethernet (MAC control)", size: 14, reader: "srv1's NIC (never forwarded)", fields: { "dst MAC": "01:80:c2:00:00:01", "src MAC": fab.portMac(L, "srv1"), EtherType: "0x8808 (MAC control)" } },
      {
        name: "PFC",
        size: "20 B + padding to a 64-byte frame",
        tone: "danger",
        reader: "srv1's NIC",
        fields: { opcode: "0x0101 (PFC)", "class-enable vector": "0x0008 (priority 3 only)", "time[3]": "65,535 quanta", "time[0-2, 4-7]": "0 (not enabled)" },
        highlight: ["class-enable vector", "time[3]"],
      },
    ],
    "sent by rail1-leaf1 to srv1",
  );
  fab.note(
    `The PAUSE is a 64-byte MAC control frame to the reserved address 01:80:c2:00:00:01, EtherType 0x8808, opcode 0x0101: the class-enable vector 0x0008 selects priority 3 only, with a timer of 65,535 quanta of 512 bit times, about ${num(quantaUs, 1)} μs at 400 Gb/s. Traffic on the other seven priorities keeps flowing on the same link, and the switch re-sends the PAUSE before the timer runs out if it still needs to.`,
    "frame",
  );

  reveal(firstXoff + DELAY);
  bufferTable(firstXoff + DELAY, "senders stopped; inside headroom");
  fab.state("srv1", "paused prio 3", "danger");
  fab.state("srv2", "paused prio 3", "danger");
  fab.headers(undefined);
  fab.note(
    `The senders' bytes keep arriving for ${num(DELAY * TICK_US, 1)} μs more, the PAUSE's trip up 50 m of fibre (0.25 μs), the bytes already on the fibre towards the switch (0.25 μs) and the NIC's reaction time (about 0.1 μs): ${kb(DELAY * IN)} per port, of which srv3's port drains half, so PG3 peaks at ${kb(peak)}. The switch reserves headroom above XOFF for exactly this (here 50 KB per port: those ${kb(DELAY * IN)} plus a 9,216-byte frame in progress at each end), so nothing is dropped.`,
    "headroom",
  );

  reveal(firstXon);
  bufferTable(firstXon, "XON reached");
  fab.state(L, "XON", "done");
  fab.headers(
    [
      { name: "Ethernet (MAC control)", size: 14, reader: "srv1's NIC (never forwarded)", fields: { "dst MAC": "01:80:c2:00:00:01", "src MAC": fab.portMac(L, "srv1"), EtherType: "0x8808 (MAC control)" } },
      { name: "PFC", size: "20 B + padding to a 64-byte frame", tone: "done", reader: "srv1's NIC", fields: { opcode: "0x0101 (PFC)", "class-enable vector": "0x0008 (priority 3 only)", "time[3]": "0 (resume)", "time[0-2, 4-7]": "0 (not enabled)" } },
    ],
    "sent by rail1-leaf1 to srv1",
  );
  fab.packets(
    [
      { from: L, to: "srv1", label: "PFC time 0 = XON", tone: "done", progress: 0.4 },
      { from: L, to: "srv2", label: "PFC time 0 = XON", tone: "done", progress: 0.4 },
    ],
    `With nothing arriving on priority 3, srv3's port keeps draining at 400 Gb/s and each PG3 falls by 25 KB per μs, reaching the XON threshold of 80 KB at t = ${us(firstXon)} μs. rail1-leaf1 sends the same PFC frame with the priority-3 timer set to 0, which means resume.`,
    "resume",
  );

  reveal(END);
  fab.headers(undefined);
  const xoffs = events.filter((e) => e.kind === "XOFF");
  const xons = events.filter((e) => e.kind === "XON");
  fab.state(L, "prio 3 lossless", undefined);
  fab.state("srv1", "avg 200 Gb/s", "active");
  fab.state("srv2", "avg 200 Gb/s", "active");
  fab.state("srv3", "400 Gb/s in", "done");
  fab.table(1, {
    title: `What ${num(END * TICK_US)} μs of this looks like`,
    head: ["measure", "value"],
    rows: [
      ["PAUSE (XOFF) sent per port", `${xoffs.length}, at ${xoffs.map((e) => us(e.tick)).join(" and ")} μs`],
      ["resume (XON) sent per port", `${xons.length}, at ${xons.map((e) => us(e.tick)).join(" and ")} μs`],
      ["each sender's average rate", "200 Gb/s"],
      ["lowest egress queue to srv3", kb(2 * trough)],
      ["priority-3 packets dropped", "0"],
    ],
  });
  fab.note(
    `The cycle repeats every ${num(period * TICK_US)} μs: each NIC transmits half the time and averages 200 Gb/s, srv3's port never idles (once the cycle starts, its queue never falls below ${kb(2 * trough)}) and no packet is lost. On a ConnectX NIC this shows up as rising rx_prio3_pause and rx_prio3_pause_duration counters.`,
    "cycle",
  );

  fab.state("srv1", "stop-start", "compare");
  fab.state("srv2", "stop-start", "compare");
  fab.note(
    `PFC kept priority 3 lossless, but bluntly: while srv1 is paused it cannot send priority-3 traffic to anyone, even to an idle receiver, and a switch that fills up pauses its own upstream neighbours the same way (lesson 07-08). That is why RoCE fabrics add ECN and DCQCN, which slow senders down before PFC fires, leaving PAUSE as a rare backstop rather than the normal way to share a link.`,
    "done",
  );
  return fab.f.done();
};

// ---------- ecn-dcqcn ----------

/**
 * `ecn-dcqcn` (lesson 07-07). The same 2:1 incast on rail1-leaf1.sjc, now
 * controlled by DCQCN: srv1 sends alone at 400 Gb/s, srv2 joins at t = 20 μs
 * at line rate (no slow start), the egress queue to srv3 grows 50 KB/μs and
 * passes Kmax (200 KB) at 24 μs, the switch marks CE (marking at enqueue, so
 * the marked packet waits 4 μs in the queue), srv3's NIC sends CNPs (BTH
 * opcode 0x81, DSCP 48) at most once per QP per 50 μs, and the senders run the
 * DCQCN reaction-point algorithm exactly: Rt = Rc, Rc = Rc(1 − α/2),
 * α = (1 − g)α + g on a CNP; α decays every 55 μs without one; the 55 μs rate
 * timer drives five fast-recovery steps Rc = (Rt + Rc)/2 and then additive
 * increase Rt += 40 Mb/s. Parameters are the DCQCN paper's (Zhu et al.,
 * SIGCOMM 2015): Kmin 5 KB, Kmax 200 KB, Pmax 1%, g = 1/256, N = 50 μs,
 * K = T = 55 μs, B = 10 MB, F = 5, R_AI = 40 Mb/s. Two cuts (400 → 200 → 100),
 * the queue drains at 97 μs, recovery to 198.46 Gb/s each by 409 μs. Rate
 * chart: both senders and their total, 5 μs per point.
 *
 * Inputs: none. 14 frames.
 */
export const ecnDcqcn: FabGen = () => {
  const L = RAIL1_LEAF1;
  const P = { kmin: 5_000, kmax: 200_000, pmax: 0.01, g: 1 / 256, n: 50, k: 55, t: 55, f: 5, rai: 0.04, byteCounter: 10_000_000 };
  const fab = new Fab(
    [
      { id: L, kind: "leaf", x: 50, y: 0, state: "congestion pt" },
      { id: "srv1", kind: "nic", x: 14, y: 100, state: "reaction pt" },
      { id: "srv2", kind: "nic", x: 50, y: 100, state: "reaction pt" },
      { id: "srv3", kind: "nic", x: 86, y: 100, state: "notification" },
    ],
    [
      ["srv1", L],
      ["srv2", L],
      [L, "srv3"],
    ],
    { height: 210 },
  );
  // ----- the timeline, derived from the parameters -----
  const B_START = 20;
  const tKmin = B_START + P.kmin / BYTES_PER_US; // 20.1
  const tKmax = B_START + P.kmax / BYTES_PER_US; // 24
  const tMarkSeen = tKmax + P.kmax / BYTES_PER_US; // 28: the marked packet waits behind 200 KB
  const FEEDBACK = 1; // μs for the CNP to reach the senders
  const tCut1 = tMarkSeen + FEEDBACK; // 29
  const qStand = (tCut1 - B_START) * BYTES_PER_US; // 450 KB
  const tCnp2 = tMarkSeen + P.n; // 78
  const tCut2 = tCnp2 + FEEDBACK; // 79
  const pktsInRamp = Math.round(((tKmax - tKmin) * BYTES_PER_US) / ROCE_FRAME);
  // ----- the reaction point (both senders behave identically once srv2 has started) -----
  const rp = { rc: LINE, rt: LINE, alpha: 1, cnps: 0, phase: "line rate" };
  const brk: [number, number][] = [[0, LINE]];
  const cut = (t: number) => {
    rp.rt = rp.rc;
    rp.rc = rp.rc * (1 - rp.alpha / 2);
    rp.alpha = (1 - P.g) * rp.alpha + P.g;
    rp.cnps++;
    rp.phase = "rate cut";
    brk.push([t, rp.rc]);
  };
  const timer = (t: number, step: number) => {
    rp.alpha *= 1 - P.g;
    if (step <= P.f) {
      rp.rc = (rp.rt + rp.rc) / 2;
      rp.phase = `fast recovery ${step}/${P.f}`;
    } else {
      rp.rt += P.rai;
      rp.rc = (rp.rt + rp.rc) / 2;
      rp.phase = "additive increase";
    }
    brk.push([t, rp.rc]);
  };
  const rateAt = (t: number) => [...brk].reverse().find(([bt]) => bt <= t)![1];
  const fmtRate = (r: number) => `${trim(r, 2)} Gb/s`;
  const portUse = () => `${num((2 * rp.rc * 100) / LINE, 1)}%`;
  const rpTable = (srv2Started = true) =>
    fab.table(0, {
      title: "Sender NICs (reaction points): DCQCN state",
      head: ["NIC", "Rc (current)", "Rt (target)", "α", "CNPs", "phase"],
      rows: [
        ["srv1", fmtRate(rp.rc), fmtRate(rp.rt), num(rp.alpha, 4), rp.cnps, rp.phase],
        srv2Started ? ["srv2", fmtRate(rp.rc), fmtRate(rp.rt), num(rp.alpha, 4), rp.cnps, rp.phase] : ["srv2", "idle", "", "", "", ""],
      ],
    });
  const queueTable = (q: number, extra: [string, string][] = []) => {
    const p = q <= P.kmin ? 0 : q >= P.kmax ? 1 : ((q - P.kmin) / (P.kmax - P.kmin)) * P.pmax;
    fab.table(1, {
      title: "rail1-leaf1 egress queue to srv3 (congestion point)",
      head: ["measure", "value"],
      rows: [
        ["queue depth", `${num(q / 1000)} KB`],
        ["queueing delay", `${num(q / BYTES_PER_US, 1)} μs`],
        ["mark probability", p >= 1 ? "100% (above Kmax)" : `${num(p * 100, 2)}%`],
        ...extra,
      ],
      tones: [q > P.kmax ? "danger" : q > P.kmin ? "compare" : undefined],
    });
    fab.state(L, `queue ${num(q / 1000)} KB`);
    fab.tone(L, q > P.kmax ? "danger" : q > P.kmin ? "compare" : undefined);
  };
  fab.chart({
    title: "Sending rates",
    unit: "Gb/s",
    yMax: 850,
    xLabel: "time, 5 μs per point",
    series: [
      { name: "srv1", tone: "active" },
      { name: "srv2", tone: "compare" },
      { name: "total into srv3's port", tone: "danger" },
    ],
    marks: [{ y: LINE, label: "srv3's port: 400 Gb/s", tone: "done" }],
  });
  let shown = -1;
  const reveal = (t: number) => {
    while ((shown + 1) * 5 <= t) {
      shown++;
      const tt = shown * 5;
      const a = rateAt(tt);
      const b = tt < B_START ? null : a;
      fab.point({ srv1: Math.round(a * 100) / 100, srv2: b === null ? null : Math.round(b * 100) / 100, "total into srv3's port": Math.round((a + (b ?? 0)) * 100) / 100 });
    }
    fab.set({ t: `${num(t)} μs` });
  };

  reveal(0);
  rpTable(false);
  fab.table(1, {
    title: "DCQCN parameters in this run (from the DCQCN paper)",
    head: ["parameter", "value"],
    rows: [
      ["switch marking: Kmin / Kmax / Pmax", "5 KB / 200 KB / 1%"],
      ["CNPs per queue pair, at most", "one per 50 μs"],
      ["rate cut on a CNP", "Rc × (1 − α/2), α starts at 1"],
      ["α gain g, α timer", "1/256, every 55 μs"],
      ["rate-increase timer, byte counter", "55 μs, 10 MB"],
      ["fast recovery steps F, additive step", "5, 40 Mb/s"],
    ],
  });
  fab.note(
    `DCQCN (Data Center Quantized Congestion Notification), RoCE's standard congestion control, has three roles: rail1-leaf1 is the congestion point that marks packets, srv3's NIC is the notification point that reports the marks, and the sending NICs on srv1 and srv2 are reaction points that set their own rates. This run uses the parameters published with DCQCN (Zhu et al., SIGCOMM 2015) on Meridian's 400 Gb/s links; production values are tuned per NIC, switch and link speed.`,
    "topology",
  );

  reveal(15);
  queueTable(0);
  fab.state("srv1", "400 Gb/s", "active");
  fab.headers(
    roceStack({ dstMac: fab.portMac(L, "srv1"), srcMac: nicMac(1), src: nicIp(1), dst: nicIp(3), sport: roceSport(0xd2), qp: 0x11c, psn: 7001, ecn: "10 (ECT(0), ECN-capable)" }),
    "sent by srv1's NIC",
  );
  fab.send(
    "srv1",
    L,
    "RoCE, ECN 10",
    `For the first 20 μs only srv1 sends, at the full 400 Gb/s that srv3's port can carry, so the egress queue stays empty and nothing is marked. Every packet leaves the NIC with its 2-bit ECN (explicit congestion notification) field set to 10, ECT(0), which tells the switches that this sender reacts to congestion marks.`,
  );

  reveal(B_START);
  rpTable();
  fab.state("srv2", "400 Gb/s", "active");
  fab.state("srv3", "800 Gb/s offered", "compare");
  queueTable(0, [["growth", "+50 KB per μs"]]);
  fab.headers(undefined);
  fab.packets(
    [
      { from: "srv1", to: L, label: "400 Gb/s" },
      { from: "srv2", to: L, label: "400 Gb/s" },
    ],
    `At t = 20 μs srv2 starts sending to srv3 as well, straight at 400 Gb/s, because DCQCN has no slow start. 800 Gb/s now arrives for a 400 Gb/s port, so the queue grows by 50 KB every microsecond.`,
  );

  queueTable(P.kmax, [["growth", "+50 KB per μs"]]);
  fab.set({ t: `${num(tKmax)} μs` });
  fab.note(
    `The queue passes Kmin (5 KB) at t = ${num(tKmin, 1)} μs and Kmax (200 KB) at t = ${num(tKmax)} μs. In between, at most 1% of packets are marked and each flow sends only about ${pktsInRamp} packets, so a mark is unlikely; above Kmax the switch marks every packet, and that is where this run's first marks come from.`,
    "threshold",
  );

  reveal(25);
  queueTable((25 - B_START) * BYTES_PER_US, [["growth", "+50 KB per μs"]]);
  fab.headers(
    roceStack({ dstMac: nicMac(3), srcMac: fab.portMac(L, "srv3"), src: nicIp(1), dst: nicIp(3), sport: roceSport(0xd2), qp: 0x11c, psn: 7400, ecn: "11 (CE, congestion experienced)" }),
    "leaving rail1-leaf1 for srv3",
  );
  fab.send(
    L,
    "srv3",
    "CE-marked packet",
    `rail1-leaf1 sets the packet's ECN field to 11, congestion experienced (CE), and still forwards it: marking replaces dropping. It marks as the packet joins the queue, so the packet waits ${num(P.kmax / BYTES_PER_US)} μs behind 200 KB before srv3's NIC sees it, and that wait is part of the control loop.`,
    { tone: "compare" },
  );

  fab.set({ t: `${num(tMarkSeen)} μs` });
  queueTable((tMarkSeen - B_START) * BYTES_PER_US, [["growth", "+50 KB per μs"]]);
  fab.headers(
    [
      { name: "Ethernet", size: 14, reader: "this link only", fields: { "dst MAC": fab.portMac(L, "srv3"), "src MAC": nicMac(3), EtherType: "0x0800 (IPv4)" } },
      { name: "IPv4", size: 20, reader: "every switch", fields: { src: nicIp(3), dst: nicIp(1), DSCP: "48 → priority 6 (strict)", protocol: "17 (UDP)" }, highlight: ["DSCP"] },
      { name: "UDP", size: 8, reader: "srv1's NIC", fields: { "src port": roceSport(0x11c), "dst port": "4791 (RoCEv2)" } },
      { name: "IB BTH", size: 12, tone: "danger", reader: "srv1's NIC", fields: { opcode: "0x81 (CNP)", "dest QP": `${qpHex(0xd2)} (srv1's QP)`, PSN: 0 }, highlight: ["opcode"] },
      { name: "Reserved", size: 16, reader: "nobody", fields: { bytes: "16 B of zeros" } },
      { name: "ICRC + FCS", size: 8, reader: "srv1's NIC (ICRC), each link (FCS)", fields: { ICRC: "4 B, end to end", FCS: "4 B, this link" } },
    ],
    "CNP built by srv3's NIC for srv1",
  );
  fab.state("srv3", "sending CNPs", "active");
  fab.packets(
    [
      { from: "srv3", to: L, label: "CNP → srv1", tone: "danger", progress: 0.35 },
      { from: "srv3", to: L, label: "CNP → srv2", tone: "danger", progress: 0.7 },
    ],
    `At t = ${num(tMarkSeen)} μs srv3's NIC receives CE-marked packets on both connections and answers each sender with a congestion notification packet (CNP): a small RoCEv2 packet with BTH opcode 0x81, addressed to the sender's queue pair and sent with DSCP 48 into strict-priority queue 6, so it overtakes the queued data. The NIC sends at most one CNP per queue pair every 50 μs, however many marked packets arrive.`,
    "cnp",
  );

  cut(tCut1);
  reveal(30);
  rpTable();
  fab.headers(undefined);
  fab.state("srv1", fmtRate(rp.rc), "compare");
  fab.state("srv2", fmtRate(rp.rc), "compare");
  fab.state("srv3", "400 Gb/s", "done");
  queueTable(qStand, [["growth", "0: 400 in, 400 out"]]);
  fab.note(
    `The CNPs reach srv1 and srv2 at t = ${num(tCut1)} μs and each NIC cuts its rate: target Rt = 400, current Rc = 400 × (1 − α/2) = ${trim(rp.rc)} Gb/s with α = 1, and α is updated to (1 − g)α + g, which stays 1. Together they now send exactly 400 Gb/s, so the queue stops growing, but it is already ${num(qStand / 1000)} KB deep.`,
    "cut",
  );

  reveal(75);
  queueTable(qStand, [["growth", "0: 400 in, 400 out"]]);
  fab.state("srv3", "no CNP yet", "muted");
  fab.note(
    `With 400 Gb/s in and 400 Gb/s out, the ${num(qStand / 1000)} KB queue stands still, adding ${num(qStand / BYTES_PER_US)} μs of delay to every packet, and every packet is marked because the queue is above Kmax; srv3's NIC has already sent its CNPs, so it stays silent until 50 μs have passed since the last one. Each sender's ${num(qStand / 2000)} KB share stays below the PFC threshold that a switch with tens of megabytes of shared buffer computes, so no PAUSE is sent here (the PFC example's small fixed 100 KB XOFF would have fired).`,
    "standing",
  );

  const beforeSecond = rp.rc;
  cut(tCut2);
  reveal(80);
  rpTable();
  fab.state("srv1", fmtRate(rp.rc), "compare");
  fab.state("srv2", fmtRate(rp.rc), "compare");
  fab.state("srv3", "CNPs sent", "active");
  queueTable(qStand, [["growth", "−25 KB per μs"]]);
  const tEmpty = tCut2 + qStand / (BYTES_PER_US - (2 * rp.rc * 1e9) / 8 / 1e6);
  fab.note(
    `At t = ${num(tCnp2)} μs srv3's NIC may send again and does, and at ${num(tCut2)} μs both senders cut a second time: Rt = ${trim(beforeSecond)}, Rc = ${trim(beforeSecond)} × (1 − 1/2) = ${trim(rp.rc)} Gb/s, and α stays 1. Now ${trim(2 * rp.rc)} Gb/s arrives for a 400 Gb/s port and the queue drains at 25 KB per μs.`,
    "cut",
  );

  reveal(tEmpty);
  queueTable(0, [["srv3's port in use", portUse()]]);
  fab.state("srv3", `${trim(2 * rp.rc)} Gb/s in`, "compare");
  fab.note(
    `The queue is empty at t = ${num(tEmpty)} μs and the last marked packets arrived within 50 μs of the second CNP, so no third CNP follows. Draining the queue took a second halving, and the link now runs half idle until the senders climb back: DCQCN trades a short spell of under-use for an empty queue.`,
    "drained",
  );

  const tick = (k: number) => tCut2 + k * P.t;
  timer(tick(1), 1);
  reveal(tick(1) + 1);
  rpTable();
  queueTable(0, [["srv3's port in use", portUse()]]);
  fab.state("srv1", fmtRate(rp.rc), "active");
  fab.state("srv2", fmtRate(rp.rc), "active");
  fab.note(
    `${P.t} μs after the last CNP, with no new one, each sender's rate-increase timer fires and fast recovery begins: Rc moves halfway back to the target, (${trim(rp.rt)} + ${trim(beforeSecond / 2)}) / 2 = ${trim(rp.rc)} Gb/s. The α timer fires at the same interval and decays α to ${num(rp.alpha, 4)}, so the next cut will be very slightly gentler.`,
    "recover",
  );

  const steps: number[] = [];
  for (let k = 2; k <= P.f; k++) {
    timer(tick(k), k);
    steps.push(rp.rc);
  }
  reveal(tick(P.f) + 1);
  rpTable();
  queueTable(0, [["srv3's port in use", portUse()]]);
  fab.state("srv1", fmtRate(rp.rc), "active");
  fab.state("srv2", fmtRate(rp.rc), "active");
  fab.state("srv3", `${trim(2 * rp.rc, 2)} Gb/s in`, "done");
  fab.note(
    `Every further ${P.t} μs without a CNP halves the remaining gap: ${steps.map((s) => trim(s)).join(", ")} Gb/s at t = ${[2, 3, 4, 5].map((k) => num(tick(k))).join(", ")} μs, the last of the five fast-recovery steps. The pair is back to ${trim(2 * rp.rc, 2)} Gb/s, ${num((2 * rp.rc * 100) / LINE, 1)}% of srv3's port, and the queue is still empty.`,
    "recover",
  );

  timer(tick(P.f + 1), P.f + 1);
  reveal(tick(P.f + 1) + 1);
  rpTable();
  queueTable(0, [["srv3's port in use", portUse()]]);
  fab.state("srv1", fmtRate(rp.rc), "active");
  fab.state("srv2", fmtRate(rp.rc), "active");
  fab.state("srv3", `${trim(2 * rp.rc, 1)} Gb/s in`, "done");
  // bytes each sender has sent since the second cut (the byte counter resets on a CNP)
  let sentBytes = 0;
  for (let i = 0; i < brk.length - 1; i++) if (brk[i]![0] >= tCut2) sentBytes += ((brk[i]![1] * 1e9) / 8 / 1e6) * (brk[i + 1]![0] - brk[i]![0]);
  fab.note(
    `After fast recovery comes additive increase: the target rises by 40 Mb/s to ${trim(rp.rt, 2)} Gb/s and Rc moves halfway to it, ${trim(rp.rc, 2)} Gb/s. The 10 MB byte counter, the other trigger for increases, has counted only ${num(sentBytes / 1e6, 1)} MB since the last cut, so at this speed the timer drives recovery.`,
    "increase",
  );

  reveal(420);
  fab.table(1, {
    title: "Where each part of the loop is counted",
    head: ["device", "counter (ConnectX names on NICs)"],
    rows: [
      ["rail1-leaf1 egress port", "ECN-marked packets, queue depth"],
      ["srv3 NIC (notification point)", "np_ecn_marked_roce_packets, np_cnp_sent"],
      ["srv1, srv2 NICs (reaction points)", "rp_cnp_handled"],
    ],
  });
  fab.note(
    `From here the senders creep upwards until their total passes 400 Gb/s, the queue rises past Kmin, a mark produces a CNP and the cycle of cut and recovery repeats, with the queue mostly near empty, so PFC rarely has to fire. To see this loop in production, put the switch's ECN-mark counters next to the NIC counters for marked packets received and CNPs sent (np_ecn_marked_roce_packets and np_cnp_sent) and CNPs handled at the senders (rp_cnp_handled).`,
    "done",
  );
  return fab.f.done();
};

// ---------- pfc-deadlock ----------

/**
 * `pfc-deadlock` (lesson 07-08). Small example of Meridian's San Jose back
 * end: ai-spine1/2.sjc, both leaves of rail 1 (rail1-leaf1 for srv1-64,
 * rail1-leaf2 for srv65-128) and rail2-leaf1; every server box is that
 * server's NIC on the leaf's rail. Act 1, congestion spreading: srv1 and
 * srv65 both write to srv3 (incast); rail1-leaf1 pauses srv1 and ai-spine1,
 * ai-spine1 pauses rail1-leaf2, rail1-leaf2 pauses srv65 and srv66, and
 * srv66's flow to the idle srv5 stalls (head-of-line blocking, the victim
 * flow); the incast ends and it clears. Act 2, deadlock: the ai-spine1 –
 * rail1-leaf1 optic fails; ai-spine1's IS-IS converges first onto valley paths
 * via the other leaves while rail1-leaf2 still hashes to ai-spine1, so
 * srv66's packets micro-loop; both directions of the rail1-leaf2 – ai-spine1
 * link fill and pause each other (cyclic buffer dependency); rail1-leaf2
 * converges but the deadlock remains and catches srv65's flow to rail 2; the
 * PFC watchdog (SONiC defaults: 200 ms detection and restoration, action
 * drop) breaks it; prevention and signals.
 *
 * Inputs: none. 15 frames.
 */
export const pfcDeadlock: FabGen = () => {
  const S1 = "ai-spine1.sjc";
  const S2 = "ai-spine2.sjc";
  const L1 = RAIL1_LEAF1;
  const L2 = RAIL1_LEAF2;
  const L3 = "rail2-leaf1.sjc";
  const fab = new Fab(
    [
      { id: S1, kind: "spine", x: 30, y: 0 },
      { id: S2, kind: "spine", x: 70, y: 0 },
      { id: L1, kind: "leaf", x: 16, y: 50 },
      { id: L2, kind: "leaf", x: 50, y: 50 },
      { id: L3, kind: "leaf", x: 84, y: 50 },
      { id: "srv1", kind: "nic", x: 5, y: 100 },
      { id: "srv3", kind: "nic", x: 17, y: 100 },
      { id: "srv5", kind: "nic", x: 29, y: 100 },
      { id: "srv65", kind: "nic", x: 44, y: 100 },
      { id: "srv66", kind: "nic", x: 57, y: 100 },
      { id: "srv2", kind: "nic", x: 84, y: 100, label: "srv2 (rail 2)" },
    ],
    [
      [L1, S1],
      [L1, S2],
      [L2, S1],
      [L2, S2],
      [L3, S1],
      [L3, S2],
      ["srv1", L1],
      ["srv3", L1],
      ["srv5", L1],
      ["srv65", L2],
      ["srv66", L2],
      ["srv2", L3],
    ],
    { height: 300 },
  );
  type Pause = { link: string; who: string; state: string; tone?: Tone };
  let pauses: Pause[] = [];
  const pauseTable = (title = "PFC pauses on priority 3") =>
    fab.table(0, {
      title,
      head: ["link", "who pauses whom", "state"],
      rows: pauses.length ? pauses.map((p) => [p.link, p.who, p.state]) : [["(none)", "", ""]],
      tones: pauses.length ? pauses.map((p) => p.tone ?? "danger") : [undefined],
    });
  type Flow = { name: string; path: string; status: string; tone?: Tone };
  let flows: Flow[] = [];
  const flowTable = () => fab.table(1, { title: "RDMA flows (all priority 3)", head: ["flow", "path", "status"], rows: flows.map((f) => [f.name, f.path, f.status]), tones: flows.map((f) => f.tone) });

  fab.note(
    `Meridian's San Jose back end, small example: two of its eight spines and three of its sixteen leaves (both halves of rail 1 and the first leaf of rail 2), each server box being that server's NIC on that leaf's rail. Priority 3 is lossless on every link, and every link runs at 400 Gb/s.`,
    "topology",
  );

  // ----- act 1: congestion spreading and head-of-line blocking -----
  flows = [
    { name: "srv1 → srv3", path: "rail1-leaf1", status: "400 Gb/s (incast)", tone: "compare" },
    { name: "srv65 → srv3", path: "rail1-leaf2 → ai-spine1 → rail1-leaf1", status: "200 Gb/s (incast)", tone: "compare" },
    { name: "srv66 → srv5", path: "rail1-leaf2 → ai-spine1 → rail1-leaf1", status: "200 Gb/s", tone: "active" },
  ];
  flowTable();
  pauseTable();
  fab.path(["srv65", L2, S1, L1, "srv3"], "frontier");
  fab.path(["srv1", L1]);
  fab.linkSet(L1, "srv3", { tone: "danger" });
  fab.linkSet(L1, "srv5", { tone: "path" });
  fab.linkSet("srv66", L2, { tone: "path" });
  fab.state("srv3", undefined, "compare");
  fab.state("srv5", undefined, "done");
  fab.packets(
    [
      { from: "srv1", to: L1, label: "→ srv3" },
      { from: S1, to: L1, label: "→ srv3, → srv5" },
      { from: "srv66", to: L2, label: "→ srv5", tone: "done" },
    ],
    `Three RDMA flows start: srv1 at 400 Gb/s and srv65 at 200 Gb/s both write to srv3, an incast of 600 Gb/s into one 400 Gb/s port, and srv66 writes 200 Gb/s to srv5, an unrelated flow whose destination port is idle. rail1-leaf2 hashes both of its flows onto ai-spine1, which fills that 400 Gb/s uplink exactly but does not overload it.`,
  );

  pauses = [
    { link: "rail1-leaf1 → srv1", who: "rail1-leaf1 pauses srv1", state: "XOFF" },
    { link: "rail1-leaf1 → ai-spine1", who: "rail1-leaf1 pauses ai-spine1", state: "XOFF" },
  ];
  pauseTable();
  fab.state(L1, "XOFF ×2", "danger");
  fab.state("srv1", undefined, "danger");
  fab.state(S1, "paused ↓", "danger");
  fab.packets(
    [
      { from: L1, to: "srv1", label: "PAUSE", tone: "danger", progress: 0.4 },
      { from: L1, to: S1, label: "PAUSE prio 3", tone: "danger", progress: 0.4 },
    ],
    `srv3's port is offered 600 Gb/s for 400, its queue grows and rail1-leaf1's priority-3 buffers cross XOFF on both ports that feed it, the one from srv1 and the one from ai-spine1, so it pauses both. The PAUSE to ai-spine1 stops all priority-3 traffic on that link, srv66's packets for the idle srv5 included.`,
    "pause",
  );

  pauses.push({ link: "ai-spine1 → rail1-leaf2", who: "ai-spine1 pauses rail1-leaf2", state: "XOFF" });
  pauseTable();
  fab.state(S1, "XOFF", "danger");
  fab.state(L2, "paused ↑", "danger");
  fab.send(
    S1,
    L2,
    "PAUSE prio 3",
    `ai-spine1 can no longer send priority 3 down to rail1-leaf1, so packets for it pile up inside ai-spine1, charged to the port they came in on, the one from rail1-leaf2. That buffer crosses XOFF and ai-spine1 pauses rail1-leaf2: the congestion has moved one more hop upstream.`,
    { tone: "danger", progress: 0.4 },
  );

  pauses.push({ link: "rail1-leaf2 → srv65", who: "rail1-leaf2 pauses srv65", state: "XOFF" }, { link: "rail1-leaf2 → srv66", who: "rail1-leaf2 pauses srv66", state: "XOFF" });
  pauseTable();
  flows[2] = { ...flows[2]!, status: "0 Gb/s, waiting", tone: "danger" };
  flowTable();
  fab.state(L2, "XOFF ×2", "danger");
  fab.tones(["srv65", "srv66"], "danger");
  fab.packets(
    [
      { from: L2, to: "srv65", label: "PAUSE", tone: "danger", progress: 0.4 },
      { from: L2, to: "srv66", label: "PAUSE", tone: "danger", progress: 0.4 },
    ],
    `rail1-leaf2's queue towards ai-spine1 stops too, its buffers from srv65 and srv66 fill, and it pauses both NICs. srv66 has stopped although srv5's port is idle, because its packets sit behind srv3's in queues that PFC has frozen: this is head-of-line blocking, and srv66's flow is the victim.`,
    "pause",
  );

  fab.set({ "victim flow": "srv66 → srv5", drops: 0, "ECN marks at srv5": 0 });
  fab.note(
    `What srv66's owner sees: throughput collapses with zero drops, no ECN marks at srv5's port and no errors, while PAUSE counters climb on every link back towards the incast. Only following the pauses hop by hop, from srv66 to rail1-leaf2, ai-spine1 and rail1-leaf1, leads to srv3's congested port.`,
    "victim",
  );

  pauses = [];
  pauseTable();
  flows = flows.map((f) => ({ ...f, status: f.name === "srv66 → srv5" ? "200 Gb/s again" : "finished", tone: f.name === "srv66 → srv5" ? "done" : "muted" }));
  flowTable();
  fab.unset("victim flow", "drops", "ECN marks at srv5");
  fab.clearPath();
  for (const n of ["srv1", "srv3", "srv65", "srv66"]) { fab.state(n, undefined); fab.tone(n, undefined); }
  { fab.state("srv5", undefined); fab.tone("srv5", undefined); }
  for (const n of [S1, L1, L2]) { fab.state(n, undefined); fab.tone(n, undefined); }
  fab.note(
    `When the incast ends (or DCQCN slows srv1 and srv65), the buffers drain, resume frames travel back the same way and srv66 recovers. Congestion spreading like this is temporary; the next failure is not.`,
    "clear",
  );

  // ----- act 2: a micro-loop, a cyclic buffer dependency and the watchdog -----
  fab.down(S1, L1);
  fab.state(S1, "SPF done", "active");
  fab.state(L2, "not yet", "compare");
  const leaf1Nics = "srv1–64 NIC1s (rail1-leaf1)";
  fab.table(0, { title: "ai-spine1 FIB (updated)", head: ["prefix", "next hop"], rows: [[leaf1Nics, "rail1-leaf2, rail2-leaf1 (valley paths)"]], tones: ["compare"] });
  fab.table(1, { title: "rail1-leaf2 FIB (not yet updated)", head: ["prefix", "next hops"], rows: [[leaf1Nics, "ai-spine1, ai-spine2 (ECMP)"]], tones: ["danger"] });
  fab.note(
    `Later the optic on the ai-spine1 – rail1-leaf1 link fails. ai-spine1 sees the loss of light at once and its IS-IS recomputes first: its only ways left to rail1-leaf1 go down through another leaf (rail1-leaf2 or rail2-leaf1) and back up via ai-spine2, valley paths, so it now sends that traffic down to those leaves.`,
    "failure",
  );

  fab.path(["srv66", L2, S1], "danger");
  fab.packets(
    [
      { from: L2, to: S1, label: "→ srv5, TTL 63", tone: "danger", progress: 0.35 },
      { from: S1, to: L2, label: "→ srv5, TTL 62", tone: "danger", progress: 0.65 },
    ],
    `rail1-leaf2 has not processed the news yet and still hashes srv66's flow to ai-spine1, which hashes it straight back down to rail1-leaf2; rail1-leaf2 sends it up again, and the packets ping-pong in a micro-loop, losing 1 from their TTL at every pass. The rail1-leaf2 → ai-spine1 link is now offered srv66's new packets plus every looping one, far more than its 400 Gb/s.`,
    "loop",
  );

  pauses = [
    { link: "rail1-leaf2 → ai-spine1", who: "rail1-leaf2 pauses ai-spine1", state: "XOFF" },
    { link: "ai-spine1 → rail1-leaf2", who: "ai-spine1 pauses rail1-leaf2", state: "XOFF" },
  ];
  pauseTable();
  fab.state(S1, "XOFF", "danger");
  fab.state(L2, "XOFF", "danger");
  fab.packets(
    [
      { from: L2, to: S1, label: "PAUSE", tone: "danger", progress: 0.3 },
      { from: S1, to: L2, label: "PAUSE", tone: "danger", progress: 0.7 },
    ],
    `Queues fill in both directions. rail1-leaf2's buffer for packets that came from ai-spine1 crosses XOFF, so it pauses ai-spine1, and ai-spine1's buffer for packets that came from rail1-leaf2 crosses XOFF, so it pauses rail1-leaf2.`,
    "pause",
  );

  fab.table(1, {
    title: "Who waits for whom (priority 3)",
    head: ["this queue", "waits for"],
    rows: [
      ["rail1-leaf2 → ai-spine1", "free buffer in ai-spine1"],
      ["ai-spine1's buffer", "sending to rail1-leaf2"],
      ["ai-spine1 → rail1-leaf2", "free buffer in rail1-leaf2"],
      ["rail1-leaf2's buffer", "sending to ai-spine1"],
    ],
    tones: ["danger", "danger", "danger", "danger"],
  });
  fab.state(S1, "deadlocked", "danger");
  fab.state(L2, "deadlocked", "danger");
  fab.set({ "cyclic buffer dependency": "rail1-leaf2 ⇄ ai-spine1" });
  fab.note(
    `Now each switch waits for the other: rail1-leaf2 cannot send until ai-spine1 frees buffer, and ai-spine1 cannot free buffer until it may send to rail1-leaf2, which it may not. This cyclic buffer dependency is a deadlock: the packets never move again, so not even their TTL can expire them, because TTL only falls when a packet is forwarded.`,
    "deadlock",
  );

  fab.clearPath();
  fab.linkSet(L2, S1, { tone: "danger" });
  fab.path(["srv65", L2], "danger");
  fab.path(["srv66", L2], "danger");
  fab.state(L2, "converged", "danger");
  fab.tones(["srv65", "srv66"], "danger");
  fab.table(1, { title: "rail1-leaf2 FIB (updated)", head: ["prefix", "next hops"], rows: [[leaf1Nics, "ai-spine2 only"], ["srv1–64 NIC2s (rail2-leaf1)", "ai-spine1, ai-spine2 (ECMP)"]], tones: ["done", "danger"] });
  pauses.push({ link: "rail1-leaf2 → srv66", who: "rail1-leaf2 pauses srv66", state: "XOFF" }, { link: "rail1-leaf2 → srv65", who: "rail1-leaf2 pauses srv65", state: "XOFF" });
  pauseTable();
  fab.packets(
    [
      { from: "srv66", to: L2, label: "→ srv5, stuck", tone: "danger" },
      { from: "srv65", to: L2, label: "→ srv2, stuck", tone: "danger" },
    ],
    `Milliseconds later rail1-leaf2 updates its FIB and sends rail1-leaf1 traffic via ai-spine2 only, but the deadlock outlives the loop that caused it: the stuck packets are already queued for ports that stay paused. srv66 gains nothing from the new path, because its packets queued for ai-spine1 before the change still fill its buffer at rail1-leaf2, which keeps pausing it. Any RoCE flow that rail1-leaf2 hashes onto ai-spine1, such as srv65's to srv2 on rail2-leaf1, is stuck behind them too, and rail1-leaf2 pauses srv65 in turn.`,
  );

  pauses = pauses.map((p) => (p.link === "rail1-leaf2 → ai-spine1" || p.link === "ai-spine1 → rail1-leaf2" ? { ...p, state: "storm detected" } : p));
  pauseTable();
  fab.state(S1, "watchdog: drop", "compare");
  fab.state(L2, "watchdog: drop", "compare");
  fab.set({ "PFC watchdog": "detection 200 ms, action drop" });
  fab.note(
    `The PFC watchdog on each switch notices a priority-3 queue that has been paused, with packets waiting and nothing transmitted, for longer than its detection time (200 ms in SONiC's defaults). It declares a PFC storm on that queue, ignores further PAUSE frames for it and drops what it holds.`,
    "watchdog",
  );

  pauses = [{ link: "rail1-leaf2 ⇄ ai-spine1", who: "watchdog restoring", state: "lossless again after 200 ms", tone: "done" }];
  pauseTable("PFC on priority 3 after the watchdog");
  fab.clearPath();
  fab.linkSet(L2, S1, { tone: "compare" });
  fab.state(S1, "restoring", "done");
  fab.state(L2, "restoring", "done");
  fab.tones(["srv65", "srv66"], undefined);
  fab.table(1, {
    title: "What the hosts see",
    head: ["NIC", "symptom", "counter"],
    rows: [
      ["srv5, srv2", "gaps in arriving PSNs", "out_of_sequence"],
      ["srv66, srv65", "NAKs or ACK timeouts, packets resent", "packet_seq_err, local_ack_timeout_err"],
    ],
  });
  fab.packets(
    [
      { from: L2, to: S1, label: "srv65 → srv2", tone: "done" },
      { from: S1, to: L3, label: "srv65 → srv2", tone: "done" },
      { from: L2, to: S2, label: "srv66 → srv5", tone: "done" },
    ],
    `Dropping the stuck packets frees the buffers, the pauses stop and the cycle is broken, and srv66's flow resumes on its new path via ai-spine2; once the restoration time (200 ms by default) passes without a new storm, the queue is lossless again. The RoCE senders resend from the first missing sequence number, after a NAK from the receiver or, if the tail of a burst was dropped, an ACK timeout, and the NICs count both.`,
    "recover",
  );

  fab.unset("cyclic buffer dependency");
  fab.set({ prevention: "no valley paths (eBGP underlay, lesson 03-03)", alert: "a queue paused for milliseconds" });
  { fab.state(S1, undefined); fab.tone(S1, undefined); }
  { fab.state(L2, undefined); fab.tone(L2, undefined); }
  fab.note(
    `Prevention beats recovery: the valley path made the loop possible, and an eBGP underlay in which all spines share one AS rejects such paths (lesson 03-03), while ConnectX NICs have a similar guard against pause storms of their own. The signals worth alerting on are a queue paused continuously for milliseconds, watchdog storm events, and pause counters rising around a ring of links rather than up a tree.`,
    "done",
  );
  return fab.f.done();
};

// ---------- rail-optimized ----------

/**
 * `rail-optimized` (lesson 07-09). Two of the 128 GPU servers in Meridian's
 * San Jose cluster, srv1 and srv2, eight GPUs each joined by NVLink/NVSwitch;
 * NIC k of every server is cabled to rail k's leaf (the drawing shows the
 * first leaf of each rail, `railk-leaf1.sjc`, and one spine linked to rails 7
 * and 8 only). Sizing for 1,024 GPUs with 51.2 Tb/s leaves (64 ports down, 64
 * up): two leaves per rail, 16 leaves, 8 spines. Same-rail traffic (GPU3 to
 * GPU3) crosses one switch; cross-rail sent directly (GPU7 to GPU8) crosses
 * three via a spine; with NCCL's PXN it goes over NVLink to GPU8 first, then
 * one switch on rail 8. Then the comparison (including same rail, other leaf
 * half) and the cost of one failed NIC link.
 *
 * Inputs: none. 10 frames.
 */
export const railOptimized: FabGen = () => {
  const RAILS = 8;
  const row = (k: number) => 2 + (k - 1) * 12;
  const leaf = (k: number) => `rail${k}-leaf1.sjc`;
  const gpu = (srv: number, k: number) => `srv${srv}-gpu${k}`;
  const nv = (srv: number) => `srv${srv}-nvswitch`;
  const SP = "ai-spine1.sjc";
  const ks = Array.from({ length: RAILS }, (_, i) => i + 1);
  const fab = new Fab(
    [
      { id: nv(1), label: "NVLink", kind: "switch", x: 4, y: 44, state: "srv1.sjc" },
      { id: nv(2), label: "NVLink", kind: "switch", x: 96, y: 44, state: "srv2.sjc" },
      ...ks.flatMap((k) => [
        { id: gpu(1, k), label: `GPU${k}`, kind: "gpu" as const, x: 22, y: row(k) },
        { id: leaf(k), kind: "leaf" as const, x: 50, y: row(k) },
        { id: gpu(2, k), label: `GPU${k}`, kind: "gpu" as const, x: 78, y: row(k) },
      ]),
      { id: SP, kind: "spine", x: 64, y: 100, state: "1 of 8" },
    ],
    [
      ...ks.flatMap((k): [string, string, { label?: string; tone?: "muted" }][] => [
        [nv(1), gpu(1, k), { tone: "muted" }],
        [gpu(1, k), leaf(k), k === 1 ? { label: "400G" } : {}],
        [leaf(k), gpu(2, k), k === 1 ? { label: "400G" } : {}],
        [gpu(2, k), nv(2), { tone: "muted" }],
      ]),
      [leaf(7), SP, { dashed: true }],
      [leaf(8), SP, { dashed: true }],
    ],
    { height: 520 },
  );
  fab.set({ servers: "128 × 8 GPUs", rails: RAILS });
  fab.note(
    `Two of the 128 GPU servers in Meridian's San Jose cluster, srv1 and srv2, each with eight GPUs joined inside the server by NVLink through NVSwitch chips. Every GPU has its own 400 Gb/s NIC, and a rail is the set of leaves that NIC k of every server is cabled to: all GPU1s to rail 1 (rail1-leaf1 here), all GPU2s to rail 2, and so on across eight rails.`,
    "topology",
  );

  const PORTS = 128;
  const down = PORTS / 2;
  const leavesPerRail = 128 / down;
  const leaves = RAILS * leavesPerRail;
  const spines = (leaves * (PORTS - down)) / PORTS;
  fab.table(0, {
    title: "Sizing the back end for 1,024 GPUs",
    head: ["item", "arithmetic"],
    rows: [
      ["GPUs and NICs", "128 servers × 8 = 1,024"],
      ["leaf switch", `51.2 Tb/s = ${PORTS} ports × 400 Gb/s`],
      ["each leaf", `${down} ports down to NICs, ${PORTS - down} up (1:1)`],
      ["leaves per rail", `128 NICs ÷ ${down} = ${leavesPerRail} (srv1–64, srv65–128)`],
      ["leaves", `${RAILS} rails × ${leavesPerRail} = ${leaves}`],
      ["spines", `${leaves} × ${PORTS - down} uplinks ÷ ${PORTS} ports = ${spines}`],
      ["each leaf to each spine", `${PORTS - down} ÷ ${spines} = ${(PORTS - down) / spines} links of 400 Gb/s`],
    ],
  });
  fab.note(
    `Sized for 1,024 GPUs with 51.2 Tb/s switches (${PORTS} ports of 400 Gb/s, Spectrum-4 class), each leaf uses ${down} ports for NICs and ${PORTS - down} for spines, so no leaf is oversubscribed. Each rail therefore needs ${leavesPerRail} leaves, one for srv1–64 and one for srv65–128, which makes ${leaves} leaves and ${spines} spines; the drawing shows only the first leaf of each rail and one spine.`,
    "sizing",
  );

  fab.note(
    `The design follows the traffic: when NCCL runs a collective across servers it binds each GPU to its nearest NIC and connects GPU k on one server to GPU k on the others, so nearly every byte that leaves a server travels between same-numbered GPUs, inside one rail. The exception is all-to-all traffic (mixture-of-experts models), where GPU k must reach other GPU numbers too, which is the case shown below.`,
    "why",
  );

  fab.tones([gpu(1, 3), gpu(2, 3)], "active");
  fab.path([gpu(1, 3), leaf(3), gpu(2, 3)]);
  fab.hop([gpu(1, 3), leaf(3), gpu(2, 3)], "RDMA WRITE", [
    `GPU3 on srv1 sends to GPU3 on srv2: its NIC puts the RDMA write on its own 400 Gb/s link to rail3-leaf1.`,
    `rail3-leaf1 forwards it straight out of srv2's GPU3 port: one switch between the two GPUs, no spine, no ECMP choice and nothing shared with the other seven rails.`,
  ]);

  fab.clearPath();
  fab.tones([gpu(1, 3), gpu(2, 3)], undefined);
  fab.tones([gpu(1, 7), gpu(2, 8)], "active");
  fab.path([gpu(1, 7), leaf(7), SP, leaf(8), gpu(2, 8)], "danger");
  fab.packets(
    [
      { from: leaf(7), to: SP, label: "GPU7 → GPU8", tone: "danger" },
      { from: SP, to: leaf(8), label: "", tone: "danger", progress: 0.2 },
    ],
    `GPU7 on srv1 now has to send to GPU8 on srv2, a different rail. Sent straight from GPU7's own NIC, it goes up rail7-leaf1, across a spine and down rail8-leaf1: three switches instead of one, and an ECMP choice among the eight spines where it can collide with other flows.`,
    "cross-rail",
  );

  fab.clearPath();
  fab.path([gpu(1, 7), nv(1), gpu(1, 8)], "path");
  fab.tone(gpu(1, 8), "compare");
  fab.packets(
    [
      { from: gpu(1, 7), to: nv(1), label: "NVLink copy" },
      { from: nv(1), to: gpu(1, 8), label: "", progress: 0.3 },
    ],
    `NCCL avoids this with PXN (PCIe × NVLink, NCCL 2.12 and later): GPU7 first copies the data over NVLink to GPU8 in its own server. NVLink gives each H100 GPU about 900 GB/s (450 GB/s each way) against 50 GB/s each way for a 400 Gb/s NIC, so the extra copy costs little.`,
    "pxn",
  );

  fab.path([gpu(1, 8), leaf(8), gpu(2, 8)], "path");
  fab.packets(
    [
      { from: gpu(1, 8), to: leaf(8), label: "rail 8" },
      { from: leaf(8), to: gpu(2, 8), label: "", progress: 0.3 },
    ],
    `Then srv1's GPU8 NIC sends the data on rail 8, and rail8-leaf1 delivers it to srv2's GPU8: one switch again, and the traffic stays rail-aligned.`,
    "pxn",
  );

  fab.clearPath();
  fab.tones([gpu(1, 7), gpu(1, 8), gpu(2, 8)], undefined);
  fab.table(1, {
    title: "Switches crossed, by path",
    head: ["traffic", "path", "switches"],
    rows: [
      ["same rail, same leaf", "srv1 GPU3 → rail3-leaf1 → srv2 GPU3", "1"],
      ["other rail, direct", "srv1 GPU7 → rail7-leaf1 → spine → rail8-leaf1 → srv2 GPU8", "3"],
      ["other rail, PXN", "srv1 GPU7 → NVLink → GPU8 → rail8-leaf1 → srv2 GPU8", "1 + NVLink"],
      ["same rail, other half", "srv1 GPU1 → rail1-leaf1 → spine → rail1-leaf2 → srv65 GPU1", "3"],
    ],
    tones: ["done", "danger", "done", "compare"],
  });
  fab.note(
    `Side by side, rail-aligned traffic crosses one switch, whether it starts on the right GPU or is moved there over NVLink first. The spines still matter: srv1 and srv65 are both on rail 1 but on different leaves, so their GPU1s talk through a spine, which is why every leaf has eight 400 Gb/s links to every spine.`,
    "compare",
  );

  fab.down(gpu(2, 8), leaf(8));
  fab.tone(gpu(2, 8), "danger");
  fab.set({ failed: "srv2 GPU8's NIC link", "job affected": "the job using srv2's GPU8" });
  fab.note(
    `If srv2's GPU8 cable or NIC fails, every connection NCCL built through that NIC breaks, and a synchronous collective cannot finish without GPU8, so the job typically stops with an NCCL error and restarts from its last checkpoint. That is why the platform should map every NIC, optic and leaf port to the GPUs and jobs behind it, and watch link flaps and optic receive power per rail, not just per switch.`,
    "failure",
  );
  return fab.f.done();
};

// ---------- adaptive-routing ----------

interface ArFlow {
  name: string;
  src: number;
  dst: number;
  qp: number;
}
const AR_FLOWS: ArFlow[] = [
  { name: "A", src: 1, dst: 65, qp: 0x3db },
  { name: "B", src: 2, dst: 66, qp: 0x426 },
  { name: "C", src: 3, dst: 67, qp: 0x5db },
  { name: "D", src: 4, dst: 68, qp: 0x726 },
];

/**
 * `adaptive-routing` (lesson 07-09). Both halves of rail 1 (rail1-leaf1 for
 * srv1-64, rail1-leaf2 for srv65-128) joined by 4 of the 8 spines, one 400G
 * uplink per spine in this small example. Four RoCE flows srv1-4 → srv65-68
 * (1,600 Gb/s, exactly the uplink capacity) hashed by static ECMP over the
 * 5-tuple (UDP source port from the QP): flows A and C collide on one spine
 * while another idles, so they get 200 Gb/s each. Adaptive routing
 * (Spectrum-X style) picks the least-loaded uplink per packet: every flow
 * gets 400 Gb/s, packets arrive out of order (PSN 1001, 1003, 1002, 1004); a
 * plain RoCE NIC NAKs and goes back N, a SuperNIC places each packet directly
 * and completes when all have arrived. Limits (last-hop incast) and signals.
 * Throughput chart per flow.
 *
 * Inputs: none. 10 frames.
 */
export const adaptiveRouting: FabGen = () => {
  const spines = [1, 2, 3, 4].map((i) => `ai-spine${i}.sjc`);
  const L1 = RAIL1_LEAF1;
  const L2 = RAIL1_LEAF2;
  const fab = new Fab(
    [
      ...spines.map((id, i) => ({ id, kind: "spine" as const, x: 12.5 + 25 * i, y: 0 })),
      { id: L1, kind: "leaf", x: 25, y: 50, state: "1,600G up" },
      { id: L2, kind: "leaf", x: 75, y: 50 },
      { id: "senders", label: "srv1–srv4", kind: "server", x: 25, y: 100, state: "4 × NIC1" },
      { id: "receivers", label: "srv65–srv68", kind: "server", x: 75, y: 100, state: "4 × NIC1" },
    ],
    [...spines.flatMap((s) => [[L1, s] as [string, string], [s, L2] as [string, string]]), ["senders", L1, { label: "4 × 400G" }], [L2, "receivers", { label: "4 × 400G" }]],
    { height: 260 },
  );
  const sport = (f: ArFlow) => roceSport(f.qp);
  const hash = (f: ArFlow) => fnv32(`${nicIp(f.src)}|${nicIp(f.dst)}|17|${sport(f)}|4791`);
  const ecmp = Object.fromEntries(AR_FLOWS.map((f) => [f.name, spines[hash(f) % spines.length]!])) as Record<string, string>;
  const perSpine = (s: string) => AR_FLOWS.filter((f) => ecmp[f.name] === s).map((f) => f.name);
  const crowded = spines.find((s) => perSpine(s).length > 1)!;
  const idle = spines.filter((s) => perSpine(s).length === 0);
  const victims = perSpine(crowded);
  const rateOf = (f: ArFlow) => LINE / perSpine(ecmp[f.name]!).length;
  const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const short = (id: string) => id.split(".")[0]!;

  fab.chart({ title: "Throughput per flow", unit: "Gb/s", yMax: 450, xLabel: "time", series: AR_FLOWS.map((f, i) => ({ name: `flow ${f.name}`, tone: (["active", "compare", "danger", "done"] as Tone[])[i] })), marks: [{ y: LINE, label: "line rate 400", tone: "done" }] });
  fab.note(
    `Both halves of rail 1 in Meridian's San Jose fabric, small example: rail1-leaf1 (srv1–64) and rail1-leaf2 (srv65–128) joined by 4 of the 8 spines with one 400 Gb/s uplink to each, so rail1-leaf1 has 1,600 Gb/s towards the spines. The GPU1 NICs of srv1–srv4 are about to send to their partners on srv65–srv68 at full rate, exactly 1,600 Gb/s.`,
    "topology",
  );

  fab.table(0, {
    title: "Static ECMP at rail1-leaf1: one hash per flow",
    head: ["flow", "5-tuple (UDP to 4791)", "hash mod 4", "spine"],
    rows: AR_FLOWS.map((f) => [f.name, `${nicIp(f.src)}:${sport(f)} → ${nicIp(f.dst)}`, `${hash(f).toString(16).padStart(8, "0")} mod 4 = ${hash(f) % 4}`, short(ecmp[f.name]!)]),
  });
  fab.note(
    `Each flow is one RDMA connection with one fixed 5-tuple: the NIC picks the UDP source port from the queue pair and the destination port is always 4791. Static ECMP hashes that 5-tuple and pins the whole flow to one uplink (lesson 02-02).`,
    "hash",
  );

  for (const s of spines) {
    const n = perSpine(s).length;
    fab.linkSet(L1, s, { width: n / 2, tone: n > 1 ? "danger" : n === 0 ? "muted" : "path", label: n ? perSpine(s).join("+") : "idle", labelAt: 0.75 });
  }
  fab.rowTone(0, (r) => victims.includes(r[0]!), "danger");
  fab.state(crowded, "800G for 400G", "danger");
  for (const s of idle) fab.state(s, "idle", "muted");
  fab.packets(
    AR_FLOWS.map((f, i) => ({ from: L1, to: ecmp[f.name]!, label: f.name, progress: 0.35 + 0.1 * (i % 3), tone: victims.includes(f.name) ? "danger" : "active" })),
    `The hash puts flows ${list(victims)} both on ${crowded} and leaves ${list(idle)} with nothing: two 400 Gb/s flows share one 400 Gb/s uplink while another uplink idles. Four flows on four links collide like this more often than not, since the chance that all four land on different spines is 4!/4⁴, about ${num((24 / 256) * 100)}%.`,
    "collision",
  );

  const delivered = AR_FLOWS.reduce((s, f) => s + rateOf(f), 0);
  for (let i = 0; i < 3; i++) fab.point(Object.fromEntries(AR_FLOWS.map((f) => [`flow ${f.name}`, rateOf(f)])));
  fab.set({ delivered: `${num(delivered)} of 1,600 Gb/s` });
  fab.note(
    `Flows ${list(victims)} get ${LINE / victims.length} Gb/s each and rail1-leaf1 delivers ${num(delivered)} of its 1,600 Gb/s. A collective waits for its slowest transfer, so the step's communication now runs at half speed; more queue pairs per connection (NCCL_IB_QPS_PER_CONNECTION) only improve the odds, because the hash still knows nothing about load.`,
    "slow",
  );

  fab.rowTone(0, () => true, undefined);
  for (const s of spines) {
    fab.linkSet(L1, s, { width: 0.5, tone: "path", label: undefined });
    { fab.state(s, undefined); fab.tone(s, undefined); }
  }
  fab.state(L1, "per-packet AR", "active");
  fab.packets(
    spines.map((s, i) => ({ from: L1, to: s, label: `A ${1001 + i}`, progress: 0.4 + 0.08 * i, tone: "active" })),
    `With adaptive routing (as in NVIDIA Spectrum-X, and in InfiniBand switches before it), rail1-leaf1 chooses the uplink for every packet instead of every flow, picking whichever has the least data queued at that instant. Flow A's next four packets, PSN 1001 to 1004, leave on four different spines.`,
    "spray",
  );

  for (const s of spines) fab.linkSet(L1, s, { width: 0.5, tone: "done", label: "400G", labelAt: 0.75 });
  for (let i = 0; i < 3; i++) fab.point(Object.fromEntries(AR_FLOWS.map((f) => [`flow ${f.name}`, LINE])));
  fab.set({ delivered: "1,600 of 1,600 Gb/s" });
  fab.note(
    `Spread packet by packet, the four flows load every uplink equally at 400 Gb/s, every flow gets its full 400 Gb/s and rail1-leaf1 delivers all 1,600 Gb/s. The collision is gone because no flow is tied to one path any more.`,
    "balanced",
  );

  const arrival = [
    { psn: 1001, via: spines[0]!, wait: "0.4 μs" },
    { psn: 1003, via: spines[2]!, wait: "0.3 μs" },
    { psn: 1002, via: spines[1]!, wait: "0.7 μs" },
    { psn: 1004, via: spines[3]!, wait: "0.6 μs" },
  ];
  fab.table(1, {
    title: "Flow A arriving at srv65's NIC",
    head: ["arrival", "PSN", "via", "queued on the way"],
    rows: arrival.map((a, i) => [i + 1, a.psn, short(a.via), a.wait]),
    tones: [undefined, "compare", "compare", undefined],
  });
  { fab.state(L1, undefined); fab.tone(L1, undefined); }
  fab.packets(
    arrival.map((a, i) => ({ from: a.via, to: L2, label: `A ${a.psn}`, progress: 0.8 - 0.15 * i, tone: i === 1 || i === 2 ? "compare" : "active" })),
    `The price is order: the four paths have different queues, so flow A's packets reach srv65's NIC as 1001, 1003, 1002, 1004. The paths differ by only fractions of a microsecond, but RoCE's reliable connection expects packets in strict PSN order.`,
    "reorder",
  );

  fab.state("receivers", "plain NIC: NAK", "danger");
  fab.send(
    "receivers",
    L2,
    "NAK: expected 1002",
    `A standard RoCE NIC that expects 1002 and receives 1003 treats it as loss: it discards 1003, counts it in out_of_sequence and sends a NAK, and the sender goes back and resends 1002, 1003 and 1004. On such NICs, spraying turns every reordering into retransmissions, which is why plain RoCE fabrics keep per-flow ECMP.`,
    { tone: "danger" },
  );

  fab.state("receivers", "SuperNIC: placed", "done");
  fab.table(1, {
    title: "Flow A at a SuperNIC: placed on arrival",
    head: ["arrival", "PSN", "written to", "done?"],
    rows: arrival.map((a, i) => [i + 1, a.psn, `message start + ${num((a.psn - 1001) * 4096)} B`, i === arrival.length - 1 ? "all four: complete" : "waiting for the rest"]),
    tones: [undefined, undefined, undefined, "done"],
  });
  fab.note(
    `A receiver built for spraying (a BlueField-3 SuperNIC in Spectrum-X, for example) writes each packet's payload straight to its place in GPU memory as it arrives: the write's start address plus (PSN − 1001) × 4,096 bytes says exactly where it belongs. It tracks which PSNs have arrived and reports completion only when all are there, so 1003 before 1002 costs nothing.`,
    "placed",
  );

  fab.state("receivers", "one port each", "compare");
  fab.set({ "still congestion control's job": "last-hop incast" });
  fab.note(
    `Adaptive routing removes collisions on the paths between leaves, but it cannot route around the last link: if srv1 and srv2 both write to srv65, every path ends on srv65's single 400 Gb/s port, and that remains congestion control's job (lesson 07-07). The platform should track how evenly the uplinks are loaded, out-of-sequence and NAK counts on the NICs, and the time of each collective step.`,
    "done",
  );
  return fab.f.done();
};

export const scenarios: Record<string, FabGen> = {
  "ib-credit-flow": ibCreditFlow,
  "pfc-pause": pfcPause,
  "ecn-dcqcn": ecnDcqcn,
  "pfc-deadlock": pfcDeadlock,
  "rail-optimized": railOptimized,
  "adaptive-routing": adaptiveRouting,
};

export const labels: Record<string, string> = {
  "ib-credit-flow": "InfiniBand credit-based flow control",
  "pfc-pause": "PFC pause and resume on one priority",
  "ecn-dcqcn": "ECN marking and DCQCN rate control",
  "pfc-deadlock": "PFC spreading, head-of-line blocking and deadlock",
  "rail-optimized": "Rail-optimised GPU fabric and PXN",
  "adaptive-routing": "Static ECMP vs per-packet adaptive routing",
};
