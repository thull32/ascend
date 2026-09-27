// Scenario pack B for the `system` family: messaging, rate limiting,
// resilience patterns, eviction policies, batch and stream processing,
// change capture, and deployment strategies. Each scenario is a script over
// the `Sys` DSL in system-core.tsx; the renderer is shared.
//
// Inputs: every scenario accepts `{}`. Where the catalogue lists `nodes`,
// `keys` or `requests`, the scenario clamps them so the story still fits in
// 8–20 frames and a readable diagram. Rate limiters and caches are driven by
// a small fixed request schedule (optionally truncated by `requests` or
// replaced by `keys`) so every request's accept/reject or hit/miss decision
// gets its own frame.
import type { Tone } from "../primitives";
import { Sys, type SysGen } from "./system-core";

// ---------- helpers ----------

type Row = (string | number)[];

const clampInt = (v: unknown, lo: number, hi: number, def: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def;
};

/** Author-supplied keys (capped at `max`), padded from `def` up to `min` so a one-key input still tells the story. */
const keyList = (keys: unknown, def: string[], max: number, min = 1): string[] => {
  const given = Array.isArray(keys) ? keys.slice(0, max).map(String) : [];
  const out = [...given];
  for (const d of def) {
    if (out.length >= Math.max(min, given.length)) break;
    out.push(d);
  }
  return out.slice(0, max);
};

/** FNV-1a, same hash the core file uses, so partition numbers are stable across scenarios. */
const fnv = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/** Tiny deterministic RNG so jitter replays identically on every render. */
const lcg = (seed: number) => {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
};

/** Evenly spread `n` items across [lo, hi] (a single item sits in the middle). */
const spread = (n: number, lo: number, hi: number): number[] => Array.from({ length: n }, (_, i) => (n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (n - 1)));

/** Row tones for a decision log: the newest row is highlighted, older rows keep their verdict colour. */
const verdictTones = (verdicts: boolean[]): (Tone | undefined)[] => verdicts.map((ok, i) => (i === verdicts.length - 1 ? "active" : ok ? "done" : "danger"));

// ---------- messaging ----------

const messageQueue: SysGen = ({ requests }) => {
  const n = clampInt(requests, 3, 12, 12);
  const sys = new Sys([
    { id: "prod", label: "Producer", kind: "client", x: 8, y: 50 },
    { id: "q", label: "Queue", kind: "queue", x: 45, y: 40, state: "depth 0" },
    { id: "dlq", label: "Dead letters", kind: "queue", x: 45, y: 95, state: "0 messages" },
    { id: "w1", label: "Worker 1", kind: "service", x: 88, y: 20, state: "idle" },
    { id: "w2", label: "Worker 2", kind: "service", x: 88, y: 80, state: "idle" },
  ]);
  const msgs: { id: string; status: string; attempts: number }[] = [];
  const show = (hl?: string[]) =>
    sys.table({
      title: "Queue contents (visibility timeout 30 s, max receives 3)",
      head: ["message", "status", "attempts"],
      rows: msgs.map((m) => [m.id, m.status, m.attempts]),
      tones: msgs.map((m) => (hl?.includes(m.id) ? "active" : m.status === "acked" ? "done" : m.status === "dead" ? "danger" : undefined)),
    });
  const depth = () => msgs.filter((m) => m.status === "queued" || m.status.startsWith("in-flight")).length;
  const mid = (i: number) => `m${i + 1}`;
  const last = mid(n - 1);
  show();
  sys.set({ pattern: "work queue (competing consumers)", delivery: "at-least-once", "in flight": 0 });
  sys.note(`A message queue decouples a producer from its consumers in time and in rate: the producer enqueues and moves on; workers pull when they have capacity.`);
  for (let i = 0; i < n; i++) msgs.push({ id: mid(i), status: "queued", attempts: 0 });
  sys.state("q", `depth ${depth()}`, "compare");
  show(msgs.map((m) => m.id));
  sys.msg("prod", "q", `enqueue ${mid(0)}…${last}`, `The producer publishes a burst of ${n} messages; the broker persists each one and acknowledges immediately, so the producer never waits for processing.`, { tone: "active" });
  msgs[0]!.status = "in-flight (w1)";
  msgs[0]!.attempts = 1;
  sys.state("w1", `processing ${mid(0)}`, "active");
  sys.set({ "in flight": 1 });
  show([mid(0)]);
  sys.msg("q", "w1", `deliver ${mid(0)}`, `Worker 1 receives ${mid(0)}. The broker does not delete it; it hides it for a visibility timeout of 30 s so nobody else sees it while the worker works.`, { tone: "compare" });
  msgs[1]!.status = "in-flight (w2)";
  msgs[1]!.attempts = 1;
  sys.state("w2", `processing ${mid(1)}`, "active");
  sys.set({ "in flight": 2 });
  show([mid(1)]);
  sys.msg("q", "w2", `deliver ${mid(1)}`, `Worker 2 takes ${mid(1)}: two workers process in parallel, and each message goes to exactly one of them (competing consumers).`, { tone: "compare" });
  msgs[0]!.status = "acked";
  sys.state("w1", "idle", undefined);
  sys.state("q", `depth ${depth()}`, "compare");
  sys.set({ "in flight": 1, acked: 1 });
  show([mid(0)]);
  sys.msg("w1", "q", `ack ${mid(0)}`, `Worker 1 finishes and acknowledges: only now is ${mid(0)} deleted. Ack-after-work is what makes the queue durable against worker crashes.`, { tone: "done" });
  sys.state("w2", "CRASHED", "danger");
  show([mid(1)]);
  sys.note(`Failure mode: worker 2 crashes halfway through ${mid(1)}. No ack was sent, so the message is still in the queue, merely invisible.`, "crash");
  msgs[1]!.status = "in-flight (w1)";
  msgs[1]!.attempts = 2;
  sys.state("w1", `processing ${mid(1)} (retry)`, "active");
  show([mid(1)]);
  sys.msg("q", "w1", `redeliver ${mid(1)} (attempt 2)`, `The visibility timeout expires and ${mid(1)} becomes visible again; worker 1 receives it. This is at-least-once delivery: nothing is lost, but a message can be delivered twice.`, { tone: "compare" });
  msgs[1]!.status = "acked";
  sys.state("w1", "idle", undefined);
  sys.state("q", `depth ${depth()}`, "compare");
  sys.set({ "in flight": 0, acked: 2 });
  show([mid(1)]);
  sys.msg("w1", "q", `ack ${mid(1)}`, `If worker 2 had already charged the card before dying, the charge now happens twice. Consumers must be idempotent (dedupe on message id) because the queue cannot know how far the crashed worker got.`, { tone: "done" });
  if (n > 3) {
    for (let i = 2; i < n - 1; i++) {
      msgs[i]!.status = "acked";
      msgs[i]!.attempts = 1;
    }
    sys.set({ acked: n - 1 });
    sys.state("w2", "restarted · idle", undefined);
    sys.state("q", `depth ${depth()}`, "compare");
    show(msgs.slice(2, n - 1).map((m) => m.id));
    sys.fanout("q", ["w1", "w2"], `${mid(2)}…${mid(n - 2)}`, `Worker 2 restarts and both workers drain the backlog. Throughput scales by adding workers, but messages taken by different workers can complete in any order: the queue orders delivery, not completion.`, "compare", "drain");
  } else {
    sys.state("w2", "restarted · idle", undefined);
  }
  msgs[n - 1]!.status = "in-flight (w1)";
  msgs[n - 1]!.attempts = 1;
  sys.state("w1", `processing ${last}`, "active");
  show([last]);
  sys.msg("q", "w1", `deliver ${last}`, `${last} is a poison message: its payload makes the handler throw every time.`, { tone: "compare" });
  msgs[n - 1]!.status = "queued";
  sys.state("w1", "idle", "danger");
  show([last]);
  sys.msg("w1", "q", `nack ${last} (attempt 1 failed)`, `The worker rejects it; the broker makes it visible again and increments its receive count.`, { tone: "danger" });
  msgs[n - 1]!.status = "dead";
  msgs[n - 1]!.attempts = 3;
  sys.state("w1", "idle", undefined);
  sys.state("q", `depth ${depth()}`, undefined);
  sys.state("dlq", `1 message (${last})`, "danger");
  sys.set({ "dead-lettered": 1 });
  show([last]);
  sys.msg("q", "dlq", `${last} after 3 receives`, `After the max receive count (3) the broker moves ${last} to the dead-letter queue instead of retrying forever, which would block a worker permanently and hide the bug. Someone inspects and replays it by hand.`, { tone: "danger" });
  sys.set({ "watch": "queue depth and oldest-message age, not just throughput" });
  sys.note(`Trade-off: the queue buys temporal decoupling and elastic workers at the price of at-least-once semantics (idempotent consumers), loss of end-to-end ordering, and a backlog that can silently grow; alert on message age, because depth alone hides a stalled consumer.`, "done");
  return sys.f.done();
};

const pubsub: SysGen = ({ nodes }) => {
  const k = clampInt(nodes, 2, 4, 3);
  const subIds = Array.from({ length: k }, (_, i) => `S${i + 1}`);
  const subNames = ["Billing", "Email", "Analytics", "Audit"];
  const ys = spread(k, 15, 85);
  const sys = new Sys([
    { id: "pub", label: "Order service", kind: "client", x: 8, y: 50 },
    { id: "topic", label: "Topic: orders", kind: "queue", x: 45, y: 50, state: "0 subscribers" },
    ...subIds.map((id, i) => ({ id, label: subNames[i]!, kind: "service" as const, x: 88, y: ys[i]!, state: "not subscribed" })),
  ]);
  const slow = subIds[k - 1]!;
  const delivered: Record<string, number> = {};
  const pending: Record<string, string[]> = {};
  const show = (hl?: string) =>
    sys.table({
      title: "Subscriptions (durable: the broker keeps a per-subscriber backlog)",
      head: ["subscriber", "delivered", "pending backlog"],
      rows: subIds.map((s) => [`${s} ${subNames[subIds.indexOf(s)]}`, delivered[s] ?? 0, (pending[s] ?? []).join(", ") || "—"]),
      tones: subIds.map((s) => (s === hl ? "active" : (pending[s] ?? []).length > 0 ? "danger" : undefined)),
    });
  show();
  sys.set({ pattern: "publish / subscribe", fanout: `1 publish → ${k} deliveries`, "publisher knows": "the topic only" });
  sys.note(`Publish/subscribe: a publisher emits events to a topic; every subscriber gets its own copy. Unlike a work queue, a message is not consumed by one worker but broadcast to all interested parties.`);
  for (const s of subIds) {
    delivered[s] = 0;
    pending[s] = [];
    sys.state(s, "subscribed", "visited");
  }
  sys.state("topic", `${k} subscribers`, "compare");
  show();
  sys.fanin(subIds, "topic", "SUBSCRIBE orders", `Each consumer registers interest. The order service never learns who listens: adding a ${k + 1}th subscriber later needs no change to the publisher.`, "compare", "subscribe");
  sys.msg("pub", "topic", "publish OrderPlaced #1", `The order service publishes one event and returns as soon as the broker has it. It does not wait for billing, email, or analytics.`);
  for (const s of subIds) delivered[s] = 1;
  show();
  sys.fanout("topic", subIds, "OrderPlaced #1", `The broker fans the event out to all ${k} subscribers, each of which acks independently. One publish became ${k} deliveries.`, "done");
  sys.state(slow, "DOWN", "danger");
  sys.note(`Failure mode: ${subNames[k - 1]} (${slow}) goes offline. What happens to the events published while it is away depends entirely on the subscription type.`, "crash");
  sys.msg("pub", "topic", "publish OrderPlaced #2", `Event #2 is published while ${slow} is down.`);
  for (const s of subIds) if (s !== slow) delivered[s] = 2;
  pending[slow]!.push("#2");
  show(slow);
  sys.fanout("topic", subIds.filter((s) => s !== slow), "OrderPlaced #2", `The online subscribers get #2 at once. With an ephemeral subscription, ${slow} would simply miss it forever; with a durable subscription, the broker parks #2 in ${slow}'s backlog.`, "done");
  for (const s of subIds) if (s !== slow) delivered[s] = 3;
  pending[slow]!.push("#3");
  show(slow);
  sys.fanout("topic", subIds.filter((s) => s !== slow), "OrderPlaced #3", `Event #3 follows; ${slow}'s backlog grows to two. The broker now holds state per subscriber, which is exactly what makes the outage survivable and what costs it memory or disk.`, "done");
  sys.state(slow, "reconnected", "compare");
  delivered[slow] = 3;
  pending[slow] = [];
  show(slow);
  sys.msg("topic", slow, "#2, #3 (catch-up)", `${slow} reconnects and the broker replays its backlog in order. Nothing was lost, and the publisher never knew a subscriber was down.`, { tone: "done" });
  sys.set({ "backlog bound": "retention by time or size; then drop or block the publisher", "log-based variant": "Kafka: subscribers keep an offset into a shared log" });
  sys.note(`Failure mode two: a subscriber that is permanently slow accumulates an unbounded backlog and eventually exhausts the broker. Every broker has a retention policy (drop oldest, cap size, or push back on the publisher); log-based brokers sidestep the per-subscriber copy by letting each subscriber keep an offset into one shared log.`, "backlog");
  sys.note(`Trade-off: pub/sub decouples producers from an open-ended set of consumers, which makes adding features cheap, but the publisher can no longer see whether anything happened downstream; delivery is at-least-once per subscriber, so handlers must be idempotent, and ordering holds only within one subscriber's stream.`, "done");
  return sys.f.done();
};

