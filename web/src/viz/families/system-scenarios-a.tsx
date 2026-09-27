// Scenario pack A for the `system` family: caching, sharding, replication,
// quorums and consensus, distributed transactions, logical time,
// coordination, and storage engines. Each scenario is a script over the
// `Sys` DSL in system-core.tsx; the renderer is shared.
//
// Inputs: every scenario accepts `{}`. Where the catalogue lists `nodes`,
// `replicas`, `keys` or `requests`, the scenario clamps them to a range that
// still fits in a readable diagram (and well under MAX_FRAMES).
import type { Tone } from "../primitives";
import { Sys, type SysGen } from "./system-core";

// ---------- helpers ----------

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
    if (!out.includes(d)) out.push(d);
  }
  return out.slice(0, max);
};

/** FNV-1a, same hash the core file uses, so numbers are stable across scenarios. */
const fnv = (s: string): number => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
};

/** Tiny deterministic RNG so gossip rounds replay identically on every render. */
const lcg = (seed: number) => {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
};

/** Evenly spread `n` items across [lo, hi] (a single item sits in the middle). */
const spread = (n: number, lo: number, hi: number): number[] => Array.from({ length: n }, (_, i) => (n === 1 ? (lo + hi) / 2 : lo + ((hi - lo) * i) / (n - 1)));

// ---------- caching ----------

const cacheAside: SysGen = () => {
  const sys = new Sys([
    { id: "app", label: "App server", kind: "service", x: 10, y: 50 },
    { id: "cache", label: "Redis", kind: "cache", x: 60, y: 15, state: "user:42 → (none)" },
    { id: "db", label: "Postgres", kind: "db", x: 60, y: 85, state: "user:42 = v1" },
  ]);
  sys.set({ pattern: "cache-aside (lazy loading)", "cache hits": 0, "db reads": 0 });
  sys.note(`Cache-aside: the application owns the cache logic. It reads the cache first, falls back to the database on a miss, and writes the result back itself; the cache never talks to the database.`);
  sys.msg("app", "cache", "GET user:42", `Read path: the app asks the cache first.`, { tone: "compare" });
  sys.state("cache", "MISS", "danger");
  sys.msg("cache", "app", "(nil)", `Miss: nothing has been loaded for this key yet (cold cache, or the entry expired).`, { tone: "danger" });
  sys.set({ "db reads": 1 });
  sys.msg("app", "db", "SELECT … WHERE id = 42", `The app falls through to the database, the source of truth (~5 ms).`);
  sys.msg("db", "app", "row v1", `The database returns the row.`, { tone: "done" });
  sys.state("cache", "user:42 = v1 · TTL 300s", "done");
  sys.msg("app", "cache", "SET user:42 v1 EX 300", `The app populates the cache with a TTL. Only keys that are actually read get cached, so memory goes to hot data.`, { tone: "done" });
  sys.set({ "cache hits": 1 });
  sys.msg("app", "cache", "GET user:42 → HIT", `Second read: a hit, served in ~0.5 ms without touching the database.`, { tone: "done" });
  sys.state("db", "user:42 = v2", "active");
  sys.msg("app", "db", "UPDATE … SET name = … (v2)", `Write path: the app updates the database first.`);
  sys.state("cache", "user:42 → (none)", "compare");
  sys.msg("app", "cache", "DEL user:42", `Then it invalidates the cache entry rather than writing v2 into it: a delete is idempotent and cannot race with another writer's SET; the next read reloads the fresh row.`, { tone: "compare" });
  sys.set({ "db reads": 2 });
  sys.msg("app", "cache", "GET → MISS → DB → SET v2", `The next read misses, reloads v2 and repopulates. Every write costs one extra miss on the next read.`, { tone: "compare" });
  sys.state("cache", "user:42 = v1 (stale!)", "danger");
  sys.note(`Failure mode (the classic race): reader A misses and reads v1 from the DB; writer B updates to v2 and deletes the key; then A's late SET writes v1 back. The cache serves stale v1 until the TTL expires.`, "race");
  sys.set({ "stale window": "≤ TTL", fix: "short TTL, SET NX, or version-checked writes" });
  sys.note(`Trade-off: simple and resilient (a cache outage just means more DB reads), but cache and DB can diverge briefly. Choose the TTL that bounds staleness at what the product tolerates.`, "done");
  return sys.f.done();
};

const writeThrough: SysGen = () => {
  const sys = new Sys([
    { id: "app", label: "App server", kind: "service", x: 8, y: 50 },
    { id: "cache", label: "Cache", kind: "cache", x: 50, y: 50, state: "price:7 = 10" },
    { id: "db", label: "Database", kind: "db", x: 92, y: 50, state: "price:7 = 10" },
  ]);
  sys.set({ pattern: "write-through", "write latency": "cache + DB (synchronous)", "read staleness": "none" });
  sys.note(`Write-through: every write goes to the cache, and the cache synchronously writes it to the database before acknowledging. Cache and database never disagree.`);
  sys.msg("app", "cache", "SET price:7 = 12", `The app writes to the cache; the cache is the front door of the write path.`);
  sys.state("cache", "price:7 = 12 (pending)", "compare");
  sys.msg("cache", "db", "UPDATE price:7 = 12", `The cache forwards the write to the database and waits for it. This synchronous hop is what makes it "through".`);
  sys.state("db", "price:7 = 12", "done");
  sys.msg("db", "cache", "OK (committed)", `The database commits the row.`, { tone: "done" });
  sys.state("cache", "price:7 = 12", "done");
  sys.msg("cache", "app", "OK", `Only now is the app acknowledged, so any subsequent read sees 12. Latency is cache write + DB write (~6 ms instead of ~1 ms).`, { tone: "done" });
  sys.msg("app", "cache", "GET price:7 → 12", `A read hits the cache and is guaranteed fresh: there is no invalidation step to forget and no stale window.`, { tone: "done" });
  sys.state("db", "DOWN", "danger");
  sys.msg("app", "cache", "SET price:7 = 13", `Failure mode: the database is unavailable when a write arrives.`);
  sys.msg("cache", "db", "UPDATE price:7 = 13", `The cache cannot complete the synchronous write…`, { tone: "danger", dashed: true });
  sys.msg("cache", "app", "ERROR (DB unavailable)", `…so the write fails and the cache keeps 12. Writes are exactly as available as the database, never more: consistency is preserved at the cost of availability.`, { tone: "danger" });
  sys.state("db", "price:7 = 12", "visited");
  sys.set({ "cache pollution": "every written key is cached, read or not", "pairs well with": "read-through, TTL to evict cold keys" });
  sys.note(`Trade-off: strong cache/DB agreement and simple reads, but higher write latency and cache pollution from keys nobody reads. Compare write-behind, which trades durability for write speed.`, "done");
  return sys.f.done();
};

const writeBehind: SysGen = () => {
  const sys = new Sys([
    { id: "app", label: "App server", kind: "service", x: 8, y: 50 },
    { id: "cache", label: "Cache", kind: "cache", x: 50, y: 50, state: "dirty: 0" },
    { id: "db", label: "Database", kind: "db", x: 92, y: 50, state: "views:9 = 100" },
  ]);
  const buf: (string | number)[][] = [];
  const show = (tones?: (Tone | undefined)[]) => sys.table({ title: "Write-behind buffer (dirty entries waiting to flush)", head: ["key", "latest value", "writes coalesced"], rows: buf.map((r) => [...r]), tones });
  show();
  sys.set({ pattern: "write-behind (write-back)", "ack latency": "~1 ms (cache only)", "DB writes": 0 });
  sys.note(`Write-behind: the cache acknowledges a write immediately and persists it to the database later, asynchronously and usually in batches.`);
  buf.push(["views:9", 101, 1]);
  show(["active"]);
  sys.state("cache", "dirty: 1", "compare");
  sys.msg("app", "cache", "SET views:9 = 101", `The write lands in the cache and the entry is marked dirty.`);
  sys.msg("cache", "app", "OK (1 ms)", `Acknowledged before the database has seen anything. This is where write-behind gets its speed.`, { tone: "done" });
  buf[0] = ["views:9", 102, 2];
  show(["active"]);
  sys.msg("app", "cache", "SET views:9 = 102", `A second write to the same key overwrites the dirty entry: two application writes will become one database write (coalescing).`);
  buf[0] = ["views:9", 103, 3];
  buf.push(["views:4", 7, 1]);
  show([undefined, "active"]);
  sys.state("cache", "dirty: 2", "compare");
  sys.msg("app", "cache", "SET views:9 = 103, views:4 = 7", `More writes accumulate; the buffer keeps only the latest value per key.`);
  show(["active", "active"]);
  sys.msg("cache", "db", "batch UPDATE (2 rows)", `Flush trigger (every 500 ms, or when the buffer fills): the cache writes the batch to the DB in one round trip instead of four.`, { tone: "compare" });
  sys.state("db", "views:9=103 · views:4=7", "done");
  buf.length = 0;
  show();
  sys.state("cache", "dirty: 0", "done");
  sys.set({ "DB writes": 1, "app writes": 4 });
  sys.msg("db", "cache", "OK", `Flushed; the entries are clean again. Four application writes cost one database write.`, { tone: "done" });
  buf.push(["views:9", 104, 1]);
  show(["active"]);
  sys.state("cache", "dirty: 1", "compare");
  sys.msg("app", "cache", "SET views:9 = 104 → OK", `A new write is dirty again and acknowledged instantly.`);
  sys.state("cache", "CRASHED", "danger");
  show(["danger"]);
  sys.note(`Failure mode: the cache node dies before the next flush. views:9 = 104 was acknowledged to the client but never reached the database: it is lost.`, "crash");
  sys.state("db", "views:9 = 103 (stale)", "danger");
  sys.msg("app", "db", "GET views:9 → 103", `After recovery the DB serves 103 although the client was told 104 succeeded. Write-behind turns a durability guarantee into a durability probability.`, { tone: "danger" });
  sys.set({ mitigations: "replicate or persist the buffer; bound the flush interval", "good for": "counters, view counts, metrics, last-seen timestamps" });
  sys.note(`Trade-off: the lowest write latency and the fewest DB writes (coalescing), against a window of possible data loss and a DB that lags the cache. Use it for data you can afford to lose a few hundred milliseconds of.`, "done");
  return sys.f.done();
};

const cacheStampede: SysGen = ({ requests }) => {
  const n = clampInt(requests, 2, 1000, 40);
  const sys = new Sys([
    { id: "clients", label: `${n} readers`, kind: "client", x: 8, y: 50 },
    { id: "app", label: "App servers", kind: "service", x: 42, y: 50 },
    { id: "cache", label: "Cache", kind: "cache", x: 85, y: 15, state: "hot:feed · TTL 2s" },
    { id: "db", label: "Database", kind: "db", x: 85, y: 85, state: "load: 1 query/s" },
  ]);
  sys.set({ "hot key": "hot:feed", "concurrent readers": n, "DB queries (naive)": 0 });
  sys.note(`Cache stampede (dog-pile): a hot key expires, and every concurrent reader misses at the same moment and recomputes it against the database.`);
  sys.state("cache", "hot:feed · TTL 0s", "danger");
  sys.note(`The TTL runs out. The key vanishes from the cache while ${n} requests per second are still asking for it.`, "expire");
  sys.msg("clients", "app", `${n} × GET /feed`, `${n} requests arrive in the same instant.`);
  sys.msg("app", "cache", `${n} × GET hot:feed`, `All of them check the cache…`, { tone: "compare" });
  sys.msg("cache", "app", `${n} × MISS`, `…and all of them miss, because nobody has repopulated the key yet.`, { tone: "danger" });
  sys.state("db", `load: ${n} queries at once`, "danger");
  sys.set({ "DB queries (naive)": n, "DB latency": "5 ms → seconds (queueing)" });
  sys.msg("app", "db", `${n} × SELECT feed (expensive)`, `Every request runs the expensive query. A database sized for ~1 query/s on this key gets ${n} at once: latency spikes, the connection pool drains, unrelated queries stall.`, { tone: "danger" });
  sys.msg("db", "app", `${n} × rows (slow)`, `Eventually they all return the same result and all ${n} SET the same value. Cascading failures often start exactly here.`, { tone: "danger" });
  sys.state("db", "load: 1 query/s", "visited");
  sys.state("cache", "hot:feed (expired)", "danger");
  sys.note(`Fix 1, request coalescing (single-flight): the first request to miss takes a short lock on the key; the others wait on it instead of querying.`, "fix");
  sys.state("cache", "lock:hot:feed (1 owner)", "compare");
  sys.set({ "DB queries (single-flight)": 1, waiting: n - 1 });
  sys.msg("app", "cache", "SET lock:hot:feed NX PX 500", `One request wins the lock (SET NX); the other ${n - 1} see the lock and wait briefly, or serve a stale copy if one exists.`, { tone: "compare" });
  sys.msg("app", "db", "1 × SELECT feed", `Only the lock holder queries the database.`);
  sys.state("cache", "hot:feed · TTL 2s", "done");
  sys.msg("app", "cache", "SET hot:feed; DEL lock", `It repopulates and releases the lock; the waiters read the fresh value from the cache. DB load: 1 query instead of ${n}.`, { tone: "done" });
  sys.set({ "fix 2": "stale-while-revalidate: serve the old value, refresh in the background", "fix 3": "jittered TTL / probabilistic early refresh" });
  sys.note(`Fix 2: keep serving the stale value while one background job refreshes it (stale-while-revalidate, or probabilistic early expiry). Fix 3: add jitter to TTLs so many keys never expire together.`, "fix");
  sys.note(`Trade-off: single-flight adds a lock round trip and a short wait on every miss; stale-while-revalidate serves briefly out-of-date data. Both are far cheaper than a database that falls over under ${n}× load.`, "done");
  return sys.f.done();
};

// ---------- sharding ----------

