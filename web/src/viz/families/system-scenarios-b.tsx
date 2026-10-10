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

/** Author-supplied keys (capped at `max`), padded from `def` up to `min` so a one-key input still tells the story; the whole default when none are given. */
const keyList = (keys: unknown, def: string[], max: number, min = 1): string[] => {
  const given = Array.isArray(keys) ? keys.slice(0, max).map(String) : [];
  if (given.length === 0) return def.slice(0, max);
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

/** Set a node's readout and return it to its default colour (Sys.state keeps the old tone when none is given). */
const plain = (sys: Sys, id: string, state: string) => {
  sys.state(id, state);
  sys.tone(id, undefined);
};

/** Row tones for a decision log: the newest row is highlighted, older rows keep their verdict colour. */
const verdictTones = (verdicts: boolean[]): (Tone | undefined)[] => verdicts.map((ok, i) => (i === verdicts.length - 1 ? "active" : ok ? "done" : "danger"));

/** Optional number input (fractional allowed), clamped; `def` when absent or not a number. */
const num = (v: unknown, lo: number, hi: number, def: number): number => {
  const n = Number(v);
  return v !== undefined && v !== null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
};

/** Optional list of numbers (e.g. arrival times); undefined when absent or empty. */
const numList = (v: unknown): number[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(Number).filter((x) => Number.isFinite(x));
  return out.length > 0 ? out : undefined;
};

/** Optional short string input. */
const str = (v: unknown, def: string): string => (typeof v === "string" && v.trim() !== "" ? v : def);

/** Round to one decimal place and drop a trailing ".0". */
const r1 = (x: number): number => Math.round(x * 10) / 10;

/** "1 token", "2 tokens", "0.5 tokens". */
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

// ---------- messaging ----------

// Message queue inputs (optional): `requests` (messages, 3–12), `flavor`
// ("visibility": SQS-style visibility timeout, the default; "lease": a task
// queue whose workers hold renewable leases), `effect` (the side effect a
// redelivery repeats) and `dedupe` (how the consumer makes that safe).
const messageQueue: SysGen = (input) => {
  const n = clampInt(input.requests, 3, 12, 12);
  const lease = input.flavor === "lease";
  const effect = str(input.effect, "charged the card");
  const dedupe = str(input.dedupe, "dedupe on message id");
  const item = lease ? "task" : "message";
  const sys = new Sys([
    { id: "prod", label: "Producer", kind: "client", x: 8, y: 50 },
    { id: "q", label: lease ? "Task queue" : "Queue", kind: "queue", x: 45, y: 40, state: "depth 0" },
    { id: "dlq", label: "Dead letters", kind: "queue", x: 45, y: 95, state: `0 ${item}s` },
    { id: "w1", label: "Worker 1", kind: "service", x: 88, y: 20, state: "idle" },
    { id: "w2", label: "Worker 2", kind: "service", x: 88, y: 80, state: "idle" },
  ]);
  const msgs: { id: string; status: string; attempts: number }[] = [];
  const show = (hl?: string[]) =>
    sys.table({
      title: lease ? `Task queue (lease 30 s, renewed every 10 s while working; max attempts 3)` : `Queue contents (visibility timeout 30 s, max receives 3)`,
      head: [item, "status", "attempts"],
      rows: msgs.map((m) => [m.id, m.status, m.attempts]),
      tones: msgs.map((m) => (hl?.includes(m.id) ? "active" : m.status === "acked" ? "done" : m.status === "dead" ? "danger" : undefined)),
    });
  const depth = () => msgs.filter((m) => m.status === "queued" || m.status.startsWith(lease ? "leased" : "in-flight")).length;
  const busy = lease ? "leased" : "in-flight";
  const mid = (i: number) => (lease ? `t${i + 1}` : `m${i + 1}`);
  const burst = Math.min(n, Math.max(3, Math.ceil(n / 2)));
  show();
  sys.set({ pattern: "work queue (competing consumers)", delivery: "at-least-once", "in flight": 0 });
  sys.note(`A ${lease ? "task" : "message"} queue decouples a producer from its consumers in time and in rate: the producer enqueues and moves on; workers pull when they have capacity.`);
  for (let i = 0; i < burst; i++) msgs.push({ id: mid(i), status: "queued", attempts: 0 });
  sys.state("q", `depth ${depth()}`, "compare");
  show(msgs.map((m) => m.id));
  sys.msg("prod", "q", `enqueue ${mid(0)}…${mid(burst - 1)}`, `The producer publishes ${burst} ${item}s; the broker persists each one and acknowledges immediately, so the producer never waits for processing.`, { tone: "active" });
  msgs[0]!.status = `${busy} (w1)`;
  msgs[0]!.attempts = 1;
  sys.state("w1", `processing ${mid(0)}`, "active");
  sys.set({ "in flight": 1 });
  show([mid(0)]);
  sys.msg("q", "w1", `deliver ${mid(0)}`, lease ? `Worker 1 takes ${mid(0)} under a 30 s lease and renews it every 10 s while it works. Nobody else can take a leased task.` : `Worker 1 receives ${mid(0)}. The broker does not delete it; it hides it for a visibility timeout of 30 s so nobody else sees it while the worker works.`, { tone: "compare" });
  msgs[1]!.status = `${busy} (w2)`;
  msgs[1]!.attempts = 1;
  sys.state("w2", `processing ${mid(1)}`, "active");
  sys.set({ "in flight": 2 });
  show([mid(1)]);
  sys.msg("q", "w2", `deliver ${mid(1)}`, `Worker 2 takes ${mid(1)}: two workers process in parallel, and each ${item} goes to exactly one of them (competing consumers).`, { tone: "compare" });
  msgs[0]!.status = "acked";
  plain(sys, "w1", "idle");
  sys.state("q", `depth ${depth()}`, "compare");
  sys.set({ "in flight": 1, acked: 1 });
  show([mid(0)]);
  sys.msg("w1", "q", `ack ${mid(0)}`, `Worker 1 finishes and acknowledges: only now is ${mid(0)} ${lease ? "marked done" : "deleted"}. Ack-after-work is what makes the queue durable against worker crashes.`, { tone: "done" });
  sys.state("w2", "CRASHED", "danger");
  show([mid(1)]);
  sys.note(`Failure mode: worker 2 crashes halfway through ${mid(1)}. No ack was sent, so the ${item} is still in the queue, ${lease ? "held by a lease that nobody is renewing" : "merely invisible"}.`, "crash");
  msgs[1]!.status = `${busy} (w1)`;
  msgs[1]!.attempts = 2;
  sys.state("w1", `processing ${mid(1)} (retry)`, "active");
  show([mid(1)]);
  sys.msg("q", "w1", `redeliver ${mid(1)} (attempt 2)`, lease ? `The lease expires without a renewal and ${mid(1)} is handed out again; worker 1 takes it. This is at-least-once delivery: nothing is lost, but a task can run twice.` : `The visibility timeout expires and ${mid(1)} becomes visible again; worker 1 receives it. This is at-least-once delivery: nothing is lost, but a message can be delivered twice.`, { tone: "compare" });
  msgs[1]!.status = "acked";
  plain(sys, "w1", "idle");
  sys.state("q", `depth ${depth()}`, "compare");
  sys.set({ "in flight": 0, acked: 2 });
  show([mid(1)]);
  sys.msg("w1", "q", `ack ${mid(1)}`, `If worker 2 had already ${effect} before dying, it has now happened twice. Consumers must be idempotent (${dedupe}) because the queue cannot know how far the crashed worker got.`, { tone: "done" });
  // Growth: the producer keeps publishing faster than the workers drain.
  let poison = burst - 1;
  if (n > burst) {
    const before = depth();
    for (let i = burst; i < n; i++) msgs.push({ id: mid(i), status: "queued", attempts: 0 });
    const doneNow = Math.min(2, Math.max(0, burst - 3));
    for (let i = 2; i < 2 + doneNow; i++) {
      msgs[i]!.status = "acked";
      msgs[i]!.attempts = 1;
    }
    poison = 2 + doneNow;
    plain(sys, "w2", "restarted · idle");
    sys.state("q", `depth ${depth()} ↑`, "danger");
    sys.set({ acked: 2 + doneNow, "depth trend": `${before} → ${depth()}` });
    show(msgs.slice(burst).map((m) => m.id));
    sys.msg("prod", "q", `enqueue ${mid(burst)}…${mid(n - 1)}`, `Meanwhile the producer keeps going: ${n - burst} more ${item}${n - burst === 1 ? "" : "s"} arrive ${doneNow === 0 ? "before the workers finish another" : `in the time the workers finish ${doneNow}`}. Depth grows from ${before} to ${depth()}. Depth divided by the drain rate is the delay every new ${item} will see, and its growth rate is the number to alert on.`, { tone: "danger", tag: "backlog" });
  } else {
    plain(sys, "w2", "restarted · idle");
  }
  const pid = mid(poison);
  msgs[poison]!.status = `${busy} (w1)`;
  msgs[poison]!.attempts = 1;
  sys.state("w1", `processing ${pid}`, "active");
  show([pid]);
  sys.msg("q", "w1", `deliver ${pid}`, `${pid} is a poison ${item}: its payload makes the handler throw every time.`, { tone: "compare" });
  msgs[poison]!.status = "queued";
  sys.state("w1", "idle", "danger");
  show([pid]);
  sys.msg("w1", "q", `nack ${pid} (attempt 1 failed)`, `The worker rejects it; the broker makes it available again and increments its ${lease ? "attempt" : "receive"} count.`, { tone: "danger" });
  msgs[poison]!.status = "dead";
  msgs[poison]!.attempts = 3;
  plain(sys, "w1", "idle");
  plain(sys, "q", `depth ${depth()}`);
  sys.state("dlq", `1 ${item} (${pid})`, "danger");
  sys.set({ "dead-lettered": 1 });
  show([pid]);
  sys.msg("q", "dlq", `${pid} after 3 ${lease ? "attempts" : "receives"}`, `After ${lease ? "the third failed attempt" : "the max receive count (3)"} the broker moves ${pid} to the dead-letter queue instead of retrying forever, which would block a worker permanently and hide the bug. Someone inspects and replays it by hand.`, { tone: "danger" });
  sys.set({ watch: `queue depth and oldest-${item} age, not just throughput` });
  sys.note(`Trade-off: the queue buys temporal decoupling and elastic workers at the price of at-least-once semantics (idempotent consumers), loss of end-to-end ordering, and a backlog that can silently grow; alert on ${item} age, because depth alone hides a stalled consumer.`, "done");
  return sys.f.done();
};

/** One retained log, several consumer groups each building its own view from its own offset. */
const logViews: SysGen = () => {
  const views = [
    { id: "V1", name: "Search index", builds: "a document per title" },
    { id: "V2", name: "Cache", builds: "a key per title" },
    { id: "V3", name: "Warehouse", builds: "a row per play" },
  ];
  const sys = new Sys([
    { id: "pub", label: "Play service", kind: "client", x: 8, y: 50 },
    { id: "log", label: "Log: plays", kind: "queue", x: 42, y: 50, state: "end offset 0" },
    ...views.map((v, i) => ({ id: v.id, label: v.name, kind: "service" as const, x: 88, y: [12, 44, 76][i]!, state: "offset 0" })),
    { id: "V4", label: "Recommendations", kind: "service", x: 60, y: 95, state: "not yet built" },
  ]);
  let end = 0;
  const off: Record<string, number | undefined> = { V1: 0, V2: 0, V3: 0, V4: undefined };
  const names: Record<string, string> = { V1: "Search index", V2: "Cache", V3: "Warehouse", V4: "Recommendations" };
  const show = (hl?: string) =>
    sys.table({
      title: `One retained log (end offset ${end}); each view is its own consumer group with its own offset`,
      head: ["consumer group", "committed offset", "lag", "view"],
      rows: Object.keys(names)
        .filter((k) => off[k] !== undefined)
        .map((k) => [names[k]!, off[k]!, end - off[k]!, k === "V4" ? "recommendations per user" : views.find((v) => v.id === k)!.builds]),
      tones: Object.keys(names)
        .filter((k) => off[k] !== undefined)
        .map((k) => (k === hl ? "active" : end - off[k]! > 0 ? "danger" : undefined)),
    });
  const sync = () => {
    for (const k of Object.keys(off)) if (off[k] !== undefined) sys.state(k, `offset ${off[k]}${end - off[k]! > 0 ? ` · lag ${end - off[k]!}` : ""}`, end - off[k]! > 0 ? "danger" : "done");
    sys.state("log", `end offset ${end}`, "compare");
  };
  show();
  sys.set({ "source of truth": "the log", views: "derived, rebuildable", "producer knows": "the log only" });
  sys.note(`One log, many derived views: the play service appends events to one retained log, and every view (a search index, a cache, a warehouse table) is a separate consumer group that reads the same records at its own pace. Reading consumes nothing: each group's progress is just an offset.`);
  end = 3;
  sync();
  show();
  sys.msg("pub", "log", "append plays e0, e1, e2", `The play service appends three events at offsets 0 to 2 and moves on. It does not know which views exist.`, { tone: "active" });
  off.V1 = 3;
  off.V2 = 3;
  off.V3 = 3;
  sync();
  show();
  sys.fanout("log", ["V1", "V2", "V3"], "e0..e2", `All three groups read offsets 0 to 2 independently and fold them into their own view: an index document, a cache entry, warehouse rows. Each commits offset 3. One copy of the data, three readers.`, "done", "read");
  sys.state("V3", "DOWN · offset 3", "danger");
  end = 5;
  off.V1 = 5;
  off.V2 = 5;
  sync();
  sys.state("V3", "DOWN · offset 3", "danger");
  show("V3");
  sys.msg("pub", "log", "append e3, e4", `The warehouse loader goes down; two more plays arrive at offsets 3 and 4. Search and cache read them at once. The warehouse simply falls behind: its offset stays at 3 and its lag is 2. The broker keeps no per-subscriber copy, only the log and an offset per group.`, { tone: "active" });
  off.V3 = 5;
  sync();
  show("V3");
  sys.msg("log", "V3", "e3, e4 (catch-up)", `The loader comes back, resumes from its committed offset 3, and catches up to 5. Nothing was lost and nobody else waited.`, { tone: "done" });
  off.V4 = 0;
  sync();
  show("V4");
  sys.state("V4", "new group · offset 0", "compare");
  sys.note(`A new view, recommendations, is added as a new consumer group starting at offset 0. The producer is not changed and not even told.`, "new view");
  off.V4 = 5;
  sync();
  show("V4");
  sys.msg("log", "V4", "replay e0..e4", `The new group replays the whole retained log, offsets 0 to 4, and builds its view from history, then keeps up with new events like the others. Fixing a buggy view works the same way: run the new code from offset 0 into a fresh table and switch readers over, which is Kappa's reprocessing.`, { tone: "done", tag: "replay" });
  sys.set({ retention: "long enough to rebuild every view (or compacted)" });
  sys.note(`The catch: a view can be rebuilt only from what the log still holds. Retention (or compaction to the latest record per key) must cover the rebuild, and every view is eventually consistent with the log, each lagging by its own offset.`, "retention");
  sys.note(`Trade-off: deriving every view from one log makes adding, fixing and rebuilding views cheap and keeps them consistent with one order of events, at the cost of storing the log for as long as rebuilds need it and of views that are only eventually up to date.`, "done");
  return sys.f.done();
};

// Pub/sub inputs (optional): `nodes` (subscribers, 2–4); `flavor: "log"` shows
// subscribers as consumer groups over one retained log (derived views).
const pubsub: SysGen = (input) => {
  if (input.flavor === "log") return logViews(input);
  if (input.flavor === "presence") return presence(input);
  const { nodes } = input;
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

// Token bucket inputs (all optional): `capacity` (burst, default 5),
// `refill` (seconds, or minutes with `unit: "min"`, per token; default 1),
// `times` (arrival times), `requests` (how many of the schedule to play),
// `keys` (one key per request: a separate bucket per key), and
// `mode: "retry-budget"` (gRPC retryThrottling: failures drain, successes refill).
const tokenBucket: SysGen = (input) => {
  if (input.mode === "retry-budget") return retryBudget(input);
  const cap = clampInt(input.capacity, 1, 20, 5);
  const per = num(input.refill, 0.01, 100000, 1);
  const unit = input.unit === "min" ? "min" : "s";
  const u = unit === "min" ? " min" : "s";
  const keyed = Array.isArray(input.keys) && input.keys.length > 0;
  const defaultTimes = keyed ? [0, 0, 0, 0, 0, per, per, 2 * per, 2 * per] : [...Array.from({ length: cap + 2 }, () => 0), 2 * per, 3 * per, 3 * per, 3 * per, 9 * per];
  const schedule = numList(input.times) ?? defaultTimes;
  const keys = keyed ? (input.keys as string[]).slice(0, 20).map(String) : [];
  const maxN = keyed ? Math.min(keys.length, 20) : Math.min(schedule.length, 20);
  const n = keyed ? maxN : clampInt(input.requests, Math.min(5, maxN), maxN, Math.min(10, maxN));
  const times = Array.from({ length: n }, (_, i) => schedule[Math.min(i, schedule.length - 1)]!);
  const rateText = per === 1 ? `1 token/${unit}` : `1 token every ${per} ${unit}`;
  const unitWord = unit === "min" ? "minute" : "second";
  const sys = new Sys([
    { id: "client", label: keyed ? "Clients" : "Client", kind: "client", x: 8, y: 50 },
    { id: "limiter", label: "Rate limiter", kind: "lb", x: 50, y: 50, state: keyed ? "no buckets yet" : `tokens ${cap}/${cap}` },
    { id: "api", label: "API", kind: "service", x: 92, y: 50, state: "served 0" },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () =>
    sys.table({
      title: keyed ? `Request log (one bucket per key: capacity ${cap}, refill ${rateText})` : `Request log (bucket capacity ${cap}, refill ${rateText})`,
      head: keyed ? ["#", "key", `t (${unit})`, "tokens", "decision", "left"] : ["#", `t (${unit})`, "tokens", "decision", "left"],
      rows: rows.map((r) => [...r]),
      tones: verdictTones(verdicts),
    });
  show();
  sys.set({ capacity: cap, "refill rate": rateText, ...(keyed ? { "bucket per": "key" } : {}), accepted: 0, rejected: 0 });
  sys.note(
    keyed
      ? `Keyed token buckets: the limiter keeps a separate bucket for every key (an IP, an account, a device, a session). Each holds at most ${cap} tokens and gains ${per === 1 ? `one token per ${unitWord}` : `one token every ${per} ${unitWord}s`}; a request spends a token from its own key's bucket only.`
      : `Token bucket: the bucket holds at most ${cap} tokens and gains ${per === 1 ? `1 per ${unitWord}` : `one every ${per} ${unitWord}s`}. A request takes one token; if none is left it is rejected. Capacity sets the largest burst, refill rate sets the sustained rate.`,
  );
  const buckets: Record<string, { tokens: number; last: number }> = {};
  const fmtBuckets = () =>
    Object.entries(buckets)
      .map(([k, b]) => `${k} ${r1(b.tokens)}/${cap}`)
      .join(" · ");
  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < n; i++) {
    const t = times[i]!;
    const key = keyed ? keys[i]! : "";
    const fresh = !(key in buckets);
    if (fresh) buckets[key] = { tokens: cap, last: t };
    const b = buckets[key]!;
    const earned = r1((t - b.last) / per);
    const refilled = r1(Math.min(cap, b.tokens + earned));
    const gained = r1(refilled - b.tokens);
    const since = `${r1(t - b.last)}${u} since t=${b.last}${u}`;
    let refillNote = "";
    if (keyed && fresh) refillNote = `First request from ${key}: its bucket is created full (${cap} tokens). `;
    else if (gained > 0 && earned > gained) refillNote = `${since} would earn ${plural(earned, "token")}, but the bucket holds at most ${cap}: it is full again (${refilled} available). `;
    else if (gained > 0) refillNote = `${plural(gained, "token")} refilled since t=${b.last}${u} (${refilled} available). `;
    b.tokens = refilled;
    b.last = t;
    const who = keyed ? ` from ${key}` : "";
    const keyCell = keyed ? [key] : [];
    if (b.tokens >= 1) {
      b.tokens = r1(b.tokens - 1);
      accepted += 1;
      rows.push([i + 1, ...keyCell, t, r1(b.tokens + 1), "accept", b.tokens]);
      verdicts.push(true);
      sys.state("limiter", keyed ? fmtBuckets() : `tokens ${b.tokens}/${cap}`, b.tokens < 1 ? "danger" : "done");
      sys.state("api", `served ${accepted}`, "done");
      sys.set({ accepted, rejected });
      show();
      sys.msg("limiter", "api", `#${i + 1}${keyed ? ` ${key}` : ""} (t=${t}${u})`, `Request #${i + 1}${who} at t=${t}${u}: ${refillNote}Take one token → forwarded; ${b.tokens} left${keyed ? ` in ${key}'s bucket` : ""}.`, { tone: "done" });
    } else {
      rejected += 1;
      const wait = r1((1 - b.tokens) * per);
      const dry = b.tokens === 0 ? "is empty" : `holds only ${b.tokens} of a token`;
      rows.push([i + 1, ...keyCell, t, b.tokens, "reject", b.tokens]);
      verdicts.push(false);
      sys.state("limiter", keyed ? fmtBuckets() : `tokens ${b.tokens}/${cap}`, "danger");
      sys.set({ accepted, rejected });
      show();
      sys.msg(
        "limiter",
        "client",
        `#${i + 1} → 429`,
        keyed
          ? `Request #${i + 1}${who} at t=${t}${u}: ${refillNote}${key}'s bucket ${dry} → rejected with 429 and Retry-After ${wait}${u}, when its next token arrives. No other key's bucket is touched.`
          : `Request #${i + 1} at t=${t}${u}: ${refillNote}the bucket ${dry} → rejected with 429 and a Retry-After hint. The client, not the API, pays for the overload.`,
        { tone: "danger" },
      );
    }
    if (sys.f.full) break;
  }
  if (keyed) {
    sys.set({ buckets: Object.keys(buckets).length, "state per key": "tokens + last refill time" });
    sys.note(`One key exhausting its bucket never touches another key's: the limit is per key. Choosing the key is the real decision. Per IP punishes a class behind one NAT address; per account stops guessing against one account from many addresses; the limiter keeps two numbers per key, so idle keys can be expired.`, "keys");
  } else {
    sys.set({ "burst allowed": `${cap} at once`, sustained: rateText });
    sys.note(`Failure mode: capacity too large lets a client dump ${cap} requests on the API in one instant, so downstream must absorb that burst; capacity too small rejects legitimate bursty traffic such as a page that fires several API calls at once.`, "burst");
  }
  sys.note(`Trade-off: token bucket allows bursts up to capacity while enforcing an average rate, needs only two numbers per ${keyed ? "key" : "client"} (tokens, last refill time), and is what most API gateways implement; compare the leaky bucket, which forbids bursts and smooths output instead.`, "done");
  return sys.f.done();
};

/** gRPC retryThrottling (gRFC A6): failed attempts drain the bucket, successes refill it by tokenRatio, retries only above half. */
const retryBudget: SysGen = (input) => {
  const max = clampInt(input.capacity, 4, 100, 10);
  const ratio = num(input.ratio, 0.01, 1, 0.1);
  const maxAttempts = clampInt(input.attempts, 2, 5, 3);
  const half = max / 2;
  const sys = new Sys([
    { id: "client", label: "gRPC channel", kind: "client", x: 8, y: 50, state: "RPC 1" },
    { id: "budget", label: "Retry budget", kind: "lb", x: 50, y: 50, state: `tokens ${max}/${max}` },
    { id: "svc", label: "Server", kind: "service", x: 92, y: 50, state: "DOWN", tone: "danger" },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () => sys.table({ title: `Retry budget (maxTokens ${max}, tokenRatio ${ratio}; retry only while tokens > ${half})`, head: ["step", "attempt", "result", "tokens after", "retry allowed?"], rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  show();
  sys.set({ maxTokens: max, tokenRatio: ratio, threshold: `tokens > ${half}`, maxAttempts, attempts: 0, retries: 0 });
  sys.note(`A retry budget is a token bucket that the outcomes fill instead of the clock. gRPC's retryThrottling starts at maxTokens (${max}); every failed attempt removes 1 token, every success adds ${ratio}, and a retry may be sent only while the bucket holds more than half (${half}).`);
  let tokens = max;
  let step = 0;
  let attempts = 0;
  let retries = 0;
  const attempt = (rpc: number, a: number): boolean => {
    step += 1;
    attempts += 1;
    if (a > 1) retries += 1;
    tokens = Math.max(0, r1(tokens - 1));
    const allowed = tokens > half && a < maxAttempts;
    const why = a >= maxAttempts && tokens > half ? `maxAttempts reached; RPC ${rpc} fails` : allowed ? "yes" : `no: ${tokens} is not above ${half}; RPC ${rpc} fails`;
    rows.push([step, `RPC ${rpc}, attempt ${a}`, "UNAVAILABLE", tokens, why]);
    verdicts.push(allowed);
    sys.state("budget", `tokens ${tokens}/${max}`, tokens > half ? "compare" : "danger");
    sys.state("client", `RPC ${rpc} · attempt ${a}`, a > 1 ? "compare" : undefined);
    sys.set({ attempts, retries });
    show();
    return allowed;
  };
  const rpcs: { rpc: number; note: (a: number, ok: boolean) => string }[] = [
    { rpc: 1, note: (a, ok) => (a === 1 ? `RPC 1, attempt 1: the server is hard down and answers UNAVAILABLE. The failure costs a token: ${tokens} left, still above ${half}, so a retry is allowed.` : ok ? `Attempt ${a} fails too: ${tokens} tokens left, still above ${half}, so the channel may retry again.` : `Attempt ${a} fails: ${tokens} tokens left. The budget would allow another retry, but the policy's maxAttempts of ${maxAttempts} is reached, so RPC 1 fails.`) },
    { rpc: 2, note: (a, ok) => (a === 1 ? `RPC 2, attempt 1 fails: ${tokens} tokens left, still above ${half}, so one retry is allowed.` : ok ? `Attempt ${a} fails: ${tokens} left.` : `The retry fails and the bucket falls to ${tokens}, which is not above ${half}: no more retries, and RPC 2 fails after ${a} attempts.`) },
    { rpc: 3, note: () => `RPC 3 makes one attempt and fails: ${tokens} tokens left. The budget is below the threshold, so it is not retried at all. Retries have switched themselves off after ${retries} of them.` },
  ];
  for (const { rpc, note } of rpcs) {
    for (let a = 1; a <= maxAttempts; a++) {
      const ok = attempt(rpc, a);
      sys.msg("client", "svc", `RPC ${rpc} attempt ${a} → UNAVAILABLE`, note(a, ok), { tone: "danger", tag: a > 1 ? "retry" : "attempt" });
      if (!ok) break;
    }
  }
  const later = Math.ceil(tokens) + 2;
  const startRpc = 4;
  for (let i = 0; i < later; i++) {
    step += 1;
    attempts += 1;
    tokens = Math.max(0, r1(tokens - 1));
  }
  rows.push([`${step - later + 1}–${step}`, `RPCs ${startRpc}–${startRpc + later - 1}, attempt 1 each`, "UNAVAILABLE", tokens, "no"]);
  verdicts.push(false);
  sys.state("budget", `tokens ${tokens}/${max}`, "danger");
  sys.state("client", "1 attempt per RPC", "danger");
  sys.set({ attempts, retries, amplification: `${r1(attempts / (startRpc + later - 1))}× and falling to 1×` });
  show();
  sys.msg("client", "svc", `RPCs ${startRpc}–${startRpc + later - 1}: 1 attempt each`, `Every later RPC makes exactly one attempt; the bucket falls to ${tokens} and stays there. After ${retries} retries in total the outage adds no extra load: amplification tends to exactly 1×, where a fixed "${maxAttempts} attempts each" would have tripled it.`, { tone: "danger", tag: "throttled" });
  const needed = Math.floor(half / ratio) + 1;
  tokens = r1(Math.min(max, tokens + needed * ratio));
  rows.push([`+${needed}`, `${needed} successful RPCs`, "OK", tokens, `yes: ${tokens} > ${half}`]);
  verdicts.push(true);
  sys.state("svc", "healthy", "done");
  sys.state("budget", `tokens ${tokens}/${max}`, "done");
  sys.state("client", "retries allowed again", "done");
  show();
  sys.msg("svc", "client", `${needed} × OK (+${ratio} each)`, `The server heals. Each success adds only ${ratio}, so it takes ${needed} successes to lift the bucket from 0 to ${tokens}, just above ${half}, before retries resume. The budget returns retries only after the dependency has proved itself.`, { tone: "done", tag: "recover" });
  const f = r1(100 / (1 / ratio + 1));
  sys.set({ "drift per attempt": `${ratio}(1 − f) − f`, "retries off when failures exceed": `≈ ${f}%` });
  sys.note(`In a partial outage where a fraction f of attempts fail, the tokens drift by ${ratio}(1 − f) − f per attempt, which is negative once f exceeds about ${f}%. Retries switch themselves off exactly in the regime where they stop helping and start adding load.`, "drift");
  sys.note(`Trade-off: a per-request attempt count multiplies load by the attempt count in an outage; a budget bounds retries as a fraction of traffic, costs one number per server, and lets a healthy system retry freely. Finagle, Linkerd and Envoy budget the same way (a percentage of requests with a small floor).`, "done");
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
  sys.set({ "max added latency": `${(cap - 1) / leak} s ((bucket size − 1) ÷ leak rate)` });
  sys.note(`Failure mode: the bucket hides overload as latency. With size ${cap} and ${leak}/s, the last of ${cap} queued requests waits ${(cap - 1) / leak} s before it is even started, (size − 1) ÷ leak rate; size the bucket by the delay you can accept, not by memory.`, "latency");
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

// Circuit breaker inputs (all optional): `requests` (calls shed while open),
// `caller`, `dependency`, `timeoutMs` (default 2000), `fallback` (what the
// caller serves while open), `openFor` (seconds before half-open, default 5), `contract: true` (show that a 4xx is not counted
// while 5xx and timeouts are), `mode: "spend"` (the same state machine
// tripping on a daily spend threshold instead of errors).
const circuitBreaker: SysGen = (input) => {
  if (input.mode === "spend") return spendBreaker(input);
  const shed = clampInt(input.requests, 1, 100000, 15);
  const threshold = 3;
  const openFor = clampInt(input.openFor, 1, 3600, 5);
  const callerName = str(input.caller, "Checkout");
  const depName = str(input.dependency, "Payments API");
  const tMs = num(input.timeoutMs, 1, 60000, 2000);
  const tLabel = tMs >= 1000 ? `${tMs / 1000} s` : `${tMs} ms`;
  const tCell = `${tMs} ms`;
  const fallback = str(input.fallback, `retry later, a cached quote, or "payment pending"`);
  const contract = input.contract === true;
  const sys = new Sys([
    { id: "client", label: callerName, kind: "service", x: 8, y: 50 },
    { id: "breaker", label: "Breaker", kind: "lb", x: 50, y: 50, state: `CLOSED · 0/${threshold} failures` },
    { id: "dep", label: depName, kind: "external", x: 92, y: 50, state: "healthy" },
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
  sys.set({ "failure threshold": threshold, "open timeout": `${openFor} s`, "half-open trials": 1, ...(contract ? { "counts as failure": "timeouts and 5xx, never 4xx" } : {}), state: "CLOSED" });
  sys.note(`Circuit breaker: a proxy in front of a dependency with three states. CLOSED passes calls and counts failures; after ${threshold} consecutive failures it OPENS and fails every call instantly; after ${openFor} s it goes HALF-OPEN and lets one trial call decide.`);
  let c = call("CLOSED", "200 OK", "40 ms", true);
  sys.msg("breaker", "dep", `#${c} → 200 OK`, `Normal operation: the breaker is CLOSED and forwards the call; a success resets the failure counter.`, { tone: "done" });
  if (contract) {
    c = call("CLOSED", "400 Bad Request (not counted)", "35 ms", true);
    sys.msg("dep", "breaker", `#${c} → 400 (not counted)`, `Call #${c} comes back 400: the request itself was invalid. A 4xx says the caller is wrong and the dependency is fine, so the breaker does not count it; otherwise one buggy client sending bad requests would open the breaker for every other caller. Still 0/${threshold}.`, { tone: "compare", tag: "4xx" });
  }
  sys.state("dep", "degraded · timing out", "danger");
  c = call("CLOSED", "timeout", tCell, false);
  sys.state("breaker", `CLOSED · 1/${threshold} failures`, "compare");
  sys.msg("breaker", "dep", `#${c} → timeout (${tLabel})`, `${depName} starts timing out. Call #${c} holds a ${callerName} request for the full ${tLabel} timeout before failing; the breaker counts failure 1 of ${threshold}.`, { tone: "danger" });
  if (contract) {
    c = call("CLOSED", "503 Service Unavailable", "12 ms", false);
    sys.state("breaker", `CLOSED · 2/${threshold} failures`, "compare");
    sys.msg("dep", "breaker", `#${c} → 503`, `Call #${c} gets a 503. A 5xx says the dependency is failing, so it counts: failure 2 of ${threshold}. The error contract (4xx means fix your request, 5xx means try later) is exactly what tells the breaker which is which.`, { tone: "danger", tag: "5xx" });
  } else {
    c = call("CLOSED", "timeout", tCell, false);
    sys.state("breaker", `CLOSED · 2/${threshold} failures`, "compare");
    sys.msg("breaker", "dep", `#${c} → timeout (${tLabel})`, `Failure 2 of ${threshold}. Every slow failure so far has held its caller for the full ${tLabel}; multiplied by every request in flight, that is how one sick dependency drags its callers down with it.`, { tone: "danger" });
  }
  c = call("CLOSED → OPEN", "timeout", tCell, false);
  sys.state("breaker", "OPEN · opened at t=0", "danger");
  sys.set({ state: "OPEN", "opened at": "t=0" });
  sys.msg("breaker", "dep", `#${c} → timeout (${tLabel})`, `Failure ${threshold} of ${threshold}: the threshold is reached and the breaker trips OPEN.`, { tone: "danger" });
  c = call("OPEN", "503 (breaker)", "<1 ms", false);
  sys.msg("breaker", "client", `#${c} → 503 immediately`, `While OPEN, the breaker rejects call #${c} in under a millisecond without touching ${depName}: a slow failure has been turned into a fast one, and the caller is free to serve its fallback (${fallback}).`, { tone: "danger" });
  const firstShed = calls + 1;
  calls += shed;
  rows.push([shed === 1 ? `${firstShed}` : `${firstShed}–${calls}`, "OPEN", `${shed} × 503 (breaker)`, "<1 ms each"]);
  verdicts.push(false);
  show();
  sys.set({ "calls shed while open": shed, "waits avoided": `${shed} × ${tLabel}` });
  sys.msg("breaker", "client", shed === 1 ? `#${firstShed} → 503` : `#${firstShed}–#${calls}: ${shed} × 503`, `Over the next ${openFor} s the breaker sheds ${shed === 1 ? `call #${firstShed}` : `calls #${firstShed} to #${calls}, ${shed} more,`} the same way. ${depName} gets quiet time to recover instead of a queue of retries.`, { tone: "danger", tag: "shed" });
  sys.state("breaker", "HALF-OPEN · 1 trial", "compare");
  sys.set({ state: "HALF-OPEN" });
  sys.note(`The open timeout (${openFor} s) elapses: the breaker moves to HALF-OPEN and will allow exactly one trial call through to probe ${depName}.`, "timer");
  c = call("HALF-OPEN → OPEN", "timeout", tCell, false);
  sys.state("breaker", `OPEN · opened at t=${openFor}`, "danger");
  sys.set({ state: "OPEN", "opened at": `t=${openFor}`, "probe calls": 1 });
  sys.msg("breaker", "dep", `#${c} trial → timeout`, `Trial call #${c} fails: ${depName} is still sick. Back to OPEN for another ${openFor} s (many implementations back this timeout off exponentially).`, { tone: "danger" });
  sys.state("dep", "healthy", "done");
  sys.state("breaker", "HALF-OPEN · 1 trial", "compare");
  sys.set({ state: "HALF-OPEN" });
  sys.note(`${depName} recovers. Another ${openFor} s pass and the breaker goes HALF-OPEN again.`, "timer");
  c = call("HALF-OPEN → CLOSED", "200 OK", "45 ms", true);
  sys.state("breaker", `CLOSED · 0/${threshold} failures`, "done");
  sys.set({ state: "CLOSED", "probe calls": 2 });
  sys.msg("breaker", "dep", `#${c} trial → 200 OK`, `Trial call #${c} succeeds: the breaker CLOSES and resets its failure counter. Traffic flows normally again, and the outage cost two probe calls, one failed and one successful, instead of ${shed} more waits for a timeout.`, { tone: "done" });
  sys.set({ fallback: "cached / degraded response, or an honest error fast" });
  sys.note(`Failure modes: a threshold that counts a single flaky call trips too often (use a failure rate over a sliding window and a minimum volume instead of a raw count); one breaker shared across unrelated endpoints lets a broken /refund take down /charge; and a breaker without a fallback still fails the user, just faster.`, "pitfalls");
  sys.note(`Trade-off: the breaker sacrifices the few calls that would have succeeded during the open period in exchange for freeing the caller's resources and giving the dependency room to recover; it makes failure explicit and fast, which is what lets the rest of the system stay up.`, "done");
  return sys.f.done();
};

/** The breaker's state machine with spend as the trip signal: a global daily cost fuse. */
const spendBreaker: SysGen = (input) => {
  const budget = clampInt(input.threshold, 10, 1000000, 500);
  const shed = clampInt(input.requests, 1, 100000, 16);
  const sys = new Sys([
    { id: "client", label: "AI routes", kind: "service", x: 8, y: 50 },
    { id: "breaker", label: "Spend breaker", kind: "lb", x: 50, y: 50, state: `CLOSED · $0 / $${budget}` },
    { id: "dep", label: "Model API", kind: "external", x: 92, y: 50, state: "billing per token" },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const show = () => sys.table({ title: `Today's AI calls (UTC day; global threshold $${budget}, an example figure)`, head: ["calls", "breaker", "outcome", "spend today"], rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  show();
  sys.set({ "trip signal": "priced usage today, all users", threshold: `$${budget} per day`, state: "CLOSED", "spend today": "$0" });
  sys.note(`The same three-state machine, with a different signal. Instead of counting failures, this breaker sums today's priced usage across all users. CLOSED while the total is under a daily threshold; OPEN once it is crossed, sending AI features down the existing disabled path; HALF-OPEN when the next UTC day begins.`);
  const s1 = Math.round(budget * 0.24);
  rows.push(["1–2,000", "CLOSED", "200 OK, priced and added", `$${s1}`]);
  verdicts.push(true);
  sys.state("breaker", `CLOSED · $${s1} / $${budget}`, "done");
  sys.set({ "spend today": `$${s1}` });
  show();
  sys.msg("breaker", "dep", "coach turns, quiz generation", `Morning: calls pass straight through. After each one the breaker prices the tokens it used (input, output, cache reads and writes) and adds them to today's total: $${s1} of $${budget}. A closed breaker costs one addition per call.`, { tone: "done" });
  const s2 = Math.round(budget * 0.97);
  rows.push(["2,001–9,000", "CLOSED", "200 OK; spend climbing fast", `$${s2}`]);
  verdicts.push(true);
  sys.state("breaker", `CLOSED · $${s2} / $${budget}`, "compare");
  sys.set({ "spend today": `$${s2}` });
  show();
  sys.msg("breaker", "dep", "traffic spike", `Afternoon: a spike (a viral post, a scripted abuser spread over many accounts, or a prompt change that tripled output) pushes the total to $${s2}. Every user is inside their own daily budget; it is the sum that is running away, which only a global breaker can see.`, { tone: "compare" });
  const s3 = budget + 2;
  rows.push(["9,001", "CLOSED → OPEN", "200 OK; total crosses the threshold", `$${s3}`]);
  verdicts.push(false);
  sys.state("breaker", `OPEN · $${s3} / $${budget}`, "danger");
  sys.set({ state: "OPEN", "spend today": `$${s3}`, paged: "on-call" });
  show();
  sys.msg("breaker", "dep", "call 9,001 → total $" + s3, `Call 9,001 takes the total to $${s3}, over $${budget}: the breaker trips OPEN and pages someone. Money already spent stays spent; the breaker bounds what comes next.`, { tone: "danger", tag: "trip" });
  rows.push(["9,002", "OPEN", "AI disabled message, no model call", `$${s3}`]);
  verdicts.push(false);
  show();
  sys.msg("breaker", "client", "AiDisabled: graceful message", `Call 9,002 never reaches the model. The route takes the existing AI-disabled path and answers at once with a friendly "AI features are paused for today"; lessons, practice and everything else keep working. Cost of the call: $0.`, { tone: "danger" });
  rows.push([`next ${shed}`, "OPEN", `${shed} × AI disabled`, `$${s3}`]);
  verdicts.push(false);
  sys.set({ "calls refused while open": shed });
  show();
  sys.msg("breaker", "client", `${shed} × AiDisabled`, `For the rest of the day every AI call is refused the same way (${shed} more here). The total stays at $${s3}: the open breaker is a hard ceiling on the bill, not a slowdown.`, { tone: "danger", tag: "shed" });
  sys.state("breaker", `HALF-OPEN · $0 / $${budget}`, "compare");
  sys.set({ state: "HALF-OPEN", "spend today": "$0" });
  rows.push(["00:00 UTC", "OPEN → HALF-OPEN", "new day: total resets", "$0"]);
  verdicts.push(true);
  show();
  sys.note(`Midnight UTC: a new day, a new total of $0. The breaker goes HALF-OPEN: the first calls of the day are let through as trials, because whatever drove yesterday's spike may still be running.`, "timer");
  rows.push(["1–500", "HALF-OPEN → CLOSED", "200 OK; spend rate normal", `$${Math.round(budget * 0.03)}`]);
  verdicts.push(true);
  sys.state("breaker", `CLOSED · $${Math.round(budget * 0.03)} / $${budget}`, "done");
  sys.set({ state: "CLOSED", "spend today": `$${Math.round(budget * 0.03)}` });
  show();
  sys.msg("breaker", "dep", "trial traffic → 200 OK", `The trial calls cost what calls normally cost, so the breaker CLOSES. Had the spike still been running, the total would have climbed back to the threshold and the breaker would have opened again.`, { tone: "done" });
  sys.set({ "per-user budget": "bounds one learner's day", "spend breaker": "bounds the whole bill" });
  sys.note(`Fuse and bill are different wires. Per-user budgets bound what one learner can cost; multiplied by every user they bound nothing useful. The spend breaker is the global fuse, and it reuses a failure path the product already has, so tripping it degrades the app instead of breaking it.`, "done");
  return sys.f.done();
};

// Retry inputs (optional): `requests` (max attempts, 3–6), `deadlineMs` (the
// caller's deadline: no attempt starts unless it can finish inside it),
// `attemptMs` (how long a failed attempt takes; default 0, or 120 with a
// deadline), `example` (a non-idempotent call that must not be retried blindly).
const retryBackoff: SysGen = (input) => {
  const attempts = clampInt(input.requests, 3, 6, 4);
  const deadline = input.deadlineMs === undefined ? undefined : num(input.deadlineMs, 50, 600000, 1000);
  const attemptMs = num(input.attemptMs, 0, 60000, deadline === undefined ? 0 : 120);
  const example = str(input.example, `"charge card" call`);
  const base = 100;
  const factor = 2;
  const cap = 2000;
  const rnd = lcg(7);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 8, y: 30 },
    { id: "herd", label: "999 other clients", kind: "client", x: 8, y: 80 },
    { id: "svc", label: "Service", kind: "service", x: 92, y: 50, state: "overloaded", tone: "danger" },
  ]);
  const rows: Row[] = [];
  const verdicts: boolean[] = [];
  const head = deadline === undefined ? ["attempt", "outcome", "backoff", "with jitter"] : ["attempt", "starts at", "outcome", "backoff", "with jitter"];
  const show = () => sys.table({ title: `Attempts (base ${base} ms, factor ${factor}, cap ${cap} ms, full jitter${deadline === undefined ? "" : `; deadline ${deadline} ms, each attempt ${attemptMs} ms`})`, head, rows: rows.map((r) => [...r]), tones: verdictTones(verdicts) });
  show();
  sys.set({ "base delay": `${base} ms`, factor, "max attempts": attempts, jitter: "full (random 0..delay)", ...(deadline === undefined ? {} : { deadline: `${deadline} ms` }) });
  sys.note(
    `Retry with exponential backoff: after each failure wait base × factor^n, so the delay doubles every time (${base}, ${base * factor}, ${base * factor * factor}… ms). Jitter randomises each wait so that clients that failed together do not retry together.${deadline === undefined ? "" : ` And every attempt lives inside the caller's deadline of ${deadline} ms: an attempt that cannot finish before it is not started.`}`,
  );
  let elapsed = 0;
  let waited = 0;
  let gaveUp = false;
  for (let k = 1; k < attempts; k++) {
    const delay = Math.min(cap, base * Math.pow(factor, k - 1));
    const jittered = Math.round(rnd() * delay);
    const start = elapsed;
    elapsed += attemptMs;
    rows.push(deadline === undefined ? [k, "503", `${delay} ms`, `${jittered} ms`] : [k, `${start} ms`, "503", `${delay} ms`, `${jittered} ms`]);
    verdicts.push(false);
    show();
    sys.state("client", `attempt ${k} · t=${start} ms`, "compare");
    sys.msg("client", "svc", `attempt ${k} → 503`, `Attempt ${k}${deadline === undefined ? "" : `, started at ${start} ms,`} fails with 503 (overloaded)${attemptMs > 0 ? ` after ${attemptMs} ms` : ""}. A 503 or a timeout is retryable; a 400 or 404 is not, and retrying it only adds load.`, { tone: "danger" });
    if (deadline !== undefined && elapsed + jittered + attemptMs > deadline) {
      rows[rows.length - 1]![4] = `${jittered} ms (not taken)`;
      show();
      gaveUp = true;
      sys.state("client", `gave up · t=${elapsed} ms`, "danger");
      sys.set({ "total wait": `${waited} ms`, "remaining at give-up": `${deadline - elapsed} ms` });
      sys.note(`The next wait would be ${jittered} ms, and attempt ${k + 1} would then need ${attemptMs} ms: ${elapsed} + ${jittered} + ${attemptMs} = ${elapsed + jittered + attemptMs} ms, past the ${deadline} ms deadline. So the client stops now and returns DEADLINE_EXCEEDED at ${elapsed} ms instead of sending an attempt whose answer nobody would wait for.`, "deadline");
      break;
    }
    elapsed += jittered;
    waited += jittered;
    sys.state("client", `sleeping ${jittered} ms`, "muted");
    sys.note(`Backoff: the schedule says wait ${delay} ms; full jitter picks a uniform random value in [0, ${delay}], here ${jittered} ms. Next attempt at t=${elapsed} ms${deadline === undefined ? "" : `, leaving ${deadline - elapsed} ms of the deadline`}.`, "wait");
  }
  if (!gaveUp) {
    rows.push(deadline === undefined ? [attempts, "200 OK", "—", "—"] : [attempts, `${elapsed} ms`, "200 OK", "—", "—"]);
    verdicts.push(true);
    show();
    sys.state("svc", "recovering", "done");
    sys.state("client", `attempt ${attempts} · t=${elapsed} ms`, "done");
    sys.set({ "total wait": `${waited} ms` });
    sys.msg("client", "svc", `attempt ${attempts} → 200 OK`, `Attempt ${attempts} succeeds after ${waited} ms of total waiting. Had every retry fired immediately, all ${attempts} would have landed inside the same overload window and failed.`, { tone: "done" });
  }
  sys.state("svc", "OVERLOADED (retry storm)", "danger");
  sys.fanin(["client", "herd"], "svc", `1,000 retries at exactly t+${base} ms`, `Failure mode without jitter: 1,000 clients that failed at the same instant all sleep exactly ${base} ms and retry in lockstep; the service, which had just started to recover, is hit by the same wave again, now synchronised. Retries turned an outage into a longer one.`, "danger", "storm");
  sys.state("svc", "recovering", "compare");
  sys.fanin(["client", "herd"], "svc", `retries spread over 0–${base} ms`, `With full jitter the same 1,000 retries arrive spread across the whole interval, and the service sees a gentle ramp it can actually serve. Jitter is not optional; it is the part that makes backoff work at scale.`, "done", "jitter");
  sys.set({ "retry budget": "e.g. retries ≤ 10% of requests", idempotency: "required for anything but reads" });
  sys.note(`Two more rules: cap retries with a budget (retries as a percentage of traffic) so a full outage cannot multiply load by the attempt count, and only retry operations that are idempotent: a ${example} that timed out but succeeded would otherwise happen twice.`, "rules");
  sys.note(`Trade-off: retries turn transient failures into successes at the cost of latency and extra load exactly when the system can least afford it; exponential backoff bounds the load, jitter de-synchronises it, and a budget plus a circuit breaker stop it when the failure is not transient.`, "done");
  return sys.f.done();
};

// Bulkhead inputs (optional): `nodes` (dependencies, 2–4), `slow` (name of the
// dependency that degrades, default Search), `slowMs` (its latency when slow,
// default 8000) and `normalMs` (its usual latency, default 50).
const bulkhead: SysGen = (input) => {
  const d = clampInt(input.nodes, 2, 4, 3);
  const custom = typeof input.slow === "string" && input.slow.trim() !== "";
  const slowLabel = custom ? String(input.slow) : "Search";
  const others = ["Search", "Recs", "Email"].filter((x) => !slowLabel.toLowerCase().startsWith(x.toLowerCase().slice(0, 3)));
  const depNames = ["Payments", slowLabel, ...others].slice(0, d);
  const slowMs = num(input.slowMs, 1, 600000, 8000);
  const normalMs = num(input.normalMs, 1, 600000, 50);
  const ms = (v: number) => (v >= 1000 ? `${v / 1000} s` : `${v} ms`);
  const ratio = r1(slowMs / normalMs);
  const feature = custom ? slowLabel.toLowerCase() : "search box";
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
  sys.set({ "shared pool": `${total} threads`, "slow dependency": slowName, "p99 of slow calls": ms(slowMs) });
  sys.note(`Bulkhead: partition resources (threads, connections, instances) per dependency so a failure in one compartment cannot flood the others, like the watertight compartments in a ship's hull. First, the version without it.`);
  sys.state(slow, `p99 ${ms(slowMs)}`, "danger");
  sys.note(`${slowName} becomes slow: calls that took ${ms(normalMs)} now hang for ${ms(slowMs)} before timing out. Nothing else has changed.`, "degrade");
  shared[slow] = 6;
  sys.state("app", `pool 6/${total}`, "compare");
  showShared(slow);
  sys.msg("app", slow, `6 calls in flight (${ms(slowMs)} each)`, `Every request to ${slowName} holds a gateway thread for ${ms(slowMs)} instead of ${ms(normalMs)}; 6 are in flight and the shared pool is half gone.`, { tone: "danger" });
  shared[slow] = total;
  sys.state("app", `pool ${total}/${total} EXHAUSTED`, "danger");
  showShared(slow);
  sys.msg("app", slow, `${total} calls in flight`, `More ${slowName} traffic arrives at the normal rate, but calls now leave ${ratio}× slower than they enter; ${slowName} alone holds all ${total} threads.`, { tone: "danger" });
  sys.msg("client", "app", "POST /checkout", `A checkout request arrives. It needs ${depNames[0]}, which is perfectly healthy.`);
  sys.msg("app", "client", "503 (no thread available)", `Failure mode: it is rejected anyway, because there is no thread to run it. A slow ${custom ? `${feature} service` : feature} has taken down ${depNames[0]!.toLowerCase()}; one dependency's latency became every feature's outage.`, { tone: "danger" });
  for (const id of depIds) shared[id] = 0;
  sys.state("app", `pools ${depIds.length} × ${per}`, "compare");
  showOwn();
  sys.set({ bulkheads: `${d} pools × ${per} threads`, "worst case": `${slowName} can hold at most ${per}` });
  sys.note(`The fix: split the ${total} threads into ${d} pools of ${per}, one per dependency. A call to ${slowName} may only use a ${slowName} thread; when that pool is full, the call is rejected immediately instead of waiting.`, "fix");
  own[slow] = per;
  showOwn(slow);
  sys.msg("app", slow, `${per} calls in flight (pool full)`, `${slowName} degrades exactly as before and fills its ${per}-thread pool, but it cannot borrow from anyone else.`, { tone: "danger" });
  sys.msg("app", "client", `${custom ? slowLabel.toLowerCase() : "search"} unavailable (fast)`, `The next ${slowName} call finds its pool full and fails in microseconds with a clear "${custom ? slowLabel.toLowerCase() : "search"} unavailable"; the page renders without the ${feature} instead of hanging.`, { tone: "danger" });
  own[depIds[0]!] = 1;
  showOwn(depIds[0]!);
  sys.msg("app", depIds[0]!, "POST /charge (1/" + per + ")", `Checkout arrives, takes a ${depNames[0]} thread from a pool with ${per - 1} to spare, and succeeds. The compartment held: the leak in ${slowName} never reached ${depNames[0]}.`, { tone: "done" });
  own[slow] = 0;
  own[depIds[0]!] = 0;
  plain(sys, slow, "healthy");
  showOwn();
  sys.note(`${slowName} recovers and its pool drains back to 0. Failure mode of the fix itself: pool sizing. Too small and a normal traffic spike to one dependency rejects legitimate calls (a self-inflicted outage); too large and the isolation is nominal. Size from measured concurrency (rate × latency) with headroom, and alert on rejections.`, "sizing");
  sys.note(`Trade-off: bulkheads cap the blast radius of any one dependency at its compartment's size, at the cost of lower peak utilisation (idle threads in one pool cannot help another) and one more number per dependency to tune; the same idea applies to connection pools, worker processes, and whole availability zones.`, "done");
  return sys.f.done();
};

/** Load shedding at the edge: a bounded queue admits what fits and rejects the rest at once. */
const edgeReject: SysGen = (input) => {
  const burst = clampInt(input.requests, 10, 40, 20);
  const cap = 8;
  const rate = 2;
  const sys = new Sys([
    { id: "client", label: "Clients", kind: "client", x: 8, y: 50 },
    { id: "edge", label: "Edge", kind: "lb", x: 36, y: 50, state: "admitting" },
    { id: "q", label: "Bounded queue", kind: "queue", x: 64, y: 50, state: `0/${cap}` },
    { id: "w", label: "Worker", kind: "service", x: 92, y: 50, state: `${rate} per tick` },
  ]);
  const q: string[] = [];
  let next = 1;
  let admitted = 0;
  let rejected = 0;
  const show = () => sys.table({ title: `Queue (capacity ${cap}, served ${rate} per tick)`, head: ["slot", "request", "waits (ticks)"], rows: q.map((m, i) => [i + 1, m, Math.floor(i / rate) + 1]), tones: q.map((_, i) => (i >= cap - rate ? "danger" : undefined)) });
  show();
  sys.set({ "queue capacity": cap, "service rate": `${rate}/tick`, admitted: 0, rejected: 0 });
  sys.note(`Load shedding at the edge: the queue in front of the worker holds at most ${cap} requests and the worker serves ${rate} per tick. A request that finds the queue full is rejected immediately with a clear signal, instead of waiting.`);
  const arrive = (count: number, note: (a: number, r: number) => string) => {
    let a = 0;
    let r = 0;
    for (let i = 0; i < count; i++) {
      if (q.length < cap) {
        q.push(`r${next}`);
        a += 1;
      } else r += 1;
      next += 1;
    }
    admitted += a;
    rejected += r;
    sys.state("q", `${q.length}/${cap}${q.length === cap ? " FULL" : ""}`, q.length === cap ? "danger" : "compare");
    sys.state("edge", r > 0 ? `rejected ${r} at once` : "admitting", r > 0 ? "danger" : "done");
    sys.set({ admitted, rejected });
    show();
    sys.s.messages = [
      { from: "edge", to: "q", label: `${a} admitted`, tone: "active" },
      ...(r > 0 ? [{ from: "edge", to: "client", label: `${r} × 503 + Retry-After`, tone: "danger" as Tone }] : []),
    ];
    sys.s.log = [...sys.s.log.slice(-4), `edge → q: ${a} admitted${r > 0 ? ` · edge → clients: ${r} rejected` : ""}`];
    sys.f.push(note(a, r), r > 0 ? "reject" : "admit");
  };
  arrive(burst, (a, r) => `A burst of ${burst} requests arrives at once. The first ${a} fit and are queued; the other ${r} are rejected in microseconds with 503 and a Retry-After header. Nothing is dropped silently: every caller knows at once.`);
  q.splice(0, rate);
  sys.state("q", `${q.length}/${cap}`, "compare");
  sys.state("w", `served ${rate}`, "done");
  show();
  sys.msg("q", "w", `${rate} requests`, `One tick: the worker serves ${rate}, and ${q.length} remain. The slot at the back of a full queue waits ${cap / rate} ticks, and that is the worst delay any admitted request can see.`, { tone: "done" });
  arrive(5, (a, r) => `Five more arrive. ${a} fit into the free slots and ${r} are rejected straight away. The queue never grows past ${cap}, so the delay of an admitted request stays bounded.`);
  sys.set({ "unbounded alternative": `${burst} queued → the last waits ${burst / rate} ticks` });
  sys.note(`Compare an unbounded queue: all ${burst} of the first burst would have been accepted, and the last would wait ${burst / rate} ticks. If callers time out sooner, the worker spends those ticks serving requests nobody is waiting for, and the retries add more. Size the queue from the delay you will tolerate, not from memory.`, "sizing");
  sys.state("client", "retry after backoff", "compare");
  sys.note(`The rejected callers back off and retry after the Retry-After interval, or degrade. Failing fast is the point: the overload is visible at the edge, where it can be handled, instead of as latency in the middle.`, "retry");
  sys.note(`Trade-off: a small bounded queue sheds some requests during spikes in exchange for bounded latency and memory and honest overload signals; a large one accepts more and serves them too late to matter.`, "done");
  return sys.f.done();
};

/** Telemetry agent: a 429 sends batches to a bounded disk spool (drop oldest when full), drained after Retry-After. */
const agentSpool: SysGen = (input) => {
  const n = clampInt(input.requests, 4, 12, 8);
  const cap = 4;
  const sys = new Sys([
    { id: "app", label: "Application", kind: "client", x: 6, y: 50, state: "never waits" },
    { id: "agent", label: "Agent", kind: "service", x: 38, y: 50, state: "pushing" },
    { id: "spool", label: "Disk spool", kind: "queue", x: 38, y: 95, state: `0/${cap} batches` },
    { id: "gw", label: "Ingest gateway", kind: "lb", x: 78, y: 50, state: "accepting" },
  ]);
  const spool: string[] = [];
  const dropped: string[] = [];
  let accepted = 0;
  const b = (i: number) => `b${i}`;
  const show = (hl?: string) =>
    sys.table({ title: `Agent disk spool (bounded: ${cap} batches; when full, the oldest is dropped)`, head: ["slot", "batch", "status"], rows: [...dropped.map((d) => ["—", d, "dropped (oldest)"]), ...spool.map((s, i) => [i + 1, s, "waiting to retry"])], tones: [...dropped.map(() => "danger" as Tone), ...spool.map((s) => (s === hl ? "active" : undefined) as Tone | undefined)] });
  const sync = () => {
    sys.state("spool", `${spool.length}/${cap} batches${spool.length === cap ? " FULL" : ""}`, spool.length === cap ? "danger" : spool.length > 0 ? "compare" : undefined);
    sys.set({ accepted, spooled: spool.length, dropped: dropped.length });
  };
  show();
  sys.set({ "spool capacity": `${cap} batches`, accepted: 0, spooled: 0, dropped: 0 });
  sys.note(`A telemetry agent batches the application's metrics and logs and pushes each batch to the ingest gateway. When the gateway answers 429, the agent does not block the application and does not throw the batch away: it writes it to a bounded spool on local disk (${cap} batches here) and retries later. If the spool fills, the oldest telemetry is dropped first.`);
  accepted += 1;
  sync();
  sys.msg("agent", "gw", `${b(1)} → 204`, `Batch ${b(1)} is pushed and accepted with 204. Normal operation: the spool is empty and the application never notices the agent.`, { tone: "done" });
  const refused = n - 3;
  sys.state("gw", "tenant over limit → 429", "danger");
  sys.state("agent", "backing off (Retry-After)", "compare");
  spool.push(b(2));
  sync();
  show(b(2));
  sys.msg("gw", "agent", `${b(2)} → 429 Retry-After`, `The tenant goes over its ingest limit and the gateway refuses ${b(2)} with 429 and a Retry-After. That is backpressure, not an error: the agent writes ${b(2)} to the disk spool (1 of ${cap}) and backs off. The application keeps running and is never made to wait.`, { tone: "danger", tag: "429" });
  for (let i = 3; i <= refused + 1; i++) {
    if (spool.length < cap) {
      spool.push(b(i));
      sync();
      show(b(i));
      sys.msg("app", "agent", `${b(i)} → spool`, `Batch ${b(i)} is ready while the agent is still backing off, so it goes straight to the spool without hitting the gateway: ${spool.length} of ${cap} slots used.`, { tone: "compare", tag: "spool" });
    } else {
      const old = spool.shift()!;
      dropped.push(old);
      spool.push(b(i));
      sync();
      show(b(i));
      sys.msg("app", "agent", `${b(i)} → spool (drop ${old})`, `Batch ${b(i)} arrives and the spool is full. For telemetry the right policy is to drop the oldest: ${old} is discarded and counted, and ${b(i)} takes its place. Memory and disk stay bounded, and the newest data, the most useful during an incident, survives.`, { tone: "danger", tag: "drop" });
    }
  }
  sys.state("gw", "accepting", "done");
  sys.state("agent", "draining spool", "active");
  const first = spool.splice(0, Math.min(2, spool.length));
  accepted += first.length;
  sync();
  show();
  sys.msg("agent", "gw", `${first.join(", ")} → 204`, `Retry-After has passed and the gateway accepts again. The agent drains the spool oldest first: ${first.join(" and ")} are accepted.`, { tone: "done", tag: "drain" });
  const rest = spool.splice(0);
  const next = b(refused + 2);
  accepted += rest.length + 1;
  sync();
  show();
  sys.msg("agent", "gw", `${[...rest, next].join(", ")} → 204`, `The rest of the spool${rest.length ? `, ${rest.join(" and ")},` : ""} goes out, followed by the new batch ${next}. The spool is empty again; ${dropped.length === 0 ? "nothing was lost" : `only ${dropped.join(", ")} was lost, and the agent counted the drop`}.`, { tone: "done", tag: "drain" });
  sys.state("agent", "pushing", undefined);
  accepted += 1;
  sync();
  sys.msg("agent", "gw", `${b(refused + 3)} → 204`, `Batch ${b(refused + 3)} is pushed directly, as before the refusal. ${accepted} of ${n} batches arrived: the refused ones late rather than lost${dropped.length ? `, except ${dropped.join(", ")}` : ""}.`, { tone: "done" });
  sys.note(`The edge case: replayed batches are older than live data. An ingester that accepts samples only up to a fixed window older than its newest rejects the oldest replayed ones as out of order, so size that window to the spool, or accept the gap and count the rejections per host.`, "replay");
  sys.note(`Trade-off: the spool turns a refusal into delay instead of loss and never pushes the slowdown into the application, at the price of local disk, stale data during a long refusal, and a bounded loss of the oldest telemetry when the refusal outlasts the spool.`, "done");
  return sys.f.done();
};

// Backpressure inputs (optional): `requests` (burst size, 10–40; batches 4–12 with
// `mode: "spool"`); `mode: "reject"` sheds at the edge with an explicit rejection;
// `mode: "spool"` shows a telemetry agent spooling refused batches to disk.
const backpressure: SysGen = (input) => {
  if (input.mode === "reject") return edgeReject(input);
  if (input.mode === "spool") return agentSpool(input);
  const { requests } = input;
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
  sys.state("buf", `${buf.length}/${cap}`, "compare");
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

const lruCache: SysGen = ({ keys, capacity }) => {
  /** Numeric keys read better as "key 3". */
  const nm = (k: string) => (/^\d+$/.test(k) ? `key ${k}` : k);
  const seq = keyList(keys, ["A", "B", "C", "A", "D", "B", "E", "A"], 12, 5);
  const cap = clampInt(capacity, 1, 6, 3);
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
      sys.msg("app", "cache", `GET ${k} → HIT`, `Step ${step}: ${nm(k)} is in the cache (hit). It moves from rank ${idx + 1} to the front: recency is updated on reads as well as writes.`, { tone: "done" });
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
      sys.msg("app", "db", `MISS ${k} → load`, evicted ? `Step ${step}: ${nm(k)} is not cached (miss). The cache is full, so the LRU key ${evicted} (last used at step ${lastUsed[evicted]}) is evicted and ${nm(k)} is loaded from the database and placed at the front.` : `Step ${step}: ${nm(k)} is not cached (miss). There is room, so it is loaded from the database and inserted at the front.`, { tone: "danger" });
    }
  });
  sys.set({ "hit rate": `${hits}/${seq.length}`, structure: "hash map + doubly linked list, O(1) per access" });
  sys.note(`Failure mode: a one-off scan. Reading ${cap + 1} keys once each (a report, a crawler) pushes every genuinely hot key out, and the next real requests all miss. Variants such as LRU-K, ARC, or a small probationary segment (SLRU, W-TinyLFU) admit a key to the main cache only on its second touch.`, "scan");
  sys.note(`Trade-off: LRU is O(1) with a hash map and a doubly linked list, adapts instantly to a shifting working set, and is the default almost everywhere, but it tracks recency only, so it cannot tell a key read a thousand times from one read once a moment ago; Redis approximates it by sampling five keys because the exact list costs memory per entry.`, "done");
  return sys.f.done();
};

const lfuCache: SysGen = ({ keys, capacity }) => {
  const seq = keyList(keys, ["A", "A", "B", "C", "A", "D", "B", "E", "A", "D"], 12, 5);
  const cap = clampInt(capacity, 1, 6, 3);
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
  const docs = ["the cat sat", "the dog sat", "the the the the ran"];
  const mapIds = Array.from({ length: m }, (_, i) => `M${i + 1}`);
  const redIds = ["R0", "R1"];
  const xs = spread(m, 15, 85);
  const sys = new Sys([
    { id: "master", label: "Master", kind: "lb", x: 50, y: 8 },
    ...mapIds.map((id, i) => ({ id, label: `Mapper ${id}`, kind: "node" as const, x: xs[i]!, y: 48, state: "idle" })),
    ...redIds.map((id, i) => ({ id, label: `Reducer ${i}`, kind: "node" as const, x: i === 0 ? 30 : 70, y: 92, state: "idle" })),
  ]);
  const splits: string[][] = mapIds.map(() => []);
  docs.forEach((d, i) => splits[i % m]!.push(d));
  // The lesson's partitioner: sum of the word's character codes, mod 2.
  const codeSum = (w: string) => [...w].reduce((a, c) => a + c.charCodeAt(0), 0);
  const part = (w: string) => codeSum(w) % 2;
  const mapped = splits.map((s) => s.flatMap((d) => d.split(" ").map((w) => [w, 1] as [string, number])));
  const combined = mapped.map((pairs) => {
    const c: Record<string, number> = {};
    for (const [w, v] of pairs) c[w] = (c[w] ?? 0) + v;
    return Object.entries(c);
  });
  const fmt = (pairs: [string, number][]) => pairs.map(([w, v]) => `(${w},${v})`).join(" ") || "—";
  const victimIdx = 1;
  const victim = mapIds[victimIdx]!;
  const rerun = mapIds[0]!;
  const segment = (mi: number, p: number) => combined[mi]!.filter(([w]) => part(w) === p).sort((a, b) => (a[0] < b[0] ? -1 : 1)) as [string, number][];
  sys.table({ title: "Input splits", head: ["mapper", "split"], rows: splits.map((s, i) => [mapIds[i]!, s.join(" | ") || "(empty)"]) });
  sys.set({ job: "word count", mappers: m, reducers: 2, "input records": docs.length });
  sys.note(`MapReduce: a job is two user functions. map(record) emits key/value pairs; reduce(key, all values) folds them. The framework does everything else: splitting input, scheduling, shuffling by key, and re-running failed tasks.`);
  mapIds.forEach((id) => sys.state(id, "map task", "active"));
  sys.fanout("master", mapIds, "map task (split i)", `The master splits the ${docs.length} input records into ${m} splits and assigns one map task each, preferring the worker that already holds that split on local disk (move compute to data).`);
  sys.table({ title: "Map output: (word, 1) per occurrence", head: ["mapper", "emitted pairs"], rows: mapped.map((pairs, i) => [mapIds[i]!, fmt(pairs)]), tones: mapped.map(() => "active" as Tone) });
  mapIds.forEach((id, i) => sys.state(id, `${mapped[i]!.length} pairs`, "compare"));
  sys.note(`Each mapper runs map() over its records independently and emits (word, 1) for every word. Map is stateless per record, which is what makes it embarrassingly parallel.`, "map");
  const before = mapped.reduce((a, p) => a + p.length, 0);
  const after = combined.reduce((a, p) => a + p.length, 0);
  const busiest = combined.findIndex((pairs, i) => pairs.length < mapped[i]!.length);
  const top = busiest >= 0 ? combined[busiest]!.reduce((a, b) => (b[1] > a[1] ? b : a)) : undefined;
  sys.table({ title: "After the combiner (local pre-reduce on each mapper)", head: ["mapper", "partial counts"], rows: combined.map((pairs, i) => [mapIds[i]!, fmt(pairs)]), tones: combined.map((pairs, i) => (pairs.length < mapped[i]!.length ? "done" : undefined) as Tone | undefined) });
  mapIds.forEach((id, i) => sys.state(id, `${combined[i]!.length} pairs`, "compare"));
  sys.set({ "pairs before combiner": before, "pairs after combiner": after });
  sys.note(
    top && busiest >= 0
      ? `Optimisation: a combiner runs the reduce function locally on each mapper's output. ${mapIds[busiest]} emitted (${top[0]},1) ${top[1]} times, and the combiner turns those into one (${top[0]},${top[1]}) before anything crosses the network: ${before} pairs become ${after}. The other mappers saw no word twice, so theirs are unchanged. Only valid because sum is associative and commutative.`
      : `Optimisation: a combiner runs the reduce function locally on each mapper's output; here no mapper saw a word twice, so nothing changes. Only valid because sum is associative and commutative.`,
    "combine",
  );
  const allWords = [...new Set(docs.flatMap((d) => d.split(" ")))];
  sys.table({ title: "Partitioning: reducer = (sum of character codes) mod 2", head: ["word", "code sum", "mod 2", "reducer"], rows: allWords.map((w) => [w, codeSum(w), part(w), `reducer ${part(w)}`]) });
  sys.note(`Shuffle, step 1: every pair is routed to a reducer by hashing its key, here the sum of its character codes mod 2, so all values for one word land on the same reducer no matter which mapper produced them. Each mapper writes one sorted segment per reducer to its local disk.`, "partition");
  const segRows = () => mapIds.map((id, i) => [id, fmt(segment(i, 0)), fmt(segment(i, 1))]);
  sys.table({ title: "Map output on local disk: one segment per reducer", head: ["mapper", "segment for reducer 0", "segment for reducer 1"], rows: segRows() });
  sys.state("R0", `fetched ${m} segments`, "compare");
  sys.fanin(mapIds, "R0", "partition 0", `Shuffle, step 2: reducer 0 fetches its segment from every mapper's local disk (${m} fetches) and merge-sorts them by key. This all-to-all transfer is the expensive part of the job.`, "compare", "shuffle");
  sys.state(victim, "DIED", "danger");
  sys.table({ title: "Map output on local disk: one segment per reducer", head: ["mapper", "segment for reducer 0", "segment for reducer 1"], rows: segRows().map((r, i) => (i === victimIdx ? [r[0]!, "lost", "lost"] : r)), tones: mapIds.map((_, i) => (i === victimIdx ? "danger" : undefined)) });
  sys.note(`Failure: ${victim}'s worker dies after reducer 0 has fetched from it but before reducer 1 has. Its map output lived on its local disk, so both of its segments are gone.`, "crash");
  sys.state(rerun, `re-ran ${victim}'s split`, "done");
  sys.table({ title: "Map output on local disk: one segment per reducer", head: ["mapper", "segment for reducer 0", "segment for reducer 1"], rows: segRows().map((r, i) => (i === victimIdx ? [`${r[0]} (re-run on ${rerun})`, r[1]!, r[2]!] : r)), tones: mapIds.map((_, i) => (i === victimIdx ? "done" : undefined)) });
  sys.msg("master", rerun, `re-run ${victim}'s split`, `The master notices the missed heartbeats, marks ${victim}'s output lost and re-runs the same split on ${rerun}, which regenerates both segments with identical bytes. Map is deterministic, so a re-run is always safe. Reducer 0 does nothing: the master tracks fetches per (map, reduce) pair and its copy is already merged.`, { tone: "danger", tag: "recover" });
  sys.state("R1", `fetched ${m} segments`, "compare");
  sys.fanin(mapIds.filter((id) => id !== victim), "R1", "partition 1", `Reducer 1 is told the new location of ${victim}'s output and fetches its segments, ${victim}'s from ${rerun}. Nothing is lost and nothing is counted twice.`, "compare", "shuffle");
  const totals = allWords.map((w) => [w, docs.flatMap((d) => d.split(" ")).filter((x) => x === w).length] as [string, number]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  redIds.forEach((id) => sys.state(id, "reduce", "done"));
  sys.table({ title: "Final output", head: ["word", "count", "written by"], rows: totals.map(([w, c]) => [w, c, `reducer ${part(w)}`]), tones: totals.map(() => "done" as Tone) });
  sys.fanin(redIds, "master", "output files", `Each reducer calls reduce(word, [counts]) once per key and writes one output file. Reducer 1 adds the partial counts for "the" from all ${m} mappers; the combiner changed how many pairs carried them, not the answer.`, "done", "reduce");
  sys.set({ stragglers: "speculative execution: re-run the slowest task elsewhere, take the first result", skew: "a hot key sends all its values to one reducer" });
  sys.note(`Two more failure modes: a straggler (a slow machine) holds the whole job at the end, so the master speculatively runs backup copies of the last tasks; and key skew, where one hot word sends most values to a single reducer that finishes long after the rest.`, "stragglers");
  sys.note(`Trade-off: materialising every stage to disk gives simple, restartable fault tolerance on cheap hardware, but it makes iterative or multi-stage jobs slow; Spark keeps intermediate data in memory and recomputes lost partitions from lineage instead, which is faster and needs more care.`, "done");
  return sys.f.done();
};

// Windowing inputs (optional): `requests` (events, 5–12) and `size` (the
// tumbling window in seconds, default 10). Event times, the slide and the
// session gap scale with the size; a whole number of minutes is shown as m:ss.
const streamWindowing: SysGen = (input) => {
  const n = clampInt(input.requests, 5, 12, 12);
  const size = clampInt(input.size, 10, 3600, 10);
  const k = size / 10;
  const times = [1, 3, 6, 9, 12, 14, 17, 22, 25, 27, 31, 33].slice(0, n).map((t) => t * k);
  const clock = size % 60 === 0;
  const at = (t: number) => (clock ? `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : `${t}s`);
  const bare = (t: number) => (clock ? at(t) : String(t));
  const span = (s: number) => (clock ? (s % 60 === 0 ? `${s / 60} min` : `${s} s`) : `${s} s`);
  const sys = new Sys([
    { id: "src", label: "Event source", kind: "client", x: 8, y: 50 },
    { id: "op", label: "Window op", kind: "service", x: 50, y: 50, state: `tumbling ${span(size)}` },
    { id: "sink", label: "Sink", kind: "db", x: 92, y: 50, state: "0 results" },
  ]);
  const windows: Record<number, number> = {};
  const winOf = (t: number) => Math.floor(t / size) * size;
  const label = (s: number) => (clock ? `[${at(s)}, ${at(s + size)})` : `[${s}, ${s + size})`);
  let fired = 0;
  const show = (open: number, hl?: number) => {
    const starts = Object.keys(windows).map(Number).sort((a, b) => a - b);
    sys.table({ title: `Tumbling windows of ${span(size)} (one result per window)`, head: ["window", "count", "status"], rows: starts.map((s) => [label(s), windows[s]!, s < open ? "fired" : "open"]), tones: starts.map((s) => (s === hl ? "active" : s < open ? "done" : undefined)) });
  };
  sys.set({ "window size": span(size), events: times.map(at).join(", "), "results emitted": 0 });
  sys.note(`Windowing turns an infinite stream into finite groups. Tumbling windows are fixed size and never overlap: with size ${span(size)} every event belongs to exactly one window, and the window emits one result when it closes.`);
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
      sys.msg("src", "op", `event t=${at(t)}`, `Event at t=${at(t)} falls in ${label(w)}, so ${label(closed)} is complete: the operator emits count=${windows[closed]} to the sink and discards that window's state. The result for a window is available only once the next window has started.`, { tone: "done", tag: "fire" });
    } else {
      windows[w] = (windows[w] ?? 0) + 1;
      show(current, w);
      sys.msg("src", "op", `event t=${at(t)}`, `Event at t=${at(t)}: ${bare(w)} ≤ ${bare(t)} < ${bare(w + size)}, so it is added to ${label(w)} (count ${windows[w]}). The window stays open because a later event may still belong to it.`, { tone: "active" });
    }
    if (sys.f.full) break;
  }
  const slide = size / 2;
  const slidingStarts = Array.from({ length: Math.floor(times[n - 1]! / slide) + 1 }, (_, i) => i * slide);
  const sliding = slidingStarts.map((s) => [clock ? `[${at(s)}, ${at(s + size)})` : `[${s}, ${s + size})`, times.filter((t) => t >= s && t < s + size).length] as Row);
  sys.state("op", `sliding ${span(size)} every ${span(slide)}`, "compare");
  sys.table({ title: `Sliding windows of ${span(size)} every ${span(slide)} (each event lands in ${size / slide} windows)`, head: ["window", "count"], rows: sliding, tones: sliding.map(() => "active" as Tone) });
  sys.note(`Sliding windows overlap: size ${span(size)}, sliding every ${span(slide)}, so each event is counted in ${size / slide} windows and a result is emitted every ${span(slide)}. Smoother output, ${size / slide}× the state.`, "sliding");
  const gap = 4 * k;
  const sessions: number[][] = [];
  for (const t of times) {
    const last = sessions[sessions.length - 1];
    if (last && t - last[last.length - 1]! <= gap) last.push(t);
    else sessions.push([t]);
  }
  sys.state("op", `session gap ${span(gap)}`, "compare");
  sys.table({ title: `Session windows (gap ${span(gap)}): a session ends when the next event is more than ${span(gap)} away`, head: ["session", "events", "span"], rows: sessions.map((s, i) => [i + 1, s.length, clock ? `${at(s[0]!)}–${at(s[s.length - 1]!)}` : `${s[0]}–${s[s.length - 1]} s`]), tones: sessions.map(() => "active" as Tone) });
  sys.note(`Session windows have no fixed size: events at most ${span(gap)} apart merge into one session, and the session closes only after a longer silence. Here the same ${n} events form ${sessions.length} sessions. Size is data-driven, so state is unbounded for a never-silent key.`, "session");
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
      const ooo = et < prevWm + lateness ? ` It arrives out of order (event time ${et} s after we already saw ${maxEvt} s), but the watermark (${wmLabel}) has not passed the window's end (10), so [0,10) is still open and the event is on time.` : "";
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
  sys.note(`The emitted count for [0,10) was ${inWindow}; the true count was ${events.filter(([et]) => et < size).length}. The ${late} late events are the price of deciding early. A larger bound (say 6 s) would have caught them, but every window would then fire 4 s later in event time than with the ${lateness} s bound.`, "accuracy");
  sys.note(`Failure modes: a heuristic watermark can be wrong (late data is dropped silently: measure it); one stalled source partition holds the watermark back for the whole job, so nothing fires (idle-source timeouts exist for this); and a device with a skewed clock stamps events in the future, advancing the watermark past live data.`, "pitfalls");
  sys.note(`Trade-off: the watermark bound is a direct dial between latency and completeness. Small bound: fast results, more late data; large bound: slower results and more buffered state. Systems like Flink and Beam let you emit early speculative results, a final result at the watermark, and corrections for allowed lateness.`, "done");
  return sys.f.done();
};

/** Kafka's idempotent producer on one partition: PID and epoch, per-partition sequence numbers, the five-batch cache, OutOfOrderSequence, and epoch fencing. */
const idempotentProducer: SysGen = () => {
  const sys = new Sys([
    { id: "P1", label: "Producer", kind: "client", x: 8, y: 30, state: "starting" },
    { id: "P2", label: "Replacement", kind: "client", x: 8, y: 85, state: "not started" },
    { id: "L1", label: "Broker 1", kind: "queue", x: 62, y: 25, state: "leader payments-0" },
    { id: "L2", label: "Broker 2", kind: "queue", x: 62, y: 80, state: "follower" },
  ]);
  const rows: Row[] = [];
  const tones: (Tone | undefined)[] = [];
  let cache: string[] = [];
  let last = -1;
  let next = 100;
  const show = () => sys.table({ title: "payments-0: producer state per (PID, partition) and the log", head: ["step", "batch", "broker's check", "result", "log offsets", "cached batches"], rows: rows.map((r) => [...r]), tones: tones.map((t, i) => (i === tones.length - 1 ? "active" : t)) });
  const step = (batch: string, check: string, result: string, offsets: string, tone: Tone) => {
    rows.push([rows.length + 1, batch, check, result, offsets, cache.join(", ") || "—"]);
    tones.push(tone);
    sys.set({ PID: 4001, "last sequence": last, "next offset": next });
    show();
  };
  const append = (lo: number, hi: number) => {
    const off = `${next}–${next + (hi - lo)}`;
    next += hi - lo + 1;
    last = hi;
    cache = [...cache, lo === hi ? `${lo}` : `${lo}–${hi}`].slice(-5);
    return off.replace(/^(\d+)–\1$/, "$1");
  };
  show();
  sys.set({ "dedupe scope": "one producer session, one partition", "max in flight": 5 });
  sys.note(`Kafka's idempotent producer. Every batch carries a producer ID, an epoch and the sequence number of its first record; the partition leader keeps, per producer, the last sequence and the last five batches it appended. That is enough to recognise a resend and to keep order across retries.`);
  sys.state("P1", "PID 4001 · epoch 0", "compare");
  sys.set({ PID: 4001, epoch: 0 });
  sys.msg("P1", "L1", "InitProducerId", `On start the producer asks for a producer ID and gets PID 4001, epoch 0. Sequence numbers count records per partition, starting at 0.`, { tone: "compare", tag: "init" });
  let off = append(0, 2);
  step("B0: seq 0–2", "new PID, first seq is 0", "append", off, "done");
  sys.msg("P1", "L1", "B0 seq 0–2", `Batch B0 carries sequences 0 to 2. The PID is new and the batch starts at 0, so the leader appends it at offsets ${off} and caches its range.`, { tone: "done" });
  off = append(3, 4);
  step("B1: seq 3–4 (ack lost)", "3 = last (2) + 1", "append", off, "done");
  sys.msg("P1", "L1", "B1 seq 3–4", `B1, sequences 3 to 4, follows on: 3 is the last sequence plus one, so it is appended at ${off}. But the acknowledgement is lost on the way back.`, { tone: "done" });
  off = append(5, 7);
  step("B2: seq 5–7", "5 = 4 + 1", "append, acked", off, "done");
  sys.msg("P1", "L1", "B2 seq 5–7", `B2 was in flight alongside B1 and is appended at ${off} and acknowledged. Up to five batches may be in flight at once.`, { tone: "done" });
  step("B1 again", "3–4 matches a cached batch", "duplicate: answers offset 103, writes nothing", "unchanged", "compare");
  sys.msg("P1", "L1", "B1 seq 3–4 (retry)", `After the request timeout the producer resends B1. Its range, 3 to 4, matches a cached batch, so the leader answers with the original offset, 103, and writes nothing. The retry that would have duplicated a payment is absorbed.`, { tone: "compare", tag: "duplicate" });
  sys.state("L1", "DOWN", "danger");
  sys.state("L2", "leader payments-0 · last seq 7", "compare");
  step("B3: seq 8–9 fails; B4: seq 10", "new leader rebuilt state: last = 7; 10 ≠ 8", "B4 rejected: OutOfOrderSequence", "unchanged", "danger");
  sys.msg("P1", "L2", "B4 seq 10 → OutOfOrderSequence", `Broker 1 fails. B3, sequences 8 to 9, gets NOT_LEADER_OR_FOLLOWER, but B4, sequence 10, reaches the new leader on broker 2, which rebuilt the producer state from the replicated log: last is 7. 10 is not 8, so B4 is rejected with OutOfOrderSequence. A failed batch blocks every later one, so nothing can overtake it.`, { tone: "danger", tag: "out-of-order" });
  const o3 = append(8, 9);
  const o4 = append(10, 10);
  off = `${o3.split("–")[0]}–${o4}`;
  step("B3 then B4, resent in order", "8 = 7 + 1, then 10 = 9 + 1", "append both", off, "done");
  sys.msg("P1", "L2", "B3 seq 8–9, B4 seq 10", `The client resends B3 and then B4, in sequence order: 8 follows 7, then 10 follows 9, and both are appended at ${off}. Ordering survived the retries, and B1 was written once.`, { tone: "done" });
  sys.state("P1", "PID 4001 · epoch 0 · paused", "muted");
  sys.state("P2", "PID 4001 · epoch 1", "compare");
  sys.set({ epoch: 1 });
  step("replacement: InitProducerId", "same transactional.id", "epoch bumped to 1; epoch 0 fenced", "unchanged", "compare");
  sys.msg("P2", "L2", "InitProducerId (same transactional.id)", `The epoch exists for one scenario: the old producer is not dead, only paused. A replacement starts with the same transactional ID; InitProducerId returns the same PID with the epoch bumped to 1, and the broker learns that epoch 0 is over.`, { tone: "compare", tag: "epoch" });
  step("zombie: seq 11, epoch 0", "epoch 0 < current epoch 1", "rejected: ProducerFenced", "unchanged", "danger");
  sys.state("P1", "FENCED", "danger");
  sys.msg("P1", "L2", "epoch 0 → ProducerFenced", `The old producer wakes and sends with epoch 0. The leader compares epochs first: 0 is lower than 1, so the batch is rejected with ProducerFenced. The zombie cannot write, even though it never learned it was replaced.`, { tone: "danger", tag: "fenced" });
  sys.note(`Scope, precisely: this dedupes one producer session's own retries to one partition. A producer restarted without a transactional ID gets a new PID, so its resend is a new record; so is the application calling send twice; and nothing downstream is covered.`, "scope");
  sys.note(`Trade-off: idempotence costs a few bytes per batch and a small cache per producer on each leader, and it caps in-flight requests at five so a retried batch is still cached when it arrives; in exchange retries can neither duplicate nor reorder. Exactly-once beyond one partition needs transactions and idempotent sinks.`, "done");
  return sys.f.done();
};

/** Presence: one channel per user, subscribed to only by gateways whose clients have that user on screen. */
const presence: SysGen = () => {
  const gws = ["GA", "GB", "GC"];
  const sys = new Sys([
    { id: "pres", label: "Presence service", kind: "service", x: 8, y: 50, state: "u_12 offline" },
    { id: "topic", label: "Channel u_12", kind: "queue", x: 45, y: 50, state: "0 subscribers" },
    { id: "GA", label: "Gateway A", kind: "service", x: 88, y: 15, state: "client viewing u_12" },
    { id: "GB", label: "Gateway B", kind: "service", x: 88, y: 50, state: "client viewing u_12" },
    { id: "GC", label: "Gateway C", kind: "service", x: 88, y: 85, state: "contacts, not viewing" },
  ]);
  const sub: Record<string, boolean> = { GA: false, GB: false, GC: false };
  const got: Record<string, number> = { GA: 0, GB: 0, GC: 0 };
  const why: Record<string, string> = { GA: "a client has u_12 on screen", GB: "a client has u_12 on screen", GC: "u_12 in contact lists, not on screen" };
  const show = (hl?: string) => sys.table({ title: "Who receives u_12's presence (subscribe on view)", head: ["gateway", "subscribed", "updates received", "why"], rows: gws.map((g) => [g.replace("G", "Gateway "), sub[g] ? "yes" : "no", got[g]!, why[g]!]), tones: gws.map((g) => (g === hl ? "active" : sub[g] ? "done" : undefined)) });
  const count = () => sys.state("topic", `${gws.filter((g) => sub[g]).length} subscribers`, "compare");
  show();
  sys.set({ "naive fan-out": "every contact: ~200 per change", "subscribe on view": "only gateways with a viewer" });
  sys.note(`Presence as publish and subscribe. Each user has a channel; a status change is published to it once. Gateways subscribe on behalf of clients that currently have that user on screen, so the fan-out follows attention, not the contact list.`);
  sub.GA = true;
  sub.GB = true;
  count();
  show();
  sys.fanin(["GA", "GB"], "topic", "SUBSCRIBE u_12", `Clients on gateways A and B have u_12 on screen, so those gateways subscribe to u_12's channel. Gateway C holds clients who have u_12 in their contacts but are not looking: it does not subscribe.`, "compare", "subscribe");
  sys.state("pres", "u_12 online", "done");
  sys.msg("pres", "topic", "u_12: online", `u_12 comes online. The presence service publishes one event to u_12's channel and moves on; it does not know who is watching.`);
  got.GA = 1;
  got.GB = 1;
  show();
  sys.fanout("topic", ["GA", "GB"], "u_12: online", `Only the two subscribed gateways receive it, and each pushes it to its viewers. Two deliveries, not one per contact. Gateway C, with no viewer, gets nothing.`, "done");
  sys.state("GB", "viewer scrolled away", "muted");
  sub.GB = false;
  why.GB = "viewer scrolled away; lease not renewed";
  count();
  show("GB");
  sys.note(`The client on gateway B scrolls u_12 off screen. Gateway B keeps the subscription for a short grace period in case the user scrolls back, then stops renewing it; subscriptions are leases, so a crashed gateway cannot leak them either.`, "unsubscribe");
  sys.state("pres", "u_12 reconnecting (debounce)", "compare");
  show();
  sys.note(`u_12's phone switches from Wi-Fi to cellular and the connection drops. The presence service waits about 30 s before publishing offline; u_12 reconnects within that window, so nothing is published and nobody sees a flash of offline.`, "debounce");
  sys.state("pres", "u_12 offline · last seen saved", "muted");
  got.GA = 2;
  show("GA");
  sys.msg("topic", "GA", "u_12: offline", `Later u_12 closes the app. After the 30 s debounce the service publishes offline once, and only gateway A, the one subscriber left, receives it. "Last seen" is written lazily, on this transition, not on every heartbeat.`, { tone: "compare" });
  sub.GC = true;
  why.GC = "a client scrolled u_12 into view";
  count();
  sys.state("GC", "client viewing u_12", "compare");
  show("GC");
  sys.msg("GC", "topic", "SUBSCRIBE u_12 (+ current state)", `A client on gateway C scrolls u_12 into view. Gateway C subscribes and fetches the current state in the same batched call that returns all the users on that screen; from now on it receives u_12's changes too.`, { tone: "compare", tag: "subscribe" });
  sys.set({ "if every contact were told": "≈ 33 million notifications/s", "with subscribe on view": "only users on someone's screen" });
  sys.note(`The arithmetic behind it: 100 million online users with 200 contacts each, changing state about every 10 minutes, would be about 33 million notifications a second, almost all to people not looking. Subscribe on view sends only to screens that show the user.`, "arithmetic");
  sys.note(`Trade-off: subscribe on view moves the cost into subscription churn as users scroll, which stays in the datacentre and is batched, in exchange for removing the fan-out to contacts who are not looking; debouncing offline trades a few seconds of accuracy for no flicker.`, "done");
  return sys.f.done();
};

const kafkaPartitions: SysGen = (input) => {
  if (input.mode === "lag") return consumerLag(input);
  if (input.mode === "idempotent") return idempotentProducer(input);
  const { nodes, keys } = input;
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
  const committed: number[] = partIds.map(() => 0);
  const partOf = (k: string) => fnv(k) % p;
  const show = (hl?: number) =>
    sys.table({
      title: `Topic "events": ${p} partitions, each an append-only ordered log`,
      head: ["partition", "log (offset: key)", "next offset", "g1 committed"],
      rows: partIds.map((id, i) => [id, logs[i]!.map((k, o) => `${o}: ${k}`).join("  ") || "(empty)", logs[i]!.length, committed[i]!]),
      tones: partIds.map((_, i) => (i === hl ? "active" : undefined)),
    });
  show();
  sys.set({ partitions: p, "partition of key": "hash(key) mod " + p, "consumer group": "g1 (2 consumers)" });
  sys.note(`A Kafka topic is split into partitions, each an ordered, append-only log. The producer hashes the message key to choose a partition; ordering is guaranteed within a partition only, so all events for one key stay in order.`);
  for (const k of keyIds) {
    const i = partOf(k);
    logs[i]!.push(k);
    const off = logs[i]!.length - 1;
    sys.state(partIds[i]!, `offset ${logs[i]!.length}`, "active");
    show(i);
    sys.msg("prod", partIds[i]!, `${k} → offset ${off}`, off > 0 && logs[i]!.slice(0, -1).includes(k) ? `hash(${k}) mod ${p} = ${i}: appended at offset ${off}, behind the earlier ${k} event in the same partition. A consumer will always see this key's events in the order they were written.` : `hash(${k}) mod ${p} = ${i}: the message is appended to partition ${i} at offset ${off}. The broker never reorders or rewrites the log.`, { tone: "active" });
    sys.tone(partIds[i]!, undefined);
    if (sys.f.full) break;
  }
  const owns: Record<string, number[]> = { C1: partIds.map((_, i) => i).filter((i) => i % 2 === 0), C2: partIds.map((_, i) => i).filter((i) => i % 2 === 1) };
  const names = (ps: number[]) => ps.map((i) => partIds[i]!).join(", ");
  const empty = partIds.map((_, i) => i).filter((i) => logs[i]!.length === 0);
  sys.state("C1", `owns ${names(owns.C1!)}`, "compare");
  sys.state("C2", `owns ${names(owns.C2!)}`, "compare");
  sys.set({ assignment: `C1: ${names(owns.C1!)} · C2: ${names(owns.C2!)}` });
  sys.note(`Consumer group g1 has two consumers, and the group coordinator assigns each partition to exactly one of them: C1 gets ${names(owns.C1!)} and C2 gets ${names(owns.C2!)}. Partitions, not messages, are the unit of parallelism.${empty.length > 0 ? ` ${names(empty)} received no keys at all: hashing spreads keys, not load, so a partition can sit empty while another is busy.` : ""}`, "assign");
  const firstFull = (c: string) => owns[c]!.find((i) => logs[i]!.length > 0);
  const victim = firstFull("C2") !== undefined ? "C2" : "C1";
  const survivor = victim === "C2" ? "C1" : "C2";
  const sp = firstFull(survivor);
  if (sp !== undefined) {
    const L = logs[sp]!.length;
    sys.state(survivor, `processing ${partIds[sp]}`, "active");
    show(sp);
    sys.msg(partIds[sp]!, survivor, L === 1 ? "poll → offset 0" : `poll → offsets 0..${L - 1}`, `${survivor} polls ${partIds[sp]} and receives its record${L === 1 ? "" : "s"} in offset order. The broker deletes nothing on read: a consumer's position is just an offset, so another group can read the same log independently.`, { tone: "compare" });
    committed[sp] = L;
    sys.state(survivor, `${partIds[sp]} committed @${L}`, "done");
    show(sp);
    sys.msg(survivor, partIds[sp]!, `commit offset ${L}`, `After processing, ${survivor} commits offset ${L}, the next offset it wants. Commit after processing gives at-least-once (a crash between processing and commit replays); commit before gives at-most-once. Exactly-once needs transactions or idempotent sinks.`, { tone: "done" });
  } else {
    sys.state(survivor, `owns ${names(owns[survivor]!)} · idle`, "muted");
    sys.note(`${survivor}'s partition${owns[survivor]!.length === 1 ? "" : "s"} (${names(owns[survivor]!)}) ${owns[survivor]!.length === 1 ? "holds" : "hold"} no records, so it polls and gets nothing: a consumer is only as busy as the partitions it owns.`, "idle");
  }
  const vp = firstFull(victim)!;
  const L = logs[vp]!.length;
  const last = L - 1;
  sys.state(victim, `processing ${partIds[vp]}`, "active");
  show(vp);
  sys.msg(partIds[vp]!, victim, L === 1 ? "poll → offset 0" : `poll → offsets 0..${last}`, `${victim} polls ${partIds[vp]} and starts processing ${L === 1 ? "offset 0" : `offsets 0 to ${last} in order`}.`, { tone: "compare" });
  if (L >= 2) {
    committed[vp] = last;
    sys.state(victim, `${partIds[vp]} committed @${last} · processing ${last}`, "active");
    show(vp);
    sys.msg(victim, partIds[vp]!, `commit offset ${last}`, `${victim} has finished offset${last === 1 ? "" : "s"} 0${last > 1 ? ` to ${last - 1}` : ""} and commits offset ${last}; it is now working on offset ${last}.`, { tone: "done" });
  }
  sys.state(victim, "CRASHED", "danger");
  show(vp);
  sys.note(`Failure mode: ${victim} dies after processing offset ${last} but before committing it. The group's committed offset for ${partIds[vp]} is still ${committed[vp]}.`, "crash");
  owns[survivor] = partIds.map((_, i) => i);
  sys.state(survivor, `owns ${partIds.join(", ")} · resumes ${partIds[vp]} @${committed[vp]}`, "compare");
  sys.set({ rebalance: `${survivor} now owns all ${p} partitions` });
  show(vp);
  const redo = last - committed[vp]! + 1;
  sys.msg(partIds[vp]!, survivor, `redeliver offset${redo === 1 ? "" : "s"} ${committed[vp]}${redo > 1 ? `..${last}` : ""}`, `After ${victim}'s session timeout the coordinator rebalances: ${survivor} takes over ${names(owns[victim]!)} and resumes ${partIds[vp]} from the last committed offset, ${committed[vp]}. ${redo === 1 ? `Offset ${last}, which ${victim} processed but never committed, is` : `Offsets ${committed[vp]} to ${last}, which ${victim} processed but never committed, are`} delivered again: at-least-once, so the handler must be idempotent. During an eager rebalance the whole group pauses.`, { tone: "danger", tag: "rebalance" });
  owns[victim] = [];
  sys.set({ "max consumers useful": p, "hot key": "one busy key = one busy partition" });
  sys.note(`Two design limits: a group can use at most ${p} consumers, one per partition (a ${p + 1}th sits idle), so the partition count chosen at creation caps consumer parallelism; and a hot key sends all its traffic to one partition, which one consumer must handle alone.`, "limits");
  sys.note(`Trade-off: partitioning by key gives per-key ordering and horizontal scale with a dumb, durable broker, at the price of no global order, parallelism fixed by partition count, and rebalances that pause consumption; choose keys that spread load yet keep the events that must stay ordered together.`, "done");
  return sys.f.done();
};

/** A consumer group as a work queue: offsets, a crash that replays uncommitted records, and lag that grows when producers outpace consumers. */
const consumerLag: SysGen = (input) => {
  const effect = str(input.effect, "runs its side effect");
  const topic = str(input.topic, "events");
  const sys = new Sys([
    { id: "prod", label: "Producers", kind: "client", x: 8, y: 50, state: "producing" },
    { id: "P0", label: "Partition 0", kind: "queue", x: 48, y: 25, state: "end 0 · committed 0" },
    { id: "P1", label: "Partition 1", kind: "queue", x: 48, y: 75, state: "end 0 · committed 0" },
    { id: "C1", label: "Consumer 1", kind: "service", x: 90, y: 25, state: "owns P0" },
    { id: "C2", label: "Consumer 2", kind: "service", x: 90, y: 75, state: "owns P1" },
  ]);
  const end = [0, 0];
  const com = [0, 0];
  const age = ["—", "—"];
  const show = (hl?: number) =>
    sys.table({
      title: `Topic "${topic}", consumer group g1 (lag = log-end offset − committed offset)`,
      head: ["partition", "log-end offset", "committed", "lag (records)", "oldest unprocessed"],
      rows: [0, 1].map((i) => [`P${i}`, end[i]!, com[i]!, end[i]! - com[i]!, end[i]! - com[i]! > 0 ? age[i]! : "—"]),
      tones: [0, 1].map((i) => (i === hl ? "active" : end[i]! - com[i]! > 4 ? "danger" : undefined)),
    });
  const part = (i: number) => sys.state(`P${i}`, `end ${end[i]} · committed ${com[i]}`, end[i]! - com[i]! > 4 ? "danger" : "compare");
  show();
  sys.set({ "consumer group": "g1: C1 owns P0, C2 owns P1", "lag P0": 0, "lag P1": 0 });
  sys.note(`Inside one consumer group, Kafka behaves like a work queue: each partition is owned by exactly one member, so each record is handled by one consumer. Nothing is deleted on read; a member's progress is the offset it commits, and lag is log-end offset minus committed offset.`);
  end[0] = 4;
  end[1] = 4;
  age[0] = "0 s";
  age[1] = "0 s";
  part(0);
  part(1);
  show();
  sys.fanout("prod", ["P0", "P1"], "4 records each", `Producers append 4 records to each partition (offsets 0 to 3). Lag is 4 on both: four records written and not yet processed by the group.`, "active", "produce");
  sys.state("C1", "owns P0 · processed 0..1", "active");
  sys.msg("P0", "C1", "poll → offsets 0..1", `C1 polls P0 and processes offsets 0 and 1.`, { tone: "compare" });
  com[0] = 2;
  part(0);
  show(0);
  sys.state("C1", "owns P0 · committed @2", "done");
  sys.set({ "lag P0": 2 });
  sys.msg("C1", "P0", "commit offset 2", `Then it commits offset 2, the next record it wants. Committing after processing is at-least-once: a crash before the commit replays the batch. P0's lag drops to 2.`, { tone: "done" });
  sys.state("C2", "owns P1 · processing 0..1", "active");
  sys.msg("P1", "C2", "poll → offsets 0..1", `C2 polls P1 and processes offsets 0 and 1: for each record it ${effect}.`, { tone: "compare" });
  sys.state("C2", "CRASHED", "danger");
  show(1);
  sys.note(`C2 crashes before committing. The group's committed offset for P1 is still 0, although records 0 and 1 have already been processed.`, "crash");
  sys.state("C1", "owns P0, P1 · resumes P1 @0", "compare");
  sys.set({ "consumer group": "g1: C1 owns P0 and P1 (rebalanced)" });
  sys.msg("P1", "C1", "redeliver offsets 0..1", `After C2's session timeout the coordinator rebalances and gives P1 to C1, which resumes from the committed offset, 0. Records 0 and 1 are processed a second time: the side effect happens twice unless the handler is idempotent.`, { tone: "danger", tag: "rebalance" });
  com[1] = 2;
  end[0] = 12;
  end[1] = 12;
  com[0] = 4;
  age[0] = "4 s";
  age[1] = "5 s";
  part(0);
  part(1);
  sys.state("C1", "owns P0, P1 · alone", "danger");
  sys.state("prod", "spiking", "danger");
  sys.set({ "lag P0": end[0] - com[0], "lag P1": end[1] - com[1] });
  show();
  sys.fanout("prod", ["P0", "P1"], "+8 records each", `A spike: producers append 8 more records to each partition while C1, now alone, gets through only 4 in total. Lag climbs to ${end[0] - com[0]} and ${end[1] - com[1]}, and the oldest unprocessed record is 4 to 5 s old. Nothing fails; results just arrive later and later.`, "danger", "backlog");
  age[0] = "9 s";
  age[1] = "10 s";
  end[0] = 20;
  end[1] = 20;
  com[0] = 8;
  com[1] = 6;
  part(0);
  part(1);
  sys.set({ "lag P0": end[0] - com[0], "lag P1": end[1] - com[1], alert: "lag in time: oldest unprocessed > 5 s" });
  show();
  sys.note(`The backlog keeps growing: another 8 records land on each partition while C1 works through 4 more on P0 and 4 on P1. Lag is now ${end[0] - com[0]} and ${end[1] - com[1]} records, the oldest waiting about 10 s. A record count means nothing on its own (100,000 records is nothing on one topic and an hour on another), so alert on lag in time, the age of the oldest unprocessed record.`, "alert");
  sys.state("C2", "rejoined · owns P1", "done");
  sys.state("C1", "owns P0", "done");
  end[0] = 22;
  end[1] = 22;
  com[0] = 14;
  com[1] = 12;
  age[0] = "6 s";
  age[1] = "7 s";
  part(0);
  part(1);
  sys.set({ "consumer group": "g1: C1 owns P0, C2 owns P1", "max useful consumers": "2 (one per partition)", "lag P0": end[0] - com[0], "lag P1": end[1] - com[1] });
  show();
  sys.note(`C2 restarts and the group rebalances back to one partition each. With two consumers working, each gets through 6 records while only 2 more arrive, and the lag falls to ${end[0] - com[0]} and ${end[1] - com[1]}. A third consumer would sit idle: with 2 partitions, 2 members is the most a group can use, so the partition count is the ceiling on catch-up speed.`, "scale");
  sys.note(`Trade-off: the log gives a work queue whose backlog is durable and replayable, at the price of per-partition parallelism and at-least-once redelivery after every crash or rebalance; size partitions for the catch-up rate you need and make handlers idempotent.`, "done");
  return sys.f.done();
};

// ---------- change capture and event sourcing ----------

/** Where CDC events end up: the label, how one event is applied, and who sees the lag. */
const cdcSinks: Record<string, { label: string; noun: string; apply: (op: string) => string; reader: string; writer?: string; changes?: [string, string, string][] }> = {
  search: { label: "Search index", noun: "the search index", apply: (op) => `the indexer applies it as an upsert keyed by primary key${op === "DELETE" ? " (here: a delete by primary key)" : ""}`, reader: "a search user" },
  "read-model": { label: "Read model", noun: "the read model", apply: (op) => `a consumer applies it to the summary store${op === "DELETE" ? " (here: removing the row's contribution)" : ""}`, reader: "a reader of the read model" },
  "new-store": { label: "New store", noun: "the new store", apply: (op) => `the new store applies it as an upsert keyed by primary key${op === "DELETE" ? " (here: a delete by primary key)" : ""}`, reader: "a reader of the new store" },
  cache: { label: "Cache", noun: "the cache", apply: () => `a consumer turns it into a delete of the cached key, so the next read refills from the database`, reader: "a reader holding a stale cache entry" },
  topic: { label: "Kafka topic", noun: "the topic", apply: () => `the connector publishes it to the topic, keyed by primary key`, reader: "a downstream consumer" },
  "seat-map": {
    label: "Seat-map publisher",
    noun: "the seat map",
    apply: () => `the publisher flips the seat's bit in the bitmap it publishes every second`,
    reader: "a fan looking at the seat map",
    writer: "Writers",
    changes: [
      ["UPDATE", "seats", "A12 free → held"],
      ["UPDATE", "seats", "A12 held → sold"],
      ["UPDATE", "seats", "B3 held → free (sweeper)"],
      ["UPDATE", "seats", "C7 sold → free (support tool)"],
      ["UPDATE", "seats", "B3 free → held"],
      ["UPDATE", "seats", "B3 held → sold"],
    ],
  },
};

/** "an INSERT", "an UPDATE", "a DELETE". */
const withArticle = (op: string): string => `${/^[AEIOU]/.test(op) ? "an" : "a"} ${op}`;

// CDC inputs (optional): `requests` (number of changes, 2–6) and `sink`
// ("search" default, "read-model", "new-store", "cache", "topic", "seat-map").
const cdc: SysGen = (input) => {
  const n = clampInt(input.requests, 2, 6, 4);
  const sink = cdcSinks[String(input.sink ?? "search")] ?? cdcSinks.search!;
  const changes = (
    sink.changes ?? [
      ["INSERT", "users", "id=1 name=Ada"],
      ["UPDATE", "users", "id=1 name=Ada L."],
      ["INSERT", "orders", "id=9 user=1"],
      ["DELETE", "users", "id=1"],
      ["INSERT", "users", "id=2 name=Bob"],
      ["UPDATE", "orders", "id=9 status=paid"],
    ]
  ).slice(0, n) as [string, string, string][];
  const writer = sink.writer ?? "App";
  const sys = new Sys([
    { id: "app", label: writer, kind: "client", x: 6, y: 50 },
    { id: "db", label: "Postgres", kind: "db", x: 36, y: 50, state: "WAL LSN 0" },
    { id: "cdc", label: "CDC connector", kind: "service", x: 66, y: 50, state: "confirmed LSN 0" },
    { id: "sink", label: sink.label, kind: "external", x: 94, y: 50, state: "empty" },
  ]);
  const wal: Row[] = [];
  const tones: (Tone | undefined)[] = [];
  const show = () => sys.table({ title: "Write-ahead log as the connector sees it (via a replication slot)", head: ["LSN", "op", "table", "row", "emitted"], rows: wal.map((r) => [...r]), tones: [...tones] });
  show();
  sys.set({ "source of truth": "Postgres", mechanism: "logical decoding of the WAL", "confirmed LSN": 0 });
  sys.note(`Change data capture: instead of the ${writer === "App" ? "app" : "writers"} writing to the database and to ${sink.noun} (a dual write), a connector tails the database's write-ahead log and turns every committed change into an event. The database's own commit order becomes the event stream.`);
  sys.msg("cdc", "db", "initial snapshot + slot", `Setup: the connector creates a replication slot (so Postgres retains WAL from that point) and takes a consistent snapshot of the existing rows, streaming them as synthetic INSERTs. From here on it needs only the log.`, { tone: "compare", tag: "snapshot" });
  let lsn = 0;
  let applied = 0;
  for (let i = 0; i < changes.length; i++) {
    const [op, table, row] = changes[i]!;
    const lastOne = i === changes.length - 1;
    lsn += 1;
    wal.push([lsn, op, table, row, "no"]);
    tones.push("active");
    sys.state("db", `WAL LSN ${lsn}`, "active");
    show();
    const who = writer === "App" ? "The app" : row.includes("sweeper") ? "The hold sweeper" : row.includes("support") ? "A support tool" : "The booking service";
    sys.msg("app", "db", `${op} ${table} (${row}) COMMIT`, `${who} commits ${withArticle(op)} on ${table}. The database writes it to the WAL at LSN ${lsn} before acknowledging; the writer knows nothing about ${sink.noun}.`, { tone: "active" });
    wal[wal.length - 1]![4] = lastOne ? "yes (not confirmed)" : "yes";
    tones[tones.length - 1] = lastOne ? "active" : "done";
    applied += 1;
    sys.state("cdc", lastOne ? `emitted LSN ${lsn} · confirmed ${lsn - 1}` : `confirmed LSN ${lsn}`, lastOne ? "compare" : "done");
    sys.state("sink", `${applied} change${applied === 1 ? "" : "s"} applied`, "done");
    sys.set({ "confirmed LSN": lastOne ? lsn - 1 : lsn });
    show();
    sys.msg(
      "cdc",
      "sink",
      `{op:${op}, before, after} @${lsn}`,
      `The connector decodes LSN ${lsn} into a change event with the row's before and after images, and ${sink.apply(op)}.${lastOne ? ` The connector has emitted LSN ${lsn} but not yet confirmed it to the slot, so the slot still says ${lsn - 1}.` : ` The connector then confirms LSN ${lsn} to the slot.`} The gap between commit and apply is the staleness ${sink.reader} can observe.`,
      { tone: "done" },
    );
    if (sys.f.full) break;
  }
  wal[wal.length - 1]![4] = "yes, twice";
  tones[tones.length - 1] = "done";
  sys.state("cdc", `restarted · confirmed LSN ${lsn}`, "danger");
  sys.set({ "confirmed LSN": lsn });
  show();
  sys.msg("cdc", "sink", `re-emit @${lsn} (duplicate)`, `Failure mode: the connector crashes right there, after emitting LSN ${lsn} but before confirming it. On restart it resumes after the last confirmed LSN, ${lsn - 1}, re-emits LSN ${lsn}, and this time confirms it. ${sink.label} receives LSN ${lsn} twice: delivery is at-least-once, so it must apply events idempotently (by primary key, or dedupe by LSN).`, { tone: "danger", tag: "replay" });
  sys.state("cdc", "DOWN 3 days", "danger");
  sys.state("db", "WAL retained: disk 95%", "danger");
  sys.note(`Failure mode two: the replication slot pins WAL. If the connector is down for days, Postgres keeps every segment since the confirmed LSN and the primary's disk fills; monitor slot lag and set a retention cap.`, "retention");
  plain(sys, "cdc", `confirmed LSN ${lsn}`);
  plain(sys, "db", `WAL LSN ${lsn}`);
  sys.set({ "vs dual write": `no lost or reordered update; ${sink.noun} only ever lags`, "vs polling": "sees deletes and every intermediate update" });
  sys.note(`Why not dual writes: if the ${writer === "App" ? "app" : "writers"} wrote to Postgres and to ${sink.noun} directly, a crash between the two loses an update and two concurrent writers can apply updates to ${sink.noun} in the opposite order. Tailing one log makes the database the single arbiter of order.`, "dual-write");
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
    sys.state("facade", s === 0 ? "all → legacy" : s === routes.length ? "all → new service" : `${s} → new · ${routes.length - s} → legacy`, s === routes.length ? "done" : "compare");
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
  sys.state("facade", "1 → new · /orders shadowed", "compare");
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
  sys.set({ live: "blue (v1)", idle: "green (v2, broken)", "time to roll back": "seconds" });
  sys.msg("router", "blue", "100% traffic (rollback)", `Rollback is the same flip in reverse: seconds, no redeploy, no rebuild. This only works because the expand-only migration left the schema readable by v1.`, { tone: "done", tag: "rollback" });
  sys.set({ "migration rule": "expand now, contract only after the old version is retired" });
  sys.note(`What would have broken it: a migration that renamed or dropped a column for v2 would have crashed v1 on rollback, and writes v2 made to the new column are invisible to v1 (data written during the green window may need reconciling). Sessions and background jobs on the old colour need the same care.`, "schema");
  sys.state("green", "v2.1 · LIVE", "done");
  sys.state("blue", "idle", "muted");
  sys.state("router", "→ green", "done");
  sys.set({ live: "green (v2.1)", idle: "blue (v1)" });
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
    { id: "stable", label: "Stable v1 ×9", kind: "service", x: 78, y: 20, state: "baseline · healthy", tone: "done" },
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
  /** Two arrows from the load balancer, each labelled with its own request count. */
  const route = (s: number, c: number, note: string, tone: Tone) => {
    sys.s.messages = [
      { from: "lb", to: "stable", label: `${s} req`, tone },
      { from: "lb", to: "canary", label: `${c} req`, tone },
    ];
    sys.s.log = [...sys.s.log.slice(-4), `lb → stable: ${s} req · lb → canary: ${c} req`];
    sys.f.push(note, "stage");
  };
  sys.set({ "canary share": "0%", "promotion gate": "errors no worse than stable; p99 ≤ 1.2 × stable p99", "auto rollback": "on" });
  sys.note(`Canary release: send a small slice of real traffic to the new version, compare its metrics against the stable version serving the rest, and only then widen the slice. Named after the canary in the coal mine: it fails first, and few are exposed.`);
  sys.state("canary", "v2 · 0% traffic", "compare");
  sys.note(`v2 is deployed to one instance alongside nine stable ones. It receives no traffic yet; health checks pass.`, "deploy");
  let [s, c] = stage(10, 0, 0, "120 ms", "118 ms", "active");
  sys.state("lb", "90% stable · 10% canary", "compare");
  sys.state("canary", "v2 · 10% traffic", "compare");
  sys.set({ "canary share": "10%" });
  route(s, c, `Stage 1: 10% of traffic goes to the canary (${c} of the next ${n} requests), 90% to stable (${s}). If v2 is broken, at most one user in ten sees it, and only briefly.`, "active");
  sys.msg("metrics", "lb", "canary ok: 0 errors, p99 +2 ms", `The analysis compares the two versions on the same window: error rate, p99, saturation. The canary has 0 errors like stable, and its p99 of 120 ms is within 1.2 × stable's 118 ms, so the gate passes and the share is widened.`, { tone: "done", tag: "analyse" });
  const bad = Math.max(1, Math.round(split(50)[1] * 0.4));
  [s, c] = stage(50, bad, 0, "410 ms", "118 ms", "danger");
  sys.state("lb", "50% stable · 50% canary", "compare");
  sys.state("canary", `v2 · 50% traffic · errors`, "danger");
  sys.set({ "canary share": "50%" });
  route(s, c, `Stage 2 widens to 50%. Now the canary sees enough traffic to hit the code path that 10% never exercised: ${bad} of its ${c} requests fail and its p99 jumps to 410 ms.`, "active");
  sys.msg("metrics", "lb", `canary FAIL: ${bad}/${c} errors, p99 410 ms`, `The gate fails: ${bad} errors in ${c} canary requests against 0 in stable's ${s}, and a p99 far above 1.2 × 118 ms. Because stable is serving the same window cleanly, the comparison isolates the release from any ambient noise.`, { tone: "danger", tag: "analyse" });
  stage(0, 0, 0, "—", "118 ms", "danger");
  sys.state("lb", "100% stable", "done");
  sys.state("canary", "rolled back", "danger");
  sys.set({ "canary share": "0%", "users affected": "the canary's 50% share, for one analysis window" });
  sys.msg("lb", "stable", "100% (auto rollback)", `Automatic rollback: the load balancer weight for v2 goes to zero. The bad release reached only the canary's share of traffic, for one analysis window, instead of everyone for as long as a human took to notice.`, { tone: "done", tag: "rollback" });
  [s, c] = stage(10, 0, 0, "119 ms", "118 ms", "active");
  sys.state("canary", "v2.1 · 10% traffic", "compare");
  sys.state("lb", "90% stable · 10% canary", "compare");
  sys.set({ "canary share": "10%" });
  route(s, c, `v2.1 with the fix starts again from 10% (${plural(c, "canary request")}, ${s} stable). Every promotion repeats the same gate; nothing is trusted because it passed last time.`, "active");
  [s, c] = stage(50, 0, 0, "121 ms", "118 ms", "done");
  sys.state("lb", "50% stable · 50% canary", "compare");
  sys.state("canary", "v2.1 · 50% traffic", "done");
  sys.set({ "canary share": "50%" });
  route(s, c, `50%: clean, 0 errors on both sides and a p99 of 121 ms against 118 ms. The gate compares like with like, so a traffic spike that slows both versions does not fail the canary.`, "done");
  stage(100, 0, 0, "121 ms", "—", "done");
  sys.state("lb", "100% v2.1", "done");
  sys.state("canary", "v2.1 · promoted", "done");
  sys.state("stable", "v2.1 ×10", "done");
  sys.set({ "canary share": "100%" });
  sys.msg("lb", "canary", "100% → v2.1 is the new stable", `Promotion: the remaining instances roll to v2.1 and it becomes the stable version. The whole release took a few analysis windows longer than a blue-green flip.`, { tone: "done", tag: "promote" });
  const c10 = split(10)[1];
  sys.note(`Failure modes: with ${c10 > 1 ? c10 : "a handful of"} canary requests per window there may be too few samples to see a 1% error rate (the gate must require a minimum count, not a rate alone); a canary that only gets the "easy" traffic (cache hits, one region) passes and then fails at 100%; and stateful sessions need sticky routing or the same user bounces between versions.`, "pitfalls");
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
    [`${A} → ${B}`, "allow; timeout 500 ms; retries 2 (GET only)"],
    ["outlier detection", "eject after 5 consecutive 5xx"],
  ];
  sys.table({ title: "Policy pushed to every sidecar (data plane)", head: ["setting", "value"], rows: policy });
  sys.set({ "data plane": `${k} sidecar proxies`, "control plane": "distributes config and certs", "app code changes": "none" });
  sys.note(`Service mesh: every service gets a sidecar proxy (Envoy) that intercepts all of its inbound and outbound traffic. A control plane configures the proxies. Retries, timeouts, mTLS, routing, and telemetry move out of application code into the mesh.`);
  proxies.forEach((p) => sys.tone(p, "compare"));
  sys.fanout("ctrl", proxies, "xDS: routes, certs, policy", `The control plane pushes routing rules, retry and timeout policy, and short-lived certificates to each sidecar. Application containers never see any of this.`, "compare", "config");
  proxies.forEach((p) => sys.tone(p, undefined));
  sys.msg(a, pa, `GET ${b}:8080/status`, `${A} makes a plain HTTP call to ${b}:8080, exactly as it would without a mesh. iptables rules in the pod redirect the connection into ${A}'s sidecar; the app has no idea a mesh exists.`, { tone: "active" });
  sys.state(pa, `${A} · mTLS`, "done");
  sys.state(pb, `${B} · mTLS`, "done");
  sys.msg(pa, pb, "mTLS · timeout 500 ms", `${A}'s sidecar resolves ${B}, picks a healthy endpoint, and opens a mutually authenticated TLS connection to ${B}'s sidecar. Both sides verify identity from the certificate (SPIFFE IDs), not from IP addresses.`, { tone: "active" });
  sys.msg(pb, b, "plain HTTP (authz: allow)", `${B}'s sidecar checks the authorization policy (${A} may call ${B}), terminates TLS, and forwards plain HTTP over localhost to the application.`, { tone: "done" });
  sys.msg(pb, pa, "200 OK · 32 ms", `The response returns through both sidecars, each of which records latency, status, and a trace span. The two extra proxy traversals cost on the order of a millisecond or less.`, { tone: "done" });
  sys.state(b, "slow · 5xx", "danger");
  sys.state(pa, `${A} · retry 1/2`, "compare");
  sys.msg(pa, pb, "retry (attempt 2, budget ok)", `${B} starts failing. ${A}'s sidecar applies the retry policy from the control plane: one retry within budget, with a timeout, without any change to ${A}'s code. Retrying is safe here only because the call is a GET; a proxy cannot know whether a failed POST already charged a card, so retry-on-5xx belongs on idempotent routes.`, { tone: "danger", tag: "retry" });
  sys.state(pa, `${A} · ${B} ejected`, "danger");
  sys.msg(pa, a, "503 (outlier ejected, fast)", `After 5 consecutive 5xx the sidecar ejects that ${B} endpoint from its pool (outlier detection: a per-endpoint circuit breaker) and fails fast. Once ${B} recovers, the endpoint is re-admitted after a cool-down.`, { tone: "danger", tag: "eject" });
  plain(sys, b, "app code");
  plain(sys, pa, A);
  plain(sys, pb, B);
  sys.state("ctrl", "config v1 · telemetry", "compare");
  sys.fanin(proxies, "ctrl", "metrics, traces, access logs", `Every sidecar reports uniform metrics and trace spans, so the mesh gives a service graph, golden signals per edge, and distributed traces for free, in the same shape for every language.`, "compare", "telemetry");
  sys.state("ctrl", "config v2", "done");
  sys.state(pa, `${A} · 10% → ${B} v2`, "done");
  sys.msg("ctrl", pa, `route: 10% ${B} → v2`, `Traffic shaping: the control plane updates ${A}'s sidecar to send 10% of ${B} calls to a v2 subset. Canary releases, header-based routing, and fault injection become configuration, not code.`, { tone: "done", tag: "route" });
  sys.state("ctrl", "DOWN", "danger");
  sys.set({ "control plane down": "sidecars keep last config; no new pods or cert rotation", "cost": "≈1 ms or less per call and a proxy's CPU/memory per pod" });
  sys.note(`Failure modes: the control plane is a new critical dependency (sidecars keep running on their last config, but new pods cannot join and certificates stop rotating); each proxy adds latency and memory to every pod; and debugging now spans app, sidecar, and mesh config, which is a lot of YAML for a small team.`, "pitfalls");
  plain(sys, "ctrl", "config v2");
  plain(sys, pa, A);
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
