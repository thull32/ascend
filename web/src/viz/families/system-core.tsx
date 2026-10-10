// The `system` family: boxes (services, caches, databases, queues, nodes)
// exchanging messages, each box carrying a small mutable state readout.
// Scenarios are scripts over the `Sys` DSL below; the renderer is shared.
//
// Scenario authors: create `new Sys([...nodes])`, then call `msg`, `state`,
// `tone`, `note`, `set`, and return `sys.f.done()`. Keep node ids short
// (they are drawn as labels). Coordinates are optional (0..100 grid); the
// default layout places nodes in rows of up to four.
import { Arrow, Box, Legend, Vars, type Tone } from "../primitives";
import { Frames, type Family, type RendererProps } from "../engine";

export interface SystemInput {
  nodes?: number;
  replicas?: number;
  keys?: string[];
  /** A bare number given as `keys` in a lesson: how many keys to generate. */
  keyCount?: number;
  requests?: number;
  [k: string]: unknown;
}

export interface SysNode {
  id: string;
  label: string;
  kind: "client" | "service" | "cache" | "db" | "queue" | "node" | "lb" | "external";
  x?: number;
  y?: number;
  tone?: Tone;
  /** Short state readout drawn under the label, e.g. "term 3 · leader". */
  state?: string;
}

export interface SysMessage {
  from: string;
  to: string;
  label: string;
  tone: Tone;
  dashed?: boolean;
}

export interface SystemState {
  nodes: SysNode[];
  messages: SysMessage[];
  log: string[];
  vars: Record<string, unknown>;
  /** Optional ring (consistent hashing) 0..360 positions for keys/nodes. */
  ring?: { nodes: { id: string; angle: number; tone?: Tone }[]; keys: { id: string; angle: number; owner?: string; tone?: Tone }[] };
  /** Optional table (e.g. a log, a bucket, a cache) drawn under the diagram. */
  table?: { title: string; rows: (string | number)[][]; head?: string[]; tones?: (Tone | undefined)[] };
}

export class Sys {
  s: SystemState;
  f: Frames<SystemState>;
  constructor(nodes: (Partial<SysNode> & { id: string })[]) {
    this.s = {
      nodes: nodes.map((n) => ({ id: n.id, label: n.label ?? n.id, kind: n.kind ?? "service", x: n.x, y: n.y, tone: n.tone, state: n.state })),
      messages: [],
      log: [],
      vars: {},
    };
    this.f = new Frames<SystemState>(() => ({
      nodes: this.s.nodes.map((n) => ({ ...n })),
      messages: this.s.messages.map((m) => ({ ...m })),
      log: [...this.s.log],
      vars: { ...this.s.vars },
      ring: this.s.ring ? { nodes: this.s.ring.nodes.map((n) => ({ ...n })), keys: this.s.ring.keys.map((k) => ({ ...k })) } : undefined,
      table: this.s.table ? { ...this.s.table, rows: this.s.table.rows.map((r) => [...r]), tones: this.s.table.tones ? [...this.s.table.tones] : undefined } : undefined,
    }));
  }
  node(id: string): SysNode {
    const n = this.s.nodes.find((x) => x.id === id);
    if (!n) throw new Error(`unknown node ${id}`);
    return n;
  }
  /** One message in flight for this frame (cleared on the next call unless keep). */
  msg(from: string, to: string, label: string, note: string, opts: { tone?: Tone; tag?: string; keep?: boolean; dashed?: boolean } = {}) {
    const m: SysMessage = { from, to, label, tone: opts.tone ?? "active", dashed: opts.dashed };
    this.s.messages = opts.keep ? [...this.s.messages, m] : [m];
    this.s.log = [...this.s.log.slice(-4), `${from} → ${to}: ${label}`];
    this.f.push(note, opts.tag ?? "message");
  }
  /** Several messages at once (fan-out, replication, gossip). */
  fanout(from: string, tos: string[], label: string, note: string, tone: Tone = "active", tag = "fan-out") {
    this.s.messages = tos.map((to) => ({ from, to, label, tone }));
    this.s.log = [...this.s.log.slice(-4), `${from} → ${tos.join(", ")}: ${label}`];
    this.f.push(note, tag);
  }
  fanin(froms: string[], to: string, label: string, note: string, tone: Tone = "compare", tag = "fan-in") {
    this.s.messages = froms.map((from) => ({ from, to, label, tone }));
    this.s.log = [...this.s.log.slice(-4), `${froms.join(", ")} → ${to}: ${label}`];
    this.f.push(note, tag);
  }
  clear() {
    this.s.messages = [];
  }
  state(id: string, state: string | undefined, tone?: Tone) {
    const n = this.node(id);
    n.state = state;
    if (tone !== undefined) n.tone = tone;
  }
  tone(id: string, tone?: Tone) {
    this.node(id).tone = tone;
  }
  set(vars: Record<string, unknown>) {
    this.s.vars = { ...this.s.vars, ...vars };
  }
  note(text: string, tag = "note") {
    this.s.messages = [];
    this.f.push(text, tag);
  }
  table(t: SystemState["table"]) {
    this.s.table = t;
  }
  ring(r: SystemState["ring"]) {
    this.s.ring = r;
  }
}

export type SysGen = (input: SystemInput) => ReturnType<Frames<SystemState>["done"]>;

// ---------- three reference scenarios ----------

/**
 * Request flow. With no `variant` this is the textbook read path the
 * visualisation-engine lesson quotes line for line, so keep it unchanged.
 * Variants tell the story a lesson's title promises: "redirect" (URL
 * shortener hot path), "latency" (where the time goes), "aggregate" (shared
 * components receive the sum), "chain" (N services in series), "trace"
 * (traceparent propagation), "trace-ascend" (Ascend's API to grader trace),
 * "trust" (three trust boundaries), "layers" (Ascend's middleware stack).
 */