const shardingRange: SysGen = ({ nodes, keys }) => {
  const n = clampInt(nodes, 2, 4, 3);
  const keyIds = keyList(keys, ["alice", "bob", "hank", "judy", "mia", "peggy", "trent", "zoe"], 8, 4);
  const shardIds = Array.from({ length: n }, (_, i) => `S${i + 1}`);
  const xs = spread(n, 40, 95);
  const sys = new Sys([{ id: "router", label: "Router", kind: "lb", x: 8, y: 50 }, ...shardIds.map((id, i) => ({ id, kind: "db" as const, x: xs[i], y: 50 }))]);
  const A = "A".charCodeAt(0);
  const cut = (i: number) => Math.round((26 * i) / n);
  const rangeOf = (i: number) => `${String.fromCharCode(A + cut(i))}–${String.fromCharCode(A + cut(i + 1) - 1)}`;
  const ownerOf = (k: string) => {
    const c = k.toUpperCase().charCodeAt(0) - A;
    let i = 0;
    while (i < n - 1 && c >= cut(i + 1)) i++;
    return i;
  };
  const held: string[][] = shardIds.map(() => []);
  const show = (hi?: number) =>
    sys.table({ title: "Range table (kept in the router / config service)", head: ["shard", "key range", "keys"], rows: shardIds.map((id, i) => [id, rangeOf(i), held[i]!.join(", ") || "–"]), tones: shardIds.map((_, i) => (i === hi ? "active" : undefined)) });
  shardIds.forEach((id, i) => sys.state(id, rangeOf(i)));
  show();
  sys.set({ shards: n, "lookup": "binary search in the range table" });
  sys.note(`Range sharding: the key space is cut into contiguous ranges and each shard owns one. The router keeps the range table, so a lookup is a binary search over ${n} boundaries, no hashing.`);
  for (const k of keyIds) {
    const i = ownerOf(k);
    held[i]!.push(k);
    show(i);
    sys.msg("router", shardIds[i]!, `PUT ${k}`, `"${k}" starts with ${k.charAt(0).toUpperCase()}, which falls in ${rangeOf(i)} → ${shardIds[i]}. Keys inside a shard are stored in sorted order.`);
  }
  const first = keyIds[0] ?? "a";
  const i0 = ownerOf(first);
  show(i0);
  sys.msg("router", shardIds[i0]!, `SCAN ${rangeOf(i0)}`, `A range query ("names between ${rangeOf(i0).replace("–", " and ")}") touches one shard and reads contiguous sorted keys. This locality is the whole point of range sharding.`, { tone: "done" });
  const last = n - 1;
  shardIds.forEach((id, i) => sys.state(id, i === last ? "orders 2001–∞" : `orders ${i * 1000 + 1}–${(i + 1) * 1000}`));
  sys.table({ title: "Same idea, keys = auto-increment order ids", head: ["shard", "key range", "writes/s"], rows: shardIds.map((id, i) => [id, i === last ? "2001–∞" : `${i * 1000 + 1}–${(i + 1) * 1000}`, i === last ? "all" : 0]), tones: shardIds.map((_, i) => (i === last ? "danger" : undefined)) });
  sys.note(`Failure mode: shard by a monotonically increasing key (order id, timestamp) and every new key is the largest yet, so it always lands in the last range.`, "hot tail");
  sys.state(shardIds[last]!, "HOT · 100% of writes", "danger");
  sys.msg("router", shardIds[last]!, "INSERT 3001, 3002, 3003 …", `All writes hit ${shardIds[last]}: the hot tail. ${n - 1} shards sit idle while one saturates; adding shards does not help because they receive nothing until the tail moves.`, { tone: "danger" });
  sys.set({ "hot tail fixes": "split the hot range as it grows (HBase/Bigtable auto-split); prefix keys with a hash or tenant id (salting)" });
  sys.note(`Fixes: split the hot range automatically and move half to another shard (Bigtable, HBase, CockroachDB), or salt the key with a hash prefix, which spreads writes but breaks cheap range scans.`, "fix");
  sys.note(`Trade-off: range sharding gives cheap range scans and sorted locality, but needs a range table to maintain and rebalance, and it is vulnerable to hot spots on skewed or sequential keys. Hash sharding is the mirror image.`, "done");
  return sys.f.done();
};

const shardingHash: SysGen = ({ nodes, keys }) => {
  const n = clampInt(nodes, 2, 4, 3);
  const keyIds = keyList(keys, ["alice", "bob", "hank", "judy", "mia", "peggy"], 8, 4);
  const xs = spread(n + 1, 38, 95);
  const shardId = (i: number) => `S${i + 1}`;
  const sys = new Sys([{ id: "router", label: "Router", kind: "lb", x: 6, y: 50 }, ...Array.from({ length: n }, (_, i) => ({ id: shardId(i), kind: "db" as const, x: xs[i], y: 50, state: `hash mod ${n} = ${i}` }))]);
  const bucket = (k: string, m: number) => fnv(k) % m;
  const held = (m: number) => Array.from({ length: m }, (_, i) => keyIds.filter((k) => bucket(k, m) === i));
  const show = (m: number, placed: string[], hi?: number, tones?: (Tone | undefined)[]) =>
    sys.table({ title: `Buckets: shard = hash(key) mod ${m}`, head: ["shard", "keys"], rows: held(m).map((ks, i) => [shardId(i), ks.filter((k) => placed.includes(k)).join(", ") || "–"]), tones: tones ?? held(m).map((_, i) => (i === hi ? "active" : undefined)) });
  const placed: string[] = [];
  show(n, placed);
  sys.set({ shards: n, rule: `hash(key) mod ${n}` });
  sys.note(`Hash sharding: hash the key and take it modulo the shard count. Nearby keys land on unrelated shards, so load spreads evenly whatever the key distribution.`);
  for (const k of keyIds) {
    const h = fnv(k);
    const i = bucket(k, n);
    placed.push(k);
    show(n, placed, i);
    sys.msg("router", shardId(i), `PUT ${k}`, `hash("${k}") = ${h} → ${h} mod ${n} = ${i} → ${shardId(i)}. Any router computes the same answer with no shared table.`);
  }
  const counts = held(n).map((ks) => ks.length);
  sys.set({ "keys per shard": counts.join(" / "), "ideal": (keyIds.length / n).toFixed(1) });
  sys.note(`After ${keyIds.length} keys the shards hold ${counts.join(" / ")}: roughly uniform, and sequential keys (order 3001, 3002, …) would scatter just the same, so there is no hot tail.`, "balance");
  sys.fanout("router", Array.from({ length: n }, (_, i) => shardId(i)), "SCAN names a..c", `Failure mode 1: a range query cannot be routed. The router must scatter it to every shard and merge the results (scatter-gather): cost grows with the number of shards, and tail latency is the slowest shard's.`, "danger");
  const m = n + 1;
  sys.s.nodes.push({ id: shardId(n), label: shardId(n), kind: "db", x: xs[n], y: 50, state: `hash mod ${m} = ${n}`, tone: "done" });
  for (let i = 0; i < n; i++) sys.state(shardId(i), `hash mod ${m} = ${i}`);
  const moved = keyIds.filter((k) => bucket(k, n) !== bucket(k, m));
  show(m, placed, undefined, held(m).map((ks) => (ks.some((k) => moved.includes(k)) ? "danger" : undefined)));
  sys.set({ "add shard": `${n} → ${m}`, "keys moved": `${moved.length} / ${keyIds.length}`, "expected": `~${Math.round((100 * n) / m)}%` });
  sys.note(`Failure mode 2: add a shard and the modulus changes from ${n} to ${m}, so ${moved.length} of ${keyIds.length} keys now hash somewhere else and must be migrated while serving traffic. Consistent hashing exists to shrink this to ~1/${m} of the keys.`, "resharding");
  sys.note(`Failure mode 3: hashing spreads keys, not load. One celebrity key still lands on one shard; handle it by splitting hot keys with a suffix and reading from all copies.`, "hot key");
  sys.note(`Trade-off: hash sharding gives uniform load and stateless routing, at the price of scatter-gather range queries and painful resharding. Range sharding is the mirror image; many systems (Cassandra, DynamoDB) hash the partition key and range-sort within a partition.`, "done");
  return sys.f.done();
};

// ---------- replication ----------

const replicationLeaderFollower: SysGen = ({ replicas }) => {
  const r = clampInt(replicas, 1, 3, 2);
  const followers = Array.from({ length: r }, (_, i) => `F${i + 1}`);
  const ys = spread(r, 15, 85);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "L", label: "Leader", kind: "db", x: 45, y: 50, state: "x=1 · LSN 7", tone: "active" },
    ...followers.map((id, i) => ({ id, label: `Follower ${i + 1}`, kind: "db" as const, x: 90, y: ys[i], state: "x=1 · LSN 7 · lag 0" })),
  ]);
  const f1 = followers[0]!;
  sys.set({ mode: "asynchronous", "write path": "leader only", "read path": "leader or any follower" });
  sys.note(`Leader-follower replication: one node accepts writes and streams its log to ${r} follower${r > 1 ? "s" : ""}, which apply it in order. Followers serve reads and stand by for failover.`);
  sys.state("L", "x=2 · LSN 8", "active");
  sys.msg("client", "L", "WRITE x=2", `All writes go to the leader, which appends the change to its write-ahead log (LSN 8) and applies it locally.`);
  sys.msg("L", "client", "ACK (async)", `Asynchronous mode: the leader acknowledges as soon as its own log is durable, before any follower has the change.`, { tone: "done" });
  sys.fanout("L", followers, "WAL LSN 8", `The leader streams LSN 8 to the followers. On a good day this takes a few milliseconds; under load or across regions it can be seconds.`);
  followers.forEach((f) => sys.state(f, "x=1 · LSN 7 · lag 1", "compare"));
  sys.msg("client", f1, "READ x", `Reads are scaled out to a follower, but ${f1} has not applied LSN 8 yet.`, { tone: "compare" });
  sys.state(f1, "x=1 · lag 1 (stale)", "danger");
  sys.msg(f1, "client", "x=1 (stale)", `Replication lag: the client just wrote 2 and reads 1. Its own write seems to have vanished (read-your-writes violated).`, { tone: "danger" });
  followers.forEach((f) => sys.state(f, "x=2 · LSN 8 · lag 0", "done"));
  sys.note(`A few milliseconds later the followers apply LSN 8 and catch up. The system is eventually consistent: the lag window is real but usually short.`, "catch-up");
  sys.set({ "read-your-writes": "route the writer's reads to the leader for a few seconds, or send the LSN and let the follower wait until it has applied it" });
  sys.note(`Fix for the lag window: read-your-writes routing (recent writers read from the leader), or ask the follower to wait until its applied LSN ≥ the client's last write.`, "fix");
  sys.set({ mode: "synchronous (1 sync follower)" });
  sys.state(f1, "x=2 · sync", "done");
  sys.note(`Synchronous mode: the leader waits for ${f1} to confirm each write before acknowledging. Usually only one follower is synchronous, so a slow follower cannot stall every write.`, "mode");
  sys.state("L", "x=3 · LSN 9", "active");
  sys.msg("client", "L", "WRITE x=3", `Write arrives; the leader logs LSN 9.`);
  sys.fanout("L", followers, "WAL LSN 9", `The leader ships LSN 9 and waits for the synchronous follower.`);
  sys.state(f1, "x=3 · LSN 9 · sync", "done");
  sys.msg(f1, "L", "ACK LSN 9", `${f1} has LSN 9 durably on disk.`, { tone: "done" });
  sys.msg("L", "client", "ACK (sync)", `Now the client hears OK only after the write exists on two nodes. Latency is leader fsync + one round trip to ${f1}.`, { tone: "done" });
  sys.state("L", "DOWN", "danger");
  sys.note(`Failover: the leader dies. Someone (a coordinator, or the nodes via consensus) must pick the most up-to-date follower, promote it, and repoint clients.`, "failover");
  sys.state(f1, "LEADER · LSN 9", "active");
  followers.slice(1).forEach((f) => sys.state(f, `follows ${f1}`, "visited"));
  sys.set({ "lost on failover": "async: writes acked but not yet shipped; sync: none", "split brain": "fence the old leader before promoting" });
  sys.note(`${f1} is promoted. With async replication, any writes the old leader acknowledged but had not shipped are lost; with sync they are safe. If the old leader comes back believing it still leads, two nodes accept writes: fence it first.`, "promote");
  sys.note(`Trade-off: async gives low write latency and tolerates slow followers but can lose acknowledged writes; sync guarantees durability on a second node at the cost of latency and availability whenever that follower is slow. Reads scale out, writes do not.`, "done");
  return sys.f.done();
};