// ---------- rate limiting ----------

const tokenBucket: SysGen = ({ requests }) => {
  const n = clampInt(requests, 5, 12, 10);
  const schedule = [0, 0, 0, 0, 0, 0, 0, 2, 3, 3, 3, 9];
  const cap = 5;
  const rate = 1;
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 8, y: 50 },
    { id: "limiter", label: "Rate limiter", kind: "lb", x: 50, y: 50, state: `tokens ${cap}/${cap}` },
    { id: "api", label: "API", kind: "service", x: 92, y: 50, state: "served 0" },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () => sys.table({ title: `Request log (bucket capacity ${cap}, refill ${rate} token/s)`, head: ["#", "t (s)", "tokens", "decision", "left"], rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  show();
  sys.set({ capacity: cap, "refill rate": `${rate} token/s`, accepted: 0, rejected: 0 });
  sys.note(`Token bucket: the bucket holds at most ${cap} tokens and gains ${rate} per second. A request takes one token; if none is left it is rejected. Capacity sets the largest burst, refill rate sets the sustained rate.`);
  let tokens = cap;
  let last = 0;
  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < n; i++) {
    const t = schedule[i]!;
    const refilled = Math.min(cap, tokens + (t - last) * rate);
    const gained = refilled - tokens;
    const refillNote = gained > 0 ? `${gained} token${gained === 1 ? "" : "s"} refilled since t=${last}s (${refilled} available). ` : "";
    tokens = refilled;
    last = t;
    if (tokens >= 1) {
      tokens -= 1;
      accepted += 1;
      rows.push([i + 1, t, tokens + 1, "accept", tokens]);
      verdicts.push(true);
      sys.state("limiter", `tokens ${tokens}/${cap}`, tokens === 0 ? "danger" : "done");
      sys.state("api", `served ${accepted}`, "done");
      sys.set({ accepted, rejected });
      show();
      sys.msg("limiter", "api", `#${i + 1} (t=${t}s)`, `Request #${i + 1} at t=${t}s: ${refillNote}Take one token → forwarded; ${tokens} left.`, { tone: "done" });
    } else {
      rejected += 1;
      rows.push([i + 1, t, 0, "reject", 0]);
      verdicts.push(false);
      sys.state("limiter", `tokens 0/${cap}`, "danger");
      sys.set({ accepted, rejected });
      show();
      sys.msg("limiter", "client", `#${i + 1} → 429`, `Request #${i + 1} at t=${t}s: ${refillNote}the bucket is empty → rejected with 429 and a Retry-After hint. The client, not the API, pays for the overload.`, { tone: "danger" });
    }
    if (sys.f.full) break;
  }
  sys.set({ "burst allowed": `${cap} at once`, "sustained": `${rate} req/s` });
  sys.note(`Failure mode: capacity too large lets a client dump ${cap}× the sustained rate on the API in one instant, so downstream must absorb that burst; capacity too small rejects legitimate bursty traffic such as a page that fires several API calls at once.`, "burst");
  sys.note(`Trade-off: token bucket allows bursts up to capacity while enforcing an average rate, needs only two numbers per client (tokens, last refill time), and is what most API gateways implement; compare the leaky bucket, which forbids bursts and smooths output instead.`, "done");
  return sys.f.done();
};

const leakyBucket: SysGen = ({ requests }) => {
  const n = clampInt(requests, 5, 12, 12);
  const schedule = [0, 0, 0, 0, 0, 0, 1, 1, 3, 3, 6, 6];
  const cap = 4;
  const leak = 1;
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 8, y: 50 },
    { id: "bucket", label: "Bucket (queue)", kind: "queue", x: 50, y: 50, state: `depth 0/${cap}` },
    { id: "server", label: "Server", kind: "service", x: 92, y: 50, state: `${leak} req/s out` },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () => sys.table({ title: `Request log (bucket size ${cap}, leaks ${leak} request/s to the server)`, head: ["#", "arrives", "depth", "decision", "served at"], rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  show();
  sys.set({ "bucket size": cap, "leak rate": `${leak} req/s`, queued: 0, dropped: 0 });
  sys.note(`Leaky bucket: requests pour into a bucket of size ${cap}, which leaks to the server at a constant ${leak} per second. Arrivals that find the bucket full spill over and are dropped. The output rate is perfectly steady no matter how bursty the input.`);
  let depth = 0;
  let last = 0;
  let queued = 0;
  let dropped = 0;
  for (let i = 0; i < n; i++) {
    const t = schedule[i]!;
    const leaked = Math.min(depth, (t - last) * leak);
    const leakNote = leaked > 0 ? `${leaked} request${leaked === 1 ? "" : "s"} leaked to the server since t=${last}s (depth ${depth - leaked}). ` : "";
    depth -= leaked;
    last = t;
    if (depth < cap) {
      const servedAt = t + depth / leak;
      depth += 1;
      queued += 1;
      rows.push([i + 1, `t=${t}s`, depth, "queue", `t=${servedAt}s`]);
      verdicts.push(true);
      sys.state("bucket", `depth ${depth}/${cap}`, depth === cap ? "danger" : "compare");
      sys.set({ queued, dropped });
      show();
      sys.msg("client", "bucket", `#${i + 1} (t=${t}s)`, `Request #${i + 1} at t=${t}s: ${leakNote}Room in the bucket → queued at position ${depth}; it will reach the server at t=${servedAt}s.`, { tone: "compare" });
    } else {
      dropped += 1;
      rows.push([i + 1, `t=${t}s`, depth, "drop", "—"]);
      verdicts.push(false);
      sys.state("bucket", `depth ${depth}/${cap} FULL`, "danger");
      sys.set({ queued, dropped });
      show();
      sys.msg("bucket", "client", `#${i + 1} → 429`, `Request #${i + 1} at t=${t}s: ${leakNote}the bucket is full (${cap}/${cap}) → dropped. Waiting would only add latency the client would not tolerate.`, { tone: "danger" });
    }
    if (sys.f.full) break;
  }
  sys.state("server", `${leak} req/s, evenly spaced`, "done");
  sys.msg("bucket", "server", "1 request per second", `Look at the "served at" column: the server receives exactly one request per second, regardless of the six that arrived together at t=0. Bursts are converted into queueing delay, not into load.`, { tone: "done" });
  sys.set({ "max added latency": `${cap - 1} s (bucket size ÷ leak rate)` });
  sys.note(`Failure mode: the bucket hides overload as latency. With size ${cap} and ${leak}/s, a queued request can wait up to ${cap - 1} s before it is even started; size the bucket by the delay you can accept, not by memory.`, "latency");
  sys.note(`Trade-off: leaky bucket gives a perfectly smooth output rate (ideal in front of a fragile downstream), whereas a token bucket lets short bursts through at full speed; as a pure meter with no queue, the two are mathematically the same and differ only in whether bursts are allowed.`, "done");
  return sys.f.done();
};

const slidingWindowLog: SysGen = ({ requests }) => {
  const n = clampInt(requests, 5, 12, 10);
  const schedule = [0, 2, 4, 7, 9, 11, 12, 15, 21, 24, 26, 27];
  const limit = 3;
  const win = 10;
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 8, y: 50 },
    { id: "limiter", label: "Rate limiter", kind: "lb", x: 50, y: 50, state: "log: []" },
    { id: "api", label: "API", kind: "service", x: 92, y: 50, state: "served 0" },
  ]);
  const log: number[] = [];
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () => sys.table({ title: `Request log (limit ${limit} per ${win} s, sliding)`, head: ["#", "t (s)", "window", "in log", "decision"], rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  show();
  sys.set({ limit: `${limit} per ${win} s`, "log entries": 0, accepted: 0, rejected: 0 });
  sys.note(`Sliding window log: keep the timestamp of every accepted request. On arrival at time t, drop timestamps older than t − ${win} s and accept only if fewer than ${limit} remain. Exact, with no boundary effects.`);
  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < n; i++) {
    const t = schedule[i]!;
    const before = log.length;
    while (log.length > 0 && log[0]! <= t - win) log.shift();
    const evicted = before - log.length;
    const evictNote = evicted > 0 ? `${evicted} timestamp${evicted === 1 ? "" : "s"} older than t=${t - win}s dropped from the log. ` : "";
    const windowLabel = `(${t - win}, ${t}]`;
    if (log.length < limit) {
      log.push(t);
      accepted += 1;
      rows.push([i + 1, t, windowLabel, log.length, "accept"]);
      verdicts.push(true);
      sys.state("limiter", `log: [${log.join(", ")}]`, log.length === limit ? "danger" : "done");
      sys.state("api", `served ${accepted}`, "done");
      sys.set({ "log entries": log.length, accepted, rejected });
      show();
      sys.msg("limiter", "api", `#${i + 1} (t=${t}s)`, `Request #${i + 1} at t=${t}s: ${evictNote}${log.length - 1} in the window ${windowLabel} < ${limit} → accept and record t=${t}.`, { tone: "done" });
    } else {
      rejected += 1;
      rows.push([i + 1, t, windowLabel, log.length, "reject"]);
      verdicts.push(false);
      sys.state("limiter", `log: [${log.join(", ")}]`, "danger");
      sys.set({ "log entries": log.length, accepted, rejected });
      show();
      sys.msg("limiter", "client", `#${i + 1} → 429`, `Request #${i + 1} at t=${t}s: ${evictNote}${log.length} in the window ${windowLabel} = ${limit} → reject; the oldest entry (t=${log[0]}) expires at t=${log[0]! + win}s, which is the Retry-After.`, { tone: "danger" });
    }
    if (sys.f.full) break;
  }
  sys.set({ "fixed window bug": `${limit} at t=9 + ${limit} at t=10 = ${2 * limit} in 1 s` });
  sys.note(`Why not fixed windows: a counter reset every ${win} s would allow ${limit} requests at t=9 and ${limit} more at t=10, ${2 * limit} in one second, double the intended rate. The sliding log has no boundary to game.`, "boundary");
  sys.note(`Trade-off: exact enforcement costs O(limit) timestamps per client, which is fine for ${limit} per ${win} s and ruinous for 10,000 per hour; the sliding window counter (weight the previous window's count by its overlap) approximates this in O(1), and Redis-backed limiters use that or the token bucket.`, "done");
  return sys.f.done();
};

// ---------- resilience ----------