export const requestFlow: SysGen = (input) => {
  const v = String(input.variant ?? "");
  const variant = Object.hasOwn(flowVariants, v) ? flowVariants[v] : undefined;
  if (variant) return variant(input);
  const sys = new Sys([
    { id: "client", label: "Browser", kind: "client", x: 5, y: 50 },
    { id: "cdn", label: "CDN edge", kind: "external", x: 22, y: 20 },
    { id: "lb", label: "Load balancer", kind: "lb", x: 38, y: 50 },
    { id: "api", label: "API service", kind: "service", x: 58, y: 50 },
    { id: "cache", label: "Redis", kind: "cache", x: 78, y: 20 },
    { id: "db", label: "Postgres", kind: "db", x: 78, y: 80 },
  ]);
  sys.note(`A typical read path: static assets from the CDN, dynamic data through a load balancer to stateless API servers, cache in front of the database.`);
  sys.msg("client", "cdn", "GET /app.js", `Static asset: served by the nearest CDN edge from cache; the origin is never touched.`, { tone: "done" });
  sys.msg("client", "lb", "GET /api/lessons", `Dynamic request hits the load balancer (TLS terminates here).`);
  sys.msg("lb", "api", "GET /api/lessons", `Balancer picks a healthy API instance (least connections). Instances are stateless, so any one will do.`);
  sys.msg("api", "cache", "GET lessons:v3", `API checks the cache first (cache-aside).`, { tone: "compare" });
  sys.state("cache", "MISS", "danger");
  sys.msg("cache", "api", "(nil)", `Miss: the key is not there yet.`, { tone: "danger" });
  sys.msg("api", "db", "SELECT … FROM lessons", `Fall through to the database (~5 ms).`, { tone: "compare" });
  sys.msg("db", "api", "42 rows", `Database answers.`, { tone: "done" });
  sys.state("cache", "lessons:v3 (TTL 60s)", "done");
  sys.msg("api", "cache", "SET lessons:v3 EX 60", `Populate the cache with a TTL so the next 60 s of reads never touch Postgres.`, { tone: "done" });
  sys.msg("api", "client", "200 OK (ETag)", `Respond. Total ≈ LB 1 ms + cache miss 1 ms + DB 5 ms + serialisation.`, { tone: "done" });
  sys.set({ "next request": "cache HIT, ~1 ms", "scaling": "add API instances behind the LB; cache and DB are the shared state" });
  sys.note(`Ask in a design review: what happens when Redis is down (degrade to DB with a circuit breaker) and when the DB is slow (timeouts, load shedding).`, "done");
  return sys.f.done();
};

/** FNV-1a followed by murmur3's fmix32 finaliser, so short similar strings spread around the ring. */
export const ringHash = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

const fnv32 = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

// The first six are the classic demo keys; the rest were picked so no two land within 9° of each other.
const DEFAULT_RING_KEYS = ["user:1", "user:7", "video:9", "session:3", "cart:5", "feed:2", "user:2", "user:3", "user:5", "user:6", "user:9", "user:12", "user:13", "user:16", "user:17", "user:18"];
const MAX_RING_KEYS = 16;

/**
 * Consistent hashing. Nodes sit at evenly spaced points (rotated so the keys
 * split as evenly as the key hashes allow), standing in for the balanced arcs
 * that virtual nodes give a real ring; `positions` overrides them. Keys hash
 * onto the ring. The joining node lands inside the most loaded arc where it
 * takes about 1/(n+1) of the keys (`added` overrides its angle).
 */