const replicationMultiLeader: SysGen = ({ nodes }) => {
  const n = clampInt(nodes, 2, 3, 2);
  const sys = new Sys([
    { id: "cEU", label: "EU client", kind: "client", x: 10, y: 20 },
    { id: "cUS", label: "US client", kind: "client", x: 10, y: 80 },
    { id: "EU", label: "EU leader", kind: "db", x: 50, y: 20, state: "title = v1", tone: "active" },
    { id: "US", label: "US leader", kind: "db", x: 50, y: 80, state: "title = v1", tone: "active" },
    ...(n > 2 ? [{ id: "APAC", label: "APAC leader", kind: "db" as const, x: 92, y: 50, state: "title = v1", tone: "active" as Tone }] : []),
  ]);
  sys.set({ leaders: n, replication: "asynchronous, each leader to every other", "local write RTT": "~2 ms", "cross-region RTT": "~150 ms" });
  sys.note(`Multi-leader replication: each region has its own leader that accepts writes locally and replicates them asynchronously to the other leaders. Users get local write latency; the price is conflicts.`);
  sys.state("EU", "title = 'Draft A' (v2)", "active");
  sys.msg("cEU", "EU", "SET title = 'Draft A'", `The EU user edits a document title; the EU leader applies it on top of v1.`);
  sys.msg("EU", "cEU", "ACK (2 ms)", `Acknowledged locally: no cross-ocean round trip, and the write survives a link outage to the other region.`, { tone: "done" });
  sys.state("US", "title = 'Draft B' (v2)", "active");
  sys.msg("cUS", "US", "SET title = 'Draft B'", `At the same moment the US user edits the same title. The US leader also applies it on top of v1: neither leader knows about the other's write yet.`);
  sys.msg("US", "cUS", "ACK (2 ms)", `Also acknowledged locally. Two different v2s now exist.`, { tone: "done" });
  sys.msg("EU", "US", "replicate: Draft A (v1→v2)", `Replication streams cross in flight.`, { tone: "compare" });
  sys.msg("US", "EU", "replicate: Draft B (v1→v2)", `Each leader receives a write whose parent version (v1) it has already overwritten: a write conflict. There is no "first" because there was no shared order.`, { tone: "compare", keep: true });
  sys.state("EU", "CONFLICT: A vs B", "danger");
  sys.state("US", "CONFLICT: B vs A", "danger");
  sys.note(`Conflict detected on both sides. Single-leader systems never face this because the leader serialises writes; multi-leader systems must resolve it deterministically so all leaders converge.`, "conflict");
  sys.state("EU", "title = 'Draft B'", "done");
  sys.state("US", "title = 'Draft B'", "done");
  sys.set({ resolution: "last-writer-wins by timestamp", winner: "Draft B (later timestamp)", loser: "Draft A silently discarded" });
  sys.note(`Resolution 1, last-writer-wins: pick the write with the higher timestamp everywhere. Converges, but "Draft A" is silently thrown away (a lost update), and clock skew decides who loses.`, "resolve");
  sys.note(`Alternatives: merge the values (CRDTs, text merge), keep both as siblings and let the application or user resolve (Riak, Dynamo's shopping cart), or route each record to a home leader so a given key never has two writers.`, "resolve");
  if (n > 2) {
    sys.fanout("US", ["APAC", "EU"], "replicate: Draft B", `With ${n} leaders, topology matters: all-to-all is fastest but can deliver writes out of causal order (a reply arriving before the message it answers); a star or ring adds hops but keeps ordering simpler.`, "compare");
  } else {
    sys.note(`With more than two leaders, topology matters: all-to-all is fastest but can deliver writes out of causal order (a reply before its question); a star or ring adds hops but keeps ordering simpler.`, "topology");
  }
  sys.note(`Trade-off: local write latency and tolerance of inter-region outages, at the cost of conflict handling, no linearizability and subtle bugs (auto-increment keys, uniqueness constraints). Use it across regions or for offline clients; avoid it within one datacenter.`, "done");
  return sys.f.done();
};

const quorumScenario: SysGen = ({ replicas }) => {
  const N = clampInt(replicas, 3, 5, 3);
  const W = Math.floor(N / 2) + 1;
  const R = N - W + 1;
  const reps = Array.from({ length: N }, (_, i) => `R${i + 1}`);
  const ys = spread(N, 10, 90);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 5, y: 50 },
    { id: "coord", label: "Coordinator", kind: "service", x: 40, y: 50 },
    ...reps.map((id, i) => ({ id, kind: "db" as const, x: 90, y: ys[i], state: "x=v1 · ts 9" })),
  ]);
  const slow = reps[N - 1]!;
  const fast = reps.slice(0, W);
  const versions: Record<string, string> = Object.fromEntries(reps.map((r) => [r, "v1 · ts 9"]));
  const show = (hi: string[] = [], tone: Tone = "active") => sys.table({ title: "Replica versions", head: ["replica", "value"], rows: reps.map((r) => [r, versions[r]!]), tones: reps.map((r) => (hi.includes(r) ? tone : undefined)) });
  show();
  sys.set({ N, W, R, "W + R > N": `${W} + ${R} = ${W + R} > ${N}` });
  sys.note(`Quorum replication: a write must be acknowledged by W of N replicas and a read must consult R of them. With W + R > N, every read set overlaps every write set, so a read sees at least one copy of the latest write.`);
  sys.msg("client", "coord", "PUT x=v2", `The client sends a write to a coordinator (any node can coordinate).`);
  sys.fanout("coord", reps, "PUT x=v2 · ts 12", `The coordinator sends the write to all ${N} replicas in parallel, with a version timestamp.`);
  fast.forEach((r) => {
    versions[r] = "v2 · ts 12";
    sys.state(r, "x=v2 · ts 12", "done");
  });
  sys.state(slow, "x=v1 · ts 9 (slow)", "danger");
  show(fast, "done");
  sys.fanin(fast, "coord", "ACK", `${fast.join(" and ")} acknowledge; ${slow} is slow (GC pause, disk stall). W=${W} acks are in, so the coordinator does not wait.`, "done");
  sys.msg("coord", "client", `OK (W=${W})`, `The write is successful even though ${slow} still holds v1. Quorums tolerate ${N - W} slow or dead replica${N - W > 1 ? "s" : ""} on the write path.`, { tone: "done" });
  sys.msg("client", "coord", "GET x", `A read arrives at a coordinator.`, { tone: "compare" });
  sys.fanout("coord", reps, "GET x", `The coordinator asks all replicas and waits for the first R=${R} replies.`, "compare");
  const readSet = [slow, ...reps.slice(N - R, N - 1)].slice(0, R);
  const readFast = readSet.filter((r) => r !== slow);
  const withNew = readFast[0] ?? fast[0]!;
  show([slow, withNew], "active");
  sys.msg(slow, "coord", "x=v1 · ts 9", `${slow} answers first, with the stale v1…`, { tone: "compare" });
  sys.msg(withNew, "coord", "x=v2 · ts 12", `…and ${withNew} answers with v2. Because R + W > N, at least one of the R repliers must have been in the write quorum, so the newest version is guaranteed to be among the replies.`, { tone: "compare", keep: true });
  sys.msg("coord", "client", "x=v2", `The coordinator returns the value with the highest timestamp.`, { tone: "done" });
  versions[slow] = "v2 · ts 12";
  sys.state(slow, "x=v2 · ts 12", "done");
  show([slow], "done");
  sys.msg("coord", slow, "read repair: x=v2", `Read repair: the coordinator writes v2 back to the stale replica it noticed. Anti-entropy sweeps fix replicas nobody reads.`, { tone: "done" });
  sys.set({ "if W=1, R=1": "1 + 1 ≤ N: stale reads possible", "if W=N, R=1": "fast reads, writes block on every replica" });
  sys.note(`Failure mode: with W + R ≤ N (say W=1, R=1 for speed) a read may consult only replicas that missed the write, and the client sees v1 after v2 was acknowledged. Tune W and R per workload: W=N, R=1 for read-heavy data, W=1 for write-heavy data you can afford to lose.`, "tuning");
  sys.note(`Subtleties: sloppy quorums with hinted handoff (writes accepted by non-home nodes during a partition) break the overlap guarantee; two concurrent writes with the same timestamp need a tiebreak; and even a strict quorum is not linearizable without extra care (no compare-and-set).`, "caveat");
  sys.note(`Trade-off: no leader and no election, availability during partial failures, and tunable consistency per request; but every operation costs N messages, and the guarantees are weaker than they look. Used by Dynamo, Cassandra, Riak, Voldemort.`, "done");
  return sys.f.done();
};

// ---------- consensus ----------

const raftLogReplication: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "A", label: "A (leader)", kind: "node", x: 42, y: 50, state: "term 2 · commit 3", tone: "active" },
    { id: "B", kind: "node", x: 90, y: 15, state: "follower · match 3" },
    { id: "C", kind: "node", x: 90, y: 85, state: "follower · match ?" },
  ]);
  const logs: Record<string, string[]> = { A: ["1:t1", "2:t1", "3:t2"], B: ["1:t1", "2:t1", "3:t2"], C: ["1:t1", "2:t1", "3:t1"] };
  const show = (tones: Record<string, Tone | undefined> = {}) =>
    sys.table({ title: "Replicated logs (index:term); entry 3 on C is from a deposed leader of term 1", head: ["node", "1", "2", "3", "4", "5"], rows: ["A", "B", "C"].map((n) => [n, ...Array.from({ length: 5 }, (_, i) => logs[n]![i] ?? "")]), tones: ["A", "B", "C"].map((n) => tones[n]) });
  show({ C: "danger" });
  sys.set({ term: 2, commitIndex: 3, "nextIndex[C]": 4 });
  sys.note(`Raft log replication: the leader appends every client command to its log and replicates it in order. C holds a stale entry 3 from an old term-1 leader that never committed; it will be overwritten.`);
  sys.msg("client", "A", "SET y=7", `A client sends a command to the leader. Followers redirect clients to it.`);
  logs.A!.push("4:t2");
  show({ A: "active" });
  sys.state("A", "term 2 · appended 4", "active");
  sys.note(`A appends entry 4 (term 2) to its own log first. It is not yet committed: a lone leader's log is not durable enough.`, "append");
  sys.fanout("A", ["B", "C"], "AppendEntries(prev 3:t2, [4:t2])", `AppendEntries carries the new entry plus the index and term of the entry that precedes it (3:t2). A follower accepts only if its own log matches at that position.`);
  logs.B!.push("4:t2");
  show({ B: "done", C: "danger" });
  sys.state("B", "follower · match 4", "done");
  sys.msg("B", "A", "success (match 4)", `B's entry 3 is 3:t2, the check passes, it appends entry 4.`, { tone: "done" });
  sys.state("C", "reject: 3 is t1 not t2", "danger");
  sys.msg("C", "A", "false (prev mismatch)", `C's entry 3 has term 1, not 2: consistency check fails, C rejects. The Log Matching property means a mismatch at index 3 implies everything after it differs too.`, { tone: "danger", keep: true });
  sys.set({ commitIndex: 4, "replicated on": "A, B (majority of 3)" });
  sys.state("A", "term 2 · commit 4", "done");
  show({ A: "done", B: "done", C: "danger" });
  sys.note(`Entry 4 is on a majority (A and B), so the leader advances commitIndex to 4 and applies SET y=7 to its state machine. A committed entry can never be lost by any future leader, because any future leader must win votes from a majority that includes a node holding it.`, "commit");
  sys.msg("A", "client", "OK", `The client is answered only after commit. Cost per write: one round trip to a majority plus a disk fsync on each node.`, { tone: "done" });
  sys.set({ "nextIndex[C]": 3 });
  sys.msg("A", "C", "AppendEntries(prev 2:t1, [3:t2, 4:t2])", `A decrements nextIndex[C] and retries from index 3, including both entries. C's prev check at 2:t1 now passes.`);
  logs.C = ["1:t1", "2:t1", "3:t2", "4:t2"];
  show({ C: "done" });
  sys.state("C", "follower · match 4", "done");
  sys.msg("C", "A", "success (match 4)", `C deletes its conflicting 3:t1 and appends the leader's 3:t2 and 4:t2. The leader's log is the truth; followers converge to it.`, { tone: "done" });
  sys.fanout("A", ["B", "C"], "heartbeat (leaderCommit 4)", `The next heartbeat piggybacks commitIndex=4, so followers apply entries 3 and 4 to their own state machines. Followers learn of commits one round trip after the leader.`, "muted", "heartbeat");
  sys.note(`Failure mode the paper spends a figure on: a leader may only commit by counting replicas for entries from its current term. Older-term entries get committed indirectly, once a current-term entry after them commits. Skipping this rule can lose committed data.`, "caveat");
  sys.set({ "write latency": "1 RTT to majority + fsync", reads: "through the leader (or ReadIndex / lease), else stale", throughput: "leader-bound; batch and pipeline AppendEntries" });
  sys.note(`Trade-off: strong consistency and a single ordered log, but the leader is a throughput bottleneck, every write pays a majority round trip, and a minority partition cannot make progress at all. Used by etcd, Consul, CockroachDB, TiKV.`, "done");
  return sys.f.done();
};

// ---------- distributed transactions ----------

const twoPhaseCommit: SysGen = ({ nodes }) => {
  const n = clampInt(nodes, 2, 3, 2);
  const names = ["Orders DB", "Payments DB", "Inventory DB"].slice(0, n);
  const ps = names.map((_, i) => `P${i + 1}`);
  const ys = spread(n, 15, 85);
  const sys = new Sys([{ id: "coord", label: "Coordinator", kind: "service", x: 12, y: 50, state: "idle" }, ...ps.map((id, i) => ({ id, label: names[i]!, kind: "db" as const, x: 82, y: ys[i], state: "idle" }))]);
  const log: (string | number)[][] = [];
  const show = (tone?: Tone) => sys.table({ title: "Coordinator log (must be on disk before phase 2)", head: ["txn", "decision"], rows: log.map((r) => [...r]), tones: log.map((_, i) => (i === log.length - 1 ? tone : undefined)) });
  show();
  sys.set({ participants: n, "round trips": 2, "fsyncs per participant": 2 });
  sys.note(`Two-phase commit makes one transaction atomic across ${n} independent databases: either all of them commit or none does. A coordinator drives two rounds: prepare, then commit or abort.`);
  sys.state("coord", "T1: preparing", "active");
  sys.fanout("coord", ps, "PREPARE T1", `Phase 1: the coordinator asks every participant whether it can commit T1.`);
  ps.forEach((p) => sys.state(p, "PREPARED · locks held", "compare"));
  sys.fanin(ps, "coord", "YES", `Each participant force-writes a prepare record to its own log, keeps its locks, and votes YES. A YES is a promise: from now on it must be able to commit T1 even after a crash.`, "compare");
  log.push(["T1", "COMMIT"]);
  show("done");
  sys.state("coord", "T1: COMMIT (logged)", "done");
  sys.note(`The coordinator writes COMMIT to its log. This single write is the commit point: once it is on disk the outcome is decided, whatever fails next.`, "decide");
  sys.fanout("coord", ps, "COMMIT T1", `Phase 2: the decision is broadcast.`, "done");
  ps.forEach((p) => sys.state(p, "committed", "done"));
  sys.fanin(ps, "coord", "ACK", `Participants commit, release locks, and acknowledge. The coordinator can now forget T1.`, "done");
  sys.state("coord", "T2: preparing", "active");
  sys.fanout("coord", ps, "PREPARE T2", `T2: another prepare round.`);
  const no = ps[n - 1]!;
  const yes = ps.slice(0, n - 1);
  yes.forEach((p) => sys.state(p, "PREPARED", "compare"));
  sys.state(no, "NO: constraint failed", "danger");
  sys.fanin(yes, "coord", "YES", `${yes.join(", ")} vote YES…`, "compare");
  sys.msg(no, "coord", "NO", `…but ${no} cannot (a constraint violation, or it timed out). One NO is enough.`, { tone: "danger", keep: true });
  log.push(["T2", "ABORT"]);
  show("danger");
  sys.state("coord", "T2: ABORT (logged)", "danger");
  sys.fanout("coord", ps, "ABORT T2", `The coordinator logs ABORT and tells everyone to roll back. Atomicity holds: nobody committed T2.`, "danger");
  ps.forEach((p) => sys.state(p, "rolled back", "visited"));
  sys.state("coord", "T3: preparing", "active");
  sys.fanout("coord", ps, "PREPARE T3", `T3: prepare round again.`);
  ps.forEach((p) => sys.state(p, "PREPARED · locks held", "compare"));
  sys.fanin(ps, "coord", "YES", `Everyone votes YES and holds locks, waiting for the decision.`, "compare");
  sys.state("coord", "CRASHED", "danger");
  ps.forEach((p) => sys.state(p, "IN DOUBT · locks held", "danger"));
  sys.note(`Failure mode: the coordinator crashes after collecting votes but before broadcasting a decision. Participants are in doubt: they cannot commit (the coordinator may have decided abort) and cannot abort (it may have decided commit).`, "crash");
  sys.set({ blocked: "all rows T3 touched, on every participant", "until": "coordinator recovers and reads its log" });
  sys.note(`This is the blocking problem: the locks stay held, other transactions on those rows queue up, and no participant can unilaterally resolve it. Timeouts do not help because a YES vote gave up the right to abort.`, "blocked");
  log.push(["T3", "COMMIT"]);
  show("done");
  sys.state("coord", "recovered: T3 COMMIT", "done");
  sys.fanout("coord", ps, "COMMIT T3", `The coordinator restarts, replays its log, finds T3 undecided, decides, and completes phase 2. Participants have been blocked for the whole outage.`, "done");
  ps.forEach((p) => sys.state(p, "committed", "done"));
  sys.note(`Trade-off: true atomic commit across systems, at the cost of two round trips plus multiple fsyncs per transaction and availability tied to one coordinator. Real systems replicate the coordinator (Spanner: Paxos groups) or avoid 2PC with sagas and idempotent messaging.`, "done");
  return sys.f.done();
};