const circuitBreaker: SysGen = ({ requests }) => {
  const shed = clampInt(requests, 1, 100000, 15);
  const threshold = 3;
  const openFor = 5;
  const sys = new Sys([
    { id: "client", label: "Checkout", kind: "service", x: 8, y: 50 },
    { id: "breaker", label: "Breaker", kind: "lb", x: 50, y: 50, state: `CLOSED · 0/${threshold} failures` },
    { id: "dep", label: "Payments API", kind: "external", x: 92, y: 50, state: "healthy" },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () => sys.table({ title: "Call log", head: ["#", "breaker", "outcome", "latency"], rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  let calls = 0;
  const call = (state: string, outcome: string, latency: string, ok: boolean) => {
    calls += 1;
    rows.push([calls, state, outcome, latency]);
    verdicts.push(ok);
    show();
    return calls;
  };
  show();
  sys.set({ "failure threshold": threshold, "open timeout": `${openFor} s`, "half-open trials": 1, state: "CLOSED" });
  sys.note(`Circuit breaker: a proxy in front of a dependency with three states. CLOSED passes calls and counts failures; after ${threshold} consecutive failures it OPENS and fails every call instantly; after ${openFor} s it goes HALF-OPEN and lets one trial call decide.`);
  let c = call("CLOSED", "200 OK", "40 ms", true);
  sys.msg("breaker", "dep", `#${c} → 200 OK`, `Normal operation: the breaker is CLOSED and forwards the call; a success resets the failure counter.`, { tone: "done" });
  sys.state("dep", "degraded · timing out", "danger");
  c = call("CLOSED", "timeout", "2000 ms", false);
  sys.state("breaker", `CLOSED · 1/${threshold} failures`, "compare");
  sys.msg("breaker", "dep", `#${c} → timeout (2 s)`, `The payments API starts timing out. Call #${c} holds a checkout thread for the full 2 s timeout before failing; the breaker counts failure 1 of ${threshold}.`, { tone: "danger" });
  c = call("CLOSED", "timeout", "2000 ms", false);
  sys.state("breaker", `CLOSED · 2/${threshold} failures`, "compare");
  sys.msg("breaker", "dep", `#${c} → timeout (2 s)`, `Failure 2 of ${threshold}. Every slow failure so far has cost the caller a thread and 2 s; under load this is how one slow dependency exhausts the whole thread pool.`, { tone: "danger" });
  c = call("CLOSED → OPEN", "timeout", "2000 ms", false);
  sys.state("breaker", "OPEN · opened at t=0", "danger");
  sys.set({ state: "OPEN", "opened at": "t=0" });
  sys.msg("breaker", "dep", `#${c} → timeout (2 s)`, `Failure ${threshold} of ${threshold}: the threshold is reached and the breaker trips OPEN.`, { tone: "danger" });
  c = call("OPEN", "503 (breaker)", "<1 ms", false);
  sys.msg("breaker", "client", `#${c} → 503 immediately`, `While OPEN, the breaker rejects call #${c} in under a millisecond without touching the dependency: a slow failure has been turned into a fast one, and the checkout thread is free again.`, { tone: "danger" });
  sys.set({ "calls shed while open": shed, "threads saved": `${shed} × 2 s` });
  sys.msg("breaker", "client", `${shed} × 503 in ${openFor} s`, `Over the next ${openFor} s the breaker sheds ${shed} more calls the same way. The dependency gets quiet time to recover instead of a queue of retries, and the caller can serve a fallback (retry later, cached quote, "payment pending").`, { tone: "danger", tag: "shed" });
  sys.state("breaker", "HALF-OPEN · 1 trial", "compare");
  sys.set({ state: "HALF-OPEN" });
  sys.note(`The open timeout (${openFor} s) elapses: the breaker moves to HALF-OPEN and will allow exactly one trial call through to probe the dependency.`, "timer");
  c = call("HALF-OPEN → OPEN", "timeout", "2000 ms", false);
  sys.state("breaker", `OPEN · opened at t=${openFor}`, "danger");
  sys.set({ state: "OPEN", "opened at": `t=${openFor}` });
  sys.msg("breaker", "dep", `#${c} trial → timeout`, `The trial call fails: the dependency is still sick. Back to OPEN for another ${openFor} s (many implementations back this timeout off exponentially).`, { tone: "danger" });
  sys.state("dep", "healthy", "done");
  sys.state("breaker", "HALF-OPEN · 1 trial", "compare");
  sys.set({ state: "HALF-OPEN" });
  sys.note(`The dependency recovers. Another ${openFor} s pass and the breaker goes HALF-OPEN again.`, "timer");
  c = call("HALF-OPEN → CLOSED", "200 OK", "45 ms", true);
  sys.state("breaker", `CLOSED · 0/${threshold} failures`, "done");
  sys.set({ state: "CLOSED" });
  sys.msg("breaker", "dep", `#${c} trial → 200 OK`, `The trial succeeds: the breaker CLOSES and resets its failure counter. Traffic flows normally again, and the whole episode cost one probe call rather than ${shed} timeouts.`, { tone: "done" });
  sys.set({ "fallback": "cached / degraded response, or an honest error fast" });
  sys.note(`Failure modes: a threshold that counts a single flaky call trips too often (use a failure rate over a sliding window and a minimum volume instead of a raw count); one breaker shared across unrelated endpoints lets a broken /refund take down /charge; and a breaker without a fallback still fails the user, just faster.`, "pitfalls");
  sys.note(`Trade-off: the breaker sacrifices the few calls that would have succeeded during the open period in exchange for freeing the caller's resources and giving the dependency room to recover; it makes failure explicit and fast, which is what lets the rest of the system stay up.`, "done");
  return sys.f.done();
};

const retryBackoff: SysGen = ({ requests }) => {
  const attempts = clampInt(requests, 3, 6, 4);
  const base = 100;
  const factor = 2;
  const cap = 2000;
  const rnd = lcg(7);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 8, y: 30 },
    { id: "herd", label: "999 other clients", kind: "client", x: 8, y: 80 },
    { id: "svc", label: "Service", kind: "service", x: 92, y: 50, state: "overloaded" , tone: "danger" },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () => sys.table({ title: `Attempts (base ${base} ms, factor ${factor}, cap ${cap} ms, full jitter)`, head: ["attempt", "outcome", "backoff", "with jitter"], rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  show();
  sys.set({ "base delay": `${base} ms`, factor, "max attempts": attempts, jitter: "full (random 0..delay)" });
  sys.note(`Retry with exponential backoff: after each failure wait base × factor^n, so the delay doubles every time (${base}, ${base * factor}, ${base * factor * factor}… ms). Jitter randomises each wait so that clients that failed together do not retry together.`);
  let elapsed = 0;
  for (let k = 1; k < attempts; k++) {
    const delay = Math.min(cap, base * Math.pow(factor, k - 1));
    const jittered = Math.round(rnd() * delay);
    rows.push([k, "503", `${delay} ms`, `${jittered} ms`]);
    verdicts.push(false);
    show();
    sys.state("client", `attempt ${k} · t=${elapsed} ms`, "compare");
    sys.msg("client", "svc", `attempt ${k} → 503`, `Attempt ${k} fails with 503 (overloaded). A 503 or a timeout is retryable; a 400 or 404 is not, and retrying it only adds load.`, { tone: "danger" });
    elapsed += jittered;
    sys.state("client", `sleeping ${jittered} ms`, "muted");
    sys.note(`Backoff: the schedule says wait ${delay} ms; full jitter picks a uniform random value in [0, ${delay}], here ${jittered} ms. Next attempt at t=${elapsed} ms.`, "wait");
  }
  rows.push([attempts, "200 OK", "—", "—"]);
  verdicts.push(true);
  show();
  sys.state("svc", "recovering", "done");
  sys.state("client", `attempt ${attempts} · t=${elapsed} ms`, "done");
  sys.set({ "total wait": `${elapsed} ms` });
  sys.msg("client", "svc", `attempt ${attempts} → 200 OK`, `Attempt ${attempts} succeeds after ${elapsed} ms of total waiting. Had every retry fired immediately, all ${attempts} would have landed inside the same overload window and failed.`, { tone: "done" });
  sys.state("svc", "OVERLOADED (retry storm)", "danger");
  sys.fanin(["client", "herd"], "svc", `1,000 retries at exactly t+${base} ms`, `Failure mode without jitter: 1,000 clients that failed at the same instant all sleep exactly ${base} ms and retry in lockstep; the service, which had just started to recover, is hit by the same wave again, now synchronised. Retries turned an outage into a longer one.`, "danger", "storm");
  sys.state("svc", "recovering", "compare");
  sys.fanin(["client", "herd"], "svc", `retries spread over 0–${base} ms`, `With full jitter the same 1,000 retries arrive spread across the whole interval, and the service sees a gentle ramp it can actually serve. Jitter is not optional; it is the part that makes backoff work at scale.`, "done", "jitter");
  sys.set({ "retry budget": "e.g. retries ≤ 10% of requests", idempotency: "required for anything but reads" });
  sys.note(`Two more rules: cap retries with a budget (retries as a percentage of traffic) so a full outage cannot multiply load by the attempt count, and only retry operations that are idempotent, otherwise a timed-out but successful "charge card" is charged again on retry.`, "rules");
  sys.note(`Trade-off: retries turn transient failures into successes at the cost of latency and extra load exactly when the system can least afford it; exponential backoff bounds the load, jitter de-synchronises it, and a budget plus a circuit breaker stop it when the failure is not transient.`, "done");
  return sys.f.done();
};

const bulkhead: SysGen = ({ nodes }) => {
  const d = clampInt(nodes, 2, 4, 3);
  const depNames = ["Payments", "Search", "Recs", "Email"].slice(0, d);
  const depIds = depNames.map((s) => s.toLowerCase());
  const slow = depIds[1]!;
  const slowName = depNames[1]!;
  const ys = spread(d, 15, 85);
  const total = 12;
  const per = Math.floor(total / d);
  const sys = new Sys([
    { id: "client", label: "Users", kind: "client", x: 8, y: 50 },
    { id: "app", label: "API gateway", kind: "service", x: 45, y: 50, state: `pool 0/${total}` },
    ...depIds.map((id, i) => ({ id, label: depNames[i]!, kind: "external" as const, x: 90, y: ys[i]!, state: "healthy" })),
  ]);
  const shared: Record<string, number> = Object.fromEntries(depIds.map((id) => [id, 0]));
  const showShared = (hl?: string) => {
    const used = Object.values(shared).reduce((a, b) => a + b, 0);
    sys.table({ title: `One shared thread pool (${total} threads)`, head: ["holding threads for", "in use", "capacity"], rows: [...depIds.map((id) => [depNames[depIds.indexOf(id)]!, shared[id]!, "shared"]), ["total", used, total]], tones: [...depIds.map((id) => (id === hl ? "active" : undefined) as Tone | undefined), used >= total ? "danger" : undefined] });
  };
  const own: Record<string, number> = Object.fromEntries(depIds.map((id) => [id, 0]));
  const showOwn = (hl?: string) => sys.table({ title: `Bulkheads: one pool per dependency (${per} threads each)`, head: ["pool", "in use", "capacity"], rows: depIds.map((id) => [depNames[depIds.indexOf(id)]!, own[id]!, per]), tones: depIds.map((id) => (id === hl ? "active" : own[id]! >= per ? "danger" : undefined)) });
  showShared();
  sys.set({ "shared pool": `${total} threads`, "slow dependency": slowName, "p99 of slow calls": "8 s" });
  sys.note(`Bulkhead: partition resources (threads, connections, instances) per dependency so a failure in one compartment cannot flood the others, like the watertight compartments in a ship's hull. First, the version without it.`);
  sys.state(slow, "p99 8 s", "danger");
  sys.note(`${slowName} becomes slow: calls that took 50 ms now hang for 8 s before timing out. Nothing else has changed.`, "degrade");
  shared[slow] = 6;
  sys.state("app", `pool 6/${total}`, "compare");
  showShared(slow);
  sys.msg("app", slow, "6 calls in flight (8 s each)", `Every request to ${slowName} holds a gateway thread for 8 s instead of 50 ms; 6 are in flight and the shared pool is half gone.`, { tone: "danger" });
  shared[slow] = total;
  sys.state("app", `pool ${total}/${total} EXHAUSTED`, "danger");
  showShared(slow);
  sys.msg("app", slow, `${total} calls in flight`, `More ${slowName} traffic arrives at the normal rate, but calls now leave 160× slower than they enter; ${slowName} alone holds all ${total} threads.`, { tone: "danger" });
  sys.msg("client", "app", "POST /checkout", `A checkout request arrives. It needs ${depNames[0]}, which is perfectly healthy.`);
  sys.msg("app", "client", "503 (no thread available)", `Failure mode: it is rejected anyway, because there is no thread to run it. A slow search box has taken down payments; one dependency's latency became every feature's outage.`, { tone: "danger" });
  for (const id of depIds) shared[id] = 0;
  sys.state("app", `pools ${depIds.length} × ${per}`, "compare");
  showOwn();
  sys.set({ bulkheads: `${d} pools × ${per} threads`, "worst case": `${slowName} can hold at most ${per}` });
  sys.note(`The fix: split the ${total} threads into ${d} pools of ${per}, one per dependency. A call to ${slowName} may only use a ${slowName} thread; when that pool is full, the call is rejected immediately instead of waiting.`, "fix");
  own[slow] = per;
  showOwn(slow);
  sys.msg("app", slow, `${per} calls in flight (pool full)`, `${slowName} degrades exactly as before and fills its ${per}-thread pool, but it cannot borrow from anyone else.`, { tone: "danger" });
  sys.msg("app", "client", "search unavailable (fast)", `The next ${slowName} call finds its pool full and fails in microseconds with a clear "search unavailable"; the page renders without the search box instead of hanging.`, { tone: "danger" });
  own[depIds[0]!] = 1;
  showOwn(depIds[0]!);
  sys.msg("app", depIds[0]!, "POST /charge (1/" + per + ")", `Checkout arrives, takes a ${depNames[0]} thread from a pool with ${per - 1} to spare, and succeeds. The compartment held: the leak in ${slowName} never reached ${depNames[0]}.`, { tone: "done" });
  own[slow] = 0;
  own[depIds[0]!] = 0;
  sys.state(slow, "healthy", undefined);
  showOwn();
  sys.note(`Failure mode of the fix itself: pool sizing. Too small and a normal traffic spike to one dependency rejects legitimate calls (a self-inflicted outage); too large and the isolation is nominal. Size from measured concurrency (rate × latency) with headroom, and alert on rejections.`, "sizing");
  sys.note(`Trade-off: bulkheads cap the blast radius of any one dependency at its compartment's size, at the cost of lower peak utilisation (idle threads in one pool cannot help another) and one more number per dependency to tune; the same idea applies to connection pools, worker processes, and whole availability zones.`, "done");
  return sys.f.done();
};

const backpressure: SysGen = ({ requests }) => {
  const burst = clampInt(requests, 10, 40, 20);
  const cap = 8;
  const rate = 2;
  const sys = new Sys([
    { id: "prod", label: "Producer", kind: "client", x: 8, y: 50, state: "unthrottled" },
    { id: "buf", label: "Buffer", kind: "queue", x: 50, y: 50, state: `0/${cap}` },
    { id: "cons", label: "Consumer", kind: "service", x: 92, y: 50, state: `${rate} msg/tick` },
  ]);
  const buf: string[] = [];
  const show = (tone?: Tone) => sys.table({ title: `Buffer contents (capacity ${cap})`, head: ["slot", "message"], rows: buf.map((m, i) => [i + 1, m]), tones: buf.map(() => tone) });
  show();
  sys.set({ "buffer capacity": cap, "consumer rate": `${rate}/tick`, "producer burst": burst, dropped: 0 });
  sys.note(`Backpressure is the consumer's ability to slow the producer down. Without it, a fast producer and a slow consumer are separated only by a buffer, and every buffer is finite.`);
  const kept = Math.min(cap, burst);
  for (let i = 0; i < kept; i++) buf.push(`m${i + 1}`);
  const dropped = burst - kept;
  sys.state("buf", `${cap}/${cap} FULL`, "danger");
  sys.set({ dropped });
  show("danger");
  sys.msg("prod", "buf", `burst of ${burst} messages`, `The producer fires ${burst} messages at once (push model). The buffer keeps ${kept} and the remaining ${dropped} have nowhere to go: they are dropped, or, if the buffer were unbounded, the process grows until it is killed for running out of memory.`, { tone: "danger" });
  buf.splice(0, rate);
  sys.state("buf", `${buf.length}/${cap}`, "compare");
  show();
  sys.msg("buf", "cons", `m1, m2`, `The consumer drains ${rate} per tick, its real capacity. The ${dropped} dropped messages are gone; nobody upstream was told, so the producer thinks it delivered ${burst}.`, { tone: "compare" });
  sys.set({ mechanism: "demand / credits (Reactive Streams, TCP window, gRPC flow control)" });
  sys.note(`The fix: flip the direction of control. The consumer tells the producer how many messages it may send (credits, a window, or request(n)); the producer may not exceed that number. Sending becomes pull-driven.`, "fix");
  const credits = cap - buf.length;
  sys.state("cons", `demands ${credits}`, "compare");
  sys.state("prod", `credits ${credits}`, "done");
  sys.msg("cons", "prod", `request(${credits})`, `The consumer looks at its free buffer space (${credits} slots) and grants exactly that many credits.`, { tone: "compare", tag: "demand" });
  for (let i = 0; i < credits; i++) buf.push(`m${kept + i + 1}`);
  sys.state("prod", "credits 0 · blocked", "muted");
  sys.state("buf", `${buf.length}/${cap}`, "compare");
  show();
  sys.msg("prod", "buf", `${credits} messages`, `The producer sends ${credits} and stops: with zero credits it must wait, so the buffer can never overflow by construction.`, { tone: "done" });
  buf.splice(0, rate);
  sys.state("cons", `processed ${rate} · demands ${rate}`, "compare");
  sys.state("prod", `credits ${rate}`, "done");
  show();
  sys.msg("cons", "prod", `request(${rate})`, `Each tick the consumer processes ${rate} and hands back ${rate} credits. In steady state the producer is running at exactly the consumer's rate; the buffer only absorbs jitter.`, { tone: "compare", tag: "demand" });
  sys.state("prod", "blocked → its own callers wait", "danger");
  sys.msg("prod", "buf", "…", `The pressure propagates upstream: a blocked producer stops reading from its own source, whose HTTP handlers slow down, whose clients see latency or 429s. That is the point: the slowest stage sets the pace for the whole pipeline and overload becomes visible at the edge instead of as silent data loss in the middle.`, { tone: "muted", dashed: true, tag: "propagate" });
  sys.set({ alternative: "shed load: drop oldest / newest, sample, or degrade" });
  sys.note(`Failure mode: backpressure that reaches the user as a hung request is not always acceptable. For metrics or telemetry, dropping (oldest, newest, or sampled) is the right policy; for orders it is not. Also beware cycles: a producer that is blocked waiting on a consumer that is blocked waiting on the producer is a deadlock.`, "shedding");
  sys.note(`Trade-off: backpressure guarantees bounded memory and honest overload signals at the cost of coupling the producer's speed to the consumer's; pick per data type between slowing the source, buffering to durable storage (a log), and shedding.`, "done");
  return sys.f.done();
};

// ---------- eviction policies ----------

const lruCache: SysGen = ({ keys }) => {
  const seq = keyList(keys, ["A", "B", "C", "A", "D", "B", "E", "A"], 12, 5);
  const cap = 3;
  const sys = new Sys([
    { id: "app", label: "App", kind: "client", x: 8, y: 50 },
    { id: "cache", label: "LRU cache", kind: "cache", x: 50, y: 50, state: `0/${cap}` },
    { id: "db", label: "Database", kind: "db", x: 92, y: 50, state: "loads 0" },
  ]);
  const order: string[] = [];
  const lastUsed: Record<string, number> = {};
  const show = (hl?: string) => sys.table({ title: `Cache contents, most recently used first (capacity ${cap})`, head: ["rank", "key", "last used at step"], rows: order.map((k, i) => [i === 0 ? "MRU" : i === order.length - 1 ? "LRU" : i + 1, k, lastUsed[k]!]), tones: order.map((k) => (k === hl ? "active" : undefined)) });
  show();
  sys.set({ capacity: cap, sequence: seq.join(" "), hits: 0, misses: 0 });
  sys.note(`LRU (least recently used): keep the ${cap} keys touched most recently. Every access moves the key to the front; when the cache is full, the key at the back, the one untouched for longest, is evicted.`);
  let hits = 0;
  let misses = 0;
  seq.forEach((k, i) => {
    const step = i + 1;
    const idx = order.indexOf(k);
    if (idx >= 0) {
      hits += 1;
      order.splice(idx, 1);
      order.unshift(k);
      lastUsed[k] = step;
      sys.state("cache", `${order.length}/${cap} · hit`, "done");
      sys.set({ hits, misses });
      show(k);
      sys.msg("app", "cache", `GET ${k} → HIT`, `Step ${step}: ${k} is in the cache (hit). It moves from rank ${idx + 1} to the front: recency is updated on reads as well as writes.`, { tone: "done" });
    } else {
      misses += 1;
      let evicted: string | undefined;
      if (order.length >= cap) evicted = order.pop();
      order.unshift(k);
      lastUsed[k] = step;
      sys.state("cache", `${order.length}/${cap} · miss`, "danger");
      sys.state("db", `loads ${misses}`, "visited");
      sys.set({ hits, misses });
      show(k);
      sys.msg("app", "db", `MISS ${k} → load`, evicted ? `Step ${step}: ${k} is not cached (miss). The cache is full, so the LRU key ${evicted} (last used at step ${lastUsed[evicted]}) is evicted and ${k} is loaded from the database and placed at the front.` : `Step ${step}: ${k} is not cached (miss). There is room, so it is loaded from the database and inserted at the front.`, { tone: "danger" });
    }
  });
  sys.set({ "hit rate": `${hits}/${seq.length}`, structure: "hash map + doubly linked list, O(1) per access" });
  sys.note(`Failure mode: a one-off scan. Reading ${cap + 1} keys once each (a report, a crawler) pushes every genuinely hot key out, and the next real requests all miss. Variants such as LRU-K, ARC, or a small probationary segment (SLRU, W-TinyLFU) admit a key to the main cache only on its second touch.`, "scan");
  sys.note(`Trade-off: LRU is O(1) with a hash map and a doubly linked list, adapts instantly to a shifting working set, and is the default almost everywhere, but it tracks recency only, so it cannot tell a key read a thousand times from one read once a moment ago; Redis approximates it by sampling five keys because the exact list costs memory per entry.`, "done");
  return sys.f.done();
};

const lfuCache: SysGen = ({ keys }) => {
  const seq = keyList(keys, ["A", "A", "B", "C", "A", "D", "B", "E", "A", "D"], 12, 5);
  const cap = 3;
  const sys = new Sys([
    { id: "app", label: "App", kind: "client", x: 8, y: 50 },
    { id: "cache", label: "LFU cache", kind: "cache", x: 50, y: 50, state: `0/${cap}` },
    { id: "db", label: "Database", kind: "db", x: 92, y: 50, state: "loads 0" },
  ]);
  const entries: { key: string; freq: number; last: number }[] = [];
  const show = (hl?: string) => {
    const sorted = [...entries].sort((a, b) => b.freq - a.freq || b.last - a.last);
    sys.table({ title: `Cache contents by frequency (capacity ${cap}; ties broken by recency)`, head: ["key", "frequency", "last used at step"], rows: sorted.map((e) => [e.key, e.freq, e.last]), tones: sorted.map((e) => (e.key === hl ? "active" : undefined)) });
  };
  show();
  sys.set({ capacity: cap, sequence: seq.join(" "), hits: 0, misses: 0 });
  sys.note(`LFU (least frequently used): count how often each key is accessed and, when full, evict the key with the smallest count; ties go to the least recently used among them. Popularity beats recency.`);
  let hits = 0;
  let misses = 0;
  seq.forEach((k, i) => {
    const step = i + 1;
    const e = entries.find((x) => x.key === k);
    if (e) {
      hits += 1;
      e.freq += 1;
      e.last = step;
      sys.state("cache", `${entries.length}/${cap} · hit`, "done");
      sys.set({ hits, misses });
      show(k);
      sys.msg("app", "cache", `GET ${k} → HIT (freq ${e.freq})`, `Step ${step}: ${k} hits and its counter rises to ${e.freq}. The more it is read, the harder it becomes to evict.`, { tone: "done" });
    } else {
      misses += 1;
      let evictNote = "";
      if (entries.length >= cap) {
        const minFreq = Math.min(...entries.map((x) => x.freq));
        const cands = entries.filter((x) => x.freq === minFreq).sort((a, b) => a.last - b.last);
        const victim = cands[0]!;
        entries.splice(entries.indexOf(victim), 1);
        evictNote = cands.length > 1 ? ` The cache is full; ${cands.map((c) => c.key).join(" and ")} tie at frequency ${minFreq}, so the least recently used of them, ${victim.key} (step ${victim.last}), is evicted.` : ` The cache is full; ${victim.key} has the lowest frequency (${minFreq}) and is evicted.`;
      }
      entries.push({ key: k, freq: 1, last: step });
      sys.state("cache", `${entries.length}/${cap} · miss`, "danger");
      sys.state("db", `loads ${misses}`, "visited");
      sys.set({ hits, misses });
      show(k);
      sys.msg("app", "db", `MISS ${k} → load`, `Step ${step}: ${k} misses and is loaded with frequency 1.${evictNote}`, { tone: "danger" });
    }
  });
  const top = [...entries].sort((a, b) => b.freq - a.freq)[0];
  sys.set({ "hit rate": `${hits}/${seq.length}`, "most popular": top ? `${top.key} (${top.freq})` : "—" });
  sys.note(`Failure mode: no decay. A key that was hot last week keeps its high count and can never be evicted, while every new key enters at frequency 1 and is the first to go, so a shifting working set churns at the bottom and never displaces the stale top. Real LFUs age counters (halve them periodically, or Redis's logarithmic counter with decay).`, "decay");
  sys.note(`Trade-off: LFU protects genuinely popular keys from one-off scans that would flush an LRU, but it costs a counter per key, is slower to adapt when popularity shifts, and must be combined with decay; O(1) LFU keeps keys in frequency buckets, and W-TinyLFU (Caffeine) combines a tiny frequency sketch with an LRU window to get the best of both.`, "done");
  return sys.f.done();
};

// ---------- batch and stream processing ----------

const mapreduce: SysGen = ({ nodes }) => {
  const m = clampInt(nodes, 2, 3, 3);
  const docs = ["the cat sat", "the dog sat", "the cat ran"];
  const mapIds = Array.from({ length: m }, (_, i) => `M${i + 1}`);
  const redIds = ["R1", "R2"];
  const xs = spread(m, 15, 85);
  const sys = new Sys([
    { id: "master", label: "Master", kind: "lb", x: 50, y: 8 },
    ...mapIds.map((id, i) => ({ id, label: `Mapper ${id}`, kind: "node" as const, x: xs[i]!, y: 48, state: "idle" })),
    ...redIds.map((id, i) => ({ id, label: `Reducer ${id}`, kind: "node" as const, x: i === 0 ? 30 : 70, y: 92, state: "idle" })),
  ]);
  const splits: string[][] = mapIds.map(() => []);
  docs.forEach((d, i) => splits[i % m]!.push(d));
  const part = (w: string) => fnv(w) % 2;
  const mapped = splits.map((s) => s.flatMap((d) => d.split(" ").map((w) => [w, 1] as [string, number])));
  const combined = mapped.map((pairs) => {
    const c: Record<string, number> = {};
    for (const [w, v] of pairs) c[w] = (c[w] ?? 0) + v;
    return Object.entries(c);
  });
  const shuffled: Record<string, number[]>[] = [{}, {}];
  combined.forEach((pairs) => pairs.forEach(([w, v]) => (shuffled[part(w)]![w] = [...(shuffled[part(w)]![w] ?? []), v])));
  sys.table({ title: "Input splits", head: ["mapper", "split"], rows: splits.map((s, i) => [mapIds[i]!, s.join(" | ") || "(empty)"]) });
  sys.set({ job: "word count", mappers: m, reducers: 2, "input records": docs.length });
  sys.note(`MapReduce: a job is two user functions. map(record) emits key/value pairs; reduce(key, all values) folds them. The framework does everything else: splitting input, scheduling, shuffling by key, and re-running failed tasks.`);
  mapIds.forEach((id) => sys.state(id, "map task", "active"));
  sys.fanout("master", mapIds, "map task (split i)", `The master splits the ${docs.length} input records into ${m} splits and assigns one map task each, preferring the worker that already holds that split on local disk (move compute to data).`);
  sys.table({ title: "Map output: (word, 1) per occurrence", head: ["mapper", "emitted pairs"], rows: mapped.map((pairs, i) => [mapIds[i]!, pairs.map(([w, v]) => `(${w},${v})`).join(" ") || "—"]), tones: mapped.map(() => "active" as Tone) });
  mapIds.forEach((id, i) => sys.state(id, `${mapped[i]!.length} pairs`, "compare"));
  sys.note(`Each mapper runs map() over its records independently and emits (word, 1) for every word. Map is stateless per record, which is what makes it embarrassingly parallel.`, "map");
  sys.table({ title: "After the combiner (local pre-reduce on each mapper)", head: ["mapper", "partial counts"], rows: combined.map((pairs, i) => [mapIds[i]!, pairs.map(([w, v]) => `(${w},${v})`).join(" ") || "—"]) });
  sys.note(`Optimisation: a combiner runs the reduce function locally on each mapper's output, so "the" emitted twice by one mapper becomes (the,2) before anything crosses the network. Only valid because sum is associative and commutative.`, "combine");
  const allWords = [...new Set(docs.flatMap((d) => d.split(" ")))];
  sys.table({ title: "Partitioning: reducer = hash(word) mod 2", head: ["word", "hash mod 2", "reducer"], rows: allWords.map((w) => [w, part(w), redIds[part(w)]!]) });
  sys.note(`Shuffle, step 1: every pair is routed to a reducer by hashing its key, so all values for one word land on the same reducer no matter which mapper produced them.`, "partition");
  redIds.forEach((id, p) => sys.state(id, `${Object.keys(shuffled[p]!).length} keys`, "compare"));
  sys.table({ title: "Reducer inputs, sorted by key", head: ["reducer", "key → [values]"], rows: redIds.map((id, p) => [id, Object.entries(shuffled[p]!).sort().map(([w, vs]) => `${w} → [${vs.join(",")}]`).join("  ") || "—"]) });
  sys.fanin(mapIds, "R1", "partition 0", `Shuffle, step 2: each reducer pulls its partition from every mapper's local disk, then merges and sorts by key. This all-to-all transfer is the expensive part of the job.`, "compare", "shuffle");
  sys.fanin(mapIds, "R2", "partition 1", `The second reducer fetches its partition the same way. Because output is written to local disk between the map and reduce stages, a reducer that dies can simply re-fetch.`, "compare", "shuffle");
  const totals = allWords.map((w) => [w, docs.flatMap((d) => d.split(" ")).filter((x) => x === w).length] as [string, number]).sort();
  redIds.forEach((id) => sys.state(id, "reduce", "done"));
  sys.table({ title: "Final output", head: ["word", "count", "written by"], rows: totals.map(([w, c]) => [w, c, redIds[part(w)]!]), tones: totals.map(() => "done" as Tone) });
  sys.fanin(redIds, "master", "output files", `Each reducer calls reduce(word, [counts]) once per key and writes one output file. The job's result is the set of reducer outputs.`, "done", "reduce");
  const victim = mapIds[m - 1]!;
  const rerun = mapIds[0]!;
  sys.state(victim, "DIED mid-task", "danger");
  sys.msg("master", rerun, `re-run ${victim}'s split`, `Failure mode handled: ${victim} dies before its map task completes. The master notices a missed heartbeat and re-schedules the same split on ${rerun}. Safe because map is deterministic and its output is written to a temp file and renamed atomically only on completion, so a partial run leaves nothing behind.`, { tone: "danger", tag: "recover" });
  sys.state(victim, "idle", undefined);
  sys.set({ stragglers: "speculative execution: re-run the slowest task elsewhere, take the first result", skew: "a hot key sends all its values to one reducer" });
  sys.note(`Two more failure modes: a straggler (a slow machine) holds the whole job at the end, so the master speculatively runs backup copies of the last tasks; and key skew, where one hot word sends most values to a single reducer that finishes long after the rest.`, "stragglers");
  sys.note(`Trade-off: materialising every stage to disk gives simple, restartable fault tolerance on cheap hardware, but it makes iterative or multi-stage jobs slow; Spark keeps intermediate data in memory and recomputes lost partitions from lineage instead, which is faster and needs more care.`, "done");
  return sys.f.done();
};

const streamWindowing: SysGen = ({ requests }) => {
  const n = clampInt(requests, 5, 12, 12);
  const times = [1, 3, 6, 9, 12, 14, 17, 22, 25, 27, 31, 33].slice(0, n);
  const size = 10;
  const sys = new Sys([
    { id: "src", label: "Event source", kind: "client", x: 8, y: 50 },
    { id: "op", label: "Window op", kind: "service", x: 50, y: 50, state: `tumbling ${size} s` },
    { id: "sink", label: "Sink", kind: "db", x: 92, y: 50, state: "0 results" },
  ]);
  const windows: Record<number, number> = {};
  const winOf = (t: number) => Math.floor(t / size) * size;
  const label = (s: number) => `[${s}, ${s + size})`;
  let fired = 0;
  const show = (open: number, hl?: number) => {
    const starts = Object.keys(windows).map(Number).sort((a, b) => a - b);
    sys.table({ title: `Tumbling windows of ${size} s (one result per window)`, head: ["window", "count", "status"], rows: starts.map((s) => [label(s), windows[s]!, s < open ? "fired" : "open"]), tones: starts.map((s) => (s === hl ? "active" : s < open ? "done" : undefined)) });
  };
  sys.set({ "window size": `${size} s`, "events": times.join(", "), "results emitted": 0 });
  sys.note(`Windowing turns an infinite stream into finite groups. Tumbling windows are fixed size and never overlap: with size ${size} s every event belongs to exactly one window, and the window emits one result when it closes.`);
  let current = winOf(times[0]!);
  windows[current] = 0;
  for (let i = 0; i < n; i++) {
    const t = times[i]!;
    const w = winOf(t);
    if (w !== current) {
      fired += 1;
      sys.state("sink", `${fired} results · last ${label(current)}=${windows[current]}`, "done");
      sys.set({ "results emitted": fired });
      windows[w] = 1;
      const closed = current;
      current = w;
      show(current, w);
      sys.msg("src", "op", `event t=${t}s`, `Event at t=${t}s falls in ${label(w)}, so ${label(closed)} is complete: the operator emits count=${windows[closed]} to the sink and discards that window's state. The result for a window is available only once the next window has started.`, { tone: "done", tag: "fire" });
    } else {
      windows[w] = (windows[w] ?? 0) + 1;
      show(current, w);
      sys.msg("src", "op", `event t=${t}s`, `Event at t=${t}s: ${Math.floor(t / size) * size} ≤ ${t} < ${w + size}, so it is added to ${label(w)} (count ${windows[w]}). The window stays open because a later event may still belong to it.`, { tone: "active" });
    }
    if (sys.f.full) break;
  }
  const slide = 5;
  const slidingStarts = Array.from({ length: Math.floor((times[n - 1]! - 0) / slide) + 1 }, (_, i) => i * slide);
  const sliding = slidingStarts.map((s) => [`[${s}, ${s + size})`, times.filter((t) => t >= s && t < s + size).length] as Row);
  sys.state("op", `sliding ${size} s every ${slide} s`, "compare");
  sys.table({ title: `Sliding windows of ${size} s every ${slide} s (each event lands in ${size / slide} windows)`, head: ["window", "count"], rows: sliding, tones: sliding.map(() => "active" as Tone) });
  sys.note(`Sliding windows overlap: size ${size} s, sliding every ${slide} s, so each event is counted in ${size / slide} windows and a result is emitted every ${slide} s. Smoother output, ${size / slide}× the state.`, "sliding");
  const gap = 4;
  const sessions: number[][] = [];
  for (const t of times) {
    const last = sessions[sessions.length - 1];
    if (last && t - last[last.length - 1]! <= gap) last.push(t);
    else sessions.push([t]);
  }
  sys.state("op", `session gap ${gap} s`, "compare");
  sys.table({ title: `Session windows (gap ${gap} s): a window closes after ${gap} s of silence`, head: ["session", "events", "span"], rows: sessions.map((s, i) => [i + 1, s.length, `${s[0]}–${s[s.length - 1]} s`]), tones: sessions.map(() => "active" as Tone) });
  sys.note(`Session windows have no fixed size: events closer than ${gap} s apart merge into one session and the window closes only after a gap. Here the same ${n} events form ${sessions.length} sessions. Size is data-driven, so state is unbounded for a never-silent key.`, "session");
  sys.set({ "the catch": "which clock? event time vs processing time" });
  sys.note(`Trade-off: tumbling is cheapest (one bucket per key), sliding trades memory for smoother results, session fits user behaviour but needs merging; all three assume you know when a window is complete, which is the job of watermarks: an event that arrives after its window fired is either dropped or forces a correction.`, "done");
  return sys.f.done();
};

const watermarks: SysGen = () => {
  const events: [number, number][] = [
    [1, 1],
    [4, 2],
    [9, 3],
    [3, 4],
    [12, 5],
    [7, 6],
    [15, 7],
    [2, 8],
  ];
  const lateness = 2;
  const size = 10;
  const sys = new Sys([
    { id: "src", label: "Source", kind: "client", x: 8, y: 50 },
    { id: "op", label: "Window [0,10)", kind: "service", x: 50, y: 50, state: "watermark −∞" },
    { id: "sink", label: "Sink", kind: "db", x: 92, y: 50, state: "waiting" },
  ]);
  const rows: Row[] = [];
  const tones: (Tone | undefined)[] = [];
  const show = () => sys.table({ title: `Events as they arrive (watermark = max event time − ${lateness} s)`, head: ["#", "event time", "arrives at", "watermark", "action"], rows: rows.map((r) => [...r]), tones: tones.map((t, i) => (i === tones.length - 1 ? "active" : t)) });
  show();
  sys.set({ "bounded out-of-orderness": `${lateness} s`, window: "[0, 10)", "in window": 0, "late dropped": 0 });
  sys.note(`Two clocks: event time (when it happened, stamped by the device) and processing time (when it reaches us). Events arrive out of order, so "the window [0,10) is complete" cannot be decided by looking at the wall clock. A watermark is the operator's estimate that no event older than W will arrive.`);
  let maxEvt = Number.NEGATIVE_INFINITY;
  let inWindow = 0;
  let late = 0;
  let fired = false;
  for (let i = 0; i < events.length; i++) {
    const [et, pt] = events[i]!;
    const prevWm = maxEvt === Number.NEGATIVE_INFINITY ? Number.NEGATIVE_INFINITY : maxEvt - lateness;
    maxEvt = Math.max(maxEvt, et);
    const wm = maxEvt - lateness;
    const wmLabel = `${wm}`;
    sys.state("op", `watermark ${wmLabel}${fired ? " · fired" : ` · count ${inWindow}`}`, fired ? "visited" : "compare");
    if (et < size && !fired) {
      inWindow += 1;
      rows.push([i + 1, `${et} s`, `${pt} s`, wmLabel, "add to [0,10)"]);
      tones.push("done");
      sys.state("op", `watermark ${wmLabel} · count ${inWindow}`, "compare");
      sys.set({ "in window": inWindow });
      show();
      const ooo = et < prevWm + lateness ? ` It arrives out of order (event time ${et} s after we already saw ${maxEvt} s) but ${et} s ≥ watermark ${wmLabel}, so it is still on time.` : "";
      sys.msg("src", "op", `e(t=${et}s) at ${pt}s`, `Event #${i + 1}: event time ${et} s, arrives at processing time ${pt} s. Watermark advances to max(${maxEvt}) − ${lateness} = ${wmLabel}.${ooo} Window [0,10) count = ${inWindow}.`, { tone: "active" });
    } else if (!fired && wm >= size) {
      fired = true;
      rows.push([i + 1, `${et} s`, `${pt} s`, wmLabel, `belongs to [10,20); fires [0,10) = ${inWindow}`]);
      tones.push("done");
      sys.state("op", `watermark ${wmLabel} · fired`, "done");
      sys.state("sink", `[0,10) = ${inWindow}`, "done");
      show();
      sys.msg("op", "sink", `[0,10) → count ${inWindow}`, `Event #${i + 1} (event time ${et} s) pushes the watermark to ${wmLabel} ≥ 10: the operator now believes [0,10) is complete and emits count=${inWindow}. Note it fired at processing time ${pt} s, not at 10 s: completeness is decided by event time.`, { tone: "done", tag: "fire" });
    } else if (et < size) {
      late += 1;
      rows.push([i + 1, `${et} s`, `${pt} s`, wmLabel, "LATE: dropped"]);
      tones.push("danger");
      sys.set({ "late dropped": late });
      show();
      sys.msg("src", "op", `e(t=${et}s) LATE`, `Event #${i + 1} has event time ${et} s but the watermark is already ${wmLabel} and [0,10) has fired: it is late. Default behaviour drops it (or routes it to a side output); with allowed lateness the window is kept and a corrected result is re-emitted.`, { tone: "danger", tag: "late" });
    } else {
      rows.push([i + 1, `${et} s`, `${pt} s`, wmLabel, "add to [10,20)"]);
      tones.push(undefined);
      show();
      sys.msg("src", "op", `e(t=${et}s) at ${pt}s`, `Event #${i + 1} (event time ${et} s) goes to the next window [10,20) and moves the watermark to ${wmLabel}.`, { tone: "active" });
    }
    if (sys.f.full) break;
  }
  sys.set({ "true count of [0,10)": events.filter(([et]) => et < size).length, "emitted": inWindow });
  sys.note(`The emitted count for [0,10) was ${inWindow}; the true count was ${events.filter(([et]) => et < size).length}. The ${late} late events are the price of deciding early. A larger bound (say 6 s) would have caught them but delayed every result by 6 s.`, "accuracy");
  sys.note(`Failure modes: a heuristic watermark can be wrong (late data is dropped silently: measure it); one stalled source partition holds the watermark back for the whole job, so nothing fires (idle-source timeouts exist for this); and a device with a skewed clock stamps events in the future, advancing the watermark past live data.`, "pitfalls");
  sys.note(`Trade-off: the watermark bound is a direct dial between latency and completeness. Small bound: fast results, more late data; large bound: slower results and more buffered state. Systems like Flink and Beam let you emit early speculative results, a final result at the watermark, and corrections for allowed lateness.`, "done");
  return sys.f.done();
};

const kafkaPartitions: SysGen = ({ nodes, keys }) => {
  const p = clampInt(nodes, 2, 4, 3);
  const keyIds = keyList(keys, ["user:1", "user:7", "order:9", "user:1", "cart:5", "user:7"], 6, 3);
  const partIds = Array.from({ length: p }, (_, i) => `P${i}`);
  const ys = spread(p, 12, 88);
  const sys = new Sys([
    { id: "prod", label: "Producer", kind: "client", x: 8, y: 50 },
    ...partIds.map((id, i) => ({ id, label: `Partition ${i}`, kind: "queue" as const, x: 50, y: ys[i]!, state: "offset 0" })),
    { id: "C1", label: "Consumer 1", kind: "service", x: 92, y: 30, state: "group g1" },
    { id: "C2", label: "Consumer 2", kind: "service", x: 92, y: 70, state: "group g1" },
  ]);
  const logs: string[][] = partIds.map(() => []);
  const partOf = (k: string) => fnv(k) % p;
  const show = (hl?: number) => sys.table({ title: `Topic "events": ${p} partitions, each an append-only ordered log`, head: ["partition", "log (offset: key)", "next offset"], rows: partIds.map((id, i) => [id, logs[i]!.map((k, o) => `${o}: ${k}`).join("  ") || "(empty)", logs[i]!.length]), tones: partIds.map((_, i) => (i === hl ? "active" : undefined)) });
  show();
  sys.set({ partitions: p, "partition of key": "hash(key) mod " + p, "consumer group": "g1 (2 consumers)" });
  sys.note(`A Kafka topic is split into partitions, each an ordered, append-only log. The producer hashes the message key to choose a partition; ordering is guaranteed within a partition only, so all events for one key stay in order.`);
  for (const k of keyIds) {
    const i = partOf(k);
    logs[i]!.push(k);
    const off = logs[i]!.length - 1;
    const prior = logs[i]!.length - 1;
    sys.state(partIds[i]!, `offset ${logs[i]!.length}`, "active");
    show(i);
    sys.msg("prod", partIds[i]!, `${k} → offset ${off}`, prior > 0 && logs[i]!.slice(0, -1).includes(k) ? `hash(${k}) mod ${p} = ${i}: appended at offset ${off}, behind the earlier ${k} event in the same partition. A consumer will always see this key's events in the order they were written.` : `hash(${k}) mod ${p} = ${i}: the message is appended to partition ${i} at offset ${off}. The broker never reorders or rewrites the log.`, { tone: "active" });
    sys.tone(partIds[i]!, undefined);
    if (sys.f.full) break;
  }
  const c1Parts = partIds.filter((_, i) => i % 2 === 0);
  const c2Parts = partIds.filter((_, i) => i % 2 === 1);
  sys.state("C1", `owns ${c1Parts.join(", ")}`, "compare");
  sys.state("C2", `owns ${c2Parts.join(", ")}`, "compare");
  sys.set({ assignment: `C1: ${c1Parts.join(",")} · C2: ${c2Parts.join(",")}` });
  sys.note(`Consumer group g1 has two consumers, and the group coordinator assigns each partition to exactly one of them: C1 gets ${c1Parts.join(", ")} and C2 gets ${c2Parts.join(", ")}. Partitions, not messages, are the unit of parallelism.`, "assign");
  const first = c1Parts[0]!;
  const firstIdx = partIds.indexOf(first);
  sys.msg(first, "C1", `poll → offsets 0..${Math.max(0, logs[firstIdx]!.length - 1)}`, `C1 polls ${first} and receives its records in offset order. It tracks its own position (offset) per partition; the broker deletes nothing on read, so another group can read the same log independently.`, { tone: "compare" });
  sys.state("C1", `${first} committed @${logs[firstIdx]!.length}`, "done");
  sys.msg("C1", first, `commit offset ${logs[firstIdx]!.length}`, `After processing, C1 commits offset ${logs[firstIdx]!.length}. Commit after processing gives at-least-once (a crash between processing and commit replays); commit before gives at-most-once. Exactly-once needs transactions or idempotent sinks.`, { tone: "done" });
  sys.state("C2", "CRASHED", "danger");
  sys.state("C1", `owns ${partIds.join(", ")}`, "compare");
  sys.set({ rebalance: `C1 now owns all ${p} partitions` });
  sys.note(`Failure mode: C2 dies. After its session timeout the coordinator rebalances: C1 takes over ${c2Parts.join(", ")} and resumes from C2's last committed offset. During the rebalance the whole group pauses (stop-the-world), and any records C2 processed but had not committed are re-delivered.`, "rebalance");
  sys.set({ "max consumers useful": p, "hot key": "one busy key = one busy partition" });
  sys.note(`Two design limits: a group can use at most ${p} consumers, one per partition (a ${p + 1}th sits idle), so the partition count chosen at creation caps consumer parallelism; and a hot key sends all its traffic to one partition, which one consumer must handle alone.`, "limits");
  sys.note(`Trade-off: partitioning by key gives per-key ordering and horizontal scale with a dumb, durable broker, at the price of no global order, parallelism fixed by partition count, and rebalances that pause consumption; choose keys that spread load yet keep the events that must stay ordered together.`, "done");
  return sys.f.done();
};

// ---------- change capture and event sourcing ----------

const cdc: SysGen = ({ requests }) => {
  const n = clampInt(requests, 2, 6, 4);
  const changes = [
    ["INSERT", "users", "id=1 name=Ada"],
    ["UPDATE", "users", "id=1 name=Ada L."],
    ["INSERT", "orders", "id=9 user=1"],
    ["DELETE", "users", "id=1"],
    ["INSERT", "users", "id=2 name=Bob"],
    ["UPDATE", "orders", "id=9 status=paid"],
  ].slice(0, n) as [string, string, string][];
  const sys = new Sys([
    { id: "app", label: "App", kind: "client", x: 6, y: 50 },
    { id: "db", label: "Postgres", kind: "db", x: 36, y: 50, state: "WAL LSN 0" },
    { id: "cdc", label: "CDC connector", kind: "service", x: 66, y: 50, state: "confirmed LSN 0" },
    { id: "sink", label: "Search index", kind: "external", x: 94, y: 50, state: "empty" },
  ]);
  const wal: Row[] = [];
  const tones: (Tone | undefined)[] = [];
  const show = () => sys.table({ title: "Write-ahead log as the connector sees it (via a replication slot)", head: ["LSN", "op", "table", "row", "emitted"], rows: wal.map((r) => [...r]), tones: [...tones] });
  show();
  sys.set({ "source of truth": "Postgres", mechanism: "logical decoding of the WAL", "confirmed LSN": 0 });
  sys.note(`Change data capture: instead of the app writing to the database and the search index (a dual write), a connector tails the database's write-ahead log and turns every committed change into an event. The database's own commit order becomes the event stream.`);
  sys.msg("cdc", "db", "initial snapshot + slot", `Setup: the connector creates a replication slot (so Postgres retains WAL from that point) and takes a consistent snapshot of the existing rows, streaming them as synthetic INSERTs. From here on it needs only the log.`, { tone: "compare", tag: "snapshot" });
  let lsn = 0;
  let applied = 0;
  for (const [op, table, row] of changes) {
    lsn += 1;
    wal.push([lsn, op, table, row, "no"]);
    tones.push("active");
    sys.state("db", `WAL LSN ${lsn}`, "active");
    show();
    sys.msg("app", "db", `${op} ${table} (${row}) COMMIT`, `The app commits an ${op} on ${table}. The database writes it to the WAL at LSN ${lsn} before acknowledging; the app knows nothing about the search index.`, { tone: "active" });
    wal[wal.length - 1]![4] = "yes";
    tones[tones.length - 1] = "done";
    applied += 1;
    sys.state("cdc", `confirmed LSN ${lsn}`, "done");
    sys.state("sink", `${applied} change${applied === 1 ? "" : "s"} applied`, "done");
    sys.set({ "confirmed LSN": lsn });
    show();
    sys.msg("cdc", "sink", `{op:${op}, before, after} @${lsn}`, `The connector decodes LSN ${lsn} into a change event with the row's before and after images and the sink applies it as an upsert${op === "DELETE" ? " (here: a delete by primary key)" : ""}. The gap between commit and apply is the staleness a search user can observe.`, { tone: "done" });
    if (sys.f.full) break;
  }
  sys.state("cdc", "RESTARTED · replay from LSN " + Math.max(0, lsn - 1), "danger");
  sys.msg("cdc", "sink", `re-emit @${lsn} (duplicate)`, `Failure mode: the connector crashes after emitting LSN ${lsn} but before confirming it to the slot. On restart it resumes from the last confirmed LSN and re-emits ${lsn}: delivery is at-least-once, so the sink must apply events idempotently (upsert by key, or dedupe by LSN).`, { tone: "danger", tag: "replay" });
  sys.state("cdc", "DOWN 3 days", "danger");
  sys.state("db", "WAL retained: disk 95%", "danger");
  sys.note(`Failure mode two: the replication slot pins WAL. If the connector is down for days, Postgres keeps every segment since the confirmed LSN and the primary's disk fills; monitor slot lag and set a retention cap.`, "retention");
  sys.state("cdc", `confirmed LSN ${lsn}`, undefined);
  sys.state("db", `WAL LSN ${lsn}`, undefined);
  sys.set({ "vs dual write": "no lost or reordered update; index only ever lags", "vs polling": "sees deletes and every intermediate update" });
  sys.note(`Why not dual writes: if the app wrote to Postgres and the index itself, a crash between the two loses an update and two concurrent writers can apply updates to the index in the opposite order. Tailing one log makes the database the single arbiter of order.`, "dual-write");
  sys.note(`Trade-off: CDC gives exactly the database's order with no application changes and catches deletes that polling misses, but it couples you to the schema (a column rename breaks consumers unless the connector's registry mediates), delivers at-least-once, and adds operational load: slots, lag, and connector restarts.`, "done");
  return sys.f.done();
};

const eventSourcing: SysGen = ({ requests }) => {
  const n = clampInt(requests, 3, 6, 6);
  const cmds: [string, string | null, number][] = [
    ["OpenAccount", "AccountOpened", 0],
    ["Deposit 50", "Deposited 50", 50],
    ["Withdraw 20", "Withdrawn 20", -20],
    ["Withdraw 100", null, -100],
    ["Deposit 10", "Deposited 10", 10],
    ["CloseAccount", "AccountClosed", 0],
  ];
  const script = cmds.slice(0, n);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "handler", label: "Command handler", kind: "service", x: 36, y: 50, state: "balance —" },
    { id: "store", label: "Event store", kind: "db", x: 66, y: 50, state: "0 events" },
    { id: "proj", label: "Read model", kind: "cache", x: 94, y: 50, state: "balance —" },
  ]);
  const events: Row[] = [];
  const tones: (Tone | undefined)[] = [];
  const show = () => sys.table({ title: "Event stream for account-42 (append-only, never updated)", head: ["seq", "event", "balance after"], rows: events.map((r) => [...r]), tones: tones.map((t, i) => (i === tones.length - 1 ? "active" : t)) });
  show();
  sys.set({ aggregate: "account-42", "current state": "derived, not stored", "events": 0 });
  sys.note(`Event sourcing: the source of truth is not the current balance but the ordered list of facts that produced it. A command is validated against state rebuilt from past events; if valid, a new event is appended. State is a fold over the log.`);
  let balance = 0;
  let seq = 0;
  let rejected = 0;
  for (const [cmd, evt, delta] of script) {
    sys.msg("client", "handler", cmd, `Command "${cmd}" arrives. The handler loads account-42 by replaying its ${seq} event${seq === 1 ? "" : "s"} (balance ${balance}) and checks the business rule.`, { tone: "active" });
    if (evt === null) {
      rejected += 1;
      sys.state("handler", `balance ${balance} · rejected`, "danger");
      sys.set({ rejected });
      sys.msg("handler", "client", `rejected: insufficient funds`, `Balance ${balance} < ${-delta}: the command is rejected and nothing is appended. Commands can fail; events, once written, are facts and cannot.`, { tone: "danger" });
    } else {
      seq += 1;
      balance += delta;
      events.push([seq, evt, balance]);
      tones.push("done");
      sys.state("handler", `balance ${balance}`, "done");
      sys.state("store", `${seq} events`, "done");
      sys.set({ events: seq });
      show();
      sys.msg("handler", "store", `append #${seq} ${evt} (expect v${seq - 1})`, `Valid: the handler appends "${evt}" as event #${seq} with an expected-version check (optimistic concurrency: if another writer appended first, this append fails and the command is retried against fresh state). Balance is now ${balance}.`, { tone: "done" });
    }
    if (sys.f.full) break;
  }
  sys.state("proj", `balance ${balance} · at #${seq}`, "done");
  sys.msg("store", "proj", `events 1..${seq}`, `A projector subscribes to the stream and maintains a read model (a plain "balance" column, a search document, a report) tuned for queries. It is eventually consistent with the store and can be rebuilt from scratch at any time.`, { tone: "compare", tag: "project" });
  sys.state("handler", `replay 1..${seq} → ${balance}`, "compare");
  sys.note(`Replay: delete the read model and fold the ${seq} events again and you get balance ${balance}, or fold only events 1..2 to see the balance as it was then. Audit, debugging, and new projections come for free because no fact was ever overwritten.`, "replay");
  sys.set({ snapshot: `every 100 events: store (state, version) so a load replays ≤ 100` });
  sys.note(`Failure mode: an account with a million events takes a million folds to load. Snapshots fix it: periodically store the state with its version, and replay only the events after it.`, "snapshot");
  sys.note(`Failure mode two: events are forever. A changed rule cannot rewrite history, only add a compensating event; an event schema change needs upcasters for old versions; and "delete my data" needs crypto-shredding (encrypt per user, throw away the key) because you cannot remove events from the log.`, "immutability");
  sys.note(`Trade-off: event sourcing gives a complete audit trail, time travel, and cheap new read models, in exchange for eventual consistency between writes and reads (CQRS), snapshot and schema-versioning machinery, and a model that most teams find harder to reason about than a row you can UPDATE.`, "done");
  return sys.f.done();
};

// ---------- deployment and migration ----------

const stranglerFig: SysGen = ({ requests }) => {
  const n = clampInt(requests, 4, 8, 8);
  const routes = ["/users", "/orders", "/billing", "/search"];
  const sys = new Sys([
    { id: "client", label: "Clients", kind: "client", x: 8, y: 50 },
    { id: "facade", label: "Facade", kind: "lb", x: 42, y: 50, state: "all → legacy" },
    { id: "legacy", label: "Monolith", kind: "external", x: 88, y: 22, state: "owns 4 routes" },
    { id: "svc", label: "New service", kind: "service", x: 88, y: 78, state: "owns 0 routes" },
  ]);
  const target: Record<string, string> = Object.fromEntries(routes.map((r) => [r, "legacy"]));
  const show = (hl?: string) => sys.table({ title: "Facade routing table", head: ["route", "target"], rows: routes.map((r) => [r, target[r] === "legacy" ? "monolith" : target[r] === "both" ? "monolith (+ shadow to new)" : "new service"]), tones: routes.map((r) => (r === hl ? "active" : target[r] === "svc" ? "done" : undefined)) });
  const owned = () => {
    const s = routes.filter((r) => target[r] === "svc").length;
    sys.state("legacy", `owns ${routes.length - s} route${routes.length - s === 1 ? "" : "s"}`, routes.length - s === 0 ? "muted" : undefined);
    sys.state("svc", `owns ${s} route${s === 1 ? "" : "s"}`, s > 0 ? "done" : undefined);
  };
  let served = 0;
  const request = (route: string, note?: string) => {
    served += 1;
    const t = target[route]!;
    show(route);
    if (t === "svc") sys.msg("facade", "svc", `#${served} GET ${route}`, note ?? `Request #${served} for ${route}: the facade routes it to the new service; the client cannot tell anything changed.`, { tone: "done" });
    else sys.msg("facade", "legacy", `#${served} GET ${route}`, note ?? `Request #${served} for ${route}: still owned by the monolith, so the facade forwards it there untouched.`, { tone: "active" });
  };
  show();
  sys.set({ pattern: "strangler fig", migrated: `0/${routes.length}`, "big-bang rewrite": "never" });
  sys.note(`Strangler fig: put a facade in front of the legacy system, then move one capability at a time behind it into new services. The old system is strangled gradually, route by route, while it keeps serving everything not yet moved.`);
  request("/users", `Request #1 for /users: today every route goes to the monolith. The facade is a no-op proxy, which is the safe first step: deploy it alone and prove it adds no latency or errors.`);
  target["/users"] = "svc";
  owned();
  sys.set({ migrated: `1/${routes.length}` });
  show("/users");
  sys.note(`Step 1: the /users capability is rebuilt in the new service and the facade's table is flipped for that one route. Flipping is a config change, so it can be reversed in seconds if the new service misbehaves.`, "migrate");
  request("/users");
  request("/orders");
  target["/orders"] = "both";
  show("/orders");
  sys.fanout("facade", ["legacy", "svc"], `#${(served += 1)} GET /orders (shadow)`, `Step 2, safer: /orders is shadowed. The facade sends each request to both, returns the monolith's answer, and compares the new service's response offline. Mismatches are bugs found with zero user impact.`, "compare", "shadow");
  target["/orders"] = "svc";
  owned();
  sys.set({ migrated: `2/${routes.length}` });
  show("/orders");
  sys.note(`After a clean shadow period /orders is flipped for real. The monolith still owns /billing and /search and still runs; nothing forced a big-bang cut-over.`, "migrate");
  const extra = routes.concat(routes);
  for (let i = 0; i < n - 4; i++) request(extra[(i + 2) % extra.length]!);
  sys.state("legacy", "shares DB with svc", "danger");
  sys.set({ "hard part": "shared data: orders rows read by both sides" });
  sys.note(`Failure mode: the data. The new service and the monolith both need the orders table, so either the service reads the monolith's database (coupling you meant to remove) or you replicate data between them (CDC, dual reads) until the last consumer moves. Migrating the schema is usually the slow part.`, "data");
  for (const r of routes) target[r] = "svc";
  owned();
  sys.state("facade", "all → new service", "done");
  sys.set({ migrated: `${routes.length}/${routes.length}` });
  show();
  sys.note(`Eventually every route points at new services and the monolith serves nothing; it is switched off, and the facade can stay as the API gateway. Each step was small, reversible, and shipped value on its own.`, "retire");
  sys.note(`Trade-off: the strangler fig replaces a risky rewrite with many low-risk increments and lets the old and new systems coexist for months, at the cost of running both (double infrastructure, two codebases to keep consistent) and a facade that must be kept honest; the shared database is where most migrations stall.`, "done");
  return sys.f.done();
};

const blueGreen: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Users", kind: "client", x: 6, y: 50 },
    { id: "router", label: "Router", kind: "lb", x: 34, y: 50, state: "→ blue" },
    { id: "blue", label: "Blue (v1)", kind: "service", x: 68, y: 18, state: "LIVE", tone: "done" },
    { id: "green", label: "Green (v2)", kind: "service", x: 68, y: 82, state: "idle", tone: "muted" },
    { id: "db", label: "Database", kind: "db", x: 96, y: 50, state: "schema v1" },
  ]);
  sys.set({ live: "blue (v1)", idle: "green", "cut-over": "router flip, seconds", "rollback": "flip back" });
  sys.note(`Blue-green: run two identical production environments. One (blue) serves all traffic while the other (green) is idle; deploy the new version to the idle one, test it, then flip the router. Rollback is flipping back.`);
  sys.msg("router", "blue", "100% traffic", `Steady state: every request goes to blue on v1. Green sits idle, either scaled down or kept warm.`, { tone: "done" });
  sys.state("green", "deploying v2", "compare");
  sys.msg("router", "green", "no traffic", `v2 is deployed to green while blue keeps serving. A deploy failure here affects nobody: green is not in the path.`, { tone: "muted", dashed: true, tag: "deploy" });
  sys.state("db", "schema v1+ (expand)", "compare");
  sys.msg("green", "db", "ADD COLUMN nullable (expand)", `The schema change ships first as an expand step (add a nullable column, add a table, never rename or drop) so that v1 and v2 can both run against it. Both versions will be live at once, if only for seconds, and the rollback path depends on it.`, { tone: "compare" });
  sys.state("green", "v2 · smoke tests", "compare");
  sys.msg("router", "green", "internal test traffic", `Green is verified in production: smoke tests, synthetic requests, and an internal hostname. Same hardware and config as blue, which catches the "works on staging" class of bug.`, { tone: "compare", tag: "verify" });
  sys.state("router", "→ green", "done");
  sys.state("green", "LIVE", "done");
  sys.state("blue", "idle (v1, warm)", "muted");
  sys.set({ live: "green (v2)", idle: "blue (v1)" });
  sys.msg("router", "green", "100% traffic", `Cut-over: the router (DNS, load balancer target, or a service-mesh route) is flipped and all traffic moves to green at once. In-flight requests on blue are drained, not killed.`, { tone: "done", tag: "flip" });
  sys.msg("client", "router", "GET /checkout", `Users are now on v2 without downtime. Blue is left running exactly as it was.`, { tone: "done" });
  sys.state("green", "LIVE · errors 4%", "danger");
  sys.note(`Failure mode: v2 has a bug that only shows under real traffic, and the error rate climbs. Because it was an all-or-nothing switch, 100% of users are affected until someone reacts.`, "incident");
  sys.state("router", "→ blue", "done");
  sys.state("blue", "LIVE", "done");
  sys.state("green", "idle (v2, broken)", "danger");
  sys.set({ live: "blue (v1)", "time to roll back": "seconds" });
  sys.msg("router", "blue", "100% traffic (rollback)", `Rollback is the same flip in reverse: seconds, no redeploy, no rebuild. This only works because the expand-only migration left the schema readable by v1.`, { tone: "done", tag: "rollback" });
  sys.set({ "migration rule": "expand now, contract only after the old version is retired" });
  sys.note(`What would have broken it: a migration that renamed or dropped a column for v2 would have crashed v1 on rollback, and writes v2 made to the new column are invisible to v1 (data written during the green window may need reconciling). Sessions and background jobs on the old colour need the same care.`, "schema");
  sys.state("green", "v2.1 · LIVE", "done");
  sys.state("blue", "idle", "muted");
  sys.state("router", "→ green", "done");
  sys.set({ live: "green (v2.1)" });
  sys.msg("router", "green", "100% traffic", `v2.1 with the fix goes to green and is flipped in. Blue is now the idle environment for the next release; the colours alternate.`, { tone: "done", tag: "flip" });
  sys.state("db", "schema v2 (contract)", "done");
  sys.msg("green", "db", "DROP old column (contract)", `Only once no version that needs the old shape can ever be live again does the contract step run. Expand and contract are separate deploys, often days apart.`, { tone: "done" });
  sys.note(`Trade-off: blue-green gives zero-downtime deploys and the fastest possible rollback, but costs double the capacity, forces every schema change into expand/contract, and switches 100% of traffic at once, so a bad release hits everyone; canary releases trade that for gradual exposure.`, "done");
  return sys.f.done();
};