export const consistentHashing: SysGen = (input) => {
  const { nodes = 3 } = input;
  const n = Math.min(6, Math.max(2, Number.isFinite(Number(nodes)) ? Math.round(Number(nodes)) : 3));
  const nodeIds = Array.from({ length: n }, (_, i) => `N${i + 1}`);
  const given = Array.isArray(input.keys) ? [...new Set(input.keys.map(String))].slice(0, MAX_RING_KEYS) : [];
  const count = Math.min(MAX_RING_KEYS, Math.max(1, Number.isFinite(Number(input.keyCount)) ? Math.round(Number(input.keyCount)) : 6));
  const keyIds = given.length ? given : DEFAULT_RING_KEYS.slice(0, count);
  const K = keyIds.length;
  const keyAngle = Object.fromEntries(keyIds.map((k) => [k, ringHash(k) % 360])) as Record<string, number>;
  const rf = Math.min(n, Math.max(1, Number.isFinite(Number(input.replicas)) ? Math.round(Number(input.replicas)) : 1));
  const ownerIn = (ring: { id: string; angle: number }[], angle: number) => {
    const sorted = [...ring].sort((a, b) => a.angle - b.angle);
    return (sorted.find((p) => p.angle >= angle) ?? sorted[0])!.id;
  };
  const replicasIn = (ring: { id: string; angle: number }[], angle: number) => {
    const sorted = [...ring].sort((a, b) => a.angle - b.angle);
    const start = Math.max(0, sorted.findIndex((p) => p.angle >= angle));
    return Array.from({ length: Math.min(rf, sorted.length) }, (_, i) => sorted[(start + i) % sorted.length]!.id);
  };
  // Node placement: author positions, else evenly spaced and rotated to balance the keys.
  const custom = Array.isArray(input.positions) ? (input.positions as unknown[]).map(Number).filter((a) => Number.isFinite(a)) : [];
  let ringNodes: { id: string; angle: number }[];
  if (custom.length >= n) ringNodes = nodeIds.map((id, i) => ({ id, angle: ((Math.round(custom[i]!) % 360) + 360) % 360 }));
  else {
    const step = 360 / n;
    let best: { score: number; nodes: { id: string; angle: number }[] } | undefined;
    for (let off = 0; off < step; off++) {
      const cand = nodeIds.map((id, i) => ({ id, angle: Math.round(off + i * step) % 360 }));
      const load = nodeIds.map((id) => keyIds.filter((k) => ownerIn(cand, keyAngle[k]!) === id).length);
      const gap = Math.min(...keyIds.map((k) => Math.min(...cand.map((c) => Math.abs(c.angle - keyAngle[k]!)))));
      const score = (gap < 3 ? 1_000_000 : 0) + Math.max(...load) * 1000 - Math.min(...load) * 100 + off / 1000;
      if (!best || score < best.score) best = { score, nodes: cand };
    }
    ringNodes = best!.nodes;
  }
  const sys = new Sys([]);
  const placed: { id: string; angle: number; owner: string }[] = [];
  const ringState = (nodesTone: (id: string) => Tone | undefined, keyTone: (k: { id: string; owner: string }) => Tone | undefined, ring = ringNodes) =>
    sys.ring({ nodes: ring.map((p) => ({ ...p, tone: nodesTone(p.id) })), keys: placed.map((k) => ({ ...k, tone: keyTone(k) })) });
  ringState(() => undefined, () => undefined);
  const where = [...ringNodes].sort((a, b) => a.angle - b.angle).map((p) => `${p.id} ${p.angle}°`).join(", ");
  sys.set({ nodes: where, rule: "first node clockwise from the key" });
  sys.note(`Consistent hashing: nodes and keys share one circle of positions (0° to 359°). ${n} nodes sit at ${where}. A key belongs to the first node at or after its position, walking clockwise and wrapping past the top.`);
  for (const k of keyIds) {
    const angle = keyAngle[k]!;
    const o = ownerIn(ringNodes, angle);
    placed.push({ id: k, angle, owner: o });
    ringState((id) => (id === o ? "active" : undefined), (x) => (x.id === k ? "compare" : "visited"));
    const reps = replicasIn(ringNodes, angle);
    sys.s.vars = { nodes: where, key: k, position: angle + "°", owner: o, ...(rf > 1 ? { replicas: reps.join(", ") } : {}) };
    const wraps = angle > Math.max(...ringNodes.map((p) => p.angle));
    sys.f.push(`hash(${k}) lands at ${angle}°; walking clockwise${wraps ? ", past the top," : ""} the first node is ${o}${rf > 1 ? `, and with ${rf} replicas the next ${rf - 1 === 1 ? "node" : `${rf - 1} nodes`} clockwise, ${reps.slice(1).join(" and ")}, hold${rf - 1 === 1 ? "s" : ""} copies` : ""}.`, "place");
  }
  const load = (ring: { id: string; angle: number }[]) => ring.map((p) => `${p.id} ${placed.filter((k) => ownerIn(ring, k.angle) === p.id).length}`).join(" · ");
  sys.s.vars = { nodes: where, "keys per node": load(ringNodes) };
  sys.clear();
  ringState(() => undefined, () => "visited");
  sys.f.push(`All ${K} keys placed: ${load(ringNodes)}. Each node owns the arc that ends at its own position.`, "placed");
  // The joining node.
  const added = `N${n + 1}`;
  let addedAngle: number;
  const forced = Number(input.added);
  if (input.added !== undefined && Number.isFinite(forced)) addedAngle = ((Math.round(forced) % 360) + 360) % 360;
  else {
    const sorted = [...ringNodes].sort((a, b) => a.angle - b.angle);
    const arcKeys = (owner: string) => {
      const i = sorted.findIndex((p) => p.id === owner);
      const prev = sorted[(i - 1 + sorted.length) % sorted.length]!.angle;
      const dist = (a: number) => (a - prev + 360) % 360;
      return placed.filter((k) => k.owner === owner).sort((a, b) => dist(a.angle) - dist(b.angle));
    };
    const heavy = [...sorted].sort((a, b) => arcKeys(b.id).length - arcKeys(a.id).length || a.angle - b.angle)[0]!;
    const inArc = arcKeys(heavy.id);
    const take = Math.min(inArc.length, Math.max(1, Math.round(K / (n + 1))));
    if (inArc.length === 0) addedAngle = (heavy.angle + 180 / n) % 360;
    else {
      const a = inArc[take - 1]!.angle;
      const b = take < inArc.length ? inArc[take]!.angle : heavy.angle;
      const gap = (b - a + 360) % 360;
      // Land strictly inside the arc, after the last key it takes and before the next key (or the owner).
      addedAngle = gap >= 2 ? (a + Math.floor(gap / 2)) % 360 : a;
    }
  }
  const before = new Map(placed.map((k) => [k.id, k.owner]));
  const grown = [...ringNodes, { id: added, angle: addedAngle }];
  const sortedGrown = [...grown].sort((a, b) => a.angle - b.angle);
  const gi = sortedGrown.findIndex((p) => p.id === added);
  const pred = sortedGrown[(gi - 1 + sortedGrown.length) % sortedGrown.length]!;
  const succ = sortedGrown[(gi + 1) % sortedGrown.length]!;
  placed.forEach((k) => (k.owner = ownerIn(grown, k.angle)));
  const moved = placed.filter((k) => before.get(k.id) !== k.owner);
  const modMoved = keyIds.filter((k) => fnv32(k) % n !== fnv32(k) % (n + 1)).length;
  ringState((id) => (id === added ? "done" : undefined), (k) => (before.get(k.id) !== k.owner ? "danger" : "visited"), grown);
  sys.s.vars = { nodes: where, added: `${added} at ${addedAngle}°`, "keys moved": `${moved.length} / ${K}`, "keys per node": load(grown), [`hash mod ${n} → mod ${n + 1} would move`]: `${modMoved} / ${K}` };
  const movedList = moved.map((k) => k.id).join(", ");
  sys.f.push(`${added} joins at ${addedAngle}°, between ${pred.id} (${pred.angle}°) and ${succ.id} (${succ.angle}°). It claims only that arc: ${moved.length === 0 ? "no key sits on it, so nothing moves" : `${movedList} ${moved.length === 1 ? "moves" : "move"} from ${succ.id} to ${added}`}, ${moved.length} of ${K} keys. No key moves between the old nodes. With hash mod N, going from ${n} to ${n + 1} would remap ${modMoved} of these ${K} keys.`, "add node");
  sys.f.push(`The ideal is that the newcomer takes its fair share, about 1/${n + 1} of the keys, and nothing else moves. With one point per node, how much it takes depends on where it lands, so real rings give each node ~100–200 virtual nodes: arcs even out, a new node takes a little from everyone, and a failed node's load spreads across many neighbours. Used by Dynamo, Cassandra, memcached clients and CDN routing.`, "done");
  return sys.f.done();
};

export const raftElection: SysGen = () => {
  const sys = new Sys([
    { id: "A", kind: "node", x: 20, y: 30, state: "follower · term 1" },
    { id: "B", kind: "node", x: 70, y: 30, state: "follower · term 1" },
    { id: "C", kind: "node", x: 45, y: 80, state: "follower · term 1" },
  ]);
  sys.note(`Raft leader election. All nodes start as followers with randomised election timeouts (150–300 ms) so they rarely time out together.`);
  sys.state("A", "candidate · term 2", "compare");
  sys.set({ "A votes": 1 });
  sys.note(`A's timeout fires first: it increments its term to 2, becomes a candidate, and votes for itself.`, "timeout");
  sys.fanout("A", ["B", "C"], "RequestVote(term 2)", `A asks the others for votes. A vote is granted only if the requester's term ≥ the voter's and its log is at least as up to date.`, "active");
  sys.state("B", "follower · term 2 · voted A", "visited");
  sys.state("C", "follower · term 2 · voted A", "visited");
  sys.fanin(["B", "C"], "A", "VoteGranted", `Both grant their vote (one vote per term per node, persisted to disk before replying).`, "done");
  sys.set({ "A votes": 3, majority: 2 });
  sys.state("A", "LEADER · term 2", "done");
  sys.note(`A has all 3 votes, more than the 2 a majority of three needs: it becomes leader for term 2. A majority guarantees at most one leader per term.`, "elected");
  sys.fanout("A", ["B", "C"], "AppendEntries (heartbeat)", `The leader sends heartbeats to reset follower timeouts; no new elections while it keeps sending.`, "muted", "heartbeat");
  sys.tone("A", "danger");
  sys.state("A", "LEADER (partitioned)", "danger");
  sys.note(`Network partition: A is cut off. B and C stop hearing heartbeats.`, "partition");
  sys.state("C", "candidate · term 3", "compare");
  sys.msg("C", "B", "RequestVote(term 3)", `C times out first, starts term 3.`);
  sys.state("B", "follower · term 3 · voted C", "visited");
  sys.msg("B", "C", "VoteGranted", `B votes; C has 2 of 3, a majority.`, { tone: "done" });
  sys.state("C", "LEADER · term 3", "done");
  sys.note(`C leads term 3. When A reconnects, it sees a higher term in any message and steps down to follower; its uncommitted entries are overwritten.`, "done");
  sys.set({ safety: "one leader per term", liveness: "randomised timeouts", "split-brain": "impossible: old leader cannot commit without a majority" });
  return sys.f.done();
};