const saga: SysGen = ({ nodes }) => {
  const n = clampInt(nodes, 2, 4, 3);
  const all = [
    { id: "order", label: "Order svc", t: "T1 create order", c: "C1 cancel order", ok: "order pending", comp: "order cancelled" },
    { id: "pay", label: "Payment svc", t: "T2 charge card", c: "C2 refund", ok: "charged $40", comp: "refunded $40" },
    { id: "stock", label: "Inventory svc", t: "T3 reserve stock", c: "C3 release stock", ok: "reserved", comp: "released" },
    { id: "ship", label: "Shipping svc", t: "T4 book courier", c: "C4 cancel booking", ok: "booked", comp: "cancelled" },
  ].slice(0, n);
  const pos: [number, number][] = [
    [48, 18],
    [92, 18],
    [48, 82],
    [92, 82],
  ];
  const sys = new Sys([{ id: "orch", label: "Orchestrator", kind: "service", x: 8, y: 50, state: "saga: start" }, ...all.map((s, i) => ({ id: s.id, label: s.label, kind: "service" as const, x: pos[i]![0], y: pos[i]![1], state: "own DB · idle" }))]);
  const steps: (string | number)[][] = all.map((s) => [s.t, "pending"]);
  const show = () => sys.table({ title: "Saga log (persisted by the orchestrator)", head: ["step", "status"], rows: steps.map((r) => [...r]), tones: steps.map((r) => (r[1] === "done" ? "done" : r[1] === "FAILED" ? "danger" : r[1] === "compensated" ? "active" : undefined)) });
  show();
  sys.set({ services: n, "why not 2PC": "each service owns its database; no shared locks or coordinator across them" });
  sys.note(`A saga runs a multi-service business transaction as a sequence of local transactions, each committed immediately. If a later step fails, earlier steps are undone with compensating transactions rather than rolled back.`);
  const failAt = n - 1;
  for (let i = 0; i < n; i++) {
    const s = all[i]!;
    if (i < failAt) {
      steps[i]![1] = "done";
      show();
      sys.state(s.id, s.ok, "done");
      sys.state("orch", `step ${i + 1}/${n}`, "active");
      sys.msg("orch", s.id, s.t, `Step ${i + 1}: ${s.label} runs a local transaction and commits it. The change is visible to everyone immediately: there is no isolation across the saga.`);
    } else {
      steps[i]![1] = "FAILED";
      show();
      sys.state(s.id, "FAILED: unavailable", "danger");
      sys.state("orch", `step ${i + 1} failed`, "danger");
      sys.msg(s.id, "orch", `${s.t.split(" ")[0]} FAILED`, `Step ${i + 1} fails (${s.label} is down, or rejects the request). The earlier steps are already committed and cannot be rolled back with a database ROLLBACK.`, { tone: "danger" });
    }
  }
  sys.note(`The orchestrator switches to compensation: it runs the undo action for every completed step, in reverse order. Each compensation is itself a local transaction, retried until it succeeds.`, "compensate");
  for (let i = failAt - 1; i >= 0; i--) {
    const s = all[i]!;
    steps[i]![1] = "compensated";
    show();
    sys.state(s.id, s.comp, "active");
    sys.state("orch", `compensating ${i + 1}`, "compare");
    sys.msg("orch", s.id, s.c, `${s.c}: semantically undo step ${i + 1}. A refund is a new transaction that reverses the effect; the original charge still happened and is still in the ledger.`, { tone: "compare" });
  }
  sys.state("orch", "saga: aborted", "visited");
  sys.note(`The saga ends in the aborted state. Every transition was written to the saga log before the next call, so if the orchestrator itself crashes mid-way, its replacement reads the log and resumes from the last recorded step instead of leaving a half-done order behind.`, "durable");
  sys.set({ "isolation": "none: other transactions can see intermediate state (dirty reads)", "compensations must be": "idempotent, retryable, and unable to fail for business reasons" });
  sys.note(`Failure modes: another request can see the intermediate state (an order that is pending, then cancelled); a compensation might arrive twice (make it idempotent); and some actions have no undo (an email sent), so order steps so the irreversible one comes last.`, "caveats");
  sys.note(`Trade-off: sagas keep services independent and available with no cross-service locks, but you give up atomicity and isolation and must design every step's compensation by hand. Choreography (events, no orchestrator) removes the central coordinator at the cost of a flow nobody can read in one place.`, "done");
  return sys.f.done();
};

const outbox: SysGen = ({ requests }) => {
  const n = clampInt(requests, 1, 6, 4);
  const sys = new Sys([
    { id: "svc", label: "Order service", kind: "service", x: 8, y: 50 },
    { id: "db", label: "Postgres", kind: "db", x: 45, y: 50, state: "orders + outbox" },
    { id: "relay", label: "Relay / CDC", kind: "service", x: 85, y: 15, state: "polling" },
    { id: "mq", label: "Kafka", kind: "queue", x: 85, y: 85, state: "0 events" },
  ]);
  const rows: (string | number)[][] = [];
  const show = (tones?: (Tone | undefined)[]) => sys.table({ title: "outbox table", head: ["id", "event", "status"], rows: rows.map((r) => [...r]), tones });
  show();
  sys.set({ orders: 0, events: 0, "delivery": "at-least-once" });
  sys.note(`Transactional outbox: a service must update its database and publish an event, and both must happen or neither. Two separate writes cannot promise that.`);
  sys.msg("svc", "db", "INSERT order 0 · COMMIT", `The naive dual write: first the order commits…`);
  sys.msg("svc", "mq", "publish OrderCreated(0)", `…then the service publishes. If it crashes here, or the broker is unreachable, the order exists and the event never goes out; downstream (billing, shipping) never learns. Publishing first has the mirror problem: an event for an order that never committed.`, { tone: "danger", dashed: true });
  sys.note(`Fix: write the event into an outbox table in the same database transaction as the business row. One local ACID commit covers both; a separate relay moves rows to the broker.`, "fix");
  for (let i = 1; i <= n; i++) {
    rows.push([i, `OrderCreated(${i})`, "pending"]);
    show(rows.map((_, j) => (j === rows.length - 1 ? "active" : undefined)));
    sys.state("db", `orders: ${i} · outbox: ${i} pending`, "active");
    sys.set({ orders: i });
    sys.msg("svc", "db", `BEGIN; order ${i}; outbox ${i}; COMMIT`, `Request ${i}: the order row and its outbox row commit atomically. If the transaction fails, neither exists; there is nothing to publish.`, { tone: "done" });
  }
  sys.msg("relay", "db", "SELECT … WHERE status='pending'", `The relay polls the outbox (or tails the WAL with CDC, e.g. Debezium, which avoids polling entirely).`, { tone: "compare" });
  sys.state("mq", `${n} events`, "done");
  sys.set({ events: n });
  sys.msg("relay", "mq", `publish ${n} event${n > 1 ? "s" : ""}`, `The relay publishes each pending row in id order (ordering per aggregate is preserved if you key by aggregate id).`, { tone: "done" });
  rows.forEach((r) => (r[2] = "sent"));
  show(rows.map(() => "done" as Tone));
  sys.state("db", `orders: ${n} · outbox: ${n} sent`, "visited");
  sys.msg("relay", "db", "UPDATE outbox SET status='sent'", `Then it marks the rows sent (or deletes them). Sent rows can be purged later.`, { tone: "done" });
  sys.state("relay", "CRASHED after publish", "danger");
  rows[n - 1]![2] = "pending (again)";
  show(rows.map((_, j) => (j === n - 1 ? "danger" : undefined)));
  sys.note(`Failure mode: the relay crashes after publishing row ${n} but before marking it sent. On restart it publishes row ${n} again. The outbox gives at-least-once delivery, never exactly-once.`, "duplicate");
  sys.set({ "consumers must be": "idempotent (dedupe on event id / idempotency key)", latency: "polling interval or CDC lag" });
  sys.note(`Trade-off: reliable publication with only the database's own transaction, at the cost of an extra table, a relay to run, publish latency of one polling interval, and consumers that must tolerate duplicates.`, "done");
  return sys.f.done();
};

const idempotencyKey: SysGen = ({ requests }) => {
  const n = clampInt(requests, 1, 5, 3);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "api", label: "Payments API", kind: "service", x: 42, y: 50 },
    { id: "store", label: "Idempotency store", kind: "cache", x: 88, y: 15, state: "0 keys" },
    { id: "ledger", label: "Ledger", kind: "db", x: 88, y: 85, state: "charges: 0" },
  ]);
  const rows: (string | number)[][] = [];
  const show = (hi?: number, tone: Tone = "active") => sys.table({ title: "Idempotency store (key → status, saved response), TTL 24 h", head: ["key", "status", "response"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === hi ? tone : undefined)) });
  show();
  sys.set({ charges: 0, "duplicate requests": 0, "double charges": 0 });
  sys.note(`Idempotency keys make a retried request safe: the client attaches a unique key, and the server guarantees that the same key produces the same effect exactly once, however many times it arrives.`);
  sys.msg("client", "api", "POST /charge $20 · key k1", `The client generates key k1 (a UUID) for this attempt and sends it with the request.`);
  rows.push(["k1", "in progress", "–"]);
  show(0);
  sys.state("store", "k1: in progress", "compare");
  sys.msg("api", "store", "GET k1 → miss; SET k1 in-progress NX", `The API checks the store. No entry: it claims k1 atomically (SET NX) so a concurrent duplicate cannot also start processing.`, { tone: "compare" });
  sys.state("ledger", "charges: 1 ($20)", "done");
  sys.set({ charges: 1 });
  sys.msg("api", "ledger", "charge $20", `The real work happens once: the ledger records a $20 charge.`);
  rows[0] = ["k1", "done", "201 ch_9f"];
  show(0, "done");
  sys.state("store", "k1: 201 ch_9f", "done");
  sys.msg("api", "store", "SET k1 = 201 ch_9f", `The response is saved under k1 before it is returned, so a retry can be answered without redoing the work.`, { tone: "done" });
  sys.msg("api", "client", "201 Created (lost)", `The reply is sent… and lost: a timeout, a dropped connection, a crashed pod. The client cannot tell whether the charge happened.`, { tone: "danger", dashed: true });
  sys.set({ "duplicate requests": 1 });
  sys.msg("client", "api", "POST /charge $20 · key k1 (retry)", `The client retries with the same key. Without a key this would be a second $20 charge.`);
  show(0, "done");
  sys.msg("api", "store", "GET k1 → 201 ch_9f", `The store has k1 with a saved response.`, { tone: "compare" });
  sys.msg("api", "client", "201 Created (replayed)", `The API replays the saved response without touching the ledger. Charges: still 1. At-least-once delivery plus an idempotent server equals an exactly-once effect.`, { tone: "done" });
  sys.msg("client", "api", "POST … key k1 (concurrent)", `Concurrent duplicate: a second copy arrives while the first is still in progress. The SET NX fails, so the API returns 409 Conflict (or waits for the first to finish) rather than charging twice.`, { tone: "compare" });
  if (n > 1) {
    for (let i = 2; i <= n; i++) rows.push([`k${i}`, "done", `201 ch_${(fnv(`k${i}`) % 900) + 100}`]);
    show(undefined);
    sys.state("store", `${n} keys`, "done");
    sys.state("ledger", `charges: ${n}`, "done");
    sys.set({ charges: n });
    sys.msg("client", "api", `POST /charge · keys k2…k${n}`, `Different keys are different intents: k2…k${n} each charge once. The key identifies the attempt, not the endpoint.`, { tone: "done" });
  }
  sys.set({ "key scope": "per client / account", "payload mismatch": "same key, different body → 422", ttl: "24 h" });
  sys.note(`Details that bite: scope keys per account so clients cannot collide; store a hash of the request body and reject a reused key with a different payload; expire keys, but not before the client's retry window ends.`, "caveats");
  sys.note(`Trade-off: one extra store round trip per request and a keyspace to expire, in exchange for safe retries at every layer. Stripe, Adyen and most payment APIs require it; anything with side effects should offer it.`, "done");
  return sys.f.done();
};