const canary: SysGen = ({ requests }) => {
  const n = clampInt(requests, 5, 1000, 10);
  const sys = new Sys([
    { id: "client", label: "Users", kind: "client", x: 6, y: 50 },
    { id: "lb", label: "Load balancer", kind: "lb", x: 36, y: 50, state: "100% stable" },
    { id: "stable", label: "Stable v1 ×9", kind: "service", x: 78, y: 20, state: "errors 0.1%", tone: "done" },
    { id: "canary", label: "Canary v2 ×1", kind: "service", x: 78, y: 80, state: "not deployed", tone: "muted" },
    { id: "metrics", label: "Metrics", kind: "external", x: 96, y: 50, state: "compare" },
  ]);
  const split = (pct: number) => {
    const c = Math.round((n * pct) / 100);
    return [n - c, c] as const;
  };
  const stage = (pct: number, canaryErr: number, stableErr: number, p99c: string, p99s: string, hl: Tone) => {
    const [s, c] = split(pct);
    sys.table({ title: `Per-version metrics for the last ${n} requests`, head: ["version", "share", "requests", "errors", "p99"], rows: [["stable v1", `${100 - pct}%`, s, stableErr, p99s], ["canary v2", `${pct}%`, c, canaryErr, p99c]], tones: [undefined, hl] });
    return [s, c] as const;
  };
  sys.set({ "canary share": "0%", "promotion gate": "error rate and p99 within 1% of stable", "auto rollback": "on" });
  sys.note(`Canary release: send a small slice of real traffic to the new version, compare its metrics against the stable version serving the rest, and only then widen the slice. Named after the canary in the coal mine: it fails first, and few are exposed.`);
  sys.state("canary", "v2 · 0% traffic", "compare");
  sys.note(`v2 is deployed to one instance alongside nine stable ones. It receives no traffic yet; health checks pass.`, "deploy");
  let [s, c] = stage(10, 0, 0, "120 ms", "118 ms", "active");
  sys.state("lb", "90% stable · 10% canary", "compare");
  sys.state("canary", "v2 · 10% traffic", "compare");
  sys.set({ "canary share": "10%" });
  sys.fanout("lb", ["stable", "canary"], `${s} req · ${c} req`, `Stage 1: 10% of traffic goes to the canary (${c} of the next ${n} requests), 90% to stable. If v2 is broken, at most one user in ten sees it, and only briefly.`, "active", "stage");
  sys.msg("metrics", "lb", "canary ok: 0 errors, p99 +2 ms", `The analysis compares the two versions on the same window: error rate, p99, saturation. The canary is within tolerance, so the gate passes and the share is widened.`, { tone: "done", tag: "analyse" });
  [s, c] = stage(50, Math.max(1, Math.round(c * 0.4)), 0, "410 ms", "118 ms", "danger");
  sys.state("lb", "50% stable · 50% canary", "compare");
  sys.state("canary", `v2 · 50% traffic · errors`, "danger");
  sys.set({ "canary share": "50%" });
  sys.fanout("lb", ["stable", "canary"], `${s} req · ${c} req`, `Stage 2 widens to 50%. Now the canary sees enough traffic to hit the code path that 10% never exercised, and its error rate and p99 jump.`, "active", "stage");
  sys.msg("metrics", "lb", `canary FAIL: ${c > 0 ? Math.max(1, Math.round(c * 0.4)) : 1}/${Math.max(1, c)} errors, p99 410 ms`, `The gate fails: the canary's error rate is far above stable's on the same window. Because stable is still serving 50% with 0 errors, the comparison isolates the release from any ambient noise.`, { tone: "danger", tag: "analyse" });
  stage(0, 0, 0, "—", "118 ms", "danger");
  sys.state("lb", "100% stable", "done");
  sys.state("canary", "rolled back", "danger");
  sys.set({ "canary share": "0%", "users affected": "≈ half, for one analysis window" });
  sys.msg("lb", "stable", "100% (auto rollback)", `Automatic rollback: the load balancer weight for v2 goes to zero. The bad release reached a fraction of users for one window instead of everyone for as long as a human took to notice.`, { tone: "done", tag: "rollback" });
  [s, c] = stage(10, 0, 0, "119 ms", "118 ms", "active");
  sys.state("canary", "v2.1 · 10% traffic", "compare");
  sys.state("lb", "90% stable · 10% canary", "compare");
  sys.set({ "canary share": "10%" });
  sys.fanout("lb", ["stable", "canary"], `${s} req · ${c} req`, `v2.1 with the fix starts again from 10%. Every promotion repeats the same gate; nothing is trusted because it passed last time.`, "active", "stage");
  [s, c] = stage(50, 0, 0, "121 ms", "118 ms", "done");
  sys.state("lb", "50% stable · 50% canary", "compare");
  sys.state("canary", "v2.1 · 50% traffic", "done");
  sys.set({ "canary share": "50%" });
  sys.fanout("lb", ["stable", "canary"], `${s} req · ${c} req`, `50%: clean. The gate compares like with like, so a traffic spike that slows both versions does not fail the canary.`, "done", "stage");
  stage(100, 0, 0, "121 ms", "—", "done");
  sys.state("lb", "100% v2.1", "done");
  sys.state("canary", "v2.1 · promoted", "done");
  sys.state("stable", "v2.1 ×10", "done");
  sys.set({ "canary share": "100%" });
  sys.msg("lb", "canary", "100% → v2.1 is the new stable", `Promotion: the remaining instances roll to v2.1 and it becomes the stable version. The whole release took a few analysis windows longer than a blue-green flip.`, { tone: "done", tag: "promote" });
  sys.note(`Failure modes: with ${c > 1 ? c : "a handful of"} canary requests per window there may be too few samples to see a 1% error rate (the gate must require a minimum count, not a rate alone); a canary that only gets the "easy" traffic (cache hits, one region) passes and then fails at 100%; and stateful sessions need sticky routing or the same user bounces between versions.`, "pitfalls");
  sys.note(`Trade-off: canaries limit the blast radius of a bad release to the canary share and catch problems that only real traffic reveals, at the cost of slower rollouts, two versions live for hours (schema and API compatibility, as in blue-green), per-version metrics, and analysis that must be statistically honest.`, "done");
  return sys.f.done();
};