// ---------- request-flow variants ----------

const redirectFlow: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Browser", kind: "client", x: 5, y: 50 },
    { id: "lb", label: "L7 balancer", kind: "lb", x: 30, y: 50 },
    { id: "svc", label: "Redirect svc", kind: "service", x: 56, y: 50, state: "stateless × N" },
    { id: "cache", label: "Redis", kind: "cache", x: 86, y: 18 },
    { id: "db", label: "Postgres", kind: "db", x: 86, y: 82 },
  ]);
  sys.set({ "budget": "p99 < 20 ms server-side", "server time": "0 ms" });
  sys.note(`The redirect hot path: GET /{short_key} goes through an L7 load balancer to a stateless redirect service, which asks Redis first and Postgres only on a miss.`);
  sys.msg("client", "lb", "GET /x7Kq", `A click arrives. The balancer terminates TLS and picks any healthy redirect instance: they hold no state, so any one will do.`);
  sys.set({ "server time": "≈ 0.5 ms" });
  sys.msg("lb", "svc", "GET /x7Kq", `One same-zone hop, about half a millisecond.`);
  sys.msg("svc", "cache", "GET link:x7Kq", `The service asks Redis for the key. The cost is the round trip, about 0.5 ms; Redis itself answers in microseconds.`, { tone: "compare" });
  sys.state("cache", "HIT x7Kq", "done");
  sys.set({ "server time": "≈ 1 ms" });
  sys.msg("cache", "svc", "https://example.com/…", `A hit: the long URL comes straight back.`, { tone: "done" });
  sys.msg("svc", "client", "302 Location: …", `The service answers 302 with a Location header, about 1 ms after the request reached the balancer. With a 90% hit ratio, nine clicks in ten end here and never touch the database.`, { tone: "done" });
  sys.state("cache", undefined);
  sys.set({ "server time": "≈ 1 ms" });
  sys.msg("svc", "cache", "GET link:a9Zp", `A click on a link nobody has followed recently: the same path, a different key.`, { tone: "compare" });
  sys.state("cache", "MISS a9Zp", "danger");
  sys.msg("cache", "svc", "(nil)", `A miss. The service falls through to the database.`, { tone: "danger" });
  sys.set({ "server time": "≈ 2 ms" });
  sys.msg("svc", "db", "SELECT long_url … = 'a9Zp'", `A primary-key lookup on Postgres: about a millisecond including the round trip.`, { tone: "compare" });
  sys.msg("db", "svc", "https://example.org/…", `The row comes back.`, { tone: "done" });
  sys.state("cache", "a9Zp cached (TTL)", "done");
  sys.msg("svc", "cache", "SET link:a9Zp … EX 86400", `The service fills the cache with a TTL, so the next click on a9Zp is a hit.`, { tone: "done" });
  sys.set({ "server time": "≈ 2–3 ms" });
  sys.msg("svc", "client", "302 Location: …", `302 again, a couple of milliseconds in. The misses set the p99, so that is the path to make fast: an index on short_key and a connection pool sized so a miss never waits.`, { tone: "done" });
  sys.note(`Why 302 and not 301: a browser caches a 301 and stops asking, which saves load but loses click events, destination changes and takedowns. Every hop adds latency; the cache is what keeps most clicks off the database.`, "done");
  return sys.f.done();
};

const latencyFlow: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 5, y: 50 },
    { id: "lb", label: "Load balancer", kind: "lb", x: 30, y: 50 },
    { id: "svc", label: "Service", kind: "service", x: 56, y: 50 },
    { id: "cache", label: "Redis", kind: "cache", x: 86, y: 18 },
    { id: "db", label: "Postgres", kind: "db", x: 86, y: 82 },
  ]);
  const rows: (string | number)[][] = [];
  const add = (hop: string, cost: string, total: string) => {
    rows.push([hop, cost, total]);
    sys.table({ title: "Where the time goes (one request, cache miss)", head: ["hop", "cost", "server-side so far"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === rows.length - 1 ? "active" : undefined)) });
  };
  sys.table({ title: "Where the time goes (one request, cache miss)", head: ["hop", "cost", "server-side so far"], rows: [] });
  sys.note(`One request, priced hop by hop with the reference numbers: same-zone round trips of about half a millisecond, a Redis GET that is almost all round trip, a Postgres primary-key lookup of about a millisecond.`);
  add("client ↔ balancer", "20–200 ms RTT", "–");
  sys.msg("client", "lb", "GET /api/item/42", `First the client's own round trip to the region: about 20 ms from the same city, 70 to 90 ms across the Atlantic, up to 200 ms from Australia. Nothing on the server side can remove it.`);
  add("balancer → service", "~0.5 ms", "0.5 ms");
  sys.msg("lb", "svc", "GET /api/item/42", `Balancer to service: one same-zone hop, about 0.5 ms.`);
  add("service → Redis", "~0.5 ms", "1 ms");
  sys.msg("svc", "cache", "GET item:42", `Service to cache: about 0.5 ms, nearly all of it network; Redis executes a GET in about a microsecond.`, { tone: "compare" });
  sys.state("cache", "MISS", "danger");
  sys.msg("cache", "svc", "(nil)", `A miss, so the request continues to the database.`, { tone: "danger" });
  add("service → Postgres", "~1 ms", "2 ms");
  sys.msg("svc", "db", "SELECT … WHERE id = 42", `Cache miss to database: about 1 ms. The lookup itself takes about 0.13 ms on a warm buffer pool; the rest is the round trip.`, { tone: "compare" });
  sys.msg("db", "svc", "1 row", `The row comes back.`, { tone: "done" });
  add("service → client", "back over the same RTT", "≈ 2 ms + serialisation");
  sys.msg("svc", "client", "200 OK", `The response goes back. Server-side, the whole request cost about 2 ms; the client still waits its 20 to 200 ms round trip on top.`, { tone: "done" });
  sys.set({ "server-side": "≈ 2 ms", "client RTT": "20–200 ms", "slowest hop": "the geography" });
  sys.note(`The database is rarely the slowest hop; the distance to the user is. Five sequential same-zone calls cost 1–2 ms, while one cross-region call costs as much as a hundred of them, which is why multi-region designs replicate data instead of calling across an ocean on the hot path.`, "done");
  return sys.f.done();
};