// ---------- logical time ----------

type ClockEvent = { kind: "local"; at: number } | { kind: "send"; from: number; to: number };

const clockScript = (n: number): ClockEvent[] => {
  const third = n >= 3 ? 2 : 1;
  return [
    { kind: "local", at: 0 },
    { kind: "send", from: 0, to: 1 },
    { kind: "local", at: third },
    { kind: "send", from: 1, to: 0 },
    { kind: "local", at: third },
    { kind: "send", from: third, to: 0 },
  ];
};

const lamportClock: SysGen = ({ nodes }) => {
  const n = clampInt(nodes, 2, 4, 3);
  const ids = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const xs = spread(n, 10, 90);
  const sys = new Sys(ids.map((id, i) => ({ id, kind: "node" as const, x: xs[i], y: 50, state: "L = 0" })));
  const L = ids.map(() => 0);
  const rows: (string | number)[][] = [];
  const show = () => sys.table({ title: "Event log (Lamport timestamps)", head: ["#", "node", "event", "L"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === rows.length - 1 ? "active" : undefined)) });
  const record = (node: number, ev: string) => {
    rows.push([rows.length + 1, ids[node]!, ev, L[node]!]);
    show();
  };
  show();
  sys.set({ rule: "local: L = L + 1; send: attach L; receive: L = max(L, msg) + 1" });
  sys.note(`Lamport clocks give every event an integer timestamp with one guarantee: if event a can causally affect event b (same process earlier, or a message from a to b), then L(a) < L(b). No physical clocks are involved.`);
  let seq = 0;
  let concurrentPair: [string, string] | undefined;
  for (const ev of clockScript(n)) {
    if (ev.kind === "local") {
      L[ev.at] = L[ev.at]! + 1;
      sys.state(ids[ev.at]!, `L = ${L[ev.at]}`, "active");
      record(ev.at, `local e${++seq}`);
      const first = rows.find((r) => String(r[2]).startsWith("recv"));
      if (!concurrentPair && first && ev.at !== ids.indexOf(String(first[1]))) concurrentPair = [`${ids[ev.at]} e${seq} (L=${L[ev.at]})`, `${first[1]} ${first[2]} (L=${first[3]})`];
      sys.note(`Local event on ${ids[ev.at]}: it increments its own counter to ${L[ev.at]}. Nothing else changes.`, "tick");
      ids.forEach((id) => sys.tone(id, undefined));
    } else {
      L[ev.from] = L[ev.from]! + 1;
      const ts = L[ev.from]!;
      sys.state(ids[ev.from]!, `L = ${ts}`, "active");
      record(ev.from, `send m${++seq}`);
      sys.msg(ids[ev.from]!, ids[ev.to]!, `m${seq} (L=${ts})`, `${ids[ev.from]} sends a message: it ticks to ${ts} and stamps the message with ${ts}.`);
      const before = L[ev.to]!;
      L[ev.to] = Math.max(before, ts) + 1;
      sys.state(ids[ev.to]!, `L = ${L[ev.to]}`, "done");
      record(ev.to, `recv m${seq}`);
      sys.msg(ids[ev.from]!, ids[ev.to]!, `m${seq} (L=${ts})`, `${ids[ev.to]} receives it: L = max(own ${before}, message ${ts}) + 1 = ${L[ev.to]}. The receive is now stamped after the send, whatever ${ids[ev.to]}'s counter was.`, { tone: "done" });
      ids.forEach((id) => sys.tone(id, undefined));
    }
  }
  sys.table({ title: "Event log (Lamport timestamps)", head: ["#", "node", "event", "L"], rows: rows.map((r) => [...r]) });
  if (concurrentPair) sys.set({ "concurrent yet ordered": `${concurrentPair[0]} vs ${concurrentPair[1]}` });
  sys.note(`Failure mode of the intuition: the converse does not hold. ${concurrentPair ? `${concurrentPair[0]} has a smaller stamp than ${concurrentPair[1]}, yet neither could have influenced the other: they are concurrent.` : "Two events with L(a) < L(b) may be concurrent."} A Lamport clock cannot tell "happened before" from "happened to be numbered lower".`, "limit");
  sys.set({ "total order": "(L, node id): break ties by id", "used for": "mutual exclusion, versioning (LWW), ordering log entries" });
  sys.note(`Trade-off: one integer per message and a consistent total order (ties broken by node id) that respects causality, but no way to detect concurrency. When you need to know that two writes conflicted, you need vector clocks.`, "done");
  return sys.f.done();
};

const vectorClock: SysGen = ({ nodes }) => {
  const n = clampInt(nodes, 2, 4, 3);
  const ids = Array.from({ length: n }, (_, i) => `P${i + 1}`);
  const xs = spread(n, 10, 90);
  const fmt = (v: number[]) => `[${v.join(",")}]`;
  const V = ids.map(() => ids.map(() => 0));
  const sys = new Sys(ids.map((id, i) => ({ id, kind: "node" as const, x: xs[i], y: 50, state: fmt(V[i]!) })));
  const rows: (string | number)[][] = [];
  const stamps: { name: string; v: number[] }[] = [];
  const show = () => sys.table({ title: "Event log (vector timestamps)", head: ["#", "node", "event", "vector"], rows: rows.map((r) => [...r]), tones: rows.map((_, i) => (i === rows.length - 1 ? "active" : undefined)) });
  const record = (node: number, ev: string) => {
    rows.push([rows.length + 1, ids[node]!, ev, fmt(V[node]!)]);
    stamps.push({ name: `${ids[node]} ${ev} ${fmt(V[node]!)}`, v: [...V[node]!] });
    show();
  };
  const leq = (a: number[], b: number[]) => a.every((x, i) => x <= (b[i] ?? 0));
  show();
  sys.set({ rule: "own slot +1 on every event; receive: elementwise max, then own slot +1", "vector size": n });
  sys.note(`Vector clocks: each of the ${n} nodes keeps a counter per node. Comparing two vectors tells you whether one event happened before the other or whether they were concurrent, something a single Lamport integer cannot.`);
  let seq = 0;
  for (const ev of clockScript(n)) {
    if (ev.kind === "local") {
      V[ev.at]![ev.at] = V[ev.at]![ev.at]! + 1;
      sys.state(ids[ev.at]!, fmt(V[ev.at]!), "active");
      record(ev.at, `local e${++seq}`);
      sys.note(`Local event on ${ids[ev.at]}: it increments its own slot → ${fmt(V[ev.at]!)}. Other slots record what it has heard from others.`, "tick");
      ids.forEach((id) => sys.tone(id, undefined));
    } else {
      V[ev.from]![ev.from] = V[ev.from]![ev.from]! + 1;
      const ts = [...V[ev.from]!];
      sys.state(ids[ev.from]!, fmt(ts), "active");
      record(ev.from, `send m${++seq}`);
      sys.msg(ids[ev.from]!, ids[ev.to]!, `m${seq} ${fmt(ts)}`, `${ids[ev.from]} ticks its slot and sends its whole vector ${fmt(ts)} with the message.`);
      const before = [...V[ev.to]!];
      V[ev.to] = before.map((x, i) => Math.max(x, ts[i] ?? 0));
      V[ev.to]![ev.to] = V[ev.to]![ev.to]! + 1;
      sys.state(ids[ev.to]!, fmt(V[ev.to]!), "done");
      record(ev.to, `recv m${seq}`);
      sys.msg(ids[ev.from]!, ids[ev.to]!, `m${seq} ${fmt(ts)}`, `${ids[ev.to]} merges: max(${fmt(before)}, ${fmt(ts)}) then its own slot +1 → ${fmt(V[ev.to]!)}. It now knows everything ${ids[ev.from]} knew.`, { tone: "done" });
      ids.forEach((id) => sys.tone(id, undefined));
    }
  }
  sys.table({ title: "Event log (vector timestamps)", head: ["#", "node", "event", "vector"], rows: rows.map((r) => [...r]) });
  const causal = stamps.find((a) => stamps.some((b) => a !== b && leq(a.v, b.v) && !leq(b.v, a.v)));
  const causalB = causal ? stamps.find((b) => b !== causal && leq(causal.v, b.v) && !leq(b.v, causal.v)) : undefined;
  const conc = stamps.find((a) => stamps.some((b) => a !== b && !leq(a.v, b.v) && !leq(b.v, a.v)));
  const concB = conc ? stamps.find((b) => b !== conc && !leq(conc.v, b.v) && !leq(b.v, conc.v)) : undefined;
  if (causal && causalB) sys.set({ "a → b": `${causal.name} ≤ ${causalB.name} (every slot)` });
  sys.note(`Comparison rule: a happened before b when every slot of a ≤ the matching slot of b and they differ. ${causal && causalB ? `${causal.name} ≤ ${causalB.name}, so the first causally precedes the second.` : ""}`, "compare");
  if (conc && concB) sys.set({ "a ∥ b (concurrent)": `${conc.name} vs ${concB.name}: neither ≤ the other` });
  sys.note(`Concurrency is now detectable: ${conc && concB ? `${conc.name} and ${concB.name} are each bigger in some slot, so neither happened before the other.` : "two vectors where each is larger in some slot are concurrent."} A store like Dynamo keeps both as siblings for the application to merge, instead of silently picking one.`, "concurrent");
  sys.set({ "cost per message": `${n} integers`, "growth": "one slot per node ever seen; needs pruning under churn" });
  sys.note(`Trade-off: exact causality and conflict detection, but the vector grows with the number of writers (clients as writers makes it explode: Riak moved to dotted version vectors), and you still need a merge policy once a conflict is found.`, "done");
  return sys.f.done();
};

// ---------- coordination ----------

const gossip: SysGen = ({ nodes }) => {
  const n = clampInt(nodes, 3, 8, 6);
  const ids = Array.from({ length: n }, (_, i) => `N${i + 1}`);
  const sys = new Sys(ids.map((id) => ({ id, kind: "node" as const, state: "v1" })));
  const rnd = lcg(n * 7919 + 17);
  const infected = new Set<string>([ids[0]!]);
  const rows: (string | number)[][] = [];
  const show = () => sys.table({ title: "Rounds", head: ["round", "know v2", "messages", "wasted (already knew)"], rows: rows.map((r) => [...r]) });
  sys.set({ nodes: n, fanout: 1, "expected rounds": `O(log ${n}) ≈ ${Math.ceil(Math.log2(n)) + 1}` });
  sys.note(`Gossip (epidemic) protocol: no coordinator. Every round, each node that knows the update tells one random peer. Like a rumour, it reaches everyone in O(log N) rounds no matter who fails.`);
  sys.state(ids[0]!, "v2 (new)", "done");
  sys.note(`${ids[0]} learns something new: a config change, a membership update, or the heartbeat counter of a peer. It has no list of who needs it.`, "origin");
  let round = 0;
  while (infected.size < n && round < 8 && !sys.f.full) {
    round++;
    const senders = [...infected];
    const msgs: { from: string; to: string; wasted: boolean }[] = [];
    for (const from of senders) {
      const others = ids.filter((x) => x !== from);
      const to = others[Math.floor(rnd() * others.length)]!;
      msgs.push({ from, to, wasted: infected.has(to) });
    }
    const newly = new Set(msgs.filter((m) => !m.wasted).map((m) => m.to));
    for (const to of newly) infected.add(to);
    const wasted = msgs.filter((m) => m.wasted).length;
    rows.push([round, `${infected.size} / ${n}`, msgs.length, wasted]);
    show();
    for (const to of newly) sys.state(to, `v2 (round ${round})`, "done");
    sys.s.messages = msgs.map((m) => ({ from: m.from, to: m.to, label: "v2", tone: m.wasted ? ("muted" as Tone) : ("active" as Tone), dashed: m.wasted }));
    sys.s.log = [...sys.s.log.slice(-4), `round ${round}: ${msgs.map((m) => `${m.from}→${m.to}`).join(" ")}`];
    sys.set({ round, "know v2": `${infected.size} / ${n}` });
    sys.f.push(`Round ${round}: ${senders.length} node${senders.length > 1 ? "s" : ""} each pick a random peer. ${newly.size} new node${newly.size === 1 ? "" : "s"} learn v2${wasted ? `; ${wasted} message${wasted > 1 ? "s" : ""} hit nodes that already knew (dashed, wasted)` : ""}. Now ${infected.size} of ${n} know.`, "round");
  }
  sys.clear();
  if (infected.size === n) sys.note(`Everyone knows v2 after ${round} rounds with ${rows.reduce((a, r) => a + Number(r[2]), 0)} messages total. Doubling N adds about one round; no node ever sent more than one message per round.`, "converged");
  else sys.note(`After ${round} rounds ${infected.size} of ${n} know; the stragglers will hear within a round or two. Random choice means no fixed bound, only a very fast expected time.`, "converged");
  sys.set({ "push vs pull": "push spreads fast early; pull finishes fast late; most systems do both", "anti-entropy": "periodic full sync (Merkle trees) repairs anything a rumour missed" });
  sys.note(`Two flavours: rumour mongering (push new updates, stop after a few rounds) is cheap but can miss nodes; anti-entropy (periodically compare full state with a peer, e.g. via Merkle trees) is heavier but guarantees convergence. Cassandra and Riak run both.`, "variants");
  sys.note(`Failure mode: during a partition each side converges to its own view, and a node with a slow or broken link is declared dead by everyone (phi-accrual detectors tune this). Gossip also carries stale news for a while: a removed node can be re-added by a peer that never heard it left, unless you gossip tombstones.`, "caveat");
  sys.note(`Trade-off: no coordinator, no single point of failure, and load that spreads evenly; but only eventual delivery, redundant messages (the wasted ones above), and O(N) state per node for membership. Used for cluster membership and failure detection in Cassandra, Consul (Serf/SWIM), and Redis Cluster.`, "done");
  return sys.f.done();
};