const serviceMesh: SysGen = ({ nodes }) => {
  const k = clampInt(nodes, 2, 4, 3);
  const names = ["Orders", "Payments", "Inventory", "Ledger"].slice(0, k);
  const ids = names.map((s) => s.toLowerCase());
  const proxies = ids.map((id) => `p-${id}`);
  const xs = spread(k, 12, 88);
  const sys = new Sys([
    { id: "ctrl", label: "Control plane", kind: "lb", x: 50, y: 6, state: "config v1" },
    ...ids.map((id, i) => ({ id, label: names[i]!, kind: "service" as const, x: xs[i]!, y: 48, state: "app code" })),
    ...proxies.map((id, i) => ({ id, label: `sidecar`, kind: "external" as const, x: xs[i]!, y: 90, state: names[i]! })),
  ]);
  const a = ids[0]!;
  const b = ids[1]!;
  const pa = proxies[0]!;
  const pb = proxies[1]!;
  const A = names[0]!;
  const B = names[1]!;
  const policy: Row[] = [
    ["mTLS", "required, certs rotated hourly"],
    [`${A} → ${B}`, "allow; timeout 500 ms; retries 2"],
    ["outlier detection", "eject after 5 consecutive 5xx"],
  ];
  sys.table({ title: "Policy pushed to every sidecar (data plane)", head: ["setting", "value"], rows: policy });
  sys.set({ "data plane": `${k} sidecar proxies`, "control plane": "distributes config and certs", "app code changes": "none" });
  sys.note(`Service mesh: every service gets a sidecar proxy (Envoy) that intercepts all of its inbound and outbound traffic. A control plane configures the proxies. Retries, timeouts, mTLS, routing, and telemetry move out of application code into the mesh.`);
  proxies.forEach((p) => sys.tone(p, "compare"));
  sys.fanout("ctrl", proxies, "xDS: routes, certs, policy", `The control plane pushes routing rules, retry and timeout policy, and short-lived certificates to each sidecar. Application containers never see any of this.`, "compare", "config");
  proxies.forEach((p) => sys.tone(p, undefined));
  sys.msg(a, pa, `GET ${b}:8080/charge`, `${A} calls ${B} as if it were a plain HTTP call to localhost. iptables rules in the pod redirect the connection into ${A}'s sidecar; the app has no idea a mesh exists.`, { tone: "active" });
  sys.state(pa, `${A} · mTLS`, "done");
  sys.state(pb, `${B} · mTLS`, "done");
  sys.msg(pa, pb, "mTLS · timeout 500 ms", `${A}'s sidecar resolves ${B}, picks a healthy endpoint, and opens a mutually authenticated TLS connection to ${B}'s sidecar. Both sides verify identity from the certificate (SPIFFE IDs), not from IP addresses.`, { tone: "active" });
  sys.msg(pb, b, "plain HTTP (authz: allow)", `${B}'s sidecar checks the authorization policy (${A} may call ${B}), terminates TLS, and forwards plain HTTP over localhost to the application.`, { tone: "done" });
  sys.msg(pb, pa, "200 OK · 32 ms", `The response returns through both sidecars, each of which records latency, status, and a trace span. Two extra hops cost roughly 1–2 ms.`, { tone: "done" });
  sys.state(b, "slow · 5xx", "danger");
  sys.state(pa, `${A} · retry 1/2`, "compare");
  sys.msg(pa, pb, "retry (attempt 2, budget ok)", `${B} starts failing. ${A}'s sidecar applies the retry policy from the control plane: one retry within budget, with a timeout, without any change to ${A}'s code.`, { tone: "danger", tag: "retry" });
  sys.state(pa, `${A} · ${B} ejected`, "danger");
  sys.msg(pa, a, "503 (outlier ejected, fast)", `After 5 consecutive 5xx the sidecar ejects that ${B} endpoint from its pool (outlier detection: a per-endpoint circuit breaker) and fails fast. Once ${B} recovers, the endpoint is re-admitted after a cool-down.`, { tone: "danger", tag: "eject" });
  sys.state(b, "app code", undefined);
  sys.state(pa, A, undefined);
  sys.state(pb, B, undefined);
  sys.state("ctrl", "config v1 · telemetry", "compare");
  sys.fanin(proxies, "ctrl", "metrics, traces, access logs", `Every sidecar reports uniform metrics and trace spans, so the mesh gives a service graph, golden signals per edge, and distributed traces for free, in the same shape for every language.`, "compare", "telemetry");
  sys.state("ctrl", "config v2", "done");
  sys.state(pa, `${A} · 10% → ${B} v2`, "done");
  sys.msg("ctrl", pa, `route: 10% ${B} → v2`, `Traffic shaping: the control plane updates ${A}'s sidecar to send 10% of ${B} calls to a v2 subset. Canary releases, header-based routing, and fault injection become configuration, not code.`, { tone: "done", tag: "route" });
  sys.state("ctrl", "DOWN", "danger");
  sys.set({ "control plane down": "sidecars keep last config; no new pods or cert rotation", "cost": "≈1–2 ms and a proxy's CPU/memory per pod" });
  sys.note(`Failure modes: the control plane is a new critical dependency (sidecars keep running on their last config, but new pods cannot join and certificates stop rotating); each proxy adds latency and memory to every pod; and debugging now spans app, sidecar, and mesh config, which is a lot of YAML for a small team.`, "pitfalls");
  sys.state("ctrl", "config v2", undefined);
  sys.state(pa, A, undefined);
  sys.note(`Trade-off: a mesh gives uniform mTLS, retries, routing, and observability across every language with zero app changes, in exchange for an extra hop, one more control plane to run, and real operational complexity; worth it at dozens of services in several languages, overkill for a handful where a shared client library would do.`, "done");
  return sys.f.done();
};

