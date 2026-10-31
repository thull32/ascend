// Scenario pack for the `fabric` family: AI fabrics: training traffic, collectives and RDMA (module 07, part 1).
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
//   | `training-step` | eight GPUs computing then all-reducing; one straggler
//     link delaying the whole step; GPU idle time | 07-01 |
//   | `incast` | many senders to one receiver at once; the egress queue
//     filling; drops (or pauses) | 07-01 (also 07-08) |
//   | `parallelism-traffic` | DP, TP and PP on 16 GPUs in two servers: which
//     bytes cross NVLink, which cross the network, and when | 07-02 |
//   | `ring-allreduce` | four GPUs: reduce-scatter then all-gather around a
//     ring, bytes per step, the 2(n-1)/n total | 07-03 |
//   | `scale-up-vs-out` | GPU to GPU inside a server over NVLink vs across
//     servers over the NIC and fabric, bandwidth and latency compared | 07-04 |
//   | `rdma-write` | a kernel TCP send (copies, syscalls, interrupts) vs an
//     RDMA WRITE: registered memory, QP, NIC to NIC, completion | 07-05 |
//
// Meridian's San Jose AI cluster (from the track brief): 128 servers x 8
// H100-class GPUs, each GPU with its own 400 Gb/s RoCEv2 NIC (ConnectX-7
// class), 8 rails (GPU k of every server, 0-based, on the rail k+1 leaf
// `rail<k+1>-leaf1.sjc`), NVLink inside each server through its NVSwitch
// (900 GB/s per GPU in total, 450 GB/s each way). Two additions this pack
// makes, both illustrative and stated in the notes where they appear: servers
// are named `srv001.sjc` .. `srv128.sjc`, and the back-end address of GPU k's
// NIC in server s is 10.3.<k+1>.<2s-1> on a /31 to its rail leaf (leaf side
// 10.3.<k+1>.<2s-2>), see `backendIp`.
import { Fab, int, type FabGen, type HeaderSpec, type LinkSpec, type NodeSpec } from "./fabric-core";

// ---------- shared helpers ----------

/** Server `n` (1..128) of the sjc AI cluster: "srv001". */
const srv = (n: number): string => `srv${String(n).padStart(3, "0")}`;
/** The first leaf of rail `r` (1..8). */
const railLeaf = (r: number): string => `rail${r}-leaf1.sjc`;
/** Illustrative back-end address of the NIC of GPU `gpu` (0..7) in server `server` (1..128). */
export const backendIp = (server: number, gpu: number): string => `10.3.${gpu + 1}.${2 * server - 1}`;

/** One back-end NIC: 400 Gb/s = 50 GB/s each way. */
const NIC_GBPS = 400;
const NIC_GBS = NIC_GBPS / 8;
/** NVLink 4 on an H100-class GPU: 18 links x 25 GB/s = 450 GB/s each way (900 GB/s in total). */
const NVLINK_GBS = 450;