const distributedLock: SysGen = () => {
  const sys = new Sys([
    { id: "A", label: "Client A", kind: "client", x: 8, y: 20, state: "wants the lock" },
    { id: "B", label: "Client B", kind: "client", x: 8, y: 80, state: "wants the lock" },
    { id: "lock", label: "Lock service", kind: "service", x: 50, y: 50, state: "free" },
    { id: "store", label: "Storage", kind: "db", x: 92, y: 50, state: "file v1" },
  ]);
  sys.set({ "lock TTL": "10 s", "fencing token": "off", "highest token seen": "–" });
  sys.note(`A distributed lock lets one client at a time touch a shared resource. Because clients can die while holding it, the lock is a lease with a TTL, and that expiry is where the trouble starts.`);
  sys.msg("A", "lock", "acquire(file, TTL 10 s)", `A asks for the lock.`);
  sys.state("lock", "held by A · token 33 · 10 s", "active");
  sys.state("A", "holds lock (token 33)", "done");
  sys.msg("lock", "A", "granted · token 33", `Granted. The service records the holder and starts the 10 s lease; A must renew or finish before then.`, { tone: "done" });
  sys.msg("B", "lock", "acquire(file)", `B asks too.`);
  sys.state("B", "waiting", "compare");
  sys.msg("lock", "B", "denied (held by A)", `Denied: B waits and retries. So far mutual exclusion works.`, { tone: "compare" });
  sys.state("A", "GC PAUSE (15 s)…", "danger");
  sys.note(`Failure mode: A stops for 15 s: a stop-the-world GC, a page fault to swap, a VM live migration, or just a slow network. A is not dead, only late, and it cannot tell.`, "pause");
  sys.state("lock", "expired → free", "danger");
  sys.note(`The lease expires. The lock service cannot distinguish a paused client from a dead one; releasing is the only way not to block forever.`, "expire");
  sys.state("lock", "held by B · token 34", "active");
  sys.state("B", "holds lock (token 34)", "done");
  sys.msg("B", "lock", "acquire → granted · token 34", `B acquires the lock with the next token, 34, and starts working.`, { tone: "done" });
  sys.state("store", "file v2 (by B)", "done");
  sys.msg("B", "store", "write v2", `B writes to storage. Legitimate: B holds the lock.`, { tone: "done" });
  sys.state("A", "resumes: still 'holds' lock", "danger");
  sys.note(`A wakes up. From A's point of view nothing happened: it acquired the lock, ran some code, and is now about to write. It has no idea 15 s passed.`, "resume");
  sys.state("store", "file v2' CORRUPTED", "danger");
  sys.msg("A", "store", "write v2' (no token)", `Storage accepts A's write on top of B's. Two clients wrote under one lock: mutual exclusion is broken and the data is corrupted. No TTL choice fixes this; a pause can always be longer.`, { tone: "danger" });
  sys.set({ "fencing token": "on", "highest token seen": 34 });
  sys.state("store", "file v2 · token 34", "done");
  sys.note(`Fix: fencing tokens. The lock service hands out a strictly increasing token with each grant, every write carries it, and storage remembers the highest token it has seen.`, "fix");
  sys.msg("A", "store", "write v2' (token 33)", `Replay with fencing: A's write carries its stale token 33.`, { tone: "compare" });
  sys.state("A", "write rejected", "visited");
  sys.msg("store", "A", "REJECT: 33 < 34", `Storage sees a token lower than 34 and rejects. The old holder is fenced off; B's work is safe. Fencing puts the safety check on the resource, the only party that can enforce it.`, { tone: "done" });
  sys.set({ "lock service must be": "consensus-backed (ZooKeeper, etcd) for correctness", "Redlock": "relies on timing assumptions; fine for efficiency, not for correctness" });
  sys.note(`Trade-off: ask what the lock is for. For efficiency (avoid duplicate work) a simple TTL lock is fine and the occasional double run is harmless. For correctness you need a consensus-backed lock service and fencing tokens on every resource, and both add latency and complexity.`, "done");
  return sys.f.done();
};

const leaderLease: SysGen = () => {
  const sys = new Sys([
    { id: "store", label: "Lease store", kind: "service", x: 50, y: 10, state: "lease: none" },
    { id: "A", label: "Node A", kind: "node", x: 12, y: 60, state: "candidate" },
    { id: "B", label: "Node B", kind: "node", x: 88, y: 60, state: "standby" },
    { id: "clients", label: "Clients", kind: "client", x: 50, y: 92 },
  ]);
  sys.set({ "lease length": "5 s", "renew every": "2 s", "clock drift bound": "±500 ms", "reads served from": "leader's local state, no quorum" });
  sys.note(`A leader lease is a time-bounded promise: while it holds a valid lease, a node knows no one else is leader, so it can serve reads from local state without asking anyone. Used by Chubby, Spanner, Raft leader leases, and Kubernetes controllers.`);
  sys.msg("A", "store", "acquire lease (5 s)", `A asks the lease store (a consensus group, or etcd) for the lease. Only one holder at a time.`);
  sys.state("store", "lease: A · exp t+5 s", "active");
  sys.state("A", "LEADER · lease t+5 s", "done");
  sys.msg("store", "A", "granted until t+5 s", `A is leader until t+5 s. It notes the expiry on its own clock, measured from when it sent the request (the conservative end).`, { tone: "done" });
  sys.msg("clients", "A", "READ x", `A client reads.`, { tone: "compare" });
  sys.msg("A", "clients", "x = 7 (local, no round trip)", `A answers from memory. Without the lease it would have to confirm with a majority that it is still leader on every read (Raft's ReadIndex), adding a round trip.`, { tone: "done" });
  sys.state("store", "lease: A · exp t+7 s", "active");
  sys.state("A", "LEADER · lease t+7 s", "done");
  sys.msg("A", "store", "renew (at t+2 s)", `A renews long before expiry; each renewal extends the lease by another 5 s from the request time. Renewal is a heartbeat with teeth.`, { tone: "done" });
  sys.state("A", "PARTITIONED", "danger");
  sys.msg("A", "store", "renew (at t+4 s)", `Failure mode: A is cut off from the store. Renewals stop arriving. Clients on A's side keep sending reads.`, { tone: "danger", dashed: true });
  sys.state("A", "lease expired → stepped down", "muted");
  sys.note(`At t+7 s by its own clock, A must stop serving even though nothing told it to. This is the discipline that makes leases safe: the holder enforces the expiry on itself.`, "step down");
  sys.state("store", "lease: expired · wait +500 ms", "compare");
  sys.note(`The store sees the lease lapse but waits an extra clock-drift bound (500 ms) before granting a new one, in case A's clock runs slow and A is still serving for a moment.`, "grace");
  sys.state("store", "lease: B · exp t+12.5 s", "active");
  sys.state("B", "LEADER · lease", "done");
  sys.msg("B", "store", "acquire → granted", `B acquires the lease. Between A's step-down and now, no reads were served: the unavailability window is roughly one lease length plus the grace.`, { tone: "done" });
  sys.msg("clients", "B", "READ x → x = 7", `Clients redirect to B, which serves locally under its own lease.`, { tone: "done" });
  sys.set({ "unavailability after crash": "≈ lease length + grace", "safety depends on": "bounded clock drift; violated by GC pauses and clock jumps" });
  sys.note(`Failure mode 2: if A's clock ran slower than the drift bound, or A paused mid-request, A could still answer a read after B became leader: stale reads, the read-side form of split brain. Spanner buys certainty with TrueTime; others add fencing tokens or accept the risk.`, "caveat");
  sys.note(`Trade-off: reads become one local lookup instead of a quorum round trip, at the cost of an unavailability window after a leader crash (shorter lease = shorter outage but more renewal traffic) and a safety argument that rests on clocks behaving.`, "done");
  return sys.f.done();
};

const crdtCounter: SysGen = ({ nodes }) => {
  const n = clampInt(nodes, 2, 4, 3);
  const ids = Array.from({ length: n }, (_, i) => `N${i + 1}`);
  const xs = spread(n, 10, 90);
  const V = ids.map(() => ids.map(() => 0));
  const fmt = (v: number[]) => `[${v.join(",")}] = ${v.reduce((a, b) => a + b, 0)}`;
  const sys = new Sys(ids.map((id, i) => ({ id, kind: "node" as const, x: xs[i], y: 50, state: fmt(V[i]!) })));
  const show = (hi: number[] = [], tone: Tone = "active") => sys.table({ title: "G-Counter state per replica: one slot per replica, value = sum", head: ["replica", ...ids, "value"], rows: ids.map((id, i) => [id, ...V[i]!, V[i]!.reduce((a, b) => a + b, 0)]), tones: ids.map((_, i) => (hi.includes(i) ? tone : undefined)) });
  const inc = (i: number, k = 1) => {
    V[i]![i] = V[i]![i]! + k;
    sys.state(ids[i]!, fmt(V[i]!), "active");
  };
  const merge = (into: number, from: number) => {
    V[into] = V[into]!.map((x, j) => Math.max(x, V[from]![j] ?? 0));
    sys.state(ids[into]!, fmt(V[into]!), "done");
  };
  show();
  sys.set({ replicas: n, "increment": "own slot += 1", merge: "elementwise max", value: "sum of slots" });
  sys.note(`A CRDT counter (G-Counter) lets ${n} replicas count without coordination: each replica increments only its own slot, and any two states merge by taking the elementwise max. Merging is commutative, associative and idempotent, so every order of delivery converges.`);
  inc(0);
  show([0]);
  sys.note(`${ids[0]} counts one like: its own slot becomes 1. No message, no lock, instant.`, "inc");
  inc(1, 2);
  show([1]);
  sys.note(`${ids[1]} counts two likes: its slot becomes 2. Replicas disagree for now (${ids[0]} says 1, ${ids[1]} says 2), and that is allowed.`, "inc");
  const third = n - 1;
  inc(third);
  show([third]);
  sys.note(`${ids[third]} counts one. Suppose ${ids[0]} is now partitioned from the rest.`, "inc");
  sys.state(ids[0]!, `${fmt(V[0]!)} · cut off`, "danger");
  merge(third, 1);
  show([third], "done");
  sys.msg(ids[1]!, ids[third]!, `state [${V[1]!.join(",")}]`, `${ids[1]} gossips its state to ${ids[third]}, which merges: max per slot → ${fmt(V[third]!)}. Nobody's increments were lost or double counted.`, { tone: "done" });
  inc(0);
  sys.state(ids[0]!, `${fmt(V[0]!)} · cut off`, "danger");
  show([0]);
  sys.note(`Still partitioned, ${ids[0]} keeps counting (slot → 2). Availability under partition is the whole point: a CRDT never has to refuse a write.`, "inc");
  ids.forEach((id) => sys.tone(id, undefined));
  sys.fanout(ids[0]!, ids.slice(1), `state [${V[0]!.join(",")}]`, `The partition heals and ${ids[0]} sends its state to everyone.`, "active");
  for (let i = 1; i < n; i++) merge(i, 0);
  show(ids.map((_, i) => i).slice(1), "done");
  sys.note(`Each replica merges ${ids[0]}'s vector. Their own slots are untouched (max with a smaller number), ${ids[0]}'s slot jumps to 2.`, "merge");
  sys.fanin(ids.slice(1), ids[0]!, "state", `The others reply with their states and ${ids[0]} merges them too.`, "done");
  for (let i = 1; i < n; i++) merge(0, i);
  show(ids.map((_, i) => i), "done");
  const total = V[0]!.reduce((a, b) => a + b, 0);
  sys.set({ converged: `every replica = ${total}`, "messages needed": "any spanning pattern, in any order, any number of times" });
  sys.note(`Converged: all replicas read ${total}, and they would have reached ${total} in any delivery order, with duplicates, or with messages dropped and resent later. That is strong eventual consistency.`, "converged");
  sys.note(`Why a vector and not one integer with max? Because max(2, 2) = 2 would lose an increment when two replicas each counted 2. Per-replica ownership of a slot is what makes concurrent increments add instead of collide.`, "why");
  sys.note(`Decrements: a PN-Counter is two G-Counters, P minus N. Failure mode: one slot per replica that ever existed, so churn bloats the state until you garbage-collect retired replica ids; and there is no "reset to zero" or "never exceed 100": invariants that need agreement need consensus, not CRDTs.`, "caveat");
  sys.note(`Trade-off: always-available, coordination-free writes and guaranteed convergence, but only for operations that commute; anything with a global invariant is out of scope. Used for counters, sets, and collaborative text (Yjs, Automerge, Riak data types).`, "done");
  return sys.f.done();
};

// ---------- storage engines ----------

