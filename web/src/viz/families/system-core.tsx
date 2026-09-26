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
  state(id: string, state: string, tone?: Tone) {
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

export const requestFlow: SysGen = () => {
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

export const consistentHashing: SysGen = ({ nodes = 3, keys }) => {
  const sys = new Sys([]);
  const nodeIds = Array.from({ length: Math.min(6, Math.max(2, nodes)) }, (_, i) => `N${i + 1}`);
  const hash = (s: string) => {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    return h % 360;
  };
  const keyIds = keys ?? ["user:1", "user:7", "video:9", "session:3", "cart:5", "feed:2"];
  const ringNodes = nodeIds.map((id) => ({ id, angle: hash(id) }));
  const owner = (angle: number) => {
    const sorted = [...ringNodes].sort((a, b) => a.angle - b.angle);
    return (sorted.find((n) => n.angle >= angle) ?? sorted[0])!.id;
  };
  sys.ring({ nodes: ringNodes, keys: [] });
  sys.note(`Consistent hashing: hash nodes and keys onto the same circle. A key belongs to the first node clockwise from it.`);
  for (const k of keyIds) {
    const angle = hash(k);
    const o = owner(angle);
    sys.ring({ nodes: ringNodes.map((n) => ({ ...n, tone: n.id === o ? "active" : undefined })), keys: [...sys.s.ring!.keys.map((x) => ({ ...x, tone: "visited" as Tone })), { id: k, angle, owner: o, tone: "compare" }] });
    sys.set({ key: k, hash: angle + "°", owner: o });
    sys.f.push(`hash(${k}) = ${angle}° → walk clockwise → ${o}.`, "place");
  }
  const added = `N${nodeIds.length + 1}`;
  const addedAngle = hash(added);
  const before = sys.s.ring!.keys.map((k) => k.owner);
  ringNodes.push({ id: added, angle: addedAngle });
  const moved = sys.s.ring!.keys.filter((k) => owner(k.angle) !== k.owner);
  sys.ring({ nodes: ringNodes.map((n) => ({ ...n, tone: n.id === added ? "done" : undefined })), keys: sys.s.ring!.keys.map((k) => ({ ...k, owner: owner(k.angle), tone: owner(k.angle) !== k.owner ? "danger" : "visited" })) });
  sys.set({ added, at: addedAngle + "°", "keys moved": `${moved.length} / ${keyIds.length}`, "naive hash mod N would move": "~all" });
  sys.f.push(`Add ${added} at ${addedAngle}°: only the keys between its predecessor and ${added} change owner (${moved.length} of ${keyIds.length}). With hash mod N, nearly every key would move.`, "add node");
  void before;
  sys.f.push(`Real systems add ~100–200 virtual nodes per physical node so load evens out and a failure spreads across many neighbours. Used by Dynamo, Cassandra, Memcached clients, and CDN routing.`, "done");
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
  sys.note(`A has a majority (3 of 3): it becomes leader for term 2. A majority guarantees at most one leader per term.`, "elected");
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
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[720px]" role="img" aria-label="System diagram">
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
  return (
    <svg viewBox="0 0 220 220" className="h-56 w-56" role="img" aria-label="Hash ring">
      <circle cx={C} cy={C} r={R} fill="none" stroke="var(--border)" strokeWidth={2} />
      {ring.keys.map((k) => {
        const [x, y] = pt(k.angle, R);
        const [lx, ly] = pt(k.angle, R + 16);
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
    normalise: (raw) => ({ ...raw, nodes: raw.nodes === undefined ? undefined : Number(raw.nodes), replicas: raw.replicas === undefined ? undefined : Number(raw.replicas), requests: raw.requests === undefined ? undefined : Number(raw.requests), keys: Array.isArray(raw.keys) ? (raw.keys as unknown[]).map(String) : undefined }),
  };
}