const aggregateFlow: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "2,000 req/s", kind: "client", x: 5, y: 50 },
    { id: "lb", label: "Load balancer", kind: "lb", x: 26, y: 50 },
    { id: "r1", label: "Replica 1", kind: "service", x: 52, y: 15, state: "pool 10" },
    { id: "r2", label: "Replica 2", kind: "service", x: 52, y: 50, state: "pool 10" },
    { id: "r3", label: "Replica 3", kind: "service", x: 52, y: 85, state: "pool 10" },
    { id: "cache", label: "Redis", kind: "cache", x: 88, y: 18, state: "shared" },
    { id: "db", label: "Postgres", kind: "db", x: 88, y: 82, state: "max_connections 100" },
  ]);
  const reps = ["r1", "r2", "r3"];
  const rows: (string | number)[][] = [];
  const show = (tone?: Tone) => sys.table({ title: "The database receives the sum (pool of 10 per replica)", head: ["replicas", "req/s each", "DB connections wanted", "max_connections"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === rows.length - 1 ? tone : undefined)) });
  sys.set({ "peak": "2,000 req/s", "queries in flight": "2,000 × 5 ms = 10" });
  sys.note(`A stateless tier behind a load balancer, all replicas sharing one Redis and one Postgres. Each replica holds a connection pool of 10, a common default.`);
  sys.msg("client", "lb", "2,000 req/s", `Peak traffic arrives at the balancer.`);
  sys.fanout("lb", reps, "≈ 667 req/s", `The balancer spreads it evenly: about 667 requests a second per replica. This part scales: add a replica and each one's share shrinks.`);
  rows.push([3, 667, 30, 100]);
  show("done");
  sys.state("db", "30 connections", "visited");
  sys.fanin(reps, "db", "pool: 10 conns", `But every replica opens its own pool to the same database: 3 × 10 = 30 connections, and every cache miss and write from all three lands on one Postgres.`, "compare");
  sys.fanin(reps, "cache", "GET / SET", `The cache sees the sum too: each replica's reads and its misses' refills.`, "compare");
  rows.push([10, 200, 100, 100]);
  show("compare");
  reps.forEach((r) => sys.state(r, "× 10 replicas"));
  sys.state("db", "100 / 100 connections", "compare");
  sys.note(`Scale the tier to 10 replicas for headroom: each now serves 200 req/s, but the database is asked for 10 × 10 = 100 connections, its whole max_connections.`, "scale");
  rows.push([30, 67, 300, 100]);
  show("danger");
  reps.forEach((r) => sys.state(r, "× 30 replicas"));
  sys.state("db", "300 wanted · limit 100", "danger");
  sys.fanin(reps, "db", "connect", `At 30 replicas the pools want 300 connections. Postgres runs a process per connection and refuses past its limit, so new connections fail although each replica is nearly idle. The stateless tier scaled; the shared component took the sum.`, "danger");
  sys.set({ "fix": "size pools from λW, put PgBouncer in front, cache reads, add read replicas, then partition" });
  sys.note(`The work itself needs only about 10 concurrent queries (2,000 req/s × 5 ms). The fixes bound the sum: size pools from that arithmetic, multiplex through PgBouncer, cut reads with the cache and read replicas, scale the primary up, and only then partition.`, "fix");
  sys.note(`The load balancer distributes requests; nothing distributes the database. Every replica you add adds its connections, misses and writes to the same shared components, so they are where horizontal scaling stops.`, "done");
  return sys.f.done();
};

const CHAIN_NAMES = ["Gateway", "Orders", "Inventory", "Pricing", "Payments", "Shipping"];

const chainFlow: SysGen = ({ nodes }) => {
  const n = Math.min(6, Math.max(2, Number.isFinite(Number(nodes)) ? Math.round(Number(nodes)) : 5));
  const names = CHAIN_NAMES.slice(0, n);
  const ids = names.map((_, i) => `s${i + 1}`);
  const sys = new Sys([{ id: "client", label: "Client", kind: "client", x: 4, y: 50 }, ...names.map((name, i) => ({ id: ids[i]!, label: name, kind: "service" as const, x: 22 + (74 * i) / Math.max(1, n - 1), y: i % 2 ? 72 : 28, state: "99.9% · p99 50 ms" }))]);
  const rows: (string | number)[][] = [];
  const pct = (x: number) => `${(100 * x).toFixed(x > 0.999 ? 2 : 1)}%`;
  const show = () => sys.table({ title: "Compounding along the chain (each service 99.9% available, p99 50 ms)", head: ["hops so far", "all hops up", "some hop in its slowest 1%"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === rows.length - 1 ? "active" : undefined)) });
  show();
  sys.note(`One request that must pass through ${n} services in sequence. Each one is 99.9% available and answers in 5 ms at the median and 50 ms at the 99th percentile. Watch what compounds.`);
  for (let i = 0; i < n; i++) {
    const k = i + 1;
    rows.push([k, pct(Math.pow(0.999, k)), pct(1 - Math.pow(0.99, k))]);
    show();
    sys.tone(ids[i]!, "active");
    sys.msg(i === 0 ? "client" : ids[i - 1]!, ids[i]!, `call ${k}`, `Hop ${k}${i === 0 ? "" : `, ${names[i - 1]} → ${names[i]}`}: a network round trip, serialisation, and one more service that must be up (${pct(Math.pow(0.999, k))} so far) and fast (${pct(1 - Math.pow(0.99, k))} chance some hop has hit its slowest 1%).`);
    sys.tone(ids[i]!, undefined);
  }
  sys.msg(ids[0]!, "client", "response", `The answer unwinds back through every hop. The request was only as available as all ${n} services at once, and only as fast as their sum.`, { tone: "done" });
  const avail = Math.pow(0.999, n);
  const down = (1 - avail) * 30 * 24;
  sys.set({ "end-to-end availability": pct(avail), "downtime a month": down >= 1 ? `${down.toFixed(1)} h (one service: 43 min)` : `${Math.round(down * 60)} min (one service: 43 min)`, "requests that hit some hop's p99": pct(1 - Math.pow(0.99, n)) });
  sys.note(`${n} sequential hops turn 99.9% per service into ${pct(avail)} end to end: ${down >= 1 ? `${down.toFixed(1)} hours` : `${Math.round(down * 60)} minutes`} of downtime a month instead of 43 minutes.${n === 5 ? " Simulated, the chain's p50 is 35 ms rather than 25, its p99 is 124 ms, and a quarter of requests take longer than any single service's p99." : ""}`, "result");
  sys.note(`The levers: fewer hops on the hot path, calls in parallel instead of in series, tight per-call timeouts and hedged requests for the tail, or keeping the boundary inside one process, where a function call cannot time out.`, "done");
  return sys.f.done();
};