const mvcc: SysGen = () => {
  const sys = new Sys([
    { id: "T1", label: "Txn 1 (read)", kind: "client", x: 10, y: 15, state: "idle" },
    { id: "T2", label: "Txn 2 (write)", kind: "client", x: 10, y: 50, state: "idle" },
    { id: "T3", label: "Txn 3 (read)", kind: "client", x: 10, y: 85, state: "idle" },
    { id: "db", label: "Storage", kind: "db", x: 65, y: 50, state: "next xid 12" },
  ]);
  const rows: (string | number)[][] = [["balance", 100, 5, "–"]];
  const show = (tones?: (Tone | undefined)[]) => sys.table({ title: "Row versions (xmin = created by txn, xmax = deleted by txn)", head: ["key", "value", "xmin", "xmax"], rows: rows.map((r) => [...r]), tones });
  show();
  sys.set({ "isolation": "snapshot (repeatable read)", "readers block writers": "never", "writers block readers": "never" });
  sys.note(`MVCC (multi-version concurrency control): instead of locking rows for readers, the database keeps several versions of each row and shows each transaction the versions that were committed when its snapshot was taken.`);
  sys.state("T1", "snapshot: xid < 12", "active");
  sys.msg("T1", "db", "BEGIN", `T1 starts and takes a snapshot: it will see every transaction committed before xid 12 and nothing later, no matter how long it runs.`);
  sys.msg("db", "T1", "balance = 100 (xmin 5)", `T1 reads balance: version created by xid 5, not deleted, committed → visible. No lock taken.`, { tone: "done" });
  sys.state("T2", "xid 12 · updating", "active");
  rows[0]![3] = 12;
  rows.push(["balance", 80, 12, "–"]);
  show(["visited", "active"]);
  sys.state("db", "next xid 13", "visited");
  sys.msg("T2", "db", "UPDATE balance = 80", `T2 (xid 12) updates the row. Nothing is overwritten: a new version (xmin 12) is appended and the old one is marked deleted by 12. T2 holds a row lock, but only against other writers.`);
  sys.msg("T1", "db", "SELECT balance", `T1 reads again while T2 is still open.`, { tone: "compare" });
  show(["active", "muted"]);
  sys.msg("db", "T1", "balance = 100 (still)", `T1 still sees 100: version 12 is invisible to its snapshot (12 is not < 12, and not committed anyway). Repeatable read without waiting on T2's lock.`, { tone: "done" });
  sys.state("T2", "committed", "done");
  show(["visited", "done"]);
  sys.msg("T2", "db", "COMMIT", `T2 commits. Version 12 becomes visible to snapshots taken from now on.`, { tone: "done" });
  sys.state("T3", "snapshot: xid < 13", "active");
  sys.msg("T3", "db", "BEGIN; SELECT balance → 80", `T3 starts afterwards and sees 80. Two open transactions see two different values of the same row, and both are correct for their snapshot.`, { tone: "done" });
  show(["active", "done"]);
  sys.msg("db", "T1", "SELECT balance → 100", `T1 keeps seeing 100. Its snapshot pins the old version alive.`, { tone: "compare" });
  sys.state("T1", "UPDATE → conflict", "danger");
  sys.msg("T1", "db", "UPDATE balance = 90", `Failure mode 1: T1 now tries to write the row it read. The current version was changed by xid 12, committed after T1's snapshot.`, { tone: "danger" });
  sys.msg("db", "T1", "ERROR: could not serialize", `First committer wins: T1 is aborted (Postgres REPEATABLE READ, "could not serialize access due to concurrent update"). Retrying T1 from scratch is the application's job; under READ COMMITTED it would instead re-read and lose T2's update silently.`, { tone: "danger" });
  sys.state("T1", "aborted", "muted");
  sys.note(`Failure mode 2, write skew: two transactions each read a row the other writes (two doctors both going off call after reading "two on call") and both commit under snapshot isolation. Only SERIALIZABLE (SSI in Postgres) detects it, by tracking read/write dependencies.`, "write skew");
  rows.shift();
  show(["done"]);
  sys.state("db", "vacuumed", "visited");
  sys.note(`Once no live snapshot can see the old version it is garbage; vacuum reclaims it. Failure mode 3: a long-running transaction pins every old version behind it, so tables and indexes bloat and vacuum falls behind.`, "vacuum");
  sys.set({ cost: "extra storage per version, visibility check per row read, vacuum", benefit: "readers never block writers or each other" });
  sys.note(`Trade-off: readers never wait and long analytical reads coexist with OLTP writes, at the price of version storage, garbage collection, and anomalies (write skew) that snapshot isolation does not prevent. Postgres, Oracle, MySQL InnoDB, CockroachDB all do this.`, "done");
  return sys.f.done();
};

const wal: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "db", label: "DB engine", kind: "service", x: 42, y: 50, state: "buffer pool: clean" },
    { id: "wal", label: "WAL (append-only)", kind: "db", x: 88, y: 15, state: "LSN 0" },
    { id: "data", label: "Data files", kind: "db", x: 88, y: 85, state: "checkpoint LSN 0" },
  ]);
  const rows: (string | number)[][] = [];
  const show = (tones?: (Tone | undefined)[]) => sys.table({ title: "Log records", head: ["LSN", "record", "on disk"], rows: rows.map((r) => [...r]), tones });
  show();
  sys.set({ rule: "log the change before touching the page", "commit = ": "log record fsynced", "pages written": "later, at checkpoint" });
  sys.note(`Write-ahead logging: before a page is modified, a record describing the change is appended to a sequential log and forced to disk. Durability comes from the log; the data files can lag behind safely.`);
  sys.msg("client", "db", "UPDATE acct 1: 100 → 50", `A transaction changes account 1.`);
  rows.push([1, "acct1: 100 → 50 (txn 7)", "no"]);
  show(["active"]);
  sys.state("wal", "LSN 1 (buffered)", "active");
  sys.msg("db", "wal", "append LSN 1", `The engine appends a log record first. The page itself is untouched so far: write-ahead.`);
  rows[0]![2] = "yes";
  show(["done"]);
  sys.state("wal", "LSN 1 (fsynced)", "done");
  sys.note(`fsync: the log record is durable. This is one sequential write at the end of a file, which even a spinning disk does at hundreds of MB/s; random page writes would be 100× slower.`, "fsync");
  sys.state("db", "page 7 dirty (in memory)", "compare");
  sys.note(`Now the page is modified in the buffer pool. On disk, the data file still says 100. That is fine: the log can rebuild the page.`, "dirty");
  sys.msg("db", "client", "COMMIT OK", `The commit is acknowledged when the log record is on disk, not when the page is. Commit latency ≈ one fsync (~0.1–1 ms on SSD).`, { tone: "done" });
  sys.msg("client", "db", "UPDATE acct 2: 0 → 50", `Second transaction.`);
  rows.push([2, "acct2: 0 → 50 (txn 8)", "yes"]);
  show([undefined, "done"]);
  sys.state("wal", "LSN 2 (fsynced)", "done");
  sys.state("db", "pages 7, 9 dirty", "compare");
  sys.msg("db", "wal", "append LSN 2 · fsync", `Logged and synced. Group commit: when many transactions commit at once, one fsync flushes all their records, so throughput scales while latency stays one fsync.`, { tone: "done" });
  sys.state("db", "CRASH (dirty pages lost)", "danger");
  sys.note(`Failure mode: power loss. The buffer pool is gone; data files say acct1 = 100 and acct2 = 0, but both commits were acknowledged. The WAL holds LSN 1 and 2.`, "crash");
  sys.state("db", "recovering", "compare");
  sys.msg("db", "wal", "read from checkpoint LSN 0", `Recovery: the engine reads the log forward from the last checkpoint.`, { tone: "compare" });
  show(["done", "done"]);
  sys.state("db", "pages 7, 9 rebuilt", "done");
  sys.msg("wal", "db", "redo LSN 1, LSN 2", `Redo: reapply every record whose LSN is newer than the page's own LSN (each page stores the LSN of its last change, so replay is idempotent). Records from transactions that never committed are undone (ARIES: redo all, then undo losers).`, { tone: "done" });
  sys.state("data", "checkpoint LSN 2", "done");
  sys.state("db", "buffer pool: clean", "visited");
  sys.msg("db", "data", "checkpoint: flush pages 7, 9", `Checkpoint: dirty pages are written to the data files and the checkpoint LSN advances. Log before it can be recycled, and recovery time is bounded by the log since the last checkpoint.`, { tone: "done" });
  sys.set({ "write amplification": "every change written twice (log, then page)", "bonus": "the log doubles as the replication and CDC stream", "fsync off": "acknowledged commits can vanish" });
  sys.note(`Trade-off: every change is written twice, but the first write is sequential and batched, and the second is deferred and coalesced. Commit latency is dominated by fsync; disabling it (or a disk that lies about fsync) means losing acknowledged commits. Postgres, InnoDB, SQLite (WAL mode), RocksDB all work this way.`, "done");
  return sys.f.done();
};

const bTreeIndex: SysGen = ({ keys }) => {
  const CAP = 4;
  const MAX_LEAVES = 5;
  const numeric = (Array.isArray(keys) ? keys : []).map(Number).filter((k) => Number.isFinite(k)).map((k) => Math.round(k));
  const inserts = keyList(numeric.map(String), ["42", "47", "12"], 5, 3).map(Number);
  const seps: number[] = [20, 40];
  const leaves: { id: string; keys: number[] }[] = [
    { id: "L1", keys: [5, 10, 15] },
    { id: "L2", keys: [20, 25, 30] },
    { id: "L3", keys: [40, 45, 50] },
  ];
  const sys = new Sys([{ id: "root", label: "root page", kind: "node", x: 50, y: 15, state: "" }, ...leaves.map((l) => ({ id: l.id, label: "leaf", kind: "db" as const, x: 0, y: 82, state: "" }))]);
  const relayout = () => {
    const xs = spread(leaves.length, 8, 92);
    leaves.forEach((l, i) => {
      const nd = sys.node(l.id);
      nd.x = xs[i];
      nd.label = `leaf ${i + 1}`;
      nd.state = l.keys.join(" ");
    });
    sys.state("root", `keys: ${seps.join(" | ")}`);
  };
  const show = (hi: string[] = [], tone: Tone = "active") =>
    sys.table({ title: `Pages (leaf capacity ${CAP}; separators route keys: child i holds sep[i-1] ≤ key < sep[i])`, head: ["page", "contents"], rows: [["root", seps.map(String).join(" | ")], ...leaves.map((l, i) => [`leaf ${i + 1}`, l.keys.join(", ")])], tones: [hi.includes("root") ? tone : undefined, ...leaves.map((l) => (hi.includes(l.id) ? tone : undefined))] });
  const childOf = (k: number) => seps.filter((s) => s <= k).length;
  relayout();
  show();
  sys.set({ height: 2, "fan-out": "hundreds per 8 KB page in practice", "page reads per lookup": "height" });
  sys.note(`A B-tree index is a balanced tree of fixed-size pages. Internal pages hold separator keys that route a lookup; leaves hold the keys (and row pointers) in sorted order. Every leaf sits at the same depth.`);
  const target = 45;
  const ci = childOf(target);
  sys.tone("root", "active");
  show(["root"]);
  sys.msg("root", leaves[ci]!.id, `${target}: ${seps.filter((s) => s <= target).map((s) => `≥ ${s}`).join(", ") || "< " + seps[0]} → child ${ci + 1}`, `Lookup ${target}: read the root, binary-search the separators (${seps.join(", ")}), follow the pointer to child ${ci + 1}. One page read.`, { tone: "compare" });
  sys.tone("root", undefined);
  sys.tone(leaves[ci]!.id, "done");
  show([leaves[ci]!.id], "done");
  sys.set({ "page reads": 2 });
  sys.note(`Read leaf ${ci + 1} and binary-search it: ${target} found. Two page reads for the whole lookup, and the root is always cached, so one disk read. With fan-out ~300, a 4-level tree indexes billions of rows.`, "found");
  sys.tone(leaves[ci]!.id, undefined);
  const lo = childOf(25);
  const hi = childOf(45);
  if (lo < hi) sys.msg(leaves[lo]!.id, leaves[hi]!.id, "sibling pointer →", `Range scan 25..45: descend once to leaf ${lo + 1}, then follow the leaf's sibling pointer to leaf ${hi + 1}. Leaves are linked, so ORDER BY and BETWEEN read sequentially without revisiting the root.`, { tone: "done" });
  else sys.note(`Range scan: descend once to the first leaf, then follow sibling pointers rightwards. Leaves are linked, so ORDER BY and BETWEEN read sequentially without revisiting the root.`, "scan");
  let skipped = false;
  for (const k of inserts) {
    if (sys.f.full) break;
    const i = childOf(k);
    const leaf = leaves[i]!;
    if (leaf.keys.includes(k)) {
      show([leaf.id], "compare");
      sys.msg("root", leaf.id, `INSERT ${k}`, `Insert ${k}: routed to leaf ${i + 1}, which already has it. Unique index: reject the duplicate; non-unique: store another pointer.`, { tone: "compare" });
      continue;
    }
    leaf.keys = [...leaf.keys, k].sort((a, b) => a - b);
    if (leaf.keys.length <= CAP) {
      relayout();
      show([leaf.id], "done");
      sys.tone(leaf.id, "done");
      sys.msg("root", leaf.id, `INSERT ${k}`, `Insert ${k}: routed to leaf ${i + 1}, which has room (${leaf.keys.length}/${CAP}). The key slides into place in the page; nothing else changes. This write goes through the WAL like any page change.`, { tone: "done" });
      sys.tone(leaf.id, undefined);
      continue;
    }
    if (leaves.length >= MAX_LEAVES) {
      leaf.keys = leaf.keys.filter((x) => x !== k);
      skipped = true;
      break;
    }
    relayout();
    sys.tone(leaf.id, "danger");
    show([leaf.id], "danger");
    sys.msg("root", leaf.id, `INSERT ${k} → overflow`, `Insert ${k}: leaf ${i + 1} would hold ${leaf.keys.length} keys, over its capacity of ${CAP}. The page must split.`, { tone: "danger" });
    const half = Math.ceil(leaf.keys.length / 2);
    const right = leaf.keys.slice(half);
    leaf.keys = leaf.keys.slice(0, half);
    const newId = `L${leaves.length + 1}`;
    leaves.splice(i + 1, 0, { id: newId, keys: right });
    sys.s.nodes.push({ id: newId, label: "leaf", kind: "db", x: 0, y: 82, state: "" });
    seps.splice(i, 0, right[0]!);
    relayout();
    sys.tone(leaf.id, "done");
    sys.tone(newId, "done");
    sys.tone("root", "active");
    show([leaf.id, newId, "root"], "done");
    sys.msg(newId, "root", `promote ${right[0]}`, `Split: half the keys move to a new leaf, and its smallest key (${right[0]}) is promoted into the parent as a separator. If the root itself overflows it splits too and the tree grows one level, from the top, which is why all leaves stay at equal depth.`, { tone: "done" });
    sys.tone(leaf.id, undefined);
    sys.tone(newId, undefined);
    sys.tone("root", undefined);
  }
  if (skipped) sys.note(`Further splits omitted to keep the diagram readable; the rule is the same at every level.`, "note");
  sys.set({ height: 2, leaves: leaves.length, "sequential keys": "append to the rightmost leaf: cheap, and the last page is hot", "random keys": "touch a random leaf: random I/O and page splits" });
  sys.note(`Failure modes: a page split is a multi-page write, so a crash mid-split needs the WAL to keep the tree consistent; random inserts fragment pages to ~70 % full; and a hot rightmost leaf (auto-increment keys) serialises inserts on one page latch.`, "caveat");
  sys.note(`Trade-off: O(log N) reads with very few page fetches, in-order scans, and in-place updates, at the cost of write amplification (a whole page per change) and random writes for random keys. LSM-trees make the opposite bet: sequential writes, more work on read.`, "done");
  return sys.f.done();
};