// ---------- exports ----------

export const scenariosB: Record<string, SysGen> = {
  "message-queue": messageQueue,
  pubsub,
  "token-bucket": tokenBucket,
  "leaky-bucket": leakyBucket,
  "sliding-window-log": slidingWindowLog,
  "circuit-breaker": circuitBreaker,
  "retry-backoff": retryBackoff,
  bulkhead,
  backpressure,
  "lru-cache": lruCache,
  "lfu-cache": lfuCache,
  mapreduce,
  "stream-windowing": streamWindowing,
  watermarks,
  "kafka-partitions": kafkaPartitions,
  cdc,
  "event-sourcing": eventSourcing,
  "strangler-fig": stranglerFig,
  "blue-green": blueGreen,
  canary,
  "service-mesh": serviceMesh,
};

export const labelsB: Record<string, string> = {
  "message-queue": "Message queue with competing consumers",
  pubsub: "Publish / subscribe",
  "token-bucket": "Token bucket rate limiter",
  "leaky-bucket": "Leaky bucket rate limiter",
  "sliding-window-log": "Sliding window log rate limiter",
  "circuit-breaker": "Circuit breaker",
  "retry-backoff": "Retry with exponential backoff and jitter",
  bulkhead: "Bulkhead isolation",
  backpressure: "Backpressure",
  "lru-cache": "LRU cache eviction",
  "lfu-cache": "LFU cache eviction",
  mapreduce: "MapReduce word count",
  "stream-windowing": "Stream windowing",
  watermarks: "Watermarks and late data",
  "kafka-partitions": "Kafka partitions and consumer groups",
  cdc: "Change data capture",
  "event-sourcing": "Event sourcing",
  "strangler-fig": "Strangler fig migration",
  "blue-green": "Blue-green deployment",
  canary: "Canary release",
  "service-mesh": "Service mesh",
};