const traceFlow: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Browser", kind: "client", x: 4, y: 50 },
    { id: "gw", label: "Gateway", kind: "lb", x: 28, y: 50 },
    { id: "orders", label: "Orders svc", kind: "service", x: 54, y: 50 },
    { id: "inv", label: "Inventory svc", kind: "service", x: 86, y: 50 },
    { id: "col", label: "Collector", kind: "external", x: 54, y: 92 },
  ]);
  const T = "4bf9…4736";
  const spans: (string | number)[][] = [];
  const show = (tone?: Tone, hi?: number) => sys.table({ title: "Spans (trace ID, span, parent)", head: ["trace", "span", "service", "parent", "duration"], rows: spans.map((r) => [...r]), tones: spans.map((_, i) => (hi === undefined || i === hi ? tone : undefined)) });
  show();
  sys.note(`A trace is a tree of spans joined by one trace ID. The ID travels between services in the W3C traceparent header: version, trace ID, the caller's span ID, and a sampled flag.`);
  spans.push([T, "s1", "gateway", "none (root)", "…"]);
  show("active", 0);
  sys.state("gw", "trace 4bf9… · span s1", "active");
  sys.msg("client", "gw", "GET /orders/42", `The request arrives with no traceparent, so the gateway starts a trace: a new 16-byte trace ID and a root span s1, marked sampled.`);
  spans.push([T, "s2", "orders", "s1", "…"]);
  show("active", 1);
  sys.state("orders", "span s2 (parent s1)", "active");
  sys.msg("gw", "orders", `traceparent 00-${T}-s1-01`, `The gateway forwards the header with its own span as the parent. Orders creates child span s2 under s1.`);
  spans.push([T, "s3", "inventory", "s2", "…"]);
  show("active", 2);
  sys.state("inv", "span s3 (parent s2)", "active");
  sys.msg("orders", "inv", `traceparent 00-${T}-s2-01`, `Orders calls inventory with the same trace ID and s2 as the parent. Inventory creates s3 and runs its query.`);
  spans[2]![4] = "720 ms (query 700)";
  spans[1]![4] = "860 ms";
  spans[0]![4] = "900 ms";
  show("done");
  ["gw", "orders", "inv"].forEach((id) => sys.state(id, undefined, undefined));
  sys.msg("gw", "client", "200 after 900 ms", `The response unwinds. Each service ends its span and records its duration: 900 ms at the gateway, 860 in orders, 720 in inventory.`, { tone: "done" });
  sys.fanin(["gw", "orders", "inv"], "col", "spans (async, batched)", `Each service exports its spans to the collector in the background. The collector groups them by trace ID and stitches the tree from the parent links: this request took 900 ms, 700 of them in one inventory query. No metric could say that.`, "compare");
  spans.push(["9c1e…07aa", "t1", "inventory", "none (root)", "720 ms"]);
  show("danger", 3);
  sys.state("inv", "new trace 9c1e…", "danger");
  sys.msg("orders", "inv", "(no traceparent)", `Failure mode: an orders build that drops the header on this call. Inventory sees no parent, starts a new trace, and the tree splits in two: the slow query is now in a trace nobody connects to the slow request.`, { tone: "danger", dashed: true });
  sys.note(`Propagate the header on every hop, including retries and messages through queues, and let the sampled flag travel with it so every service keeps or drops the same traces.`, "done");
  return sys.f.done();
};

const traceAscendFlow: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Browser", kind: "client", x: 4, y: 50 },
    { id: "edge", label: "Edge proxy", kind: "lb", x: 27, y: 50 },
    { id: "api", label: "Ascend API", kind: "service", x: 52, y: 50 },
    { id: "grader", label: "Grading svc", kind: "service", x: 86, y: 50 },
    { id: "col", label: "Jaeger", kind: "external", x: 52, y: 92 },
  ]);
  const T = "4bf9…4736";
  const spans: (string | number)[][] = [];
  const show = (hi?: number, tone: Tone = "active") => sys.table({ title: "Spans for one graded submission", head: ["trace", "span", "where", "parent"], rows: spans.map((r) => [...r]), tones: spans.map((_, i) => (i === hi ? tone : undefined)) });
  show();
  sys.set({ sampler: "ParentBased(TraceIdRatioBased(0.2))" });
  sys.note(`One request, two processes: a submission goes through the edge proxy to the API, which calls the grading service. A trace links their spans under one trace ID, so the slow part is visible instead of inferred.`);
  sys.msg("client", "edge", "POST /api/submissions", `The browser submits code for grading.`);
  spans.push([T, "e7d6…", "API: request", "none (root)"]);
  show(0);
  sys.state("api", "span request (root)", "active");
  sys.msg("edge", "api", "POST /api/submissions", `The API's TraceLayer opens the request span. It never extracts an incoming traceparent, so the trace starts here: request is the root, with trace ID ${T}.`);
  sys.msg("api", "grader", `traceparent 00-${T}-e7d6…-01`, `The API asks the grading service to run the tests, and the propagator writes the current span's context into the traceparent header. There is no separate client span, so the header names request as the parent.`);
  spans.push([T, "0a1b…", "grader: grade", "e7d6… (request)"]);
  show(1);
  sys.state("grader", "span grade (child)", "active");
  sys.note(`The grading service extracts the header and runs the job in a grade span whose parent is the API's request span. Same trace ID, a second process. The sampled flag came with it, so the grader keeps the span exactly when the API sampled the request.`, "child span");
  sys.state("grader", undefined, undefined);
  sys.state("api", undefined, undefined);
  sys.msg("grader", "api", "result", `The verdict comes back; a retry to another grading replica would carry the same header, and a test checks that it does.`, { tone: "done" });
  sys.msg("api", "client", "200 verdict", `The response goes back to the browser.`, { tone: "done" });
  show(undefined);
  sys.fanin(["api", "grader"], "col", "spans over OTLP", `Both processes export their spans to Jaeger, which joins them into one tree: request, with grade inside it. How much of the request was grading is now a picture, not a guess.`, "compare");
  sys.note(`The limit, stated honestly: inside the API there is still only the one span, because no function carries #[tracing::instrument] yet. A slow trace shows the total, not the query that caused it. Each extra span is one attribute away.`, "done");
  return sys.f.done();
};