const lsmTree: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "wal", label: "WAL", kind: "db", x: 42, y: 12, state: "empty" },
    { id: "mem", label: "Memtable", kind: "cache", x: 42, y: 50, state: "0 / 4" },
    { id: "L0", label: "L0 SSTables", kind: "db", x: 88, y: 25, state: "0 files" },
    { id: "L1", label: "L1 (merged)", kind: "db", x: 88, y: 80, state: "0 files" },
  ]);
  const CAP = 4;
  let mem: Record<string, string> = {};
  let l0: string[][] = [];
  let l1: string[] = [];
  const fmtMem = () =>
    Object.keys(mem)
      .sort()
      .map((k) => `${k}=${mem[k]}`)
      .join(" ");
  const show = (hi?: string, tone: Tone = "active") => {
    const rows: (string | number)[][] = [["memtable (RAM, sorted)", fmtMem() || "–"], ...l0.map((f, i) => [`L0 SST-${i + 1} (immutable)`, f.join(" ")]), ["L1 (merged, non-overlapping)", l1.join(" ") || "–"]];
    sys.table({ title: "Levels (⊥ = tombstone)", head: ["component", "sorted contents"], rows, tones: rows.map((r) => (String(r[0]).startsWith(hi ?? "\u0000") ? tone : undefined)) });
    sys.state("mem", `${Object.keys(mem).length} / ${CAP}`);
    sys.state("L0", `${l0.length} file${l0.length === 1 ? "" : "s"}`);
    sys.state("L1", l1.length ? "1 file" : "0 files");
  };
  show();
  sys.set({ "write path": "WAL append + memtable insert", "read path": "memtable → L0 (newest first) → L1", "memtable flush at": `${CAP} entries` });
  sys.note(`LSM-tree (log-structured merge): writes go to an in-memory sorted table and are flushed as immutable sorted files, which are later merged. Every disk write is sequential; reads may have to look in several places.`);
  mem = { a: "1", b: "2" };
  show("memtable");
  sys.state("wal", "2 records", "active");
  sys.msg("client", "mem", "put a=1, put b=2", `Each put is appended to the WAL (crash safety) and inserted into the memtable, a sorted in-memory structure (skip list or red-black tree). Sub-millisecond, no disk seeks.`);
  mem = { a: "4", b: "2", c: "3" };
  show("memtable");
  sys.state("wal", "4 records", "active");
  sys.msg("client", "mem", "put c=3, put a=4", `Overwriting a in the memtable just replaces the in-memory value; the WAL still has both records.`);
  mem = { a: "4", b: "2", c: "3", d: "5" };
  show("memtable", "danger");
  sys.state("mem", `${CAP} / ${CAP} FULL`, "danger");
  sys.msg("client", "mem", "put d=5", `The memtable reaches its size limit.`);
  l0 = [["a=4", "b=2", "c=3", "d=5"]];
  mem = {};
  show("L0 SST-1", "done");
  sys.state("wal", "truncated", "visited");
  sys.state("mem", "0 / 4 (fresh)");
  sys.msg("mem", "L0", "flush → SST-1", `Flush: the memtable is written as one sorted, immutable SSTable with a sparse index and a Bloom filter, in a single sequential write. The WAL segment can now be dropped; a fresh memtable takes new writes.`, { tone: "done" });
  mem = { b: "9", c: "⊥" };
  show("memtable");
  sys.state("wal", "2 records", "active");
  sys.msg("client", "mem", "put b=9, delete c", `Updates never touch SST-1 (it is immutable). A delete writes a tombstone (⊥) for c: the real removal happens at compaction.`);
  sys.msg("client", "mem", "get c → ⊥ → not found", `Read c: the memtable is checked first and holds the tombstone, so the answer is "not found" even though SST-1 still contains c=3. Newest level wins.`, { tone: "compare" });
  show("L0 SST-1", "done");
  sys.msg("client", "L0", "get a → miss memtable → SST-1 → a=4", `Read a: not in the memtable; SST-1's Bloom filter says "maybe", its index points to the block, one disk read returns a=4. Bloom filters let a read skip files that cannot hold the key.`, { tone: "done" });
  mem = { b: "9", c: "⊥", e: "6", f: "7" };
  l0 = [["a=4", "b=2", "c=3", "d=5"], ["b=9", "c=⊥", "e=6", "f=7"]];
  mem = {};
  show("L0 SST-2", "done");
  sys.state("wal", "truncated", "visited");
  sys.msg("mem", "L0", "flush → SST-2", `Two more puts fill the memtable and it flushes as SST-2. L0 files overlap in key range (both hold b and c), so a read for b must check SST-2 before SST-1: read amplification grows with every flush.`, { tone: "done" });
  l1 = ["a=4", "b=9", "d=5", "e=6", "f=7"];
  l0 = [];
  show("L1", "done");
  sys.msg("L0", "L1", "compact SST-1 + SST-2 → L1", `Compaction: a background merge-sort of the two files into one non-overlapping L1 file. Newer values win (b=9), and the tombstone for c drops both c=3 and itself since nothing older remains.`, { tone: "done" });
  sys.msg("client", "L1", "get b → L1 → b=9", `Read b now: memtable empty, L0 empty, one L1 file. Compaction pays a write cost now to make every later read cheaper.`, { tone: "done" });
  sys.set({ "write amplification": "each byte rewritten once per level (≈10× per level with size-tiered ratios)", "read amplification": "one lookup per overlapping file, cut by Bloom filters", "space amplification": "old versions live until compacted" });
  sys.note(`Failure modes: compaction competes with foreground I/O and can fall behind, and then write stalls kick in as L0 piles up; tombstones must survive until they reach the bottom level or deleted keys resurrect; a burst of writes to the same key wastes space until compaction.`, "caveat");
  sys.note(`Trade-off: sequential writes and excellent write throughput and compression (no in-place updates, no fragmentation), at the cost of slower point reads and range scans and background compaction that must be tuned. The B-tree makes the opposite bet. RocksDB, LevelDB, Cassandra, HBase, and most modern KV stores are LSM-based.`, "done");
  return sys.f.done();
};

const bloomFilter: SysGen = ({ keys }) => {
  const M = 16;
  const K = 3;
  const keyIds = keyList(keys, ["evt-1", "evt-2", "evt-3"], 4);
  const bits = Array.from({ length: M }, () => 0);
  const hashes = (k: string) => Array.from({ length: K }, (_, i) => fnv(`${i}:${k}`) % M);
  const sys = new Sys([
    { id: "app", label: "App", kind: "service", x: 8, y: 50 },
    { id: "bloom", label: "Bloom filter", kind: "cache", x: 50, y: 50, state: `${M} bits · k=${K}` },
    { id: "disk", label: "SSTable / DB", kind: "db", x: 92, y: 50, state: "disk reads: 0" },
  ]);
  let diskReads = 0;
  const show = (hi: number[] = [], tone: Tone = "active") =>
    sys.table({ title: `Bit array (m = ${M}), k = ${K} hash functions`, head: ["bit", ...bits.map((_, i) => String(i))], rows: [["value", ...bits.map((b, i) => (hi.includes(i) ? `[${b}]` : String(b)))]], tones: [hi.length ? tone : undefined] });
  const fpRate = (n: number) => Math.pow(1 - Math.exp((-K * n) / M), K);
  show();
  sys.set({ m: M, k: K, "keys added": 0, "false-positive rate": "0 %" });
  sys.note(`A Bloom filter answers "have I seen this key?" with a bit array and k hash functions. It can say "definitely not" or "probably yes", never "definitely yes", and it never forgets a key it was given.`);
  keyIds.forEach((k, idx) => {
    const hs = hashes(k);
    for (const h of hs) bits[h] = 1;
    show(hs, "done");
    sys.state("bloom", `${keyIds.slice(0, idx + 1).length} keys · ${bits.filter(Boolean).length}/${M} bits set`, "done");
    sys.set({ "keys added": idx + 1, "false-positive rate": `${(100 * fpRate(idx + 1)).toFixed(1)} %` });
    sys.msg("app", "bloom", `add ${k}`, `add("${k}"): h1=${hs[0]}, h2=${hs[1]}, h3=${hs[2]} → set bits ${[...new Set(hs)].join(", ")}. Bits already set stay set; the array never shrinks.`, { tone: "done" });
  });
  const present = keyIds[0]!;
  const hp = hashes(present);
  show(hp, "active");
  sys.msg("app", "bloom", `contains ${present}?`, `Query "${present}": check bits ${[...new Set(hp)].join(", ")}.`, { tone: "compare" });
  sys.msg("bloom", "app", "all set → probably yes", `All ${K} bits are 1, so the answer is "probably present". The filter can never miss a key it holds: no false negatives.`, { tone: "compare" });
  diskReads++;
  sys.state("disk", `disk reads: ${diskReads}`, "visited");
  sys.msg("app", "disk", `read ${present} → found`, `Only now does the app pay for the disk read, and it finds the key.`, { tone: "done" });
  const candidates = Array.from({ length: 400 }, (_, i) => `evt-${i + 100}`).filter((c) => !keyIds.includes(c));
  const absent = candidates.find((c) => hashes(c).some((h) => bits[h] === 0));
  const fp = candidates.find((c) => hashes(c).every((h) => bits[h] === 1));
  if (absent) {
    const ha = hashes(absent);
    const zero = ha.find((h) => bits[h] === 0)!;
    show(ha, "danger");
    sys.msg("app", "bloom", `contains ${absent}?`, `Query "${absent}": bits ${[...new Set(ha)].join(", ")}.`, { tone: "compare" });
    sys.msg("bloom", "app", `bit ${zero} = 0 → definitely no`, `Bit ${zero} is 0, so "${absent}" was never added: definitely absent. The disk read is skipped entirely. This is the win: most lookups for missing keys cost zero I/O.`, { tone: "done" });
  }
  if (fp) {
    const hf = hashes(fp);
    show(hf, "danger");
    sys.msg("app", "bloom", `contains ${fp}?`, `Query "${fp}", which was never added: bits ${[...new Set(hf)].join(", ")}.`, { tone: "compare" });
    diskReads++;
    sys.state("disk", `disk reads: ${diskReads}`, "danger");
    sys.msg("bloom", "app", "all set → probably yes", `All its bits happen to have been set by other keys: a false positive. The app reads the disk and finds nothing. Harmless for correctness, but it is the cost you tune away.`, { tone: "danger" });
  } else {
    sys.note(`With only ${keyIds.length} keys in ${M} bits, no false positive appears among 400 probes; as the array fills, some absent key will hash entirely onto set bits.`, "fp");
  }
  sys.set({ "false-positive rate": `${(100 * fpRate(keyIds.length)).toFixed(1)} % ≈ (1 − e^(−kn/m))^k`, "sizing rule": "~10 bits per key with k ≈ 7 gives ≈ 1 %", "delete": "impossible (a bit may be shared); use a counting Bloom filter or rebuild" });
  sys.note(`Failure mode: you cannot delete: clearing a bit might erase another key's evidence and create a false negative. Counting Bloom filters (a small counter per bit) or periodic rebuilds handle churn. And the rate climbs as the filter fills: size it for the final key count.`, "caveat");
  sys.note(`Trade-off: a few bits per key in memory buys "definitely not here" for the vast majority of misses, at the cost of a tunable false-positive rate and no deletes. LSM stores check a Bloom filter before every SSTable read; CDNs, browsers (safe-browsing), and databases (semi-joins) use them the same way.`, "done");
  return sys.f.done();
};

// ---------- exports ----------

export const scenariosA: Record<string, SysGen> = {
  "cache-aside": cacheAside,
  "write-through": writeThrough,
  "write-behind": writeBehind,
  "cache-stampede": cacheStampede,
  "sharding-range": shardingRange,
  "sharding-hash": shardingHash,
  "replication-leader-follower": replicationLeaderFollower,
  "replication-multi-leader": replicationMultiLeader,
  quorum: quorumScenario,
  "raft-log-replication": raftLogReplication,
  "two-phase-commit": twoPhaseCommit,
  saga,
  outbox,
  "idempotency-key": idempotencyKey,
  "lamport-clock": lamportClock,
  "vector-clock": vectorClock,
  gossip,
  "distributed-lock": distributedLock,
  "leader-lease": leaderLease,
  "crdt-counter": crdtCounter,
  mvcc,
  wal,
  "b-tree-index": bTreeIndex,
  "lsm-tree": lsmTree,
  "bloom-filter": bloomFilter,
};

export const labelsA: Record<string, string> = {
  "cache-aside": "Cache-aside (lazy loading)",
  "write-through": "Write-through cache",
  "write-behind": "Write-behind cache",
  "cache-stampede": "Cache stampede and single-flight",
  "sharding-range": "Range sharding and the hot tail",
  "sharding-hash": "Hash sharding",
  "replication-leader-follower": "Leader-follower replication",
  "replication-multi-leader": "Multi-leader replication and conflicts",
  quorum: "Quorum reads and writes (W + R > N)",
  "raft-log-replication": "Raft log replication",
  "two-phase-commit": "Two-phase commit",
  saga: "Saga with compensations",
  outbox: "Transactional outbox",
  "idempotency-key": "Idempotency keys",
  "lamport-clock": "Lamport clocks",
  "vector-clock": "Vector clocks",
  gossip: "Gossip protocol",
  "distributed-lock": "Distributed lock and fencing tokens",
  "leader-lease": "Leader lease",
  "crdt-counter": "CRDT counter (G-Counter)",
  mvcc: "MVCC snapshot isolation",
  wal: "Write-ahead log and recovery",
  "b-tree-index": "B-tree index lookup and split",
  "lsm-tree": "LSM-tree writes, flush and compaction",
  "bloom-filter": "Bloom filter",
};