const num = (n: number, digits = 0): string => n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pct1 = (x: number): string => `${(x * 100).toFixed(1)}%`;
/** Up to `max` decimals, trailing zeros dropped: 1.2 → "1.2", 50 → "50". */
const trim = (n: number, max = 2): string => n.toLocaleString("en-US", { maximumFractionDigits: max });
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
/** "Six" for 6 (sentence start), digits above ten. */
const Word = (n: number): string => {
  const w = WORDS[n] ?? String(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
};
const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

// ---------- training-step ----------

/**
 * `training-step` (lesson 07-01). Eight GPUs of the sjc cluster, GPU0 of
 * srv001..srv008 (all on rail 1, rail1-leaf1.sjc), train a 1-billion-parameter
 * model with data parallelism. Step 1: 100 ms forward, 200 ms backward, then a
 * ring all-reduce of 2 GB of bf16 gradients: each GPU sends 2(n-1)/n x 2 GB =
 * 3.5 GB, 70 ms at 400 Gb/s, while the GPUs sit idle (no compute overlap in
 * this simplified run; the notes say so). Then srv005's link comes back at
 * 200 Gb/s: compute is unchanged, but the ring runs at the slowest link's
 * rate, the all-reduce takes 140 ms, the step grows from 370 to 440 ms and
 * idle time from 18.9% to 31.8%. A chart traces srv001's GPU and link over
 * time; the link-counter table shows the one saturated link that identifies
 * the straggler; the last frame scales the cost to the 1,024-GPU job.
 *
 * Inputs: none. 12 frames.
 */
export const trainingStep: FabGen = () => {
  const N = 8;
  const SLOW = 5;
  const SLOW_GBPS = 200;
  const GRAD_GB = 2;
  const FWD = 100;
  const BWD = 200;
  const COMPUTE = FWD + BWD;
  const sendGB = ((2 * (N - 1)) / N) * GRAD_GB;
  const arMs = (sendGB / NIC_GBS) * 1000;
  const arSlowMs = (sendGB / (SLOW_GBPS / 8)) * 1000;
  const step1 = COMPUTE + arMs;
  const step2 = COMPUTE + arSlowMs;
  const servers = Array.from({ length: N }, (_, i) => i + 1);
  const gpu = (s: number) => `${srv(s)}.gpu0`;
  const leaf = railLeaf(1);
  const fab = new Fab(
    [
      ...servers.map((s, i): NodeSpec => ({ id: gpu(s), kind: "gpu", x: 12.5 + 25 * (i % 4), y: i < 4 ? 0 : 100, state: "ready" })),
      { id: leaf, kind: "leaf", x: 50, y: 50, state: "rail 1" },
    ],
    servers.map((s): LinkSpec => [gpu(s), leaf, { label: "400G", labelAt: 0.3 }]),
  );
  const all = servers.map(gpu);
  const everyone = (state: string, tone?: "active" | "done" | "muted") => {
    for (const id of all) fab.state(id, state, tone);
  };
  const GPU_SERIES = "srv001 GPU computing";
  const LINK_SERIES = "srv001 link, % of 400G";
  const tick = (ms: number, gpuPct: number, linkPct: number) => {
    for (let i = 0; i < ms / 10; i++) fab.point({ [GPU_SERIES]: gpuPct, [LINK_SERIES]: linkPct });
  };
  const timeline = (rows: (string | number)[][]) => fab.table(0, { title: "Step timeline (ms)", head: ["step", "phase", "from", "to"], rows, tones: rows.map((_, i) => (i === rows.length - 1 ? "active" : undefined)) });
  const rows: (string | number)[][] = [];

  fab.set({ job: "data parallel, 1B parameters", GPUs: "8 of 1,024 (rail 1)" });
  fab.note(
    `Eight GPUs of Meridian's San Jose cluster, GPU0 of servers srv001 to srv008, each with its own 400 Gb/s ConnectX-7 NIC on the rail-1 leaf rail1-leaf1.sjc. They train one model with data parallelism: every GPU holds a full copy of a 1-billion-parameter model and works on a different slice of each batch.`,
    "topology",
  );

  fab.chart({ title: "srv001's GPU and link over time", unit: "%", yMax: 100, xLabel: "time, 10 ms per point", series: [{ name: GPU_SERIES, tone: "done" }, { name: LINK_SERIES, tone: "active" }] });
  everyone("forward", "active");
  tick(FWD, 100, 0);
  rows.push([1, "forward", 0, FWD]);
  timeline(rows);
  fab.note(`Step 1 starts with the forward pass: each GPU runs its slice of the batch through the model for ${FWD} ms. The network is silent, because nothing needs to be exchanged yet.`, "compute");

  everyone("backward", "active");
  tick(BWD, 100, 0);
  rows.push([1, "backward", FWD, COMPUTE]);
  timeline(rows);
  fab.set({ "gradients per GPU": `${GRAD_GB} GB (1B × 2-byte bf16)` });
  fab.note(
    `The backward pass takes ${BWD} ms, about twice the forward, and leaves each GPU with ${GRAD_GB} GB of gradients, one 2-byte bf16 number per parameter. The eight sets differ because each GPU saw different data, and no GPU may update its weights until all eight have summed them.`,
    "compute",
  );

  everyone("all-reduce", "active");
  for (const id of all) fab.linkSet(id, leaf, { width: 1, tone: "active" });
  tick(arMs, 0, 100);
  rows.push([1, "all-reduce", COMPUTE, step1]);
  timeline(rows);
  fab.set({ "each GPU sends": `2 × 7/8 × ${GRAD_GB} GB = ${sendGB} GB` });
  fab.packets(
    all.map((id) => ({ from: id, to: leaf, label: `${sendGB} GB` })),
    `At ${COMPUTE} ms all eight start the all-reduce at once: in NCCL's ring algorithm each GPU sends 2 × 7/8 × ${GRAD_GB} GB = ${sendGB} GB and receives as much, so every rail-1 link runs flat out in both directions. At 400 Gb/s (${NIC_GBS} GB/s) that takes ${arMs} ms, and the GPUs have nothing to compute until it ends.`,
    "all-reduce",
  );

  everyone("step done", "done");
  for (const id of all) fab.linkSet(id, leaf, { width: 0, tone: undefined });
  fab.set({ "step 1": `${step1} ms`, "GPU idle in step 1": `${arMs} ms (${pct1(arMs / step1)})` });
  fab.unset("each GPU sends");
  fab.note(
    `Step 1 takes ${COMPUTE} + ${arMs} = ${step1} ms (plus a few milliseconds in which each GPU applies the summed gradients to its weights, left out here), and each GPU computed for ${COMPUTE} of them: ${arMs} ms, ${pct1(arMs / step1)} of the step, is idle time spent waiting for the network. Real frameworks start reducing early gradients while the backward pass still runs, but whatever does not overlap adds straight to every step.`,
    "idle",
  );

  fab.linkSet(gpu(SLOW), leaf, { label: `${SLOW_GBPS}G`, tone: "danger" });
  fab.state(gpu(SLOW), "link 200G", "danger");
  fab.note(
    `Before step 2, srv005's link flaps and comes back at ${SLOW_GBPS} Gb/s instead of 400, for example because the two ends negotiated a lower speed over a marginal copper cable. The link is up and passing traffic, so a monitor that checks only whether links are up sees nothing wrong; the flap in the log and the port's speed are the only clues.`,
    "fault",
  );

  for (const id of all) if (id !== gpu(SLOW)) fab.state(id, "fwd + bwd", "active");
  fab.state(gpu(SLOW), "fwd + bwd", "danger");
  tick(COMPUTE, 100, 0);
  rows.push([2, "forward + backward", step1, step1 + COMPUTE]);
  timeline(rows);
  fab.note(`Step 2's forward and backward passes take the same ${COMPUTE} ms as before, srv005 included: a slow link costs nothing while no one is sending.`, "compute");

  for (const id of all) fab.state(id, "all-reduce", id === gpu(SLOW) ? "danger" : "active");
  for (const id of all) fab.linkSet(id, leaf, id === gpu(SLOW) ? { width: 1, tone: "danger" } : { width: 0.5, tone: "active" });
  rows.push([2, "all-reduce", step1 + COMPUTE, "…"]);
  timeline(rows);
  fab.packets(
    all.map((id) => ({ from: id, to: leaf, label: id === gpu(SLOW) ? "200G" : "half rate", tone: id === gpu(SLOW) ? "danger" : "active" })),
    `The all-reduce starts and every GPU again has ${sendGB} GB to move, but a ring advances in lockstep: each of its 2 × (8 − 1) = 14 steps waits for the slowest transfer, the one through srv005's ${SLOW_GBPS} Gb/s link. Every other link drops to half its rate.`,
    "straggler",
  );

  for (const id of all) fab.state(id, "idle, waiting", id === gpu(SLOW) ? "danger" : "muted");
  tick(arSlowMs / 2, 0, (SLOW_GBPS / NIC_GBPS) * 100);
  rows[rows.length - 1] = [2, "all-reduce", step1 + COMPUTE, `${step1 + COMPUTE + arSlowMs / 2}…`];
  timeline(rows);
  fab.note(
    `${arSlowMs / 2} ms in, when step 1's all-reduce had already finished, every GPU has moved only half its data: the all-reduce needs ${sendGB} GB at ${SLOW_GBPS / 8} GB/s = ${arSlowMs} ms, twice step 1's, and all eight GPUs sit idle for every millisecond of it.`,
    "straggler",
  );

  tick(arSlowMs / 2, 0, (SLOW_GBPS / NIC_GBPS) * 100);
  everyone("step done", "done");
  fab.state(gpu(SLOW), "link 200G", "danger");
  for (const id of all) fab.linkSet(id, leaf, { width: 0, tone: id === gpu(SLOW) ? "danger" : undefined });
  rows[rows.length - 1] = [2, "all-reduce", step1 + COMPUTE, step1 + step2];
  timeline(rows);
  fab.set({ "step 2": `${step2} ms (+${step2 - step1} ms)`, "GPU idle in step 2": `${arSlowMs} ms (${pct1(arSlowMs / step2)})` });
  fab.note(
    `Step 2 takes ${COMPUTE} + ${arSlowMs} = ${step2} ms, ${step2 - step1} ms (${pct1((step2 - step1) / step1)}) longer than step 1, and each GPU's idle time doubles to ${arSlowMs} ms, ${pct1(arSlowMs / step2)} of the step. One slow link out of eight slowed all eight GPUs, because a synchronous collective finishes only when its slowest transfer does.`,
    "idle",
  );

  for (const id of all) fab.linkSet(id, leaf, id === gpu(SLOW) ? { width: 1, tone: "danger" } : { width: 0.5, tone: "active" });
  fab.table(1, {
    title: "rail1-leaf1.sjc port counters during step 2's all-reduce",
    head: ["port", "speed", "throughput", "utilisation"],
    rows: servers.map((s) => [srv(s), s === SLOW ? `${SLOW_GBPS}G` : "400G", `${SLOW_GBPS} Gb/s`, s === SLOW ? "100%" : "50%"]),
    tones: servers.map((s) => (s === SLOW ? "danger" : undefined)),
  });
  fab.note(
    `The GPUs cannot point at the culprit: all eight report the same step time and the same idle time. The leaf's port counters from that all-reduce can: seven links carry ${SLOW_GBPS} Gb/s at 50% of their speed, while srv005's carries the same ${SLOW_GBPS} Gb/s at 100% of its reduced speed, so the one saturated port, the only one not running at 400G, is the straggler.`,
    "signal",
  );

  const idleShare = (step2 - step1) / step2;
  const gpuHours = 1024 * 24 * idleShare;
  fab.set({ "1,024-GPU job": `${pct1(idleShare)} of every GPU-hour lost`, "per day": `≈ ${num(Math.round(gpuHours / 100) * 100)} GPU-hours` });
  fab.note(
    `In the full 1,024-GPU job one such link among 1,024 has the same effect: if it added the same ${step2 - step1} ms to a ${step2} ms step, ${pct1(idleShare)} of every GPU-hour would be wasted, about ${num(Math.round(gpuHours / 100) * 100)} GPU-hours a day, close to $${num(Math.round((gpuHours * 2.5) / 1000) * 1000)} a day at an illustrative $2.50 per GPU-hour. That is why AI fabrics are judged by job completion time, not by average link utilisation.`,
    "cost",
  );
  return fab.f.done();
};

// ---------- incast ----------

/**
 * `incast` (lessons 07-01 and 07-08). Six senders (srv002..srv007, GPU0's
 * NIC on rail 1) each send 1 MB to srv001 at the same instant through
 * rail1-leaf1.sjc, all links 400 Gb/s: 2,400 Gb/s offered to one 400 Gb/s
 * egress port. Part 1, lossy class: the egress queue grows at 2,000 Gb/s (250
 * KB/us), hits its 2 MB limit at 8 us and tail-drops 5 of every 6 arriving
 * packets; 3 MB of 6 are dropped, and RDMA's go-back-N makes each sender
 * resend about 0.6 MB. Part 2, the same burst in a PFC-enabled class
 * (DSCP 26, priority 3, XOFF 200 KB per ingress port, illustrative): pauses
 * from 4.8 us, the queue holds at 1.2 MB, each sender averages 66.7 Gb/s and
 * is paused 83% of the time, zero drops, done in 120 us (the port's minimum).
 * Closes with the cost (congestion spreading) and the counters on each side.
 *
 * Inputs: `senders` 4-6 (default 6; fewer than 4 never overflows the 2 MB
 * queue in this run). 13 frames.
 */
export const incast: FabGen = (input) => {
  const n = int(input.senders, 4, 6, 6);
  const MSG = 1; // MB per sender
  const RATE = NIC_GBPS / 8 / 1000; // MB per microsecond (0.05)
  const BUF = 2; // MB the egress queue may hold
  const XOFF = 0.2; // MB per ingress port
  const fill = (n - 1) * RATE;
  const tSend = MSG / RATE; // 20 us
  const tFull = BUF / fill;
  const qMax = Math.min(BUF, fill * tSend);
  const tEmpty = tSend + qMax / RATE;
  const delivered = MSG + qMax;
  const dropped = n * MSG - delivered;
  const useful = RATE * tFull;
  const resend = n * (MSG - useful);
  const hover = n * XOFF;
  const tHover = hover / fill;
  const tSendEnd = (n * MSG - n * RATE * tHover) / RATE + tHover;
  const tDone = (n * MSG) / RATE;
  const TICK = 4;
  const ticks = Array.from({ length: Math.round(tDone / TICK) + 1 }, (_, i) => i * TICK);
  const qLossy = (t: number) => (t <= tSend ? Math.min(BUF, fill * t) : Math.max(0, qMax - RATE * (t - tSend)));
  const qPfc = (t: number) => (t <= tHover ? fill * t : t <= tSendEnd ? hover : Math.max(0, hover - RATE * (t - tSendEnd)));
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const mb = (x: number) => `${trim(x)} MB`;
  const us = (t: number) => `${trim(t, 1)} µs`;

  const recv = `${srv(1)}.sjc`;
  const leaf = railLeaf(1);
  const senders = Array.from({ length: n }, (_, i) => `${srv(i + 2)}.sjc`);
  const fab = new Fab(
    [
      { id: recv, kind: "server", x: 50, y: 0, state: "receiver" },
      { id: leaf, kind: "leaf", x: 50, y: 45, state: "queue 0 MB" },
      ...senders.map((id, i): NodeSpec => ({ id, kind: "server", x: ((i + 0.5) * 100) / n, y: 100, state: "1 MB to send" })),
    ],
    [[leaf, recv, { label: "400G egress" }], ...senders.map((id): LinkSpec => [id, leaf])],
  );
  const chart = (upto: number | null, pfcUpto: number | null) =>
    fab.chart({
      title: `${leaf} egress queue towards srv001`,
      unit: "MB",
      yMax: 2.5,
      xLabel: `time, ${TICK} µs per point`,
      series: [
        { name: "lossy class", tone: "danger", points: upto === null ? [] : ticks.filter((t) => t <= upto + 1e-9).map((t) => r2(qLossy(t))) },
        ...(pfcUpto === null ? [] : [{ name: "PFC class", tone: "done" as const, points: ticks.filter((t) => t <= pfcUpto + 1e-9).map((t) => r2(qPfc(t))) }]),
      ],
      marks: [{ y: BUF, label: "queue limit 2 MB", tone: "danger" }, ...(pfcUpto === null ? [] : [{ y: r2(hover), label: `${n} × XOFF = ${mb(hover)}`, tone: "compare" as const }])],
    });
  const counters = (rows: [string, string][]) => fab.table(0, { title: `${leaf}, port to srv001`, head: ["counter", "value"], rows });

  fab.set({ senders: n, "offered load": `${n} × 400 = ${num(n * 400)} Gb/s`, "egress capacity": "400 Gb/s" });
  fab.note(
    `${Word(n)} servers of the San Jose cluster, ${senders[0]!.split(".")[0]} to ${senders[n - 1]!.split(".")[0]}, and a receiver, srv001, each using GPU0's 400 Gb/s NIC on the rail-1 leaf. The leaf is non-blocking, meaning it can switch every port at line rate at once, so the only place traffic can pile up here is an egress port that several senders aim at together.`,
    "topology",
  );

  chart(0, null);
  for (const id of senders) fab.linkSet(id, leaf, { width: 1, tone: "active" });
  fab.linkSet(leaf, recv, { width: 1, tone: "active" });
  fab.packets(
    senders.map((id) => ({ from: id, to: leaf, label: "1 MB" })),
    `At the same instant every sender starts a 1 MB transfer to srv001, as happens when many GPUs answer one in an all-to-all, a gather or a storage read. ${n} × 400 = ${num(n * 400)} Gb/s converges on a single 400 Gb/s egress port: ${n}:1 incast.`,
    "burst",
  );

  const t1 = tFull / 2;
  chart(t1, null);
  fab.state(leaf, `queue ${mb(qLossy(t1))}`, "active");
  counters([["queue depth", mb(qLossy(t1))], ["sent to srv001", mb(RATE * t1)], ["tail drops", "0 MB"]]);
  fab.packets(
    senders.map((id) => ({ from: id, to: leaf, label: "", progress: 0.8 })),
    `Only 400 Gb/s can leave towards srv001, so the excess ${num((n - 1) * 400)} Gb/s piles up in the leaf's egress queue at ${num(fill * 1000)} KB per microsecond: after ${us(t1)} it already holds ${mb(qLossy(t1))}.`,
    "queue",
  );

  chart(tFull, null);
  fab.state(leaf, "queue full", "danger");
  counters([["queue depth", mb(BUF)], ["sent to srv001", mb(RATE * tFull)], ["tail drops", "starting"]]);
  fab.packets(
    senders.map((id, i) => ({ from: id, to: leaf, label: i === 0 ? "queued" : "dropped", lost: i !== 0, progress: 0.8 })),
    `At ${us(tFull)} the queue reaches the 2 MB this port may take from the shared buffer (the real limit depends on the switch chip and its buffer settings), and the leaf starts tail-dropping: of every ${WORDS[n]} packets that arrive from now on, one finds room and ${WORDS[n - 1]} are discarded.`,
    "drop",
  );

  chart(tSend, null);
  for (const id of senders) fab.state(id, "sent 1 MB", "muted");
  const droppedBySend = n * MSG - RATE * tSend - qLossy(tSend);
  counters([["queue depth", mb(qLossy(tSend))], ["sent to srv001", mb(RATE * tSend)], ["tail drops", mb(droppedBySend)]]);
  for (const id of senders) fab.linkSet(id, leaf, { width: 0, tone: undefined });
  fab.note(
    `At ${us(tSend)} every sender has sent its 1 MB at line rate and stops. Of the ${mb(n * MSG)} that arrived, ${mb(RATE * tSend)} has gone out to srv001, ${mb(qLossy(tSend))} sit in the queue, and the switch has dropped ${mb(droppedBySend)}.`,
    "drop",
  );

  chart(tEmpty, null);
  fab.state(leaf, "queue 0 MB", "done");
  fab.linkSet(leaf, recv, { width: 0, tone: undefined });
  counters([["queue depth", "0 MB"], ["sent to srv001", mb(delivered)], ["tail drops", mb(dropped)]]);
  fab.set({ "lossy: delivered": mb(delivered), "lossy: dropped": `${mb(dropped)} (${Math.round((dropped / (n * MSG)) * 100)}%)` });
  fab.note(`The queue drains at 400 Gb/s and is empty at ${us(tEmpty)}. srv001 received ${mb(delivered)} of the ${mb(n * MSG)}, and the ${mb(dropped)} the switch dropped must be sent again.`, "drop");

  fab.table(1, {
    title: "go-back-N: what each sender must resend",
    head: ["sender", "sent", "accepted in order", "resend"],
    rows: senders.map((id) => [id.split(".")[0]!, "1 MB", mb(useful), mb(MSG - useful)]),
  });
  fab.set({ "lossy: resent": mb(resend) });
  fab.note(
    `For RDMA it is worse: a reliable-connected queue pair accepts packets only in order, so after a sender's first loss, about ${us(tFull)} in, srv001's NIC sends one NAK for the gap and discards everything else that sender delivers until the missing packet is resent (go-back-N, the classic RoCE behaviour; newer NICs can resend selectively). Each sender must resend about ${mb(MSG - useful)}, ${mb(resend)} in all, more than the ${mb(dropped)} the switch dropped.`,
    "go-back-n",
  );

  // ----- part 2: the same burst in a lossless class -----
  fab.table(1, undefined);
  for (const id of senders) fab.state(id, "1 MB to send");
  fab.tones(senders, undefined);
  fab.state(leaf, "queue 0 MB");
  fab.tone(leaf, undefined);
  chart(tDone, 0);
  counters([["queue depth", "0 MB"], ["sent to srv001", "0 MB"], ["tail drops", "0 MB"], ["PFC PAUSE sent, priority 3", "0"]]);
  fab.note(
    `Now the same burst in a lossless class: RoCE traffic marked DSCP 26 is mapped to priority 3, which has priority flow control (PFC) enabled on every port. The leaf counts the bytes each ingress port has queued in that class against an XOFF threshold, the fill level at which it tells the sender on that port to stop: 200 KB per port here (illustrative; real thresholds come from the chip's buffer allocation, and the headroom kept above XOFF from cable length, link speed and MTU).`,
    "lossless",
  );

  const tPause = ticks.find((t) => t >= tHover)!;
  chart(tDone, tPause);
  fab.state(leaf, `queue ${mb(hover)}`, "active");
  for (const id of senders) fab.state(id, "paused", "compare");
  fab.linkSet(leaf, recv, { width: 1, tone: "active" });
  counters([["queue depth", mb(hover)], ["sent to srv001", mb(RATE * tHover)], ["tail drops", "0 MB"], ["PFC PAUSE sent, priority 3", `${n} (one per ingress port)`]]);
  fab.packets(
    senders.map((id) => ({ from: leaf, to: id, label: "PAUSE p3", tone: "compare" })),
    `At ${us(tHover)} each of the ${WORDS[n]} ingress ports has 200 KB queued, ${mb(hover)} in all, and the leaf sends a PFC PAUSE frame (a link-level control frame, EtherType 0x8808, carrying a pause time for priority 3 only) out of each of those ports. Each sender's NIC stops transmitting priority-3 frames, and the headroom buffer reserved above XOFF absorbs the bytes that were already on the cable.`,
    "pause",
  );

  chart(tDone, tSendEnd);
  for (const id of senders) {
    fab.state(id, `avg ${trim(400 / n, 1)} Gb/s`, "compare");
    fab.linkSet(id, leaf, { width: 1 / n, tone: "compare" });
  }
  counters([["queue depth", mb(hover)], ["sent to srv001", mb(RATE * tSendEnd)], ["tail drops", "0 MB"], ["PFC PAUSE sent, priority 3", "many, per port"]]);
  fab.note(
    `For the rest of the burst the leaf pauses and resumes each sender as its share crosses the threshold, so each one averages 400/${n} = ${trim(400 / n, 1)} Gb/s and is paused ${Math.round((1 - 1 / n) * 100)}% of the time. The queue holds at about ${mb(hover)}, srv001's link stays full and nothing is dropped.`,
    "pause",
  );

  chart(tDone, tDone);
  fab.state(leaf, "queue 0 MB", "done");
  fab.state(recv, `${mb(n * MSG)} received`, "done");
  for (const id of senders) {
    fab.state(id, "done", "done");
    fab.linkSet(id, leaf, { width: 0, tone: undefined });
  }
  fab.linkSet(leaf, recv, { width: 0, tone: undefined });
  counters([["queue depth", "0 MB"], ["sent to srv001", mb(n * MSG)], ["tail drops", "0 MB"], ["PFC PAUSE sent, priority 3", "many, per port"]]);
  fab.note(
    `The last sender finishes at ${us(tSendEnd)} and the queue is empty at ${us(tDone)}: ${mb(n * MSG)} through a 400 Gb/s port in exactly the time that port needs, with zero drops and nothing to resend.`,
    "done",
  );

  fab.note(
    `The price is paid upstream: a paused sender cannot send any priority-3 traffic, even to receivers that are not congested, and if the senders sat behind spines, the leaf would pause a spine instead, whose own queue would then fill until it paused every port feeding it: congestion spreading (lesson 07-08). ECN marking with DCQCN (lesson 07-07) exists to slow the senders down before the queue ever reaches XOFF.`,
    "cost",
  );

  fab.table(0, {
    title: "the same incast, two classes",
    head: ["", "lossy", "PFC"],
    rows: [
      ["dropped", mb(dropped), "0 MB"],
      ["resent (go-back-N)", `≈ ${mb(resend)}`, "0 MB"],
      ["senders paused", "never", `${Math.round((1 - 1 / n) * 100)}% of the burst`],
      ["switch counters", "egress drops, queue depth", "PFC pause tx, queue depth"],
      ["NIC counters", "out_of_sequence, packet_seq_err", "rx_prio3_pause"],
    ],
  });
  fab.note(
    `Each side of the link records a different half: the switch shows queue depth and either egress drops or PAUSE frames sent, while the NICs show out-of-sequence packets at the receiver, sequence-error NAKs at the senders (packet_seq_err) or pauses received (rx_prio3_pause). A platform that collects both can tell incast, deep queues on one egress port, from a faulty link, which shows CRC errors on the port itself.`,
    "signal",
  );
  return fab.f.done();
};

// ---------- parallelism-traffic ----------

/**
 * `parallelism-traffic` (lesson 07-02). srv001 and srv002 (8 GPUs each,
 * NVSwitch inside, GPU k's NIC on rail k+1) train a 13B-class GPT model
 * (hidden 5,120, 40 layers, 12.6B layer parameters, sequence 4,096,
 * micro-batch 1, 8 microbatches per step, bf16) as TP 4 x PP 2 x DP 2 in
 * Megatron-LM's default rank order: TP groups GPU0-3 and GPU4-7 of each
 * server, DP twins GPU k and GPU k+4 of the same server, pipeline stage 0 on
 * srv001 and stage 1 on srv002. Frames follow one step: TP all-reduces (40 MiB,
 * 60 MiB sent per GPU, twice per layer each way) over NVLink; the PP handoff
 * (10 MiB per GPU per microbatch, scatter-gathered) over the rails, forward
 * and backward; the DP all-reduce (2.9 GiB, 3.15 GB, per GPU) over NVLink at the end.
 * A table accumulates bytes per GPU per step by link; the last frames show
 * what other placements would put on the network.
 *
 * Inputs: none. 13 frames.
 */
export const parallelismTraffic: FabGen = () => {
  const H = 5120;
  const LAYERS = 40;
  const SEQ = 4096;
  const MICRO = 8;
  const TP = 4;
  const PP = 2;
  const DP = 2;
  const layerParams = 12 * H * H * LAYERS;
  const act = SEQ * H * 2; // bytes, 40 MiB
  const tpSend = ((2 * (TP - 1)) / TP) * act; // per all-reduce per GPU
  const tpPerMicro = (LAYERS / PP) * 4 * tpSend;
  const tpPerStep = tpPerMicro * MICRO;
  const ppPerGpu = act / TP; // per microbatch per direction
  const paramsPerGpu = layerParams / (TP * PP);
  const gradBytes = paramsPerGpu * 2;
  const dpSend = ((2 * (DP - 1)) / DP) * gradBytes;
  const agPerStep = MICRO * ((TP - 1) / TP) * act; // PP all-gathers over NVLink per GPU per step
  const ms = (bytes: number, gbs: number) => (bytes / (gbs * 1e9)) * 1000;

  const S1 = `${srv(1)}.sjc`;
  const S2 = `${srv(2)}.sjc`;
  const g = (server: 1 | 2, k: number) => `${srv(server)}.gpu${k}`;
  const nvs = (server: 1 | 2) => `nvswitch.${srv(server)}`;
  const rail = (k: number) => railLeaf(k + 1);
  const ks = [0, 1, 2, 3, 4, 5, 6, 7];
  const y = (k: number) => 12.5 + 12.5 * k;
  const place = (server: 1 | 2, k: number) => ({ stage: server - 1, rep: k < 4 ? 0 : 1, tp: k % 4 });
  const nodes: NodeSpec[] = [
    { id: S1, kind: "server", x: 3, y: 0 },
    { id: S2, kind: "server", x: 97, y: 0 },
    ...ks.map((k): NodeSpec => ({ id: g(1, k), label: `GPU${k}`, kind: "gpu", x: 3, y: y(k), state: `stage0 rep${place(1, k).rep}` })),
    ...ks.map((k): NodeSpec => ({ id: g(2, k), label: `GPU${k}`, kind: "gpu", x: 97, y: y(k), state: `stage1 rep${place(2, k).rep}` })),
    { id: nvs(1), label: "NVSwitch", kind: "switch", x: 28, y: 56.25 },
    { id: nvs(2), label: "NVSwitch", kind: "switch", x: 72, y: 56.25 },
    ...ks.map((k): NodeSpec => ({ id: rail(k), label: `rail ${k + 1}`, kind: "leaf", x: 50, y: y(k) })),
  ];
  const links: LinkSpec[] = [
    ...ks.flatMap((k): LinkSpec[] => [
      [g(1, k), nvs(1)],
      [g(2, k), nvs(2)],
      [g(1, k), rail(k)],
      [rail(k), g(2, k)],
    ]),
  ];
  const fab = new Fab(nodes, links, { height: 460 });
  const nvl = (server: 1 | 2, which: number[], tone?: "active" | "done") => {
    for (const k of which) fab.linkSet(g(server, k), nvs(server), { tone, width: tone ? 0.6 : 0 });
  };
  const net = (which: number[], tone?: "path", side: 0 | 1 | 2 = 0) => {
    for (const k of which) {
      if (side !== 2) fab.linkSet(g(1, k), rail(k), { tone, width: tone ? 0.3 : 0 });
      if (side !== 1) fab.linkSet(rail(k), g(2, k), { tone, width: tone ? 0.3 : 0 });
    }
  };
  const bytesRows: (string | number)[][] = [];
  const bytesTable = () => fab.table(1, { title: "bytes per GPU per step", head: ["traffic", "per GPU", "link", "when"], rows: bytesRows });
  const gib = (b: number) => `${num(b / GiB, 1)} GiB`;
  const mib = (b: number) => `${num(b / MiB)} MiB`;
  const gb = (b: number) => `${num(b / 1e9, 2)} GB`;

  fab.set({ "NVLink per GPU": `${NVLINK_GBS} GB/s each way`, "NIC per GPU": `${NIC_GBPS} Gb/s = ${NIC_GBS} GB/s` });
  fab.note(
    `Two servers of Meridian's San Jose cluster, srv001 and srv002, each with eight H100-class GPUs joined by NVLink through the server's NVSwitch (${NVLINK_GBS} GB/s each way per GPU). Every GPU also has its own ${NIC_GBPS} Gb/s (${NIC_GBS} GB/s) NIC on its rail: GPU0 of every server connects to the rail 1 leaf, GPU7 to rail 8.`,
    "topology",
  );

  fab.table(0, {
    title: "placement: TP 4 × PP 2 × DP 2 = 16 GPUs",
    head: ["dimension", "groups", "talks over"],
    rows: [
      ["TP (tensor)", "GPU0–3 and GPU4–7 of each server", "NVLink"],
      ["DP (data)", "GPU k with GPU k+4, same server", "NVLink"],
      ["PP (pipeline)", "stage 0 = srv001 (layers 1–20), stage 1 = srv002 (21–40)", "network, rail k+1"],
    ],
  });
  fab.set({ model: `GPT, hidden ${num(H)}, ${LAYERS} layers, ${num(layerParams / 1e9, 1)}B parameters` });
  fab.note(
    `The job trains a 13B-class GPT model (hidden size 5,120, 40 layers, ${num(layerParams / 1e9, 1)} billion parameters in its layers) on all 16 GPUs as tensor parallel 4 × pipeline parallel 2 × data parallel 2. The table shows the placement Megatron-LM's default rank order gives: tensor parallelism (TP) innermost, then data (DP), then pipeline (PP) outermost.`,
    "placement",
  );

  fab.set({ "model state per GPU": `${num((paramsPerGpu * 16) / 1e9, 1)} GB` });
  fab.note(
    `Training needs about 16 bytes per parameter (bf16 weights and gradients plus fp32 master weights and two Adam moments): ${num((layerParams * 16) / 1e9)} GB for one copy, far more than an 80 GB GPU holds. Split eight ways by TP and PP, each GPU holds ${num(paramsPerGpu / 1e9, 2)} billion parameters, about ${num((paramsPerGpu * 16) / 1e9)} GB plus its activations, and the second replica (DP) doubles the work done per step without changing the memory each GPU needs.`,
    "memory",
  );

  for (const k of ks) fab.tone(g(1, k), "active");
  nvl(1, ks, "active");
  fab.packets(
    ks.map((k) => ({ from: g(1, k), to: nvs(1), label: `${mib(tpSend)}`, progress: 0.55 })),
    `Forward pass, stage 0, microbatch 1 (4,096 tokens): each layer is split across a TP group of four GPUs, and twice per layer, after attention and after the MLP, the partial results are summed with an all-reduce of 4,096 × 5,120 × 2 bytes = ${mib(act)}. In a ring of four each GPU sends 1.5 × ${mib(act)} = ${mib(tpSend)} per all-reduce over NVLink, and both of srv001's TP groups do this at once.`,
    "tp",
  );

  bytesRows.push(["TP all-reduce", gib(tpPerStep), "NVLink", "4× per layer, blocking"]);
  bytesTable();
  fab.set({ "TP per microbatch": `${mib(tpPerMicro)} per GPU` });
  fab.note(
    `Forward and backward together make four all-reduces per layer, so per microbatch each GPU sends 20 layers × 4 × ${mib(tpSend)} = ${mib(tpPerMicro)}, ${gib(tpPerStep)} per step of ${MICRO} microbatches. At ${NVLINK_GBS} GB/s that is ${num(ms(tpPerMicro, NVLINK_GBS))} ms per microbatch, on the critical path because each layer waits for its sums; through a ${NIC_GBS} GB/s NIC it would be ${num(ms(tpPerMicro, NIC_GBS))} ms, which is why TP stays inside the server.`,
    "tp",
  );

  nvl(1, ks);
  for (const k of ks) fab.tone(g(1, k), "active");
  net(ks, "path", 1);
  fab.packets(
    ks.map((k) => ({ from: g(1, k), to: rail(k), label: mib(ppPerGpu), tone: "path" })),
    `After layer 20, stage 0 hands the microbatch's activations, another ${mib(act)}, to stage 1 on srv002. Each GPU sends only its quarter, ${mib(ppPerGpu)}, to the GPU with the same index on srv002, so each transfer leaves through that GPU's own NIC and crosses one switch, its rail leaf.`,
    "pp",
  );

  for (const k of ks) {
    fab.tone(g(1, k), undefined);
    fab.tone(g(2, k), "active");
  }
  net(ks, "path", 2);
  for (const k of ks) fab.linkSet(g(1, k), rail(k), { tone: undefined, width: 0 });
  nvl(2, ks, "active");
  fab.packets(
    ks.map((k) => ({ from: rail(k), to: g(2, k), label: mib(ppPerGpu), tone: "path" })),
    `Each quarter arrives in ${num(ms(ppPerGpu, NIC_GBS), 2)} ms at 400 Gb/s; srv002's GPUs rebuild the full ${mib(act)} with an all-gather over their NVLink and run layers 21–40 with TP all-reduces of their own. Meanwhile srv001 has already started microbatch 2: that overlap is what pipelining means.`,
    "pp",
  );

  nvl(2, ks);
  for (const k of ks) {
    fab.tone(g(2, k), undefined);
    fab.linkSet(g(1, k), rail(k), { tone: "path", width: 0.3 });
    fab.linkSet(rail(k), g(2, k), { tone: "path", width: 0.3 });
  }
  fab.packets(
    ks.map((k) => ({ from: g(2, k), to: rail(k), label: mib(ppPerGpu), tone: "path" })),
    `In the backward pass the traffic reverses: srv002 sends back the gradient of those activations, again ${mib(ppPerGpu)} per GPU per microbatch over the same rails, and srv001's GPUs all-gather it over NVLink before running their own backward pass.`,
    "pp",
  );

  bytesRows.push(["PP handoff", `${mib(MICRO * ppPerGpu)} out + ${mib(MICRO * ppPerGpu)} in`, "network", "per microbatch, each way"]);
  bytesRows.push(["PP all-gather", mib(agPerStep), "NVLink", "after each handoff"]);
  bytesTable();
  net(ks);
  fab.note(
    `Over ${MICRO} microbatches each GPU sends ${mib(MICRO * ppPerGpu)} and receives ${mib(MICRO * ppPerGpu)} across the network per step, tiny next to TP's ${gib(tpPerStep)}. But every handoff sits between two stages' compute, so a slow one stalls the pipeline: PP traffic is small and latency-sensitive.`,
    "pp",
  );

  for (const sv of [1, 2] as const) {
    nvl(sv, ks, "done");
    for (const k of ks) fab.tone(g(sv, k), "done");
  }
  fab.packets(
    [1, 2].flatMap((sv) => ks.map((k) => ({ from: g(sv as 1 | 2, k), to: nvs(sv as 1 | 2), label: k === 0 || k === 4 ? gib(dpSend) : "", tone: "done" as const }))),
    `When the last microbatch's backward pass ends, each GPU holds gradients for its ${num(paramsPerGpu / 1e9, 2)} billion parameters, ${gib(gradBytes)} in bf16 (${gb(gradBytes)}), and sums them with its twin in the other replica: GPU k with GPU k+4 of the same server. An all-reduce between two sends ${gib(dpSend)} per GPU over NVLink, ${num(ms(dpSend, NVLINK_GBS))} ms; gradients accumulate over all ${MICRO} microbatches, so frameworks can start it, bucket by bucket, only during the last microbatch's backward pass.`,
    "dp",
  );

  bytesRows.push(["DP all-reduce", gib(dpSend), "NVLink", "once per step, end of backward"]);
  bytesTable();
  for (const sv of [1, 2] as const) {
    nvl(sv, ks);
    for (const k of ks) fab.tone(g(sv, k), undefined);
  }
  net(ks, "path");
  const nvBytes = tpPerStep + dpSend + agPerStep;
  const netBytes = 2 * MICRO * ppPerGpu;
  fab.set({ "per GPU per step: NVLink": gib(nvBytes), "per GPU per step: network": mib(netBytes) });
  fab.note(
    `Per GPU per step: ${gib(tpPerStep)} of TP all-reduce, ${gib(dpSend)} of DP all-reduce and ${mib(agPerStep)} of pipeline all-gathers over NVLink, ${gib(nvBytes)} in all, against ${mib(netBytes)} of pipeline traffic over the network. With this placement ${num((nvBytes / (nvBytes + netBytes)) * 100, 1)}% of the bytes stay inside a server, and the rails carry only the pipeline handoffs.`,
    "summary",
  );

  net(ks);
  const tpSplitNic = tpPerStep / 2; // 2 + 2 split: 2 of the ring's 4 hops cross servers, NCCL spreads them over both NICs per side
  fab.table(0, {
    title: "the same job, other placements: what the network carries per GPU per step",
    head: ["placement", "crosses the network", "time at 400 Gb/s"],
    rows: [
      ["this one (PP across servers)", `${mib(netBytes)} of PP`, `${num(ms(ppPerGpu, NIC_GBS), 2)} ms per handoff`],
      ["DP across servers, PP inside", `${gib(dpSend)} of DP`, `${num(ms(dpSend, NIC_GBS))} ms, partly overlapped`],
      ["TP group split 2 + 2 over two servers", `${gib(tpSplitNic)} of TP through each NIC`, `${num(ms(tpSplitNic, NIC_GBS) / 1000, 1)} s, blocking`],
    ],
    tones: [undefined, "compare", "danger"],
  });
  fab.note(
    `Placement decides what the fabric sees. If each server held a whole replica (both stages), each GPU's ${gib(dpSend)} of gradients would cross its rail every step, ${num(ms(dpSend, NIC_GBS))} ms at 400 Gb/s, only partly hidden behind the last backward pass. A TP group split two and two over the servers sends the same ${gib(tpPerStep)} per GPU per step, but half of each ring's hops now cross servers: spread over both GPUs' NICs on each side, about ${gib(tpSplitNic)} goes through every NIC at ${NIC_GBS} GB/s instead of NVLink's ${NVLINK_GBS}, putting about ${num(ms(tpSplitNic, NIC_GBS) / 1000, 1)} s of blocking all-reduce on the critical path.`,
    "placement",
  );

  fab.note(
    `At the scale of the full 1,024-GPU cluster the same rules hold: TP stays inside each 8-GPU server, while PP and DP span servers. The DP all-reduce, gigabytes per GPU at the same moment every step, is the elephant traffic the back-end fabric is built for, and expert parallelism in mixture-of-experts models adds all-to-all exchanges, every GPU sending to every other, the hardest pattern a fabric carries.`,
    "scale",
  );
  return fab.f.done();
};

// ---------- ring-allreduce ----------

/**
 * `ring-allreduce` (lesson 07-03). Four ranks, GPU0 of srv001..srv004 on
 * rail1-leaf1.sjc (physically a star through the leaf; NCCL's logical ring
 * rank 0 → 1 → 2 → 3 → 0 is drawn dashed). Each holds a 400 MB gradient
 * vector in four 100 MB chunks; one sample element per chunk is shown, with
 * rank r's value (c+1)·10^r so every digit of a partial sum shows which ranks
 * have contributed. Reduce-scatter: in step k rank r sends chunk (r-k) mod n
 * to rank r+1, which adds it; after n-1 steps rank r owns the complete chunk
 * (r+1) mod n. All-gather: n-1 more steps forward the complete chunks. Each
 * step moves one 100 MB chunk per rank (2 ms at 400 Gb/s); in total each rank
 * sends 2(n-1)/n x 400 MB = 600 MB in 12 ms. Closes with the alternatives,
 * the 2(n-1)/n curve, and algorithm vs bus bandwidth.
 *
 * Inputs: `gpus` 3-6 (default 4), the number of ranks. 13 frames with 4
 * ranks (2(n-1) + 7 in general).
 */
export const ringAllreduce: FabGen = (input) => {
  const n = int(input.gpus, 3, 6, 4);
  const S = 400; // MB
  const chunk = S / n;
  const stepMs = chunk / NIC_GBS; // MB / (GB/s) = ms
  const fmt = (x: number) => num(x, Number.isInteger(Math.round(x * 10) / 10) ? 0 : 1);
  const leaf = railLeaf(1);
  const id = (r: number) => `${srv(r + 1)}.gpu0`;
  const ranks = Array.from({ length: n }, (_, r) => r);
  const pos = (r: number): [number, number] => {
    if (n === 4) return ([[20, 0], [80, 0], [80, 100], [20, 100]] as [number, number][])[r]!;
    const phi = -Math.PI / 2 - Math.PI / n + (2 * Math.PI * r) / n;
    return [Math.round((50 + 45 * Math.cos(phi)) * 10) / 10, Math.round((50 + 50 * Math.sin(phi)) * 10) / 10];
  };
  const fab = new Fab(
    [{ id: leaf, kind: "leaf", x: 50, y: 50 }, ...ranks.map((r): NodeSpec => ({ id: id(r), label: `rank ${r}`, kind: "gpu", x: pos(r)[0], y: pos(r)[1], state: srv(r + 1) }))],
    [...ranks.map((r): LinkSpec => [id(r), leaf, { tone: "muted" }]), ...ranks.map((r): LinkSpec => [id(r), id((r + 1) % n), { dashed: true, label: "ring" }])],
  );
  // v[r][c]: rank r's sample element of chunk c.
  const v = ranks.map((r) => ranks.map((c) => (c + 1) * 10 ** r));
  const total = ranks.map((c) => ranks.reduce((s, r) => s + (c + 1) * 10 ** r, 0));
  const chunkTable = () =>
    fab.table(0, {
      title: `one sample element per ${fmt(chunk)} MB chunk`,
      head: ["rank", ...ranks.map((c) => `chunk ${c}`)],
      rows: ranks.map((r) => [`rank ${r}`, ...v[r]!.map(String)]),
    });
  const ringLinks = (tone?: "active" | "done") => {
    for (const r of ranks) fab.linkSet(id(r), id((r + 1) % n), { tone, width: tone ? 0.5 : 0 });
  };
  let sent = 0;
  const totals = total.map(String).join(", ");

  chunkTable();
  fab.set({ ranks: n, "vector per rank": `${S} MB = ${n} chunks of ${fmt(chunk)} MB` });
  fab.note(
    `${Word(n)} ranks of a training job, GPU0 of srv001 to ${srv(n)}, each on the rail-1 leaf at 400 Gb/s, each with a ${S} MB gradient vector split into ${n} chunks of ${fmt(chunk)} MB. The table shows one sample element per chunk; all-reduce must leave every rank holding the element-wise sums, ${totals}.`,
    "setup",
  );

  fab.note(
    `NCCL arranges the ranks in a logical ring, rank ${ranks.join(" → ")} → 0 (dashed); each hop physically runs NIC → ${leaf} → NIC. In every step each rank sends one chunk to its right-hand neighbour and receives one from its left, so every link is busy in both directions at once; real NCCL also cuts each chunk into small slices and pipelines them, which overlaps the steps without changing the byte count.`,
    "ring",
  );

  const exchange = (phase: "rs" | "ag", k: number) => {
    const moves = ranks.map((r) => {
      const c = phase === "rs" ? (((r - k) % n) + n) % n : (((r + 1 - k) % n) + n) % n;
      return { from: r, to: (r + 1) % n, c, value: v[r]![c]! };
    });
    const before = moves.map((m) => v[m.to]![m.c]!);
    moves.forEach((m, i) => (v[m.to]![m.c] = phase === "rs" ? before[i]! + m.value : m.value));
    sent += chunk;
    return moves.map((m, i) => ({ ...m, before: before[i]!, after: v[m.to]![m.c]! }));
  };

  for (let k = 0; k < n - 1; k++) {
    const moves = exchange("rs", k);
    chunkTable();
    fab.table(1, {
      title: `reduce-scatter step ${k + 1}: receive and add`,
      head: ["transfer", "chunk", "received", "result"],
      rows: moves.map((m) => [`rank ${m.from} → ${m.to}`, `${m.c}`, String(m.value), `${m.before} + ${m.value} = ${m.after}`]),
    });
    ringLinks("active");
    fab.set({ "sent per rank": `${fmt(sent)} MB`, elapsed: `${fmt(stepMs * (k + 1))} ms` });
    const ex = moves.find((m) => m.c === 0)!;
    fab.packets(
      moves.map((m) => ({ from: id(m.from), to: id(m.to), label: `chunk ${m.c}` })),
      k === 0
        ? `Reduce-scatter, step 1 of ${n - 1}: rank r sends chunk r to rank r+1, which adds it to its own copy, so rank 1 turns chunk 0 into 10 + 1 = 11. Each transfer is ${fmt(chunk)} MB, so at 400 Gb/s the step takes ${fmt(stepMs)} ms.`
        : k < n - 2
          ? `Step ${k + 1} of ${n - 1}: each rank forwards the partial sum it just made one place further round the ring, so rank ${ex.from} sends chunk 0 (${ex.value}) to rank ${ex.to}, which adds its own ${ex.before} to make ${ex.after}.`
          : `Step ${k + 1} of ${n - 1} completes the sums: rank ${ex.to} adds the last contribution to chunk 0 and holds ${ex.after}, the total over all ${n} ranks, and every other rank now completes one other chunk the same way.`,
      "reduce-scatter",
    );
  }

  ringLinks();
  fab.table(1, undefined);
  const owners = ranks.map((r) => `rank ${r} chunk ${(r + 1) % n}`).join(", ");
  fab.set({ "after reduce-scatter": owners });
  fab.note(
    `Reduce-scatter is done after n − 1 = ${n - 1} steps: each rank owns one fully reduced chunk (${owners}) and has sent ${n - 1} × ${fmt(chunk)} MB = ${fmt(sent)} MB, (n − 1)/n of its data. Stopping here is a collective in its own right, reduce-scatter, which sharded optimisers such as ZeRO and FSDP use.`,
    "reduce-scatter",
  );

  for (let k = 0; k < n - 1; k++) {
    const moves = exchange("ag", k);
    chunkTable();
    fab.table(1, {
      title: `all-gather step ${k + 1}: receive and overwrite`,
      head: ["transfer", "chunk", "was", "now"],
      rows: moves.map((m) => [`rank ${m.from} → ${m.to}`, `${m.c}`, String(m.before), String(m.after)]),
    });
    ringLinks("done");
    fab.set({ "sent per rank": `${fmt(sent)} MB`, elapsed: `${fmt(stepMs * (n + k))} ms` });
    const ex = moves.find((m) => m.c === 0)!;
    fab.packets(
      moves.map((m) => ({ from: id(m.from), to: id(m.to), label: `chunk ${m.c}`, tone: "done" as const })),
      k === 0
        ? `All-gather, step 1 of ${n - 1}: each rank sends its complete chunk to the right, and the receiver overwrites its partial value instead of adding: rank ${ex.from} sends chunk 0 = ${ex.value} to rank ${ex.to}.`
        : k < n - 2
          ? `Step ${k + 1} of ${n - 1}: the complete chunks move one more place round the ring, so chunk 0 = ${ex.value} reaches rank ${ex.to} and each rank now holds ${k + 2} of the ${n} totals.`
          : `Step ${k + 1} of ${n - 1}: the last complete chunks arrive, and every rank holds all ${n} totals.`,
      "all-gather",
    );
  }

  ringLinks();
  fab.table(1, undefined);
  for (const r of ranks) fab.tone(id(r), "done");
  const factor = (2 * (n - 1)) / n;
  const totalMs = 2 * (n - 1) * stepMs;
  fab.set({ "sent per rank": `${fmt(sent)} MB = 2(n−1)/n × ${S} MB`, elapsed: `${fmt(totalMs)} ms` });
  fab.note(
    `Every rank holds ${totals} after 2(n − 1) = ${2 * (n - 1)} steps. Each sent ${2 * (n - 1)} × ${fmt(chunk)} MB = ${fmt(sent)} MB, which is 2(n − 1)/n = ${trim(factor)} times the ${S} MB vector, and at 400 Gb/s the whole all-reduce took ${fmt(totalMs)} ms.`,
    "done",
  );

  const naive = (n - 1) * S;
  fab.table(1, {
    title: `ways to all-reduce ${S} MB over ${n} ranks at 400 Gb/s`,
    head: ["method", "bytes sent per rank", "time"],
    rows: [
      ["everyone sends to everyone", `${num(naive)} MB`, `${fmt(naive / NIC_GBS)} ms`],
      ["sum at rank 0, send back", `rank 0: ${num(naive)} MB in, ${num(naive)} MB out`, `≥ ${fmt(naive / NIC_GBS)} ms`],
      ["ring", `${fmt(sent)} MB`, `${fmt(totalMs)} ms`],
    ],
    tones: [undefined, undefined, "done"],
  });
  fab.note(
    `The obvious alternatives cost more. Sending every vector to every other rank makes each rank send ${num(naive)} MB, and funnelling them all through rank 0 puts ${num(naive)} MB into rank 0's one link: at least ${fmt(naive / NIC_GBS)} ms either way, while the ring keeps every link equally busy and finishes in ${fmt(totalMs)} ms.`,
    "compare",
  );

  const ns = Array.from({ length: 15 }, (_, i) => i + 2);
  fab.chart({ title: "bytes each rank sends, as a multiple of the vector size", yMax: 2.2, xLabel: "ranks n = 2 … 16", series: [{ name: "2(n−1)/n", tone: "active", points: ns.map((m) => Math.round(((2 * (m - 1)) / m) * 1000) / 1000) }], marks: [{ y: 2, label: "limit: 2", tone: "compare" }] });
  fab.note(
    `The factor 2(n − 1)/n barely grows: 1.5 for 4 ranks, 1.75 for 8, 1.998 for 1,024, so per-rank traffic stays under twice the data however large the ring. What grows is the number of steps, 2(n − 1), each paying a fixed latency, which is why NCCL prefers tree or hierarchical algorithms for small messages at scale.`,
    "scale",
  );

  const alg = S / totalMs; // MB/ms = GB/s
  fab.set({ "algorithm bandwidth": `${trim(alg, 1)} GB/s`, "bus bandwidth": `${trim(alg * factor, 1)} GB/s` });
  fab.note(
    `nccl-tests reports two numbers: algorithm bandwidth is data size over time, ${S} MB / ${fmt(totalMs)} ms = ${trim(alg, 1)} GB/s, and bus bandwidth multiplies it by 2(n − 1)/n to get ${trim(alg * factor, 1)} GB/s, the rate each link actually ran at. Bus bandwidth is the one to compare with the NIC's ${NIC_GBS} GB/s whatever the number of ranks, and a healthy real run lands a little below it, because headers and protocol overhead take a few percent.`,
    "busbw",
  );
  return fab.f.done();
};

// ---------- scale-up-vs-out ----------

/**
 * `scale-up-vs-out` (lesson 07-04). The same 1 GiB moved two ways from GPU0
 * of srv001: to GPU1 of the same server over NVLink through the NVSwitch
 * (450 GB/s each way, about 2.4 ms), and to GPU0 of srv002 through the PCIe
 * switch, the 400 Gb/s ConnectX-7 NIC, rail1-leaf1.sjc and the far NIC with
 * GPUDirect RDMA at both ends (50 GB/s, about 21.5 ms). A comparison table
 * (bandwidth, transfer time, latency, devices on the path, reach), an
 * alpha-beta chart of effective bandwidth against message size (fixed costs of
 * 1 us and 3 us, stated as assumptions), what happens without GPUDirect, and
 * how a larger scale-up domain (NVL72) changes what the network carries.
 *
 * Inputs: none. 12 frames.
 */
export const scaleUpVsOut: FabGen = () => {
  const A0 = `${srv(1)}.gpu0`;
  const A1 = `${srv(1)}.gpu1`;
  const B0 = `${srv(2)}.gpu0`;
  const B1 = `${srv(2)}.gpu1`;
  const nvA = `nvswitch.${srv(1)}`;
  const nvB = `nvswitch.${srv(2)}`;
  const pcA = `pcie.${srv(1)}`;
  const pcB = `pcie.${srv(2)}`;
  const nicA = `${srv(1)}.nic0`;
  const nicB = `${srv(2)}.nic0`;
  const leaf = railLeaf(1);
  const fab = new Fab(
    [
      { id: A1, label: "GPU1", kind: "gpu", x: 8, y: 0, state: "srv001" },
      { id: nvA, label: "NVSwitch", kind: "switch", x: 8, y: 30 },
      { id: A0, label: "GPU0", kind: "gpu", x: 8, y: 60, state: "srv001" },
      { id: pcA, label: "PCIe sw", kind: "switch", x: 28, y: 60 },
      { id: nicA, label: "NIC0", kind: "nic", x: 28, y: 80, state: "400 Gb/s" },
      { id: leaf, kind: "leaf", x: 50, y: 100 },
      { id: nicB, label: "NIC0", kind: "nic", x: 72, y: 80, state: "400 Gb/s" },
      { id: pcB, label: "PCIe sw", kind: "switch", x: 72, y: 60 },
      { id: B0, label: "GPU0", kind: "gpu", x: 92, y: 60, state: "srv002" },
      { id: nvB, label: "NVSwitch", kind: "switch", x: 92, y: 30, tone: "muted" },
      { id: B1, label: "GPU1", kind: "gpu", x: 92, y: 0, state: "srv002", tone: "muted" },
    ],
    [
      [A0, nvA, { label: "NVLink" }],
      [nvA, A1, { label: "NVLink" }],
      [A0, pcA],
      [pcA, nicA],
      [nicA, leaf, { label: "400G" }],
      [leaf, nicB, { label: "400G" }],
      [nicB, pcB],
      [pcB, B0],
      [B0, nvB, { tone: "muted" }],
      [nvB, B1, { tone: "muted" }],
    ],
  );
  const PCIE_GBS = (32 * 16 * (128 / 130)) / 8; // Gen 5 x16, each way
  const upMs = (GiB / (NVLINK_GBS * 1e9)) * 1000;
  const outMs = (GiB / (NIC_GBS * 1e9)) * 1000;
  const FRAME = 4096 + 12 + 4 + 8 + 20 + 14 + 4; // payload, BTH, ICRC, UDP, IPv4, Ethernet, FCS
  const serNs = (FRAME * 8) / NIC_GBPS;
  const cmp: (string | number)[][] = [];
  const cmpTable = () => fab.table(0, { title: "1 GiB from srv001 GPU0", head: ["", "to GPU1, same server", "to srv002 GPU0"], rows: cmp });

  fab.note(
    `Two servers of Meridian's San Jose cluster. Inside srv001, GPU0 and GPU1 connect through the NVSwitch; GPU0 also sits under a PCIe switch with its own 400 Gb/s ConnectX-7 NIC on the rail-1 leaf, and srv002 is built the same way.`,
    "topology",
  );

  fab.path([A0, nvA, A1]);
  fab.tone(A0, "active");
  fab.send(
    A0,
    nvA,
    "1 GiB over NVLink",
    `Scale-up first: GPU0 copies 1 GiB into GPU1's memory. NVLink carries the GPUs' own memory reads and writes as small hardware packets, so this is a memory copy through the NVSwitch: no NIC, no IP or transport headers and no network protocol stack.`,
  );
  cmp.push(["bandwidth each way", `${NVLINK_GBS} GB/s (NVLink 4)`, ""]);
  cmp.push(["1 GiB takes", `${num(upMs, 1)} ms`, ""]);
  cmpTable();
  fab.tone(A1, "done");
  fab.send(
    nvA,
    A1,
    "1 GiB over NVLink",
    `Each H100-class GPU has 18 NVLink 4 links, 900 GB/s in total or ${NVLINK_GBS} GB/s each way, so the 1 GiB arrives in about ${num(upMs, 1)} ms. Through the NVSwitch every one of the server's eight GPUs can reach every other at that rate.`,
    { tone: "done" },
  );

  fab.clearPath();
  fab.tone(A1, undefined);
  fab.path([A0, pcA]);
  fab.send(
    A0,
    pcA,
    "GPUDirect read",
    `Scale-out next: the same 1 GiB to GPU0 of srv002. With GPUDirect RDMA the NIC reads straight from GPU memory through the PCIe switch the two share, with no copy into the CPU's memory, and PCIe Gen 5 x16 carries about ${num(PCIE_GBS)} GB/s each way, more than the NIC needs.`,
  );

  fab.path([A0, pcA, nicA]);
  fab.state(nicA, "packetising", "active");
  fab.send(
    pcA,
    nicA,
    "1 GiB by DMA",
    `The NIC cuts the data into RoCEv2 packets of 4,096 bytes of payload, ${num(GiB / 4096)} of them for 1 GiB, and sends them at 400 Gb/s, ${NIC_GBS} GB/s: one ninth of NVLink's ${NVLINK_GBS} GB/s.`,
  );

  fab.state(nicA, "400 Gb/s", "done");
  fab.path([A0, pcA, nicA, leaf]);
  fab.send(
    nicA,
    leaf,
    "RoCEv2 packets",
    `On the wire each frame of about ${num(FRAME)} bytes takes ${num(serNs)} ns to serialise at 400 Gb/s, and light covers the few metres of cable at about 5 ns per metre. The rail-1 leaf forwards each packet on its destination IP address; it does not know a GPU is behind the NIC.`,
  );

  fab.path([A0, pcA, nicA, leaf, nicB]);
  fab.send(
    leaf,
    nicB,
    "RoCEv2 packets",
    `The leaf adds its own forwarding delay, a few hundred nanoseconds to about a microsecond depending on the switch chip, and far more if a queue has built up. srv002's NIC then checks each packet's sequence number, and the remote memory key carried in the first packet of each message, the transport work lesson 07-05 traces.`,
  );

  fab.path([A0, pcA, nicA, leaf, nicB, pcB, B0]);
  fab.tone(B0, "done");
  cmp[0]![2] = `${NIC_GBS} GB/s (400 Gb/s NIC)`;
  cmp[1]![2] = `${num(outMs, 1)} ms`;
  cmpTable();
  fab.send(
    pcB,
    B0,
    "GPUDirect write",
    `srv002's NIC writes the payload through its PCIe switch straight into GPU0's memory, GPUDirect RDMA again. The whole 1 GiB takes about ${num(outMs, 1)} ms at ${NIC_GBS} GB/s, nine times NVLink's ${num(upMs, 1)} ms.`,
    { tone: "done" },
  );

  cmp.push(["small-message latency", "≈ 1 µs", "a few µs idle, more when queued"]);
  cmp.push(["devices on the path", "NVSwitch", "PCIe sw, NIC, leaf, NIC, PCIe sw"]);
  cmp.push(["reach", "8 GPUs in one server", "all 1,024 GPUs"]);
  cmpTable();
  fab.note(
    `Side by side: NVLink gives each GPU nine times the bandwidth and lower latency, but only to the eight GPUs in its server. The NIC and the fabric reach all 1,024 GPUs in the cluster at a ninth of the rate, through five devices instead of one, and each extra switch tier adds latency.`,
    "compare",
  );

  const sizes = Array.from({ length: 11 }, (_, k) => 1024 * 4 ** k);
  const eff = (bytes: number, alphaUs: number, gbs: number) => Math.round((bytes / (alphaUs * 1e-6 + bytes / (gbs * 1e9)) / 1e9) * 10) / 10;
  fab.chart({
    title: "effective bandwidth by message size (alpha-beta model)",
    unit: "GB/s",
    yMax: 500,
    xLabel: "message size 1 KiB … 1 GiB, ×4 per point",
    series: [
      { name: "NVLink (α = 1 µs)", tone: "done", points: sizes.map((b) => eff(b, 1, NVLINK_GBS)) },
      { name: "network (α = 3 µs)", tone: "active", points: sizes.map((b) => eff(b, 3, NIC_GBS)) },
    ],
    marks: [{ y: NVLINK_GBS, label: "450 GB/s", tone: "done" }],
  });
  fab.note(
    `How fast a transfer really goes depends on its size: with an assumed fixed cost of 1 µs per NVLink transfer and 3 µs per network transfer, 1 MiB reaches ${num(eff(MiB, 1, NVLINK_GBS))} GB/s on NVLink and ${num(eff(MiB, 3, NIC_GBS))} GB/s on the network, and messages of a few kilobytes are latency-bound on both. The faster link needs the bigger message to fill it: the network comes within a few percent of its peak from about 4 MiB, NVLink only from about 16 MiB.`,
    "alpha-beta",
  );

  fab.chart(undefined);
  fab.note(
    `Without GPUDirect RDMA the data would first be copied from GPU memory into the CPU's memory and the NIC would read it from there, adding a copy and an extra PCIe crossing at each end. A NIC under the wrong PCIe switch or CPU socket has a similar effect, a classic reason a fresh cluster misses line rate (lesson 07-10).`,
    "pcie",
  );

  fab.note(
    `The scale-up domain keeps growing: an NVL72 rack joins 72 GPUs with NVLink 5 at 1.8 TB/s per GPU in total, so tensor and expert parallelism can span 72 GPUs instead of 8. The network then carries only what crosses racks, mostly data and pipeline parallelism, but each GPU's network link is still about a ninth of its NVLink or less, so placement keeps mattering.`,
    "scale",
  );
  return fab.f.done();
};

// ---------- rdma-write ----------

/**
 * `rdma-write` (lesson 07-05). Moving 1 MiB from an app on srv001 to an app
 * on srv002 (GPU0's NICs on rail 1, 10.3.1.1 and 10.3.1.3, via
 * rail1-leaf1.sjc), first with a TCP socket: send() system call, copy into
 * kernel socket buffers, NIC DMA, interrupt and the kernel stack on the far
 * side, recv() and a second copy. Then with RDMA: memory registration (lkey,
 * rkey), an RC queue pair taken RESET → INIT → RTR → RTS, a work request posted
 * with a doorbell (no system call), the NIC building 256 RoCEv2 packets
 * (BTH opcode RDMA WRITE First/Middle/Last, PSN 0x004e20..0x004f1f, RETH with
 * VA, rkey and length), the leaf routing them on IP (TTL 64 → 63), the remote
 * NIC checking QP, PSN and rkey and writing into memory with no CPU involved,
 * the ACK (opcode 0x11, AETH) and the completion polled from the CQ. A tally
 * table compares the two paths.
 *
 * Inputs: none. 19 frames.
 */
export const rdmaWrite: FabGen = () => {
  const appA = `${srv(1)}.app`;
  const kerA = `${srv(1)}.kernel`;
  const nicA = `${srv(1)}.nic0`;
  const appB = `${srv(2)}.app`;
  const kerB = `${srv(2)}.kernel`;
  const nicB = `${srv(2)}.nic0`;
  const leaf = railLeaf(1);
  const ipA = backendIp(1, 0);
  const ipB = backendIp(2, 0);
  const fab = new Fab(
    [
      { id: appA, label: "srv001 app", kind: "host", x: 12, y: 0, state: "1 MiB buffer" },
      { id: kerA, label: "srv001 kernel", kind: "cpu", x: 36, y: 40 },
      { id: nicA, label: "srv001 NIC", kind: "nic", x: 12, y: 75, state: ipA },
      { id: leaf, kind: "leaf", x: 50, y: 100 },
      { id: nicB, label: "srv002 NIC", kind: "nic", x: 88, y: 75, state: ipB },
      { id: kerB, label: "srv002 kernel", kind: "cpu", x: 64, y: 40 },
      { id: appB, label: "srv002 app", kind: "host", x: 88, y: 0, state: "1 MiB buffer" },
    ],
    [
      [appA, kerA, { label: "syscall" }],
      [kerA, nicA, { label: "driver" }],
      [nicA, leaf, { label: "400G" }],
      [leaf, nicB, { label: "400G" }],
      [nicB, kerB, { label: "driver" }],
      [kerB, appB, { label: "syscall" }],
    ],
  );
  const tally = { syscalls: 0, copies: 0, interrupts: 0 };
  const tcpTable = () =>
    fab.table(0, {
      title: "TCP path, 1 MiB so far",
      head: ["cost", "count"],
      rows: [
        ["system calls", tally.syscalls],
        ["data copies by a CPU", tally.copies],
        ["interrupts (coalesced)", tally.interrupts === 0 ? "0" : "≥ 1"],
      ],
    });

  fab.note(
    `Two servers of the San Jose cluster, each drawn as an app in user space, the kernel and the NIC (GPU0's 400 Gb/s NIC, illustrative back-end addresses ${ipA} and ${ipB}, behind the rail-1 leaf). The job is to move 1 MiB from the app on srv001 into the app's buffer on srv002, first through a TCP socket, then with an RDMA WRITE.`,
    "topology",
  );

  // ----- TCP -----
  tally.syscalls = 1;
  tcpTable();
  fab.path([appA, kerA]);
  fab.send(appA, kerA, "send() 1 MiB", `The ordinary way first: srv001's app calls send() on a TCP socket with its 1 MiB buffer. That is a system call, so the CPU switches from user mode into the kernel.`);

  tally.copies = 1;
  tcpTable();
  fab.state(kerA, "copy 1 MiB", "active");
  fab.note(
    `The kernel copies the 1 MiB from the app's buffer into socket buffers it owns (copy 1), so the app may reuse its buffer as soon as send() returns. TCP numbers the bytes and builds the TCP and IP headers, handing the NIC large chunks that the NIC splits into packets (segmentation offload).`,
    "copy",
  );

  fab.state(kerA, undefined, undefined);
  tally.interrupts = 1;
  tcpTable();
  fab.path([appA, kerA, nicA, leaf]);
  fab.send(kerA, nicA, "TCP segments", `The driver gives the NIC descriptors pointing at those kernel buffers; the NIC reads them by DMA, puts the packets on the wire towards srv002 through the rail-1 leaf and raises a completion interrupt so the driver can release the descriptors. The kernel keeps the data until srv002's ACKs arrive, in case it must retransmit.`);

  fab.path([appA, kerA, nicA, leaf, nicB, kerB]);
  fab.state(kerB, "TCP/IP stack", "active");
  fab.send(
    nicB,
    kerB,
    "interrupt",
    `On srv002 the NIC writes the arriving packets into kernel memory and raises an interrupt; the kernel's network stack (NAPI polling, IP, TCP) checks them, puts the bytes in order on the socket and sends ACKs back to srv001 (lesson 01-09 traces this path).`,
  );

  tally.syscalls = 2;
  tally.copies = 2;
  tcpTable();
  fab.state(kerB, undefined, undefined);
  fab.path([appA, kerA, nicA, leaf, nicB, kerB, appB]);
  fab.state(appB, "data received", "done");
  fab.send(kerB, appB, "recv() copy", `srv002's app calls recv(), a second system call, and the kernel copies the bytes from its socket buffer into the app's buffer (copy 2). Only now can the app use the data.`, { tone: "done" });

  fab.clearPath();
  fab.state(appB, "1 MiB buffer");
  fab.tones([appB, kerA, kerB], undefined);
  fab.note(
    `The TCP path cost two CPU copies of every byte, at least two system calls, interrupts and full TCP/IP processing on both CPUs. Even with offloads one CPU core typically manages a few tens of Gb/s of TCP, so feeding a 400 Gb/s NIC this way takes many cores, and each pass through the kernel adds microseconds.`,
    "tcp-cost",
  );

  // ----- RDMA setup -----
  const vaA = "0x7f1c40000000";
  const vaB = "0x7f3a2c000000";
  const lkey = "0x0004d2e1";
  const rkey = "0x00a1b2c3";
  const qpA = "0x000112";
  const qpB = "0x0001a7";
  const psn0 = 0x004e20;
  const PKTS = MiB / 4096;
  const psnLast = psn0 + PKTS - 1;
  const hex6 = (x: number) => `0x${x.toString(16).padStart(6, "0")}`;
  fab.link(appA, nicA, { dashed: true, label: "verbs" });
  fab.link(appB, nicB, { dashed: true, label: "verbs" });
  fab.table(0, {
    title: "registered memory regions",
    head: ["server", "address (VA)", "length", "keys", "access"],
    rows: [
      ["srv001", vaA, "1 MiB", `lkey ${lkey}`, "local read"],
      ["srv002", vaB, "1 MiB", `rkey ${rkey}`, "remote write"],
    ],
  });
  fab.tones([kerA, kerB], "active");
  fab.note(
    `Now RDMA. Once, at setup, each app registers its buffer with its NIC: the kernel pins the pages so they cannot move, gives the NIC their address translations and returns keys, an lkey for local use and an rkey that lets a remote NIC write into this buffer.`,
    "register",
  );

  fab.table(1, {
    title: "reliable-connected (RC) queue pairs",
    head: ["server", "QP number", "state", "peer QP", "start PSN"],
    rows: [
      ["srv001", qpA, "RTS", qpB, hex6(psn0)],
      ["srv002", qpB, "RTS", qpA, `expects ${hex6(psn0)}`],
    ],
  });
  fab.note(
    `Each side also creates a reliable-connected queue pair (QP): a send queue and a receive queue plus a completion queue, all in the app's memory, where the NIC reads and writes them directly. The apps swap their GIDs (for RoCEv2, the NICs' IP addresses), QP numbers, starting packet sequence numbers (PSN), buffer address and rkey over an ordinary TCP connection (or the RDMA connection manager), and step each QP through RESET, INIT, RTR (ready to receive: the peer's QP number, PSN and path MTU are set) and RTS (ready to send: the send PSN and the retry timers are set).`,
    "qp",
  );

  // ----- RDMA data path -----
  fab.tones([kerA, kerB], "muted");
  fab.table(1, {
    title: "work request posted to srv001's send queue",
    head: ["field", "value"],
    rows: [
      ["opcode", "IBV_WR_RDMA_WRITE"],
      ["local buffer", `${vaA}, 1,048,576 B, lkey ${lkey}`],
      ["remote buffer", `${vaB}, rkey ${rkey}`],
      ["flags", "IBV_SEND_SIGNALED (wr_id 7)"],
    ],
  });
  fab.path([appA, nicA], "active");
  fab.send(
    appA,
    nicA,
    "post WR + doorbell",
    `The data path starts here. srv001's app writes a work request into its send queue (RDMA WRITE of 1 MiB from ${vaA} to ${vaB} with rkey ${rkey}) and rings the NIC's doorbell, a single write to a NIC register mapped into the app's memory: no system call, no copy, the kernel is not involved.`,
  );

  const macNic = fab.portMac(nicA, leaf);
  const macLeafA = fab.portMac(leaf, nicA);
  const macLeafB = fab.portMac(leaf, nicB);
  const macNicB = fab.portMac(nicB, leaf);
  const roce = (o: { op: string; psn: number; ack: boolean; reth: boolean; ttl: number; dstMac: string; srcMac: string; len: number }): HeaderSpec[] => [
    { name: "Ethernet", size: 14, reader: "this link only", fields: { "dst MAC": o.dstMac, "src MAC": o.srcMac, EtherType: "0x0800 (IPv4)" } },
    { name: "IPv4", size: 20, reader: "every router (the leaf)", fields: { src: ipA, dst: ipB, DSCP: "26 (lossless class)", ECN: "10 (ECT(0))", TTL: o.ttl, protocol: "17 (UDP)", "total length": o.len } },
    { name: "UDP", size: 8, reader: "receiving NIC (port), ECMP hashes (src port)", fields: { "src port": 50593, "dst port": "4791 (RoCEv2)" } },
    { name: "BTH", size: 12, tone: "path", reader: "receiving NIC only", fields: { opcode: o.op, "dest QP": qpB, PSN: hex6(o.psn), "AckReq": o.ack ? 1 : 0, P_Key: "0xffff" } },
    ...(o.reth ? [{ name: "RETH", size: 16, tone: "path" as const, reader: "receiving NIC only", fields: { "virtual address": vaB, R_Key: rkey, "DMA length": "1,048,576" } }] : []),
    { name: "Payload", size: 4096, reader: "written into srv002's buffer", fields: { bytes: o.reth ? "0–4,095 of the buffer" : "last 4,096 of the buffer" } },
    { name: "ICRC", size: 4, reader: "receiving NIC", fields: { covers: "invariant fields, end to end" } },
  ];
  const first = { op: "0x06 RDMA WRITE First", psn: psn0, ack: false, reth: true, ttl: 64, dstMac: macLeafA, srcMac: macNic, len: 20 + 8 + 12 + 16 + 4096 + 4 };
  fab.headers(roce(first), "built by srv001's NIC");
  fab.state(nicA, "DMA read + build", "active");
  fab.clearPath();
  fab.set({ packets: `${PKTS} × 4,096 B`, PSNs: `${hex6(psn0)} … ${hex6(psnLast)}` });
  fab.note(
    `srv001's NIC reads the buffer by DMA and builds RoCEv2 packets itself: Ethernet, IPv4 with DSCP 26 for the lossless class, UDP to port 4791, then the InfiniBand base transport header (BTH) with destination QP ${qpB} and a PSN. 1 MiB at 4,096 bytes per packet is ${PKTS} packets, PSN ${hex6(psn0)} to ${hex6(psnLast)}.`,
    "build",
  );

  fab.state(nicA, ipA, "done");
  fab.path([nicA, leaf]);
  fab.at(`on the link srv001 NIC → ${leaf}`);
  fab.send(
    nicA,
    leaf,
    "WRITE First, PSN 0x004e20",
    `The first packet's opcode is RDMA WRITE First, and it carries an RDMA extended transport header (RETH): the remote address ${vaB}, rkey ${rkey} and the total length, 1,048,576 bytes. With the ICRC and the 4-byte Ethernet frame check sequence the frame is ${num(14 + first.len + 4)} bytes, so the back end must run a jumbo MTU (Meridian uses 9,216).`,
  );

  fab.patchHeader("IPv4", { TTL: 63 });
  fab.patchHeader("Ethernet", { "dst MAC": macNicB, "src MAC": macLeafB });
  fab.path([nicA, leaf, nicB]);
  fab.at(`on the link ${leaf} → srv002 NIC`);
  fab.send(
    leaf,
    nicB,
    "WRITE First, PSN 0x004e20",
    `${leaf} routes it like any UDP packet: it decrements the TTL to 63, rewrites both MACs and queues it in priority 3, the lossless class DSCP 26 selects. The InfiniBand headers inside mean nothing to the switch.`,
  );

  fab.at("inside srv002's NIC");
  fab.state(nicB, "check + DMA write", "active");
  fab.state(appB, "unaware", "muted");
  fab.table(1, {
    title: "srv002's NIC checks before writing",
    head: ["check", "result"],
    rows: [
      [`dest QP ${qpB} exists, in RTS`, "yes"],
      [`PSN ${hex6(psn0)} is the one expected`, "yes"],
      [`rkey ${rkey} allows remote write to ${vaB} + 1 MiB`, "yes"],
    ],
    tones: ["done", "done", "done"],
  });
  fab.note(
    `srv002's NIC checks that QP ${qpB} exists and is ready, that the PSN is the one it expects and that rkey ${rkey} allows remote writes to this address range, then DMA-writes the 4,096 bytes straight into the app's buffer. srv002's CPU does nothing: no interrupt, no system call, no copy, and the app is not even told.`,
    "write",
  );

  const lastPkt = { ...first, op: "0x08 RDMA WRITE Last", psn: psnLast, ack: true, reth: false, len: 20 + 8 + 12 + 4096 + 4 };
  fab.headers(roce(lastPkt), `on the link srv001 NIC → ${leaf}`);
  fab.table(1, undefined);
  fab.path([nicA, leaf, nicB]);
  fab.send(
    nicA,
    leaf,
    "WRITE Last, PSN 0x004f1f",
    `Packets 2 to ${PKTS - 1} are RDMA WRITE Middle with no RETH (the receiving NIC remembers the address from the first one), and the PSN rises by one each time. Packet ${PKTS}, PSN ${hex6(psnLast)}, is RDMA WRITE Last with the AckReq bit set, asking the responder to acknowledge.`,
  );

  fab.headers(
    [
      { name: "Ethernet", size: 14, reader: "this link only", fields: { "dst MAC": macLeafB, "src MAC": macNicB, EtherType: "0x0800 (IPv4)" } },
      { name: "IPv4", size: 20, reader: "every router (the leaf)", fields: { src: ipB, dst: ipA, DSCP: "26 (lossless class)", TTL: 64, protocol: "17 (UDP)" } },
      { name: "UDP", size: 8, reader: "receiving NIC", fields: { "src port": 61937, "dst port": "4791 (RoCEv2)" } },
      { name: "BTH", size: 12, tone: "path", reader: "receiving NIC only", fields: { opcode: "0x11 Acknowledge", "dest QP": qpA, PSN: hex6(psnLast) } },
      { name: "AETH", size: 4, tone: "path", reader: "receiving NIC only", fields: { syndrome: "ACK", MSN: 1 } },
      { name: "ICRC", size: 4, reader: "receiving NIC", fields: { covers: "invariant fields, end to end" } },
    ],
    "built by srv002's NIC",
  );
  fab.state(nicB, ipB, "done");
  fab.clearPath();
  fab.path([nicB, leaf, nicA], "done");
  fab.hop(
    [nicB, leaf, nicA],
    "ACK, PSN 0x004f1f",
    [
      `srv002's NIC answers with an Acknowledge packet (opcode 0x11) for PSN ${hex6(psnLast)}, whose ACK extended header (AETH) says ACK, message sequence number 1. The ACK is cumulative, covering every PSN up to that one, and on a reliable connection the NICs, not software, guarantee that every packet arrived once and in order.`,
      `The ACK crosses the leaf back to srv001's NIC. Had a packet gone missing, the responder would have sent a sequence-error NAK instead and the sender would resend everything from the missing PSN (go-back-N); had the ACK itself been lost, the sender's retry timer would have expired and it would have resent from the oldest unacknowledged PSN.`,
    ],
    {
      tone: "done",
      each: (i) => {
        fab.at(i === 0 ? `on the link srv002 NIC → ${leaf}` : `on the link ${leaf} → srv001 NIC`);
        if (i === 1) {
          fab.patchHeader("IPv4", { TTL: 63 });
          fab.patchHeader("Ethernet", { "dst MAC": macNic, "src MAC": macLeafA });
        }
      },
    },
  );

  fab.headers(undefined);
  fab.clearPath();
  fab.path([nicA, appA], "done");
  fab.state(appA, "CQE polled", "done");
  fab.table(1, {
    title: "completion queue entry, srv001",
    head: ["field", "value"],
    rows: [
      ["wr_id", "7"],
      ["status", "IBV_WC_SUCCESS"],
      ["opcode", "IBV_WC_RDMA_WRITE"],
    ],
    tones: [undefined, "done", undefined],
  });
  fab.send(
    nicA,
    appA,
    "completion (CQE)",
    `srv001's NIC writes a completion entry into the app's completion queue: wr_id 7, status IBV_WC_SUCCESS, opcode IBV_WC_RDMA_WRITE. The app finds it by polling that memory, again without the kernel, and may now reuse its buffer.`,
    { tone: "done" },
  );

  fab.clearPath();
  fab.tones([kerA, kerB], undefined);
  fab.state(appB, "1 MiB written", "done");
  fab.table(1, undefined);
  fab.table(0, {
    title: "moving 1 MiB: TCP vs RDMA WRITE (data path)",
    head: ["", "TCP socket", "RDMA WRITE"],
    rows: [
      ["system calls", "≥ 2 (send, recv)", "0"],
      ["CPU copies of the data", "2", "0"],
      ["interrupts", "yes, both sides", "0 (completion polled)"],
      ["receiving CPU involved", "yes, full TCP/IP stack", "no"],
      ["transport runs in", "kernel", "NIC hardware"],
      ["paid in advance", "nothing", "memory registration, QP setup"],
    ],
  });
  fab.note(
    `The RDMA WRITE moved 1 MiB with no CPU copies, no system calls and no interrupts on the data path, and the receiving CPU never ran, so a single core can drive the NIC at 400 Gb/s and small writes complete in a couple of microseconds. The costs moved elsewhere: registration and QP setup in advance, a remote app that must be told separately (a WRITE with immediate data, or a SEND), and a transport that wants a lossless network (lesson 07-07).`,
    "compare",
  );
  return fab.f.done();
};

export const scenarios: Record<string, FabGen> = {
  "training-step": trainingStep,
  incast,
  "parallelism-traffic": parallelismTraffic,
  "ring-allreduce": ringAllreduce,
  "scale-up-vs-out": scaleUpVsOut,
  "rdma-write": rdmaWrite,
};

export const labels: Record<string, string> = {
  "training-step": "A training step: compute, all-reduce, one straggler link",
  incast: "Incast: many senders, one egress queue, drops or pauses",
  "parallelism-traffic": "TP, PP and DP: what crosses NVLink and what crosses the network",
  "ring-allreduce": "Ring all-reduce: reduce-scatter then all-gather",
  "scale-up-vs-out": "Scale-up (NVLink) vs scale-out (NIC and fabric)",
  "rdma-write": "TCP send vs RDMA WRITE",
};