const trustFlow: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Browser", kind: "client", x: 4, y: 35, state: "untrusted" },
    { id: "gw", label: "Gateway", kind: "lb", x: 30, y: 35, state: "edge" },
    { id: "inv", label: "Invoices", kind: "service", x: 60, y: 35, state: "internal" },
    { id: "db", label: "Postgres", kind: "db", x: 90, y: 35, state: "tenant_id + RLS" },
    { id: "rep", label: "Reporting svc", kind: "service", x: 60, y: 90, state: "internal" },
  ]);
  const rows: (string | number)[][] = [
    ["1: internet → edge", "user token (TLS)", "rate limit, token valid"],
    ["2: edge → internal", "service identity (mTLS) + user token", "may this user do this?"],
    ["3: internal → data", "tenant from the token", "rows of this tenant only"],
  ];
  const show = (hi?: number, tone: Tone = "active") => sys.table({ title: "Three trust boundaries", head: ["boundary", "authenticate", "authorise"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === hi ? tone : undefined)) });
  show();
  sys.note(`A trust boundary is an edge where the level of trust changes. This request crosses three, and at each one the caller is authenticated and the request authorised. The internal network is not trusted.`);
  show(0);
  sys.state("gw", "token ok · tenant t7", "done");
  sys.msg("client", "gw", "GET /invoices/981 + token", `Boundary 1, internet to edge. The gateway terminates TLS, rate limits, and validates the user's short-lived access token: signature, expiry. The user is a member of tenant t7.`);
  sys.msg("client", "gw", "X-Tenant-Id: t9 (forged)", `The browser also sends its own X-Tenant-Id header naming another tenant. The gateway strips inbound identity headers: the tenant comes only from the validated token.`, { tone: "danger" });
  show(1);
  sys.state("inv", "caller: gateway · t7", "done");
  sys.msg("gw", "inv", "mTLS · user token (t7)", `Boundary 2, edge to internal. Invoices checks the caller's certificate (this is the gateway, not anything that reached the network) and checks that the user context permits reading this invoice.`);
  show(2);
  sys.msg("inv", "db", "SELECT … tenant t7, id 981", `Boundary 3, internal to data. The lookup is by tenant and ID, and row-level security filters to tenant t7 as a second wall, set inside the transaction so a pooled connection cannot leak the previous tenant's setting.`, { tone: "compare" });
  sys.msg("db", "inv", "invoice 981 (t7)", `The row belongs to t7, so it comes back.`, { tone: "done" });
  sys.msg("inv", "gw", "200 invoice 981", `The invoice goes back through the gateway to the user who owns it.`, { tone: "done" });
  sys.msg("inv", "db", "… WHERE tenant t7 AND id 982", `An insecure direct object reference: the same user asks for invoice 982, which belongs to tenant t9. The tenant filter returns no row, so the answer is 404. Guessing IDs gains nothing.`, { tone: "danger" });
  sys.state("rep", "compromised", "danger");
  sys.state("inv", "caller: reporting ✗", "danger");
  sys.msg("rep", "inv", "GET /invoices?all (no user)", `A compromised reporting container calls Invoices directly. Its certificate proves it is the reporting service, policy does not allow that identity to read invoices, and it carries no user token: 403. One breached container does not get the whole table.`, { tone: "danger" });
  sys.note(`At every boundary: who is calling, proven how, and may they do this to this resource? An attacker past one boundary gains only what that boundary's identity was allowed.`, "done");
  return sys.f.done();
};

const layersFlow: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Browser", kind: "client", x: 4, y: 50 },
    { id: "edge", label: "Platform edge", kind: "lb", x: 24, y: 50 },
    { id: "mw", label: "Middleware", kind: "service", x: 46, y: 50, state: "app.rs layers" },
    { id: "handler", label: "Route handler", kind: "service", x: 68, y: 18, state: "crates/api" },
    { id: "core", label: "AuthService", kind: "service", x: 68, y: 82, state: "crates/core" },
    { id: "db", label: "Postgres", kind: "db", x: 92, y: 82 },
  ]);
  const layers = ["sanitise x-request-id", "set request id", "propagate request id", "tracing span", "metrics::record", "timeout 240 s → 503", "compression", "security headers", "router: /api", "body limit 512 KiB", "rate limit", "CSRF check", "stamp_route → handler"];
  const show = (from: number, to: number, tone: Tone = "active") => sys.table({ title: "Ascend's middleware, outermost first (crates/api/src/app.rs)", head: ["#", "layer"], rows: layers.map((l, i) => [i + 1, l]), tones: layers.map((_, i) => (i >= from && i <= to ? tone : undefined)) });
  show(-1, -1);
  sys.note(`Each hop is a boundary with its own vocabulary: HTTP at the edge and in the middleware, typed requests in the handler, domain types in the core crate, SQL behind it. Follow one login through Ascend.`);
  sys.msg("client", "edge", "POST /api/auth/login", `The platform edge terminates TLS and forwards the request to Ascend, a single binary.`);
  show(0, 2);
  sys.state("mw", "request id", "active");
  sys.msg("edge", "mw", "POST /api/auth/login", `The outermost layers run first: a client-supplied x-request-id survives only if it is a UUID, one is set if none survived, and it is copied to the response.`);
  show(3, 5);
  sys.state("mw", "span · metrics · timeout", "active");
  sys.note(`Then the tracing span (it reads the request ID, so it must come after), the metrics timer (outside the timeout, so a request cut off at 240 s is still recorded as a 503), and the timeout itself.`, "layers");
  show(6, 11);
  sys.state("mw", "/api checks", "active");
  sys.note(`Compression and security headers wrap everything, error pages included. The router sends /api requests through the body limit, the per-IP rate limit and the CSRF check, rate limit first so a flood of forged requests still spends its budget.`, "layers");
  show(12, 12, "done");
  sys.state("mw", "passed", "done");
  sys.state("handler", "login handler", "active");
  sys.msg("mw", "handler", "matched route", `The route matches; stamp_route records its template for the metrics layer. The handler's extractor parses the JSON body into a typed request. HTTP vocabulary stops here.`);
  sys.state("core", "validate · verify · session", "active");
  sys.msg("handler", "core", "AuthService::login(email, pw)", `The handler calls the core crate in domain terms. core has no HTTP types at all; it validates the input, normalises the email and verifies the password.`);
  sys.msg("core", "db", "INSERT INTO sessions …", `Postgres sits behind the core crate: the service creates a session row.`, { tone: "compare" });
  sys.msg("core", "handler", "user + NewSession { token }", `The service returns the user and a NewSession with a token and an expiry. It does not know what a cookie is.`, { tone: "done" });
  sys.state("handler", "Set-Cookie (HttpOnly)", "done");
  sys.msg("handler", "client", "200 + Set-Cookie + x-request-id", `The adapter decides the token travels in an HttpOnly, SameSite=Lax cookie, and errors map to status codes in one place, crates/api/src/error.rs. On the way out the response passes back through every layer: headers added, body compressed, status recorded.`, { tone: "done" });
  sys.note(`Each boundary translates: the edge speaks TLS, the middleware speaks HTTP, the handler speaks requests and cookies, the core speaks users and sessions. Move a layer and behaviour changes, which is why the order is a design decision.`, "done");
  return sys.f.done();
};

const flowVariants: Record<string, SysGen> = { redirect: redirectFlow, latency: latencyFlow, aggregate: aggregateFlow, chain: chainFlow, trace: traceFlow, "trace-ascend": traceAscendFlow, trust: trustFlow, layers: layersFlow };

// ---------- renderer ----------

const kindTone: Record<SysNode["kind"], Tone> = { client: "default", service: "default", cache: "frontier", db: "visited", queue: "compare", node: "default", lb: "default", external: "muted" };

function layout(nodes: SysNode[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const auto = nodes.filter((n) => n.x === undefined || n.y === undefined);
  const cols = Math.min(4, Math.max(1, auto.length));
  const rows = Math.ceil(auto.length / cols);
  auto.forEach((n, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    out[n.id] = [(100 / (cols + 1)) * (c + 1), rows === 1 ? 50 : (100 / (rows + 1)) * (r + 1)];
  });
  for (const n of nodes) if (n.x !== undefined && n.y !== undefined) out[n.id] = [n.x, n.y];
  return out;
}

export function SystemRenderer({ frame }: RendererProps<SystemInput, SystemState>) {
  const { state } = frame;
  const W = 560;
  const H = state.ring ? 300 : 240;
  const pos = layout(state.nodes);
  const px = (v: number) => 60 + (v / 100) * (W - 120);
  const py = (v: number) => 30 + (v / 100) * (H - 70);
  const bw = 96;
  const bh = 40;
  return (
    <div className="flex flex-col gap-3">
      {state.nodes.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[720px]" style={{ minWidth: 500 }} role="img" aria-label="System diagram">
          {state.messages.map((m, i) => {
            const a = pos[m.from];
            const b = pos[m.to];
            if (!a || !b) return null;
            const [x1, y1] = [px(a[0]), py(a[1])];
            const [x2, y2] = [px(b[0]), py(b[1])];
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            const pad = Math.min(len / 2 - 2, Math.abs(ux) * bw * 0.55 + Math.abs(uy) * bh * 0.6 + 4);
            return <Arrow key={i} x1={x1 + ux * pad} y1={y1 + uy * pad} x2={x2 - ux * pad} y2={y2 - uy * pad} tone={m.tone} dashed={m.dashed} label={m.label.length > 34 ? m.label.slice(0, 33) + "…" : m.label} />;
          })}
          {state.nodes.map((n) => {
            const p = pos[n.id]!;
            return <Box key={n.id} x={px(p[0]) - bw / 2} y={py(p[1]) - bh / 2} w={bw} h={bh} label={n.label.length > 15 ? n.label.slice(0, 14) + "…" : n.label} sub={n.state} tone={n.tone ?? kindTone[n.kind]} />;
          })}
        </svg>
      )}
      {state.ring && <Ring ring={state.ring} />}
      {state.table && (
        <div className="overflow-x-auto">
          <div className="mb-1 text-[11px] text-muted">{state.table.title}</div>
          <table className="text-xs">
            {state.table.head && (
              <thead>
                <tr>
                  {state.table.head.map((h) => (
                    <th key={h} className="px-2 py-1 text-left font-medium text-muted">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {state.table.rows.map((r, i) => (
                <tr key={i} className={state.table!.tones?.[i] === "active" ? "bg-accent/15" : state.table!.tones?.[i] === "done" ? "bg-success/10" : state.table!.tones?.[i] === "danger" ? "bg-danger/10" : ""}>
                  {r.map((c, j) => (
                    <td key={j} className="border-t border-line px-2 py-1 font-mono">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {state.log.length > 0 && (
        <div className="rounded-md bg-code px-3 py-2 font-mono text-[11px] text-muted">
          {state.log.map((l, i) => (
            <div key={i} className={i === state.log.length - 1 ? "text-fg" : ""}>
              {l}
            </div>
          ))}
        </div>
      )}
      <Vars vars={state.vars} />
      <Legend items={[{ tone: "active", label: "request" }, { tone: "compare", label: "reply / control" }, { tone: "done", label: "committed / ok" }, { tone: "danger", label: "failure" }, { tone: "frontier", label: "cache" }, { tone: "visited", label: "database" }]} />
    </div>
  );
}

function Ring({ ring }: { ring: NonNullable<SystemState["ring"]> }) {
  const R = 90;
  const C = 110;
  const pt = (deg: number, r: number) => [C + r * Math.cos(((deg - 90) * Math.PI) / 180), C + r * Math.sin(((deg - 90) * Math.PI) / 180)] as const;
  // Keys that land close together get their labels staggered outwards so they stay readable.
  const labelOffset: Record<string, number> = {};
  let prev: { angle: number; off: number } | undefined;
  for (const k of [...ring.keys].sort((a, b) => a.angle - b.angle)) {
    const off = prev && k.angle - prev.angle < 12 ? (prev.off === 16 ? 26 : 16) : 16;
    labelOffset[k.id] = off;
    prev = { angle: k.angle, off };
  }
  return (
    <svg viewBox="-20 -20 260 260" className="h-60 w-60" role="img" aria-label="Hash ring">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--border)" strokeWidth={2} />
      {ring.keys.map((k) => {
        const [x, y] = pt(k.angle, R);
        const [lx, ly] = pt(k.angle, R + labelOffset[k.id]!);
        return (
          <g key={k.id}>
            <circle cx={x} cy={y} r={4} fill={k.tone === "danger" ? "var(--danger)" : k.tone === "compare" ? "var(--warn)" : "var(--fg-muted)"} />
            <text x={lx} y={ly + 3} fontSize="8" textAnchor="middle" fill="var(--fg-muted)">
              {k.id}
            </text>
          </g>
        );
      })}
      {ring.nodes.map((n) => {
        const [x, y] = pt(n.angle, R);
        return (
          <g key={n.id}>
            <circle cx={x} cy={y} r={11} fill={n.tone === "active" ? "var(--accent)" : n.tone === "done" ? "var(--success)" : "var(--bg-elev-2)"} stroke="var(--accent)" strokeWidth={1.5} />
            <text x={x} y={y + 3} fontSize="9" textAnchor="middle" fill="var(--fg)" fontWeight={600}>
              {n.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function makeSystemFamily(scenarios: Record<string, SysGen>, labels: Record<string, string>): Family<SystemInput, SystemState> {
  return {
    name: "System",
    description: "Distributed systems building blocks: caching, replication, consensus, queues, resilience, storage.",
    Renderer: SystemRenderer,
    algorithms: scenarios,
    labels,
    examples: Object.fromEntries(Object.keys(scenarios).map((k) => [k, {}])),
    normalise: (raw) => ({ ...raw, nodes: raw.nodes === undefined ? undefined : Number(raw.nodes), replicas: raw.replicas === undefined ? undefined : Number(raw.replicas), requests: raw.requests === undefined ? undefined : Number(raw.requests), keys: Array.isArray(raw.keys) ? (raw.keys as unknown[]).map(String) : undefined, keyCount: typeof raw.keys === "number" ? raw.keys : raw.keyCount === undefined ? undefined : Number(raw.keyCount) }),
  };
}
