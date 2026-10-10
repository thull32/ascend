// Scenario pack A for the `system` family: caching, sharding, replication,
// quorums and consensus, distributed transactions, logical time,
// coordination, and storage engines. Each scenario is a script over the
// `Sys` DSL in system-core.tsx; the renderer is shared.
//
// Inputs: every scenario accepts `{}`. Where the catalogue lists `nodes`,
// `replicas`, `keys` or `requests`, the scenario clamps them to a range that
// still fits in a readable diagram (and well under MAX_FRAMES).
import type { Tone } from "../primitives";
import { Sys, type SysGen, type SysNode, type SystemInput } from "./system-core";

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

/** A label used mid-sentence: proper names (Kafka, Postgres, PSP) keep their capitals, ordinary nouns are lowercased. */
const lc = (s: string): string => (/^[A-Z][A-Z0-9]/.test(s) || /^(Kafka|Postgres|Redis|Jaeger|Ascend|Cassandra|MongoDB)\b/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** "the card processor" but "Kafka": a label with its article, for mid-sentence use. */
const the = (s: string): string => (lc(s) === s && !/^[a-z]/.test(s) ? s : `the ${lc(s)}`);
/** "a" or "an" before a word. */
const an = (w: string): string => (/^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`);

/** A short author-supplied label, or the default. */
const label = (v: unknown, def: string): string => (typeof v === "string" && v.trim() ? v.trim() : def);

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
  sys.set({ pattern: "write-through", "write latency": "cache + DB (synchronous)" });
  sys.note(`Write-through: every write goes to the cache, and the cache synchronously writes it to the database before acknowledging. A read after a write through the cache finds the new value.`);
  sys.msg("app", "cache", "SET price:7 = 12", `The app writes to the cache; the cache is the front door of the write path.`);
  sys.state("cache", "price:7 = 12 (pending)", "compare");
  sys.msg("cache", "db", "UPDATE price:7 = 12", `The cache forwards the write to the database and waits for it. This synchronous hop is what makes it "through".`);
  sys.state("db", "price:7 = 12", "done");
  sys.msg("db", "cache", "OK (committed)", `The database commits the row.`, { tone: "done" });
  sys.state("cache", "price:7 = 12", "done");
  sys.msg("cache", "app", "OK", `Only now is the app acknowledged, so any subsequent read sees 12. Latency is cache write + DB write (~6 ms instead of ~1 ms).`, { tone: "done" });
  sys.msg("app", "cache", "GET price:7 → 12", `A read hits the cache and gets 12: there is no invalidation step to forget. That holds as long as every write goes through the cache, one at a time per key.`, { tone: "done" });
  sys.state("cache", "price:7 = 13", "compare");
  sys.msg("app", "cache", "writer A: SET 13", `Two writers, no per-key serialisation. Writer A sets 13 in the cache…`);
  sys.state("cache", "price:7 = 14", "compare");
  sys.msg("app", "cache", "writer B: SET 14", `…writer B sets 14 right after it…`);
  sys.state("db", "price:7 = 14", "compare");
  sys.msg("cache", "db", "writer B: UPDATE 14", `…B's database write lands first…`, { tone: "compare" });
  sys.state("db", "price:7 = 13", "danger");
  sys.state("cache", "price:7 = 14 (DB says 13)", "danger");
  sys.set({ "two writers": "cache 14, database 13" });
  sys.msg("cache", "db", "writer A: UPDATE 13", `…and A's lands last. The cache says 14, the database says 13, and they stay that way until the next write or eviction. The two stores applied the same writes in different orders. Fix: serialise writes per key (a version check or a per-key lock), so both stores see one order.`, { tone: "danger" });
  sys.state("cache", "price:7 = 14", "done");
  sys.state("db", "price:7 = 14", "done");
  sys.set({ "two writers": "serialise per key" });
  sys.state("db", "DOWN", "danger");
  sys.msg("app", "cache", "SET price:7 = 15", `Failure mode 2: with writes serialised and both stores back at 14, the database becomes unavailable when a write arrives.`);
  sys.msg("cache", "db", "UPDATE price:7 = 15", `The cache cannot complete the synchronous write…`, { tone: "danger", dashed: true });
  sys.msg("cache", "app", "ERROR (DB unavailable)", `…so the write fails and the cache keeps 14. Writes are exactly as available as the database, never more.`, { tone: "danger" });
  sys.state("db", "price:7 = 14", "visited");
  sys.set({ "cache pollution": "every written key is cached, read or not", "pairs well with": "read-through, TTL to evict cold keys" });
  sys.note(`Trade-off: simple reads that are fresh after a write, but higher write latency, writes that need per-key ordering, and cache pollution from keys nobody reads. Compare write-behind, which trades durability for write speed.`, "done");
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

const RANGE_KEYS = ["alice", "bob", "hank", "judy", "mia", "peggy", "trent", "zoe", "carol", "grace", "oscar", "victor"];

/** Range sharding. `keys: 12` (a count) routes that many names. */
const shardingRange: SysGen = ({ nodes, keys, keyCount }) => {
  const n = clampInt(nodes, 2, 4, 3);
  const keyIds = Array.isArray(keys) && keys.length ? keyList(keys, RANGE_KEYS, 8, 4) : RANGE_KEYS.slice(0, clampInt(keyCount, 4, 12, 4));
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
    held[i]!.sort();
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

// Chosen so the first six split 2/2/2 and all twelve 4/4/4 across three shards.
const HASH_KEYS = ["alice", "bob", "dave", "erin", "ivan", "judy", "mallory", "mia", "olivia", "peggy", "trent", "walter"];

/**
 * Hash sharding (hash mod N). `keys: 12` (a count) picks that many names.
 * `variant: "fixed"` shows a fixed partition count assigned to nodes by a
 * table; `variant: "shuffle"` is a Spark shuffle with one hot key.
 */
const shardingHash: SysGen = (input) => {
  if (input.variant === "fixed") return fixedPartitions(input);
  if (input.variant === "shuffle") return shuffleSkew(input);
  const { nodes, keys } = input;
  const n = clampInt(nodes, 2, 4, 3);
  const count = clampInt(input.keyCount, 4, 12, 6);
  const keyIds = Array.isArray(keys) && keys.length ? keyList(keys, HASH_KEYS, 8, 4) : HASH_KEYS.slice(0, count);
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
  const spreadNote = Math.max(...counts) - Math.min(...counts) <= 1 ? `as even as ${keyIds.length} keys over ${n} shards can be` : `uneven, because ${keyIds.length} keys is a tiny sample and a hash scatters them at random; over millions of keys each shard's share comes within a fraction of a percent of 1/${n}`;
  sys.note(`After ${keyIds.length} keys the shards hold ${counts.join(" / ")}: ${spreadNote}. Sequential keys (order 3001, 3002, …) would scatter just the same, so there is no hot tail.`, "balance");
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

/** Fixed partitions: hash(key) mod P picks one of P partitions forever; a table maps partitions to nodes. */
const fixedPartitions = (input: SystemInput) => {
  const n = clampInt(input.nodes, 2, 4, 3);
  const P = clampInt(input.partitions, n + 1, 16, 12);
  const keyIds = Array.isArray(input.keys) && input.keys.length ? keyList(input.keys, HASH_KEYS, 12, 4) : HASH_KEYS.slice(0, clampInt(input.keyCount, 4, 12, 12));
  const nodeId = (i: number) => `N${i + 1}`;
  const xs = spread(n + 1, 30, 95);
  const sys = new Sys([{ id: "router", label: "Router", kind: "lb", x: 6, y: 50 }, ...Array.from({ length: n }, (_, i) => ({ id: nodeId(i), kind: "db" as const, x: xs[i], y: 50 }))]);
  const part = (k: string) => fnv(k) % P;
  const owner: number[] = Array.from({ length: P }, (_, p) => p % n);
  const placed: string[] = [];
  const show = (hiParts: number[] = [], tone: Tone = "active") =>
    sys.table({ title: `Partition table: partition = hash(key) mod ${P}, fixed forever`, head: ["partition", "node", "keys"], rows: owner.map((o, p) => [`p${p}`, nodeId(o), keyIds.filter((k) => part(k) === p && placed.includes(k)).join(", ") || "–"]), tones: owner.map((_, p) => (hiParts.includes(p) ? tone : undefined)) });
  const sync = (m: number) => {
    for (let i = 0; i < m; i++) sys.state(nodeId(i), `${owner.filter((o) => o === i).length} partitions`);
  };
  sync(n);
  show();
  sys.set({ partitions: P, nodes: n, rule: `partition = hash(key) mod ${P}; node = table[partition]` });
  sys.note(`Fixed partitions: choose a partition count P = ${P}, far more than the ${n} nodes, once. A key's partition is hash(key) mod ${P} and never changes; a table assigns partitions to nodes, ${P / n === Math.floor(P / n) ? P / n : "a few"} each.`);
  const batch = Math.ceil(keyIds.length / 3);
  for (let b = 0; b < keyIds.length; b += batch) {
    const ks = keyIds.slice(b, b + batch);
    placed.push(...ks);
    const ps = [...new Set(ks.map(part))];
    show(ps);
    sys.s.messages = ks.map((k) => ({ from: "router", to: nodeId(owner[part(k)]!), label: `${k} → p${part(k)}`, tone: "active" as Tone }));
    sys.s.log = [...sys.s.log.slice(-4), ks.map((k) => `${k} → p${part(k)} → ${nodeId(owner[part(k)]!)}`).join(", ")];
    sys.f.push(`${ks.map((k) => `${k} hashes to p${part(k)}`).join(", ")}. The router looks each partition up in the table to find its node.`, "place");
  }
  const added = n;
  sys.s.nodes.push({ id: nodeId(added), label: nodeId(added), kind: "db", x: xs[added], y: 50, tone: "done" });
  const target = Math.floor(P / (n + 1));
  const moving: number[] = [];
  for (let p = 0; moving.length < target && p < P; p++) {
    const counts = Array.from({ length: n }, (_, i) => owner.filter((o) => o === i).length - moving.filter((q) => owner[q] === i).length);
    const donor = counts.indexOf(Math.max(...counts));
    const q = owner.findIndex((o, idx) => o === donor && !moving.includes(idx));
    if (q >= 0) moving.push(q);
  }
  const from = moving.map((p) => nodeId(owner[p]!));
  moving.forEach((p) => (owner[p] = added));
  sync(n + 1);
  show(moving, "done");
  const movedKeys = keyIds.filter((k) => moving.includes(part(k)));
  sys.s.messages = moving.map((p, i) => ({ from: from[i]!, to: nodeId(added), label: `copy p${p}`, tone: "done" as Tone }));
  sys.s.log = [...sys.s.log.slice(-4), moving.map((p, i) => `p${p}: ${from[i]} → ${nodeId(added)}`).join(", ")];
  const modMoved = keyIds.filter((k) => fnv(k) % n !== fnv(k) % (n + 1)).length;
  sys.set({ "partitions moved": `${moving.length} / ${P}`, "keys moved": `${movedKeys.length} / ${keyIds.length} (with their partitions)`, [`hash mod ${n} → mod ${n + 1} would move`]: `${modMoved} / ${keyIds.length}` });
  sys.f.push(`${nodeId(added)} joins. The table hands it ${moving.length} whole partitions, ${moving.map((p, i) => `p${p} from ${from[i]}`).join(", ")}, so every node holds ${P / (n + 1) === Math.floor(P / (n + 1)) ? P / (n + 1) : "about the same number"}. The keys in them (${movedKeys.join(", ") || "none here"}) move with their partition; no key changes partition and nothing is rehashed.`, "add node");
  sys.note(`Compare hash mod N over nodes: going from ${n} to ${n + 1} nodes would send ${modMoved} of these ${keyIds.length} keys somewhere new, one by one. Here the movement is a few whole-partition copies, and the only metadata change is ${moving.length} table entries.`, "compare");
  sys.note(`The catch: P is fixed at creation. Too few and you cannot grow past P nodes or split a hot partition; too many and each costs files, memory and a leader election. Kafka topics, Elasticsearch indices and Redis Cluster's 16,384 hash slots all work this way.`, "done");
  return sys.f.done();
};

/** A Spark shuffle: map tasks send each row to partition hash(key) mod n; one hot key makes one task the straggler. */
const shuffleSkew = (input: SystemInput) => {
  const n = clampInt(input.nodes, 2, 4, 3);
  const pool = Array.from({ length: 60 }, (_, i) => `t${(i * 37 + 17) % 997}`);
  const per = Array.from({ length: n }, () => 0);
  const keysChosen: string[] = [];
  for (const k of pool) {
    const b = fnv(k) % n;
    if (per[b]! < 2) {
      keysChosen.push(k);
      per[b]!++;
    }
    if (keysChosen.length === 2 * n) break;
  }
  const hot = keysChosen[0]!;
  const rowsOf = (k: string) => (k === hot ? 36 : 4);
  const total = keysChosen.reduce((a, k) => a + rowsOf(k), 0);
  const pid = (i: number) => `P${i}`;
  const ys = spread(n, 12, 88);
  const sys = new Sys([
    { id: "M1", label: "Map task 1", kind: "service", x: 8, y: 25 },
    { id: "M2", label: "Map task 2", kind: "service", x: 8, y: 75 },
    ...Array.from({ length: n }, (_, i) => ({ id: pid(i), label: `Reduce ${pid(i)}`, kind: "service" as const, x: 85, y: ys[i], state: "0 rows" })),
  ]);
  const got: string[] = [];
  const show = (tones?: (Tone | undefined)[]) =>
    sys.table({ title: `Shuffle: partition = hash(key) mod ${n}`, head: ["partition", "keys", "rows"], rows: Array.from({ length: n }, (_, i) => { const ks = keysChosen.filter((k) => fnv(k) % n === i && got.includes(k)); return [pid(i), ks.join(", ") || "–", ks.reduce((a, k) => a + rowsOf(k), 0)]; }), tones });
  show();
  sys.set({ "distinct keys": keysChosen.length, rows: total, [`rows for ${hot}`]: rowsOf(hot) });
  sys.note(`A shuffle: every map task sends each row to reduce partition hash(key) mod ${n}, so all rows with one key meet in one task. Here ${keysChosen.length} title IDs, one of them (${hot}) a new hit with ${rowsOf(hot)} of the ${total} rows.`);
  const half = keysChosen.slice(0, n);
  const rest = keysChosen.slice(n);
  for (const [m, ks] of [["M1", half], ["M2", rest]] as const) {
    got.push(...ks);
    for (let i = 0; i < n; i++) sys.state(pid(i), `${keysChosen.filter((k) => fnv(k) % n === i && got.includes(k)).reduce((a, k) => a + rowsOf(k), 0)} rows`);
    show();
    sys.s.messages = ks.map((k) => ({ from: m, to: pid(fnv(k) % n), label: `${k} × ${rowsOf(k)}`, tone: (k === hot ? "danger" : "active") as Tone }));
    sys.s.log = [...sys.s.log.slice(-4), ks.map((k) => `${k} → ${pid(fnv(k) % n)}`).join(", ")];
    sys.f.push(`${m === "M1" ? "Map task 1" : "Map task 2"} hashes each row's key: ${ks.map((k) => `${k} → ${pid(fnv(k) % n)}`).join(", ")}.`, "shuffle");
  }
  const rows = Array.from({ length: n }, (_, i) => keysChosen.filter((k) => fnv(k) % n === i).reduce((a, k) => a + rowsOf(k), 0));
  const hotP = fnv(hot) % n;
  show(rows.map((_, i) => (i === hotP ? "danger" : undefined)));
  sys.state(pid(hotP), `${rows[hotP]} rows · straggler`, "danger");
  sys.note(`Keys spread perfectly: two per partition. Rows do not: ${pid(hotP)} has ${rows[hotP]} rows against ${rows.filter((_, i) => i !== hotP).join(" and ")}, because hashing can place a key but cannot split one. The stage finishes only when its slowest task does.`, "skew");
  const m = n + 1;
  const moved = keysChosen.filter((k) => fnv(k) % n !== fnv(k) % m).length;
  sys.set({ [`partitions ${n} → ${m}`]: `${moved} of ${keysChosen.length} keys change partition` });
  sys.note(`More partitions do not help the hot key, and changing the count from ${n} to ${m} sends ${moved} of the ${keysChosen.length} keys to a different partition: the whole shuffle is redone.`, "repartition");
  sys.note(`Fixes split the key, not the hash: salt the hot key into sub-keys and combine afterwards, let adaptive query execution split the skewed partition, or broadcast the small side of a join so the big side never shuffles.`, "done");
  return sys.f.done();
};

// ---------- replication ----------

/**
 * Leader-follower replication. `mode: "async"` keeps the whole story
 * asynchronous (the failover then loses an acknowledged write); the default
 * also shows a synchronous follower. `leader`, `follower`, `log` relabel it
 * (e.g. Primary / Secondary / oplog) and `pull: true` has followers pull the
 * log. `variant: "kafka"` traces acks=1 versus acks=all with the ISR and high
 * watermark; `variant: "zones"` is a cache shard with a warm copy per zone.
 */
const replicationLeaderFollower: SysGen = (input) => {
  if (input.variant === "kafka") return kafkaAcks();
  if (input.variant === "zones") return cacheZones();
  const asyncOnly = input.mode === "async";
  const r = clampInt(input.replicas, 1, 3, 2);
  const L = label(input.leader, "Leader");
  const Fl = label(input.follower, "Follower");
  const log = label(input.log, "WAL");
  const pull = input.pull === true;
  const followers = Array.from({ length: r }, (_, i) => `F${i + 1}`);
  const ys = spread(r, 15, 85);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "L", label: L, kind: "db", x: 45, y: 50, state: "x=1 · LSN 7", tone: "active" },
    ...followers.map((id, i) => ({ id, label: `${Fl} ${i + 1}`, kind: "db" as const, x: 90, y: ys[i], state: "x=1 · LSN 7 · lag 0" })),
  ]);
  const f1 = followers[0]!;
  const f1Name = `${Fl.toLowerCase()} 1`;
  const F1 = `${Fl} 1`;
  const fs = Fl.toLowerCase().endsWith("y") ? `${Fl.toLowerCase().slice(0, -1)}ies` : `${Fl.toLowerCase()}s`;
  const lw = L.toLowerCase();
  sys.set({ mode: "asynchronous", "write path": `${lw} only`, "read path": `${lw} or any ${Fl.toLowerCase()}` });
  sys.note(`${L}-${Fl.toLowerCase()} replication: one node accepts writes and records them in its ${log}; ${r} ${r > 1 ? fs : Fl.toLowerCase()} ${pull ? "pull" : "receive"} that log and apply it in order. ${fs.charAt(0).toUpperCase() + fs.slice(1)} serve reads and stand by for failover.`);
  sys.state("L", "x=2 · LSN 8", "active");
  sys.msg("client", "L", "WRITE x=2", `All writes go to the ${lw}, which appends the change to its ${log} (LSN 8) and applies it locally.`);
  sys.msg("L", "client", "ACK (async)", `Asynchronous mode: the ${lw} acknowledges as soon as its own log is durable, before any ${Fl.toLowerCase()} has the change.`, { tone: "done" });
  sys.fanout("L", followers, `${log} LSN 8`, pull ? `The ${fs} fetch LSN 8 from the ${lw}'s ${log}. On a good day this takes milliseconds; under load or across regions it can be seconds.` : `The ${lw} streams LSN 8 to the ${fs}. On a good day this takes a few milliseconds; under load or across regions it can be seconds.`);
  followers.forEach((f) => sys.state(f, "x=1 · LSN 7 · lag 1", "compare"));
  sys.msg("client", f1, "READ x", `Reads are scaled out to a ${Fl.toLowerCase()}, but ${f1Name} has not applied LSN 8 yet.`, { tone: "compare" });
  sys.state(f1, "x=1 · lag 1 (stale)", "danger");
  sys.msg(f1, "client", "x=1 (stale)", `Replication lag: the client just wrote 2 and reads 1. Its own write seems to have vanished (read-your-writes violated).`, { tone: "danger" });
  followers.forEach((f) => sys.state(f, "x=2 · LSN 8 · lag 0", "done"));
  sys.note(`A few milliseconds later the ${fs} apply LSN 8 and catch up. The system is eventually consistent: the lag window is real but usually short.`, "catch-up");
  sys.set({ "read-your-writes": `route the writer's reads to the ${lw} for a few seconds, or send the LSN and let the ${Fl.toLowerCase()} wait until it has applied it` });
  sys.note(`Fix for the lag window: read-your-writes routing (recent writers read from the ${lw}), or ask the ${Fl.toLowerCase()} to wait until its applied LSN ≥ the client's last write.`, "fix");
  if (asyncOnly) {
    sys.state("L", "x=3 · LSN 9", "active");
    sys.msg("client", "L", "WRITE x=3", `Another write: the ${lw} logs LSN 9 and acknowledges at once, still asynchronous.`);
    sys.msg("L", "client", "ACK (async)", `The client is told x=3 is saved. No ${Fl.toLowerCase()} has LSN 9 yet.`, { tone: "done" });
    sys.state("L", "DOWN", "danger");
    sys.note(`Failover: the ${lw} dies before LSN 9 leaves it. Someone (a coordinator, or the nodes via consensus) must promote the most up-to-date ${Fl.toLowerCase()} and repoint clients.`, "failover");
    sys.state(f1, `${L.toUpperCase()} · LSN 8 · x=2`, "active");
    followers.slice(1).forEach((f) => sys.state(f, `follows ${f1Name}`, "visited"));
    sys.set({ "lost on failover": "LSN 9 (x=3): acknowledged, never shipped", "split brain": `fence the old ${lw} before promoting` });
    sys.msg("client", f1, "READ x → 2", `${F1} is promoted at LSN 8, so x is 2: the acknowledged write x=3 is gone. That window is the price of asynchronous replication. If the old ${lw} comes back believing it still leads, fence it first.`, { tone: "danger" });
    sys.note(`Trade-off: asynchronous replication keeps writes fast and tolerates slow ${fs}, at the cost of a lag window for reads and of acknowledged writes lost on failover. Reads scale out; writes do not.`, "done");
    return sys.f.done();
  }
  sys.set({ mode: `synchronous (1 sync ${Fl.toLowerCase()})` });
  sys.state(f1, "x=2 · sync", "done");
  sys.note(`Synchronous mode: the ${lw} waits for ${f1Name} to confirm each write before acknowledging. Usually only one ${Fl.toLowerCase()} is synchronous, so a slow ${Fl.toLowerCase()} cannot stall every write.`, "mode");
  sys.state("L", "x=3 · LSN 9", "active");
  sys.msg("client", "L", "WRITE x=3", `Write arrives; the ${lw} logs LSN 9.`);
  sys.fanout("L", followers, `${log} LSN 9`, `LSN 9 goes out and the ${lw} waits for the synchronous ${Fl.toLowerCase()}.`);
  sys.state(f1, "x=3 · LSN 9 · sync", "done");
  sys.msg(f1, "L", "ACK LSN 9", `${F1} has LSN 9 durably on disk.`, { tone: "done" });
  sys.msg("L", "client", "ACK (sync)", `Now the client hears OK only after the write exists on two nodes. Latency is the ${lw}'s fsync plus one round trip to ${f1Name}.`, { tone: "done" });
  sys.state("L", "DOWN", "danger");
  sys.note(`Failover: the ${lw} dies. Someone (a coordinator, or the nodes via consensus) must pick the most up-to-date ${Fl.toLowerCase()}, promote it, and repoint clients.`, "failover");
  sys.state(f1, `${L.toUpperCase()} · LSN 9`, "active");
  followers.slice(1).forEach((f) => sys.state(f, `follows ${f1Name}`, "visited"));
  sys.set({ "lost on failover": "async: writes acked but not yet shipped; sync: none", "split brain": `fence the old ${lw} before promoting` });
  sys.note(`${F1} is promoted. With async replication, any writes the old ${lw} acknowledged but had not shipped are lost; with sync they are safe. If the old ${lw} comes back believing it still leads, two nodes accept writes: fence it first.`, "promote");
  sys.note(`Trade-off: async gives low write latency and tolerates slow ${fs} but can lose acknowledged writes; sync guarantees durability on a second node at the cost of latency and availability whenever that ${Fl.toLowerCase()} is slow. Reads scale out, writes do not.`, "done");
  return sys.f.done();
};

/** Kafka: followers fetch; acks=1 versus acks=all with min.insync.replicas=2; consumers read below the high watermark. */
const kafkaAcks = () => {
  const sys = new Sys([
    { id: "prod", label: "Producer", kind: "client", x: 6, y: 30 },
    { id: "cons", label: "Consumer", kind: "client", x: 6, y: 85 },
    { id: "L", label: "Leader (B1)", kind: "queue", x: 46, y: 50, state: "LEO 100 · HW 100", tone: "active" },
    { id: "F1", label: "Follower (B2)", kind: "queue", x: 90, y: 18, state: "LEO 100" },
    { id: "F2", label: "Follower (B3)", kind: "queue", x: 90, y: 82, state: "LEO 100" },
  ]);
  const leo: Record<string, number> = { L: 100, F1: 100, F2: 100 };
  let hw = 100;
  let isr = ["L", "F1", "F2"];
  const show = (hi: string[] = [], tone: Tone = "active") =>
    sys.table({ title: "Partition 7, replication factor 3 (LEO = log end offset)", head: ["replica", "LEO", "in ISR"], rows: (["L", "F1", "F2"] as const).map((r) => [r === "L" ? "leader B1" : r === "F1" ? "follower B2" : "follower B3", leo[r]!, isr.includes(r) ? "yes" : "no"]), tones: (["L", "F1", "F2"] as const).map((r) => (hi.includes(r) ? tone : undefined)) });
  const sync = () => {
    sys.state("L", `LEO ${leo.L} · HW ${hw}`);
    sys.state("F1", `LEO ${leo.F1}`);
    sys.state("F2", `LEO ${leo.F2}`);
  };
  show();
  sys.set({ acks: "1", "min.insync.replicas": 2, "HW (high watermark)": 100 });
  sys.note(`A Kafka partition: one leader and two followers. Followers are not pushed to: each runs a fetcher that asks the leader for the next offsets. The high watermark (HW) is the offset every in-sync replica has reached; consumers read only below it.`);
  leo.L = 101;
  sync();
  show(["L"]);
  sys.msg("prod", "L", "record @100 (acks=1)", `acks=1, the asynchronous mode: the leader appends the record at offset 100 (to the page cache, not disk)…`);
  sys.msg("L", "prod", "ACK", `…and acknowledges at once. Neither follower has it yet.`, { tone: "done" });
  sys.msg("cons", "L", "fetch from 100", `A consumer asks for offset 100. It is above the HW (still 100), so the leader returns nothing yet. Kafka consumers never see a record that is not on every in-sync replica, so there is no stale-follower read here; the risk is somewhere else.`, { tone: "compare" });
  sys.state("L", "DOWN", "danger");
  isr = ["F1", "F2"];
  show(["L"], "danger");
  sys.note(`The leader's broker dies before either follower fetched offset 100.`, "crash");
  sys.state("F1", "LEADER · LEO 100", "active");
  sys.set({ "lost": "offset 100 (acked with acks=1)" });
  sys.note(`The controller elects B2, an in-sync follower, as leader. Its log ends at 100, so the acknowledged record never existed as far as the partition is concerned; when B1 returns it truncates to the new leader. acks=1 lost an acknowledged write.`, "lost");
  leo.L = 100;
  leo.F1 = 100;
  isr = ["L", "F1", "F2"];
  sys.state("F1", "LEO 100");
  sys.state("L", "LEO 100 · HW 100", "active");
  sync();
  show();
  sys.set({ acks: "all", lost: "–" });
  sys.note(`Rewind and use acks=all with min.insync.replicas=2: the leader parks the produce request until the HW passes the record, meaning every member of the ISR has it.`, "acks=all");
  leo.L = 101;
  sync();
  show(["L"]);
  sys.msg("prod", "L", "record @100 (acks=all)", `The leader appends offset 100. The producer waits.`);
  leo.F1 = 101;
  leo.F2 = 101;
  sync();
  show(["F1", "F2"], "compare");
  sys.fanin(["F1", "F2"], "L", "fetch from 100 → record", `Both followers' fetchers ask for offset 100 and append the record. The leader learns their new LEOs from their next fetch, one extra round trip.`, "compare");
  hw = 101;
  sync();
  show(["L", "F1", "F2"], "done");
  sys.msg("L", "prod", "ACK (HW 101)", `HW = the smallest LEO in the ISR = 101, past the record. Now the producer is acknowledged, and consumers may read offset 100. Slower by one replication round trip, and a single broker failure can no longer lose it.`, { tone: "done" });
  isr = ["L"];
  sys.state("F1", "out of ISR", "danger");
  sys.state("F2", "out of ISR", "danger");
  show(["F1", "F2"], "danger");
  sys.msg("prod", "L", "record @101 → NotEnoughReplicas", `If both followers fall behind and drop out of the ISR, "all in-sync replicas" would be the leader alone. min.insync.replicas=2 refuses the write with NotEnoughReplicas instead of accepting it on one machine.`, { tone: "danger" });
  sys.note(`The standard triple, replication factor 3, min.insync.replicas=2 and acks=all, survives one broker down with no loss and refuses writes rather than lose data when two are down; consumers keep reading up to the HW throughout.`, "done");
  return sys.f.done();
};

/** A cache shard with a copy in each zone: writes go to every copy, reads stay in-zone, failover is to a warm copy. */
const cacheZones = () => {
  const sys = new Sys([
    { id: "appA", label: "App (zone A)", kind: "client", x: 6, y: 20 },
    { id: "appB", label: "App (zone B)", kind: "client", x: 6, y: 80 },
    { id: "cA", label: "Shard 7 (A)", kind: "cache", x: 52, y: 20, state: "warm" },
    { id: "cB", label: "Shard 7 (B)", kind: "cache", x: 52, y: 80, state: "warm" },
    { id: "db", label: "Database", kind: "db", x: 92, y: 50, state: "normal load" },
  ]);
  sys.set({ copies: "one per zone", RAM: "doubled" });
  sys.note(`One cache shard with a copy in each of two zones. Clients write to every copy and read only their own zone's, so a read never crosses a zone while both copies are up.`);
  sys.fanout("appA", ["cA", "cB"], "SET user:42", `A write goes to both copies. Each copy is a full replica of the shard, not a cold standby.`, "active");
  sys.msg("appA", "cA", "GET user:42 → hit", `Zone A's clients read zone A's copy: a same-zone round trip.`, { tone: "done" });
  sys.msg("appB", "cB", "GET user:42 → hit", `Zone B's clients read zone B's copy. Each zone's traffic stays in its zone.`, { tone: "done" });
  sys.state("cA", "DOWN", "danger");
  sys.note(`Zone A's node dies. Without a replica, every one of its keys would miss at once and fall through to the database.`, "failure");
  sys.state("cB", "serving both zones", "active");
  sys.msg("appA", "cB", "GET user:42 (after 1 timeout)", `Zone A's clients read zone B's copy on their first timeout. It is already warm, so they hit; each read pays a cross-zone round trip, about 0.5 to 1 ms.`, { tone: "compare" });
  sys.state("db", "normal load", "done");
  sys.note(`The database never sees the spike: no miss storm, because the misses were absorbed by a copy that already held the keys.`, "no storm");
  sys.state("cA", "replacement · copying", "compare");
  sys.msg("cB", "cA", "bulk copy 76 GB", `A replacement node in zone A is filled by bulk copy from the surviving copy: 69 million items, 76 GB, about 2.5 minutes at 500 MB/s. It serves only after the copy.`, { tone: "compare" });
  sys.state("cA", "warm", "done");
  sys.state("cB", "warm");
  sys.tone("cB", undefined);
  sys.msg("appA", "cA", "GET user:42 → hit", `Zone A reads locally again.`, { tone: "done" });
  sys.note(`The price is double the RAM. The decision follows from the failure the estimates say you must survive: a zone loss takes out too many nodes for a gutter pool, so each shard keeps a warm copy elsewhere.`, "done");
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
  sys.set({ leaders: n, replication: "asynchronous, each leader to every other", "local write RTT": "~1 ms", "cross-region RTT": "~150 ms" });
  sys.note(`Multi-leader replication: each region has its own leader that accepts writes locally and replicates them asynchronously to the other leaders. Users get local write latency; the price is conflicts.`);
  sys.state("EU", "title = 'Draft A' (v2)", "active");
  sys.msg("cEU", "EU", "SET title = 'Draft A'", `The EU user edits a document title; the EU leader applies it on top of v1.`);
  sys.msg("EU", "cEU", "ACK (~1 ms)", `Acknowledged locally: no cross-ocean round trip, and the write survives a link outage to the other region.`, { tone: "done" });
  sys.state("US", "title = 'Draft B' (v2)", "active");
  sys.msg("cUS", "US", "SET title = 'Draft B'", `At the same moment the US user edits the same title. The US leader also applies it on top of v1: neither leader knows about the other's write yet.`);
  sys.msg("US", "cUS", "ACK (~1 ms)", `Also acknowledged locally. Two different v2s now exist.`, { tone: "done" });
  sys.msg("EU", "US", "replicate: Draft A (v1→v2)", `Replication streams cross in flight.`, { tone: "compare" });
  sys.s.messages = [{ from: "EU", to: "US", label: "replicate: Draft A (v1→v2)", tone: "compare" }, { from: "US", to: "EU", label: "replicate: Draft B (v1→v2)", tone: "compare" }, ...(n > 2 ? [{ from: "EU", to: "APAC", label: "Draft A", tone: "compare" as Tone }, { from: "US", to: "APAC", label: "Draft B", tone: "compare" as Tone }] : [])];
  sys.s.log = [...sys.s.log.slice(-4), `US → EU: replicate: Draft B (v1→v2)${n > 2 ? "; EU, US → APAC" : ""}`];
  sys.f.push(`Each leader receives a write whose parent version (v1) it has already overwritten: a write conflict. There is no "first" because there was no shared order.${n > 2 ? " APAC receives both writes too." : ""}`, "message");
  sys.state("EU", "CONFLICT: A vs B", "danger");
  sys.state("US", "CONFLICT: B vs A", "danger");
  if (n > 2) sys.state("APAC", "CONFLICT: A and B", "danger");
  sys.note(`Conflict detected on both sides${n > 2 ? ", and on APAC, which received both" : ""}. Single-leader systems never face this because the leader serialises writes; multi-leader systems must resolve it deterministically so all leaders converge.`, "conflict");
  sys.state("EU", "title = 'Draft B'", "done");
  sys.state("US", "title = 'Draft B'", "done");
  if (n > 2) sys.state("APAC", "title = 'Draft B'", "done");
  sys.set({ resolution: "last-writer-wins by timestamp", winner: "Draft B (later timestamp)", loser: "Draft A silently discarded" });
  sys.note(`Resolution 1, last-writer-wins: every leader picks the write with the higher timestamp. Converges, but "Draft A" is silently thrown away (a lost update), and clock skew decides who loses.`, "resolve");
  sys.note(`Alternatives: merge the values (CRDTs, text merge), keep both as siblings and let the application or user resolve (Riak, Dynamo's shopping cart), or route each record to a home leader so a given key never has two writers.`, "resolve");
  if (n > 2) {
    sys.note(`With ${n} leaders, topology matters: all-to-all is fastest but can deliver writes out of causal order (a reply arriving before the message it answers); a star or ring adds hops but keeps ordering simpler.`, "topology");
  } else {
    sys.note(`With more than two leaders, topology matters: all-to-all is fastest but can deliver writes out of causal order (a reply before its question); a star or ring adds hops but keeps ordering simpler.`, "topology");
  }
  sys.note(`Trade-off: local write latency and tolerance of inter-region outages, at the cost of conflict handling, no linearizability and subtle bugs (auto-increment keys, uniqueness constraints). Use it across regions or for offline clients; avoid it within one datacenter.`, "done");
  return sys.f.done();
};

/**
 * Leaderless quorums (Dynamo/Cassandra style). The coordinator sends writes to
 * all N and waits for W; it reads from only R replicas (data from one, digests
 * from the rest) and, on a mismatch, writes the newest value back before
 * answering (blocking read repair). Then an in-flight write shows why that
 * write-back must block. `variant: "partition"` traces a write on each side of
 * a partition; `variant: "paxos"` traces Paxos majorities overlapping.
 */
const quorumScenario: SysGen = (input) => {
  if (input.variant === "partition") return quorumPartition();
  if (input.variant === "paxos") return paxosMajorities();
  const N = clampInt(input.replicas, 3, 5, 3);
  const W = Math.floor(N / 2) + 1;
  const R = N - W + 1;
  const reps = Array.from({ length: N }, (_, i) => `R${i + 1}`);
  const ys = spread(N, 10, 90);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 5, y: 50 },
    { id: "coord", label: "Coordinator", kind: "service", x: 40, y: 50 },
    ...reps.map((id, i) => ({ id, kind: "db" as const, x: 90, y: ys[i], state: "x=v1 · ts 9" })),
  ]);
  const fast = reps.slice(0, W);
  const slowSet = reps.slice(W);
  const slowNames = slowSet.join(" and ");
  const versions: Record<string, string> = Object.fromEntries(reps.map((r) => [r, "v1 · ts 9"]));
  const show = (hi: string[] = [], tone: Tone = "active") => sys.table({ title: "Replica versions", head: ["replica", "value"], rows: reps.map((r) => [r, versions[r]!]), tones: reps.map((r) => (hi.includes(r) ? tone : undefined)) });
  const put = (r: string, v: string, tone: Tone = "done") => {
    versions[r] = v;
    sys.state(r, `x=${v}`, tone);
  };
  show();
  sys.set({ N, W, R, "W + R > N": `${W} + ${R} = ${W + R} > ${N}` });
  sys.note(`Quorum replication: a write must be acknowledged by W of N replicas and a read must hear from R of them. With W + R > N, every read set overlaps every set of replicas that acknowledged a write, so a read includes at least one copy of the latest acknowledged write.`);
  sys.msg("client", "coord", "PUT x=v2", `The client sends a write to a coordinator (any node can coordinate).`);
  sys.fanout("coord", reps, "PUT x=v2 · ts 12", `The coordinator sends the write to all ${N} replicas in parallel, with a timestamp.`);
  fast.forEach((r) => put(r, "v2 · ts 12"));
  slowSet.forEach((r) => sys.state(r, "x=v1 · ts 9 (slow)", "danger"));
  show(fast, "done");
  sys.fanin(fast, "coord", "ACK", `${fast.join(", ")} acknowledge; ${slowNames} ${slowSet.length > 1 ? "are" : "is"} slow (a GC pause, a disk stall). W=${W} acks are in, so the coordinator does not wait.`, "done");
  sys.msg("coord", "client", `OK (W=${W})`, `The write succeeds although ${slowNames} still ${slowSet.length > 1 ? "hold" : "holds"} v1. The write path tolerates ${N - W} slow or dead replica${N - W > 1 ? "s" : ""}.`, { tone: "done" });
  // Read: contact only R replicas.
  const readSet = [fast[W - 1]!, ...reps.slice(N - R + 1)].slice(0, R);
  const dataFrom = readSet[0]!;
  const digests = readSet.slice(1);
  show(readSet, "active");
  sys.s.messages = [
    { from: "coord", to: dataFrom, label: "GET x (data)", tone: "compare" },
    ...digests.map((r) => ({ from: "coord", to: r, label: "GET x (digest)", tone: "compare" as Tone })),
  ];
  sys.s.log = [...sys.s.log.slice(-4), `coord → ${readSet.join(", ")}: GET x`];
  sys.f.push(`A read arrives. The coordinator contacts only R=${R} replicas, not all ${N}: it asks ${dataFrom} for the data and ${digests.join(", ")} for a digest, a hash of the value.`, "read");
  sys.s.messages = [
    { from: dataFrom, to: "coord", label: "x=v2 · ts 12", tone: "compare" },
    ...digests.map((r) => ({ from: r, to: "coord", label: versions[r] === "v2 · ts 12" ? "digest(v2)" : "digest(v1) ≠", tone: (versions[r] === "v2 · ts 12" ? "compare" : "danger") as Tone })),
  ];
  sys.s.log = [...sys.s.log.slice(-4), `${readSet.join(", ")} → coord: replies`];
  const stale = readSet.filter((r) => !versions[r]!.startsWith("v2"));
  sys.f.push(`${dataFrom} returns v2 with timestamp 12; ${stale.join(" and ")} ${stale.length > 1 ? "send digests that do" : "sends a digest that does"} not match. The coordinator fetches full data: ${stale.join(" and ")} ${stale.length > 1 ? "have" : "has"} v1 at timestamp 9. Because R + W > N, at least one of the replicas it heard from was in the write's quorum, so v2 is among the replies, and the newest timestamp wins.`, "compare");
  stale.forEach((r) => put(r, "v2 · ts 12"));
  show(stale, "done");
  sys.fanout("coord", stale, "read repair: x=v2", `Before answering, the coordinator writes v2 back to ${stale.join(" and ")} and waits: blocking read repair. The read pays an extra round trip so that no later quorum read can go backwards.`, "done", "repair");
  sys.msg("coord", "client", "x=v2", `Only now does the client get v2.`, { tone: "done" });
  // An in-flight write: why the repair must block.
  const first = reps[0]!;
  const second = reps[1]!;
  const bSet = [first, ...reps.slice(N - R + 1)].slice(0, R);
  const cSet = reps.slice(N - R);
  const targets = bSet.filter((r) => r !== first);
  put(first, "v3 · ts 15", "active");
  show([first], "active");
  sys.msg("client", "coord", "PUT x=v3 (in flight)", `Now a write still in flight: ${first} has applied v3, the copy to ${second} is still on the wire, and the write has not been acknowledged yet. Overlap is a promise about acknowledged writes only.`, { tone: "compare" });
  show(bSet, "active");
  sys.msg("coord", first, `reader B: GET ${bSet.join(", ")}`, `Reader B's quorum is ${bSet.join(" and ")}. It sees v3 at timestamp 15 on ${first}: the newest value, so B returns v3.`, { tone: "compare" });
  show(cSet, "danger");
  sys.msg("coord", cSet[0]!, `reader C: GET ${cSet.join(", ")}`, `Reader C starts after B has returned and reads ${cSet.join(" and ")}. If B's read had not written anything back, neither replica has v3 yet, and C gets v2: a value appeared and then disappeared. No single order of events explains that, so quorum reads alone are not linearizable.`, { tone: "danger" });
  targets.forEach((r) => put(r, "v3 · ts 15"));
  show([first, ...targets], "done");
  sys.fanout("coord", targets, "B's read repair: x=v3", `Blocking read repair closes this: B writes v3 to ${targets.join(" and ")} before returning, so v3 sits on ${targets.length + 1} replicas, a write quorum, and C's read must include one of them. C reads v3.`, "done", "repair");
  sys.set({ "if W=1, R=1": "1 + 1 ≤ N: stale reads even without failures", "if W=N, R=1": "fast reads, writes block on every replica" });
  sys.note(`Tuning: with W + R ≤ N (say W=1, R=1 for speed) there is no overlap at all and a read can miss an acknowledged write. W=N, R=1 suits read-heavy data; W=1 suits writes you can afford to lose.`, "tuning");
  sys.note(`What blocking read repair still does not fix: two concurrent writes ordered by last-writer-wins timestamps, a write that failed before reaching W yet sits on one replica and is later repaired into view, and sloppy quorums, where hinted handoff lets writes land outside the home replicas. Operations that must be linearizable need consensus (Cassandra's lightweight transactions use Paxos).`, "caveat");
  sys.note(`Trade-off: no leader and no election, availability during partial failures, and consistency tunable per request; but each operation touches several replicas, and the guarantees are weaker than they look. Used by Dynamo, Cassandra, Riak.`, "done");
  return sys.f.done();
};

/** CAP: N=3, W=2, a partition with two replicas on one side and one on the other. */
const quorumPartition = () => {
  const sys = new Sys([
    { id: "cA", label: "Client A", kind: "client", x: 6, y: 25 },
    { id: "R1", kind: "db", x: 40, y: 15, state: "x=v1" },
    { id: "R2", kind: "db", x: 40, y: 55, state: "x=v1" },
    { id: "cB", label: "Client B", kind: "client", x: 94, y: 25 },
    { id: "R3", kind: "db", x: 80, y: 75, state: "x=v1" },
  ]);
  const v: Record<string, string> = { R1: "v1", R2: "v1", R3: "v1" };
  const show = (hi: string[] = [], tone: Tone = "active") => sys.table({ title: "N = 3, W = 2, R = 2", head: ["replica", "side", "value"], rows: ["R1", "R2", "R3"].map((r) => [r, r === "R3" ? "minority" : "majority", v[r]!]), tones: ["R1", "R2", "R3"].map((r) => (hi.includes(r) ? tone : undefined)) });
  show();
  sys.set({ N: 3, W: 2, R: 2 });
  sys.note(`Three replicas, writes need W = 2 acknowledgements and reads need R = 2. Two is a majority of three, so any two quorums overlap.`);
  sys.state("R3", "x=v1 · cut off", "danger");
  sys.note(`A partition: R3 can no longer reach R1 or R2. Client A can reach the majority side; client B can reach only R3.`, "partition");
  v.R1 = "v2";
  v.R2 = "v2";
  sys.state("R1", "x=v2", "done");
  sys.state("R2", "x=v2", "done");
  show(["R1", "R2"], "done");
  sys.msg("cA", "R1", "PUT x=v2", `Client A writes through R1, which replicates to R2. Two acknowledgements: W = 2 is met on the majority side, so the write commits. R3's copy waits for the partition to heal.`, { tone: "done" });
  sys.msg("R1", "cA", "OK (W=2)", `Client A gets OK. The side holding two replicas keeps working.`, { tone: "done" });
  show(["R3"], "danger");
  sys.msg("cB", "R3", "PUT x=v3", `Client B writes through R3. R3 can collect only its own acknowledgement: one of the two the write needs.`, { tone: "danger" });
  sys.msg("R3", "cB", "error: quorum unavailable (C)", `Choice C, consistency: reject the write. Client B is unavailable for the duration, but no replica ever holds a value that conflicts with v2.`, { tone: "danger" });
  v.R3 = "v3 (local)";
  sys.state("R3", "x=v3 (local) · cut off", "compare");
  show(["R3"], "compare");
  sys.msg("R3", "cB", "OK, accepted locally (A)", `Choice A, availability: accept it anyway, as a sloppy quorum with a hint, and reconcile later. Client B stays available, and now two sides hold different writes, v2 and v3.`, { tone: "compare" });
  sys.msg("cB", "R3", "GET x", `A read on the minority side has the same choice: with R = 2 it cannot be served (C), or it is served by R3 alone and may be stale or conflicting (A).`, { tone: "compare" });
  sys.state("R3", "x=v2 + v3 → resolve", "compare");
  sys.note(`The partition heals. Under C, R3 simply catches up to v2. Under A, the system must reconcile v2 and v3: last-writer-wins drops one of them, or both are kept as siblings for the application to merge.`, "heal");
  sys.note(`CAP is this choice for the clients that can reach only a minority during a partition. PACELC adds the everyday half: even without a partition, waiting for a quorum costs latency that a single-replica answer would not.`, "done");
  return sys.f.done();
};

/** Paxos: two proposers, three acceptors; a later majority overlaps the earlier one and carries its value forward. */
const paxosMajorities = () => {
  const sys = new Sys([
    { id: "P", label: "Proposer P", kind: "service", x: 8, y: 20, state: "wants X" },
    { id: "Q", label: "Proposer Q", kind: "service", x: 8, y: 80, state: "wants Y" },
    { id: "R", label: "Proposer R", kind: "service", x: 30, y: 50, state: "idle" },
    { id: "A1", kind: "node", x: 70, y: 12, state: "(0, –)" },
    { id: "A2", kind: "node", x: 70, y: 50, state: "(0, –)" },
    { id: "A3", kind: "node", x: 70, y: 88, state: "(0, –)" },
  ]);
  const acc: Record<string, [number, string]> = { A1: [0, "–"], A2: [0, "–"], A3: [0, "–"] };
  const ids = ["A1", "A2", "A3"];
  const sync = () => ids.forEach((a) => sys.state(a, `(${acc[a]![0]}, ${acc[a]![1]})`));
  const show = (hi: string[] = [], tone: Tone = "active") => sys.table({ title: "Acceptor state: (promised, accepted)", head: ["acceptor", "promised", "accepted"], rows: ids.map((a) => [a, acc[a]![0], acc[a]![1]]), tones: ids.map((a) => (hi.includes(a) ? tone : undefined)) });
  show();
  sys.set({ acceptors: 3, majority: 2 });
  sys.note(`Paxos decides one value with three acceptors. Every step needs a majority, two of three, and any two majorities of three share at least one acceptor. That shared acceptor is the memory that carries a decision from one proposer to the next.`);
  acc.A1![0] = 1;
  acc.A2![0] = 1;
  sync();
  show(["A1", "A2"]);
  sys.fanout("P", ["A1", "A2"], "prepare(1)", `P sends prepare(1). It reaches A1 and A2; the copy to A3 is delayed. Both promise to ignore proposals below 1, and neither has accepted anything.`);
  sys.fanin(["A1", "A2"], "P", "promise(1, none)", `P has promises from a majority and none reports a value, so P may propose its own: X.`, "compare");
  acc.A1![1] = "1:X";
  sync();
  show(["A1"], "compare");
  sys.msg("P", "A1", "accept(1, X)", `P's accept(1, X) reaches A1 only. One acceptor of three has accepted X, so X is not chosen.`);
  acc.A1![0] = 2;
  acc.A2![0] = 2;
  acc.A3![0] = 2;
  sync();
  show(ids);
  sys.fanout("Q", ids, "prepare(2)", `Q sends prepare(2) to all three, and all promise 2. Q's majority overlaps P's: A1 is in both.`);
  sys.fanin(ids, "Q", "promises (A1: 1:X)", `A1's promise reports what it accepted: proposal 1, value X.`, "compare");
  show(["A2"], "danger");
  sys.msg("P", "A2", "accept(1, X) → rejected", `P's delayed accept reaches A2, which has promised 2. A promise is a commitment to reject older proposals, so A2 rejects it.`, { tone: "danger" });
  sys.state("Q", "must propose X", "compare");
  sys.note(`Q picks its value. The rule: if any promise reported an accepted proposal, use the value of the highest-numbered one. That is 1:X, so Q must propose X, not its own Y. Q cannot know whether some majority it did not hear from accepted X, so it assumes one might have.`, "rule");
  acc.A1![1] = "2:X";
  acc.A2![1] = "2:X";
  acc.A3![1] = "2:X";
  sync();
  show(ids, "done");
  sys.state("Q", "X chosen", "done");
  sys.fanout("Q", ids, "accept(2, X)", `Q sends accept(2, X); all three accept. A majority has accepted proposal 2 with value X: X is chosen.`, "done");
  sys.state("Q", "crashed", "danger");
  sys.state("R", "prepare(3) → must propose X", "active");
  acc.A2![0] = 3;
  acc.A3![0] = 3;
  sync();
  show(["A2", "A3"], "compare");
  sys.fanout("R", ["A2", "A3"], "prepare(3)", `Suppose Q crashes before telling anyone. A third proposer, R, runs prepare(3) and reaches any majority, here A2 and A3. They promise 3 and both report 2:X, because any majority overlaps the one that chose X, so R must propose X again. The decision survives the crash.`, "compare");
  sys.note(`That is why acceptors fsync their promise and accepted proposal before replying: the overlap only works if the shared acceptor remembers. Majorities overlap, the overlap remembers, and only one value is ever chosen.`, "done");
  return sys.f.done();
};

// ---------- consensus ----------

/** Raft log replication. `nodes` (3 or 5) sets the cluster size; C is the follower with a stale entry, the others are up to date. */
const raftLogReplication: SysGen = (input) => {
  const n = clampInt(input.nodes, 3, 5, 3) >= 4 ? 5 : 3;
  const ids = ["A", "B", "C", "D", "E"].slice(0, n);
  const good = ids.filter((x) => x !== "A" && x !== "C");
  const majority = Math.floor(n / 2) + 1;
  const ys = spread(n - 1, 12, 88);
  const sys = new Sys([
    { id: "client", label: "Client", kind: "client", x: 6, y: 50 },
    { id: "A", label: "A (leader)", kind: "node", x: 42, y: 50, state: "term 2 · commit 3", tone: "active" },
    ...ids.slice(1).map((id, i) => ({ id, kind: "node" as const, x: 90, y: ys[i], state: id === "C" ? "follower · match ?" : "follower · match 3" })),
  ]);
  const logs: Record<string, string[]> = Object.fromEntries(ids.map((id) => [id, id === "C" ? ["1:t1", "2:t1", "3:t1"] : ["1:t1", "2:t1", "3:t2"]]));
  const show = (tones: Record<string, Tone | undefined> = {}) =>
    sys.table({ title: "Replicated logs (index:term); entry 3 on C is from a deposed leader of term 1", head: ["node", "1", "2", "3", "4", "5"], rows: ids.map((id) => [id, ...Array.from({ length: 5 }, (_, i) => logs[id]![i] ?? "")]), tones: ids.map((id) => tones[id]) });
  show({ C: "danger" });
  sys.set({ nodes: n, majority, term: 2, commitIndex: 3, "nextIndex[C]": 4 });
  sys.note(`Raft log replication with ${n} servers: the leader appends every client command to its log and replicates it in order. C holds a stale entry 3 from an old term-1 leader that never committed; it will be overwritten.`);
  sys.msg("client", "A", "SET y=7", `A client sends a command to the leader. Followers redirect clients to it.`);
  logs.A!.push("4:t2");
  show({ A: "active", C: "danger" });
  sys.state("A", "term 2 · appended 4", "active");
  sys.note(`A appends entry 4 (term 2) to its own log first. It is not yet committed: one copy is not enough.`, "append");
  sys.fanout("A", ids.slice(1), "AppendEntries(prev 3:t2, [4:t2])", `AppendEntries carries the new entry plus the index and term of the entry before it (3:t2). A follower accepts only if its own log matches at that position.`);
  good.forEach((id) => logs[id]!.push("4:t2"));
  const okTones = Object.fromEntries(good.map((id) => [id, "done" as Tone]));
  show({ ...okTones, C: "danger" });
  good.forEach((id) => sys.state(id, "follower · match 4", "done"));
  sys.fanin(good, "A", "success (match 4)", `${good.join(" and ")} ${good.length > 1 ? "have" : "has"} 3:t2 at index 3, so the check passes and ${good.length > 1 ? "they append" : "it appends"} entry 4.`, "done");
  sys.state("C", "reject: 3 is t1 not t2", "danger");
  sys.msg("C", "A", "false (prev mismatch)", `C's entry 3 has term 1, not 2: the consistency check fails and C rejects. Log Matching means a mismatch at index 3 implies everything after it may differ too.`, { tone: "danger" });
  const holders = ["A", ...good];
  sys.set({ commitIndex: 4, "replicated on": `${holders.join(", ")} (${holders.length} of ${n}, majority ${majority})` });
  sys.state("A", "term 2 · commit 4", "done");
  show({ A: "done", ...okTones, C: "danger" });
  sys.note(`Entry 4 is on ${holders.length} of ${n} servers (${holders.join(", ")}), at least a majority of ${majority}, so the leader advances commitIndex to 4 and applies SET y=7. A committed entry can never be lost: any future leader must win votes from a majority, which includes a server holding it.`, "commit");
  sys.msg("A", "client", "OK", `The client is answered only after commit. Cost per write: one round trip to a majority plus a disk fsync on each server.`, { tone: "done" });
  sys.set({ "nextIndex[C]": 3 });
  sys.msg("A", "C", "AppendEntries(prev 2:t1, [3:t2, 4:t2])", `A decrements nextIndex[C] and retries from index 3, sending both entries. C's check at 2:t1 now passes.`);
  logs.C = ["1:t1", "2:t1", "3:t2", "4:t2"];
  show({ C: "done" });
  sys.state("C", "follower · match 4", "done");
  sys.msg("C", "A", "success (match 4)", `C deletes its conflicting 3:t1 and appends the leader's 3:t2 and 4:t2. The leader's log is the truth; followers converge to it.`, { tone: "done" });
  sys.fanout("A", ids.slice(1), "heartbeat (leaderCommit 4)", `The next heartbeat carries commitIndex 4, so followers apply entries 3 and 4 to their own state machines. Followers learn of commits one round trip after the leader.`, "muted", "heartbeat");
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

type SagaStep = { svc: string; t: string; c: string; ok: string; comp: string; why: string };

const SAGA_DEFAULT: SagaStep[] = [
  { svc: "Order svc", t: "T1 create order", c: "C1 cancel order", ok: "order pending", comp: "order cancelled", why: "The order row is marked cancelled, not deleted: anyone who saw it pending saw a real state." },
  { svc: "Payment svc", t: "T2 charge card", c: "C2 refund", ok: "charged $40", comp: "refunded $40", why: "A refund is a new transaction that reverses the effect; the original charge still happened and stays in the ledger." },
  { svc: "Inventory svc", t: "T3 reserve stock", c: "C3 release stock", ok: "reserved", comp: "released", why: "The reserved units go back to the available count for other orders." },
  { svc: "Shipping svc", t: "T4 book courier", c: "C4 cancel booking", ok: "booked", comp: "cancelled", why: "The courier booking is cancelled before pickup." },
];

/**
 * Orchestrated saga. `steps` (an array of {service, step, undo, ok, undone,
 * why}) describes the lesson's own flow; the last step fails. Steps that
 * name the same service share a box.
 */
const saga: SysGen = (input) => {
  const custom = Array.isArray(input.steps)
    ? (input.steps as Record<string, unknown>[]).slice(0, 4).map((s, i) => ({ svc: label(s.service, `Service ${i + 1}`), t: label(s.step, `T${i + 1}`), c: label(s.undo, `C${i + 1}`), ok: label(s.ok, "done"), comp: label(s.undone, "undone"), why: label(s.why, "The compensation is its own local transaction.") }))
    : [];
  const all: SagaStep[] = custom.length >= 2 ? custom : SAGA_DEFAULT.slice(0, clampInt(input.nodes, 2, 4, 3));
  const n = all.length;
  const services = [...new Set(all.map((s) => s.svc))];
  const sid = (svc: string) => `s${services.indexOf(svc) + 1}`;
  const pos: [number, number][] = [
    [48, 18],
    [92, 18],
    [48, 82],
    [92, 82],
  ];
  const sys = new Sys([{ id: "orch", label: "Orchestrator", kind: "service", x: 8, y: 50, state: "saga: start" }, ...services.map((svc, i) => ({ id: `s${i + 1}`, label: svc, kind: "service" as const, x: pos[i]![0], y: pos[i]![1], state: "idle" }))]);
  const steps: (string | number)[][] = all.map((s) => [s.t, "pending"]);
  const show = () => sys.table({ title: "Saga log (persisted by the orchestrator)", head: ["step", "status"], rows: steps.map((r) => [...r]), tones: steps.map((r) => (r[1] === "done" ? "done" : r[1] === "FAILED" ? "danger" : r[1] === "compensated" ? "active" : undefined)) });
  show();
  sys.set({ steps: n, "why not 2PC": "each service owns its data; no shared locks or coordinator across them" });
  sys.note(`A saga runs a multi-service business transaction as a sequence of local transactions, each committed immediately. If a later step fails, earlier steps are undone with compensating transactions rather than rolled back.`);
  const failAt = n - 1;
  for (let i = 0; i < n; i++) {
    const s = all[i]!;
    if (i < failAt) {
      steps[i]![1] = "done";
      show();
      sys.state(sid(s.svc), s.ok, "done");
      sys.state("orch", `step ${i + 1}/${n}`, "active");
      sys.msg("orch", sid(s.svc), s.t, `Step ${i + 1}: ${s.svc} runs ${s.t.replace(/^T\d+ /, "")} and commits it on its own. The change is visible to everyone immediately: there is no isolation across the saga.`);
    } else {
      steps[i]![1] = "FAILED";
      show();
      sys.state(sid(s.svc), "FAILED", "danger");
      sys.state("orch", `step ${i + 1} failed`, "danger");
      sys.msg(sid(s.svc), "orch", `${s.t} FAILED`, `Step ${i + 1}, ${s.t.replace(/^T\d+ /, "")}, fails. The earlier steps are already committed in other services and cannot be undone with a database ROLLBACK.`, { tone: "danger" });
    }
  }
  sys.note(`The orchestrator switches to compensation: it runs the undo action for every completed step, in reverse order. Each compensation is itself a local transaction, retried until it succeeds.`, "compensate");
  for (let i = failAt - 1; i >= 0; i--) {
    const s = all[i]!;
    steps[i]![1] = "compensated";
    show();
    sys.state(sid(s.svc), s.comp, "active");
    sys.state("orch", `compensating ${i + 1}`, "compare");
    sys.msg("orch", sid(s.svc), s.c, `${s.c} undoes step ${i + 1} semantically. ${s.why}`, { tone: "compare" });
  }
  sys.state("orch", "saga: aborted", "visited");
  sys.note(`The saga ends in the aborted state. Every transition was written to the saga log before the next call, so if the orchestrator itself crashes mid-way, its replacement reads the log and resumes from the last recorded step instead of leaving the flow half done.`, "durable");
  sys.set({ isolation: "none: others can see intermediate state", "compensations must be": "idempotent, retryable, and unable to fail for business reasons" });
  sys.note(`Failure modes: other requests can see the intermediate state while it lasts; a compensation might arrive twice (make it idempotent); and some actions have no undo (an email sent), so order the steps so the irreversible one comes last.`, "caveats");
  sys.note(`Trade-off: sagas keep services independent and available with no cross-service locks, but you give up atomicity and isolation and must design every step's compensation by hand. Choreography (events, no orchestrator) removes the central coordinator at the cost of a flow nobody can read in one place.`, "done");
  return sys.f.done();
};

/**
 * Transactional outbox. `service`, `entity` (the business row), `event`,
 * `relay` and `consumer` relabel it for each lesson. The relay crashes after
 * publishing the last row and before marking it sent, so that row is
 * published twice and the consumer dedupes it by event id.
 */
const outbox: SysGen = (input) => {
  const n = clampInt(input.requests, 1, 6, 4);
  const service = label(input.service, "Order service");
  const entity = label(input.entity, "order");
  const event = label(input.event, "OrderCreated");
  const relayLabel = label(input.relay, "Relay / CDC");
  const consumer = label(input.consumer, "Consumer");
  const sys = new Sys([
    { id: "svc", label: service, kind: "service", x: 8, y: 50 },
    { id: "db", label: "Postgres", kind: "db", x: 40, y: 50, state: `${entity}s + outbox` },
    { id: "relay", label: relayLabel, kind: "service", x: 72, y: 15, state: "polling" },
    { id: "mq", label: "Kafka", kind: "queue", x: 72, y: 85, state: "0 events" },
    { id: "cons", label: consumer, kind: "service", x: 95, y: 50, state: "seen: none" },
  ]);
  const rows: (string | number)[][] = [];
  const show = (tones?: (Tone | undefined)[]) => sys.table({ title: "outbox table", head: ["event id", "event", "status"], rows: rows.map((r) => [...r]), tones });
  const evId = (i: number) => `e${i}`;
  let published = 0;
  const sent = () => rows.filter((r) => r[2] === "sent").length;
  const dbState = () => sys.state("db", `${entity}s: ${rows.length} · outbox: ${sent()} sent, ${rows.length - sent()} pending`);
  show();
  sys.set({ [`${entity}s`]: 0, published: 0, delivery: "at-least-once" });
  sys.note(`Transactional outbox: the ${lc(service)} must update its database and publish an event, and both must happen or neither. Two separate writes cannot promise that.`);
  sys.msg("svc", "db", `INSERT ${entity} 0 · COMMIT`, `The naive dual write: first the ${entity} commits…`);
  sys.msg("svc", "mq", `publish ${event}(0)`, `…then the service publishes. If it crashes here, or the broker is unreachable, the ${entity} exists and the event never goes out, and downstream never learns. Publishing first has the mirror problem: an event for ${an(entity)} that never committed.`, { tone: "danger", dashed: true });
  sys.note(`Fix: write the event into an outbox table in the same database transaction as the ${entity} row, with an event id minted right there. One local commit covers both; a separate relay moves rows to the broker.`, "fix");
  for (let i = 1; i <= n; i++) {
    rows.push([evId(i), `${event}(${i})`, "pending"]);
    show(rows.map((_, j) => (j === rows.length - 1 ? "active" : undefined)));
    dbState();
    sys.tone("db", "active");
    sys.set({ [`${entity}s`]: i });
    sys.msg("svc", "db", `BEGIN; ${entity} ${i}; outbox ${evId(i)}; COMMIT`, `Request ${i}: the ${entity} row and outbox row ${evId(i)} commit atomically. If the transaction fails, neither exists, so there is nothing to publish.`, { tone: "done" });
  }
  sys.tone("db", undefined);
  sys.msg("relay", "db", "SELECT … WHERE status='pending'", `The relay reads the pending rows in id order (by polling, or by tailing the WAL with CDC, which avoids polling).`, { tone: "compare" });
  if (n > 1) {
    published = n - 1;
    for (let i = 0; i < n - 1; i++) rows[i]![2] = "sent";
    show(rows.map((_, j) => (j < n - 1 ? "done" : undefined)));
    dbState();
    sys.state("mq", `${published} events`, "done");
    sys.state("cons", `seen: ${evId(1)}${n > 2 ? `…${evId(n - 1)}` : ""}`, "done");
    sys.set({ published });
    sys.msg("relay", "mq", `publish ${evId(1)}…${evId(n - 1)}, mark sent`, `For each row it publishes the event and then marks the row sent: ${n === 2 ? `${evId(1)} goes out and is marked` : `${evId(1)}${n > 3 ? " to " : " and "}${evId(n - 1)} go out and are marked`}.`, { tone: "done" });
  }
  published++;
  sys.state("mq", `${published} events`, "done");
  sys.set({ published });
  show(rows.map((_, j) => (j === n - 1 ? "active" : j < n - 1 ? "done" : undefined)));
  sys.state("cons", `seen: ${evId(1)}${n > 1 ? `…${evId(n)}` : ""}`, "done");
  sys.msg("relay", "mq", `publish ${evId(n)}`, `It publishes ${evId(n)}; the broker has it and ${the(consumer)} processes it.`, { tone: "done" });
  sys.state("relay", "CRASHED before marking", "danger");
  show(rows.map((_, j) => (j === n - 1 ? "danger" : "done")));
  sys.note(`Failure mode: the relay crashes after publishing ${evId(n)} and before marking it sent. The row still says pending, although the event is already in the broker.`, "crash");
  published++;
  rows[n - 1]![2] = "sent";
  sys.state("relay", "restarted");
  sys.tone("relay", undefined);
  sys.state("mq", `${published} events (${evId(n)} twice)`, "compare");
  sys.set({ published, duplicates: 1 });
  show(rows.map(() => "done" as Tone));
  dbState();
  sys.msg("relay", "mq", `publish ${evId(n)} again, mark sent`, `On restart the relay finds ${evId(n)} pending and publishes it again, then marks it. The outbox gives at-least-once publication, never exactly-once: the broker now holds ${evId(n)} twice.`, { tone: "compare" });
  sys.state("cons", `seen: ${evId(1)}…${evId(n)}`, "done");
  sys.msg("mq", "cons", `${evId(n)} (duplicate)`, `${consumer} receives ${evId(n)} a second time, finds the event id already processed, and skips it. Deduplicating on the id minted in the outbox transaction is what turns at-least-once publication into an effect that happens once.`, { tone: "done" });
  sys.set({ "consumers must be": "idempotent (dedupe on event id)", latency: "polling interval or CDC lag" });
  sys.note(`Trade-off: reliable publication using only the database's own transaction, at the cost of an extra table, a relay to run, publish latency of one polling interval (or CDC lag), and consumers that must tolerate duplicates.`, "done");
  return sys.f.done();
};

/**
 * Idempotency keys. `requests` is how many times the same logical request is
 * delivered (default 3: the original, a concurrent duplicate, a retry). The
 * key is minted once per operation and reused on every delivery. `store`
 * picks where the key lives: "db" (default: a key table in the same database,
 * written in the same transaction as the effect), "cache" (a separate store
 * claimed with SET NX), or "unique" (a consumer that uses the event ID as the
 * primary key of the row it writes). Labels describe each lesson's system.
 */
const idempotencyKey: SysGen = (input) => {
  const n = clampInt(input.requests, 1, 5, 3);
  const mode = input.store === "cache" || input.store === "unique" ? input.store : "db";
  if (mode === "unique") return idempotentSink(input, n);
  const key = label(input.key, "k1");
  const service = label(input.service, "Payments API");
  const client = label(input.client, "Client");
  const request = label(input.request, "POST /charges $20");
  const effect = label(input.effect, "charge $20");
  const target = input.target === "" || input.target === null ? "" : label(input.target, "Card processor");
  const dbLabel = label(input.db, mode === "cache" ? "Redis" : "Postgres");
  const record = label(input.record, "payment pay_1");
  const response = label(input.response, "201 ch_9f");
  const changed = label(input.changed, "$30 instead of $20");
  const effects = label(input.effects, "charges");
  const downstream = input.downstream !== false;
  const nodes: (Partial<SysNode> & { id: string })[] = [
    { id: "client", label: client, kind: "client", x: 6, y: 50 },
    { id: "api", label: service, kind: "service", x: 42, y: 50 },
    { id: "store", label: dbLabel, kind: mode === "cache" ? "cache" : "db", x: 88, y: target ? 15 : 50, state: "no key" },
  ];
  if (target) nodes.push({ id: "target", label: target, kind: "external", x: 88, y: 85, state: `${effects}: 0` });
  const sys = new Sys(nodes);
  const rows: (string | number)[][] = [];
  const title = mode === "cache" ? `${dbLabel}: key → status, saved response (TTL 24 h)` : `idempotency_keys (same database as the ${record.split(" ")[0]} rows): key → body hash, status, saved response`;
  const show = (tone?: Tone) => sys.table({ title, head: ["key", "body hash", "status", "response"], rows: rows.map((r) => [...r]), tones: rows.map(() => tone) });
  let done = 0;
  const count = (v: number) => {
    done = v;
    sys.set({ [effects]: v });
    if (target) sys.state("target", `${effects}: ${v}`, v ? "done" : undefined);
  };
  show();
  sys.set({ deliveries: 0, [effects]: 0, key: `${key} (one per operation, reused on every retry)` });
  sys.note(`Idempotency key: the client mints one key for this operation, ${key}, and sends the same key on every retry of it. The server guarantees that one key produces the effect at most once, however many times the request arrives.`);
  let delivery = 1;
  sys.set({ deliveries: delivery });
  sys.msg("client", "api", `${request} · ${key}`, `Delivery ${delivery}: the request carries the key in an Idempotency-Key header.`);
  rows.push([key, "h1", "in progress", "–"]);
  show("active");
  sys.state("store", `${key}: in progress`, "compare");
  sys.msg("api", "store", mode === "cache" ? `SET ${key} in-progress NX` : `INSERT ${key} in progress`, mode === "cache" ? `The service claims the key atomically with SET NX: only one caller can create it, so only one delivery may go on to do the work.` : `The service claims the key: it inserts a row for ${key} with a hash of the body. The key is the table's primary key (scoped to the caller), so only one insert can succeed, and only that delivery goes on to do the work.`, { tone: "compare" });
  if (n >= 3) {
    delivery++;
    sys.set({ deliveries: delivery });
    sys.msg("client", "api", `${request} · ${key} (again)`, `Delivery ${delivery} arrives while the first is still in progress: a double click, or a client that timed out early and retried.`);
    sys.msg("api", "client", "409 Conflict: in progress", `Its claim fails because ${key} already exists and is still in progress. The server answers 409, retry shortly (or makes it wait for the first to finish), and does not do the work a second time.`, { tone: "compare" });
  }
  if (target) {
    count(1);
    sys.msg("api", "target", downstream ? `${effect} · ${key}` : effect, `The work happens once: ${effect}.${downstream ? ` The same key goes downstream too, so if this call is ever repeated the ${lc(target)} recognises it.` : ""}`);
  }
  rows[0] = [key, "h1", "done", response];
  show("done");
  sys.state("store", `${key}: done · ${response}`, "done");
  if (!target) count(1);
  sys.msg(
    "api",
    "store",
    mode === "cache" ? `SET ${key} = ${response}` : target ? `COMMIT ${record} + ${key} done` : `COMMIT ${effect} + ${key} done`,
    mode === "cache"
      ? `The response is saved under ${key} before it is returned. The key store and ${target ? the(target) : "the database"} are separate systems, so a crash between the work and this write leaves the key in progress until its TTL runs out.`
      : target
        ? `One transaction records ${record}, marks ${key} done and saves the response. Because the record and the key commit together, there is no moment where one exists without the other.`
        : `The effect (${effect}) and the key's saved response commit in one transaction. If the process died before COMMIT, neither would exist and a retry would simply run again.`,
    { tone: "done" },
  );
  sys.msg("api", "client", `${response} (lost)`, `The response is sent and lost: a timeout, a dropped connection, a crashed load balancer. The client cannot tell whether the work happened.`, { tone: "danger", dashed: true });
  const retries = Math.max(0, n - delivery);
  if (retries > 0) {
    delivery++;
    sys.set({ deliveries: delivery });
    sys.msg("client", "api", `${request} · ${key} (retry)`, `Delivery ${delivery}: the client retries with the same key. Without the key the service could not tell this from a new request, and would ${effect} a second time.`);
    sys.msg("api", "store", `lookup ${key}: done, h1`, `The key exists, it is done, and the body hash matches: this is the same request again.`, { tone: "compare" });
    const extra = n - delivery;
    if (extra > 0) sys.set({ deliveries: n });
    sys.msg("api", "client", `${response} (replayed)`, `The service replays the saved response byte for byte and does no work. ${effects[0]!.toUpperCase() + effects.slice(1)}: still ${done}.${extra > 0 ? ` ${extra} more ${extra === 1 ? "retry gets" : "retries get"} the same replay.` : ""} At-least-once delivery plus an idempotent server gives an exactly-once effect.`, { tone: "done" });
  } else {
    sys.note(`Had the client retried with ${key}, the service would find the key done and replay the saved response without doing the work again.`, "replay");
  }
  sys.msg("client", "api", `${key} · ${changed}`, `A client bug: the same key with a different body (${changed}). The stored hash does not match, so the server answers 422 and does nothing: the key names a different request.`, { tone: "danger" });
  sys.set({ "key scope": "per authenticated caller", "body changed": "422, nothing done", ttl: "longer than any client's retry window" });
  sys.note(`Details that bite: scope keys per caller so one client cannot replay another's response; keep keys longer than any client retries (Stripe: at least 24 hours), because a retry after the key expires is treated as new and does the work again; and decide what a failed attempt leaves behind (release the key, or store the failure and replay it).`, "caveats");
  sys.note(`Trade-off: one extra write per request and a table of keys to expire, in exchange for retries that are safe at every layer. The key belongs to the operation, not the attempt: a fresh key per retry would dedupe nothing.`, "done");
  return sys.f.done();
};

/** The consumer side: the event ID is the primary key of the row the sink writes, so a redelivery inserts nothing. */
const idempotentSink = (input: SystemInput, n: number) => {
  const event = label(input.key, "evt-7f3");
  const source = label(input.client, "Kafka");
  const consumer = label(input.service, "Ledger consumer");
  const dbLabel = label(input.db, "Ledger DB");
  const record = label(input.record, "ledger row +$20");
  const sys = new Sys([
    { id: "client", label: source, kind: "queue", x: 6, y: 50 },
    { id: "api", label: consumer, kind: "service", x: 45, y: 50 },
    { id: "store", label: dbLabel, kind: "db", x: 90, y: 50, state: "rows: 0" },
  ]);
  const rows: (string | number)[][] = [];
  const show = (tone?: Tone) => sys.table({ title: `ledger (event_id is the primary key)`, head: ["event_id", "entry"], rows: rows.map((r) => [...r]), tones: rows.map(() => tone) });
  show();
  sys.set({ deliveries: 0, "rows written": 0, "dedupe store": "none" });
  sys.note(`A consumer that must apply each event once. The producer minted the event ID once, when the event was created (in the outbox transaction), so every redelivery of the event carries the same ID.`);
  sys.set({ deliveries: 1 });
  sys.msg("client", "api", `${event}`, `Delivery 1 of ${event}.`);
  rows.push([event, record]);
  show("done");
  sys.state("store", "rows: 1", "done");
  sys.set({ "rows written": 1 });
  sys.msg("api", "store", `INSERT (${event}, …) ON CONFLICT DO NOTHING`, `The consumer inserts the ledger row with the event ID as its primary key: 1 row inserted, committed.`, { tone: "done" });
  sys.note(`${event} will arrive again: a relay that crashed before recording its progress republishes it, or a consumer that restarted before committing its offset reads it twice. At-least-once delivery makes duplicates normal, not exceptional.`, "duplicates");
  for (let d = 2; d <= Math.max(2, n); d++) {
    sys.set({ deliveries: d });
    sys.msg("client", "api", `${event} (redelivered)`, `Delivery ${d}: the same event, with the same ID.`);
    show("compare");
    sys.msg("api", "store", `INSERT (${event}, …) → 0 rows`, `The insert hits the primary key and changes nothing: 0 rows. The ledger still holds one row for ${event}.`, { tone: "compare" });
    show();
    if (sys.f.full) break;
  }
  sys.set({ "rows written": 1 });
  sys.note(`${Math.max(2, n)} deliveries, one ledger row. The database's own unique constraint did the deduplication, inside the same transaction as the write: no separate dedupe store, no time window, no clock.`, "result");
  sys.note(`The condition: the ID must be minted once at the source and stay with the event through every retry and replay. An ID generated by the consumer, or a new one per publish attempt, dedupes nothing.`, "done");
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

/**
 * Gossip. `fanout` (default 1) peers per node per round; `mode: "push-pull"`
 * has every node exchange with its peers, so uninformed nodes learn by
 * pulling too (default: push only, informed nodes send). The seed is chosen
 * deterministically among a few so the run shows typical, not unlucky,
 * spread. `variant: "suspicion"` is SWIM-style failure detection.
 */
const gossip: SysGen = (input) => {
  if (input.variant === "suspicion") return swimSuspicion(input);
  const n = clampInt(input.nodes, 3, 8, 6);
  const fanout = clampInt(input.fanout, 1, Math.min(3, n - 1), 1);
  const pushPull = input.mode === "push-pull";
  const ids = Array.from({ length: n }, (_, i) => `N${i + 1}`);
  const target = Math.ceil(Math.log2(n)) + (pushPull ? 0 : 1);
  type Round = { msgs: { from: string; to: string; kind: "push" | "pull" | "wasted" }[]; newly: string[]; known: number };
  const simulate = (seed: number): Round[] => {
    const rnd = lcg(seed);
    const know = new Set<string>([ids[0]!]);
    const rounds: Round[] = [];
    while (know.size < n && rounds.length < 8) {
      const msgs: Round["msgs"] = [];
      const learned = new Set<string>();
      const actors = pushPull ? ids : ids.filter((x) => know.has(x));
      for (const from of actors) {
        const others = ids.filter((x) => x !== from);
        const peers: string[] = [];
        while (peers.length < fanout) {
          const p = others[Math.floor(rnd() * others.length)]!;
          if (!peers.includes(p)) peers.push(p);
        }
        for (const to of peers) {
          if (know.has(from) && !know.has(to)) {
            msgs.push({ from, to, kind: "push" });
            learned.add(to);
          } else if (pushPull && !know.has(from) && know.has(to)) {
            msgs.push({ from: to, to: from, kind: "pull" });
            learned.add(from);
          } else msgs.push({ from, to, kind: "wasted" });
        }
      }
      for (const x of learned) know.add(x);
      rounds.push({ msgs, newly: [...learned], known: know.size });
    }
    return rounds;
  };
  let rounds = simulate(n * 7919 + 17);
  for (let s = 1; s <= 40 && (rounds.length > target || rounds[rounds.length - 1]!.known < n); s++) {
    const r = simulate(n * 7919 + 17 + s * 104729);
    if (r[r.length - 1]!.known === n && r.length <= target) rounds = r;
  }
  const sys = new Sys(ids.map((id) => ({ id, kind: "node" as const, state: "v1" })));
  const rows: (string | number)[][] = [];
  const show = () => sys.table({ title: "Rounds", head: pushPull ? ["round", "know v2", "learned by push", "learned by pull", "exchanges"] : ["round", "know v2", "messages", "wasted (already knew)"], rows: rows.map((r) => [...r]) });
  sys.set({ nodes: n, fanout, style: pushPull ? "push-pull" : "push", "expected rounds": `about log₂ ${n} ≈ ${Math.ceil(Math.log2(n))}${pushPull ? "" : " plus a slow finish"}` });
  sys.note(pushPull ? `Push-pull gossip with fanout ${fanout}: no coordinator. Every round, every node exchanges state with ${fanout} random peer${fanout > 1 ? "s" : ""}. An informed node pushes the news; an uninformed node that happens to contact an informed one pulls it.` : `Gossip (epidemic) protocol: no coordinator. Every round, each node that knows the update tells ${fanout === 1 ? "one random peer" : `${fanout} random peers`}. Like a rumour, it reaches everyone in about log N rounds no matter who fails.`);
  sys.state(ids[0]!, "v2 (new)", "done");
  sys.note(`${ids[0]} learns something new: a config change, a membership update, or a peer's heartbeat counter. It has no list of who needs it.`, "origin");
  rounds.forEach((r, i) => {
    const pushes = r.newly.filter((x) => r.msgs.some((m) => m.kind === "push" && m.to === x)).length;
    const pulls = r.newly.length - pushes;
    const wasted = r.msgs.filter((m) => m.kind === "wasted").length;
    rows.push(pushPull ? [i + 1, `${r.known} / ${n}`, r.newly.filter((x) => r.msgs.some((m) => m.kind === "push" && m.to === x)).length, r.newly.filter((x) => !r.msgs.some((m) => m.kind === "push" && m.to === x)).length, r.msgs.length] : [i + 1, `${r.known} / ${n}`, r.msgs.length, wasted]);
    show();
    for (const x of r.newly) sys.state(x, `v2 (round ${i + 1})`, "done");
    sys.s.messages = r.msgs.filter((m) => !pushPull || m.kind !== "wasted").map((m) => ({ from: m.from, to: m.to, label: m.kind === "pull" ? "pull v2" : "v2", tone: (m.kind === "wasted" ? "muted" : m.kind === "pull" ? "compare" : "active") as Tone, dashed: m.kind === "wasted" }));
    sys.s.log = [...sys.s.log.slice(-4), `round ${i + 1}: ${r.newly.length} new`];
    sys.set({ round: i + 1, "know v2": `${r.known} / ${n}` });
    const newlyText = `${r.newly.length} new node${r.newly.length === 1 ? "" : "s"} learn${r.newly.length === 1 ? "s" : ""} v2`;
    sys.f.push(pushPull ? `Round ${i + 1}: ${r.msgs.length} exchanges. ${newlyText}${pushes || pulls ? ` (${pushes} by push, ${pulls} by pull)` : ""}; the rest met nodes in the same state. Now ${r.known} of ${n} know.` : `Round ${i + 1}: ${r.msgs.length} node${r.msgs.length === 1 ? "" : "s"} send${r.msgs.length === 1 ? "s" : ""}. ${newlyText}${wasted ? `; ${wasted} message${wasted > 1 ? "s" : ""} hit nodes that already knew (dashed, wasted)` : ""}. Now ${r.known} of ${n} know.`, "round");
  });
  sys.clear();
  const total = rounds.reduce((a, r) => a + r.msgs.length, 0);
  sys.note(`Everyone knows v2 after ${rounds.length} rounds and ${total} messages. The informed count roughly multiplies each round, so doubling N adds about one round, and no node sent more than ${fanout} message${fanout > 1 ? "s" : ""} a round.${pushPull ? " Pull speeds the finish: late in the spread, a straggler that asks almost anyone gets the news, instead of waiting for a push to find it." : ""}`, "converged");
  sys.set({ "push vs pull": "push spreads fast early; pull finishes fast late; most systems do both", "anti-entropy": "periodic full sync (Merkle trees) repairs anything a rumour missed" });
  sys.note(`Two flavours: rumour mongering spreads a new update and stops after a few rounds, cheap but able to miss a node; anti-entropy periodically compares full state (or a digest) with a peer and never stops, which guarantees convergence. Cassandra and Riak run both.`, "variants");
  sys.note(`Failure mode: during a partition each side converges to its own view, and gossip carries stale news for a while: a removed node can be re-added by a peer that never heard it left, unless removals are gossiped as tombstones.`, "caveat");
  sys.note(`Trade-off: no coordinator, no single point of failure, load spread evenly; but only eventual delivery, redundant messages, and per-node state that grows with membership. Used for membership and failure detection in Cassandra, Consul (Serf/SWIM) and Redis Cluster.`, "done");
  return sys.f.done();
};

/** SWIM-style failure detection: indirect probes stop one bad link from ejecting a healthy node; real failures are suspected, then confirmed. */
const swimSuspicion = (input: SystemInput) => {
  const n = clampInt(input.nodes, 4, 8, 6);
  const ids = Array.from({ length: n }, (_, i) => `N${i + 1}`);
  const sys = new Sys(ids.map((id) => ({ id, kind: "node" as const, state: "all alive" })));
  const [a, b, c, d] = [ids[0]!, ids[1]!, ids[2]!, ids[3]!];
  const others = ids.filter((x) => x !== a && x !== d);
  sys.set({ "probe": "direct ping, then k = 2 indirect", "suspicion timeout": "seconds", incarnation: `${d}: 3` });
  sys.note(`Membership by gossip, with failure detection that only suspects at first. Each node's view of who is alive travels piggybacked on gossip; a suspicion is checked by other nodes before anyone acts on it.`);
  sys.msg(a, d, "ping", `${a} probes ${d} directly and hears nothing back. The link between them is bad, but ${d} is fine.`, { tone: "danger", dashed: true });
  sys.fanout(a, [b, c], `ping-req ${d}`, `Before suspecting anything, ${a} asks two other members to probe ${d} on its behalf.`, "compare");
  sys.s.messages = [{ from: b, to: d, label: "ping", tone: "compare" }, { from: c, to: d, label: "ping", tone: "compare" }];
  sys.f.push(`${b} and ${c} each ping ${d} over their own links.`, "probe");
  sys.s.messages = [{ from: d, to: b, label: "ack", tone: "done" }, { from: d, to: c, label: "ack", tone: "done" }];
  sys.f.push(`${d} answers both, and they relay the acks to ${a}. ${d} is alive; one bad link did not eject a healthy node.`, "refuted");
  sys.state(d, "DOWN", "danger");
  sys.note(`Later ${d} really crashes.`, "crash");
  sys.state(a, `${d} suspect`, "compare");
  sys.s.messages = [{ from: a, to: d, label: "ping", tone: "danger", dashed: true }, { from: b, to: d, label: "ping", tone: "danger", dashed: true }, { from: c, to: d, label: "ping", tone: "danger", dashed: true }];
  sys.f.push(`The direct probe and both indirect probes fail. ${a} marks ${d} suspect, not dead: suspicion is cheap and local, so ${a} just stops sending it requests.`, "suspect");
  others.forEach((x) => sys.state(x, `${d} suspect`, "compare"));
  sys.fanout(a, others, `${d} suspect (inc 3)`, `The suspicion spreads by gossip like any other update, tagged with ${d}'s incarnation number, 3.`, "compare");
  sys.note(`Had ${d} been alive, it would see the rumour about itself and refute it by gossiping "alive, incarnation 4", which overrides any suspicion of incarnation 3.`, "refute");
  [a, ...others].forEach((x) => sys.state(x, `${d} dead`, "danger"));
  sys.fanout(a, others, `${d} confirmed dead`, `No refutation arrives before the suspicion timeout, so ${d} is declared dead and that, too, is gossiped. Only now does one decision-maker start the irreversible work: reassigning ${d}'s partitions or re-replicating its data.`, "danger");
  sys.note(`Suspect quickly, convict slowly: indirect probes and a refutation window trade a few seconds of detection time for not ejecting healthy nodes over one bad link or a pause. This is SWIM, as used by Consul, Nomad and Serf.`, "done");
  return sys.f.done();
};

/**
 * Distributed lock with a TTL, a pause, and the fix. `holders`, `resource`,
 * `item`, `state` relabel it; `fence: "conditional"` replaces fencing tokens
 * with the storage's own conditional write (`check`, `writeA`, `writeB`).
 */
const distributedLock: SysGen = (input) => {
  const hs = Array.isArray(input.holders) ? (input.holders as unknown[]).map(String) : [];
  const A = label(hs[0], "Client A");
  const B = label(hs[1], "Client B");
  const resource = label(input.resource, "Storage");
  const item = label(input.item, "the file");
  const itemTag = item.replace(/^the /, "");
  const initial = label(input.state, `${itemTag} v1`);
  const conditional = input.fence === "conditional";
  const writeB = label(input.writeB, "write v2");
  const writeA = label(input.writeA, "write v2'");
  const check = label(input.check, `write only if ${item} is still in the state the writer read`);
  const sys = new Sys([
    { id: "A", label: A, kind: "client", x: 8, y: 20, state: "wants the lock" },
    { id: "B", label: B, kind: "client", x: 8, y: 80, state: "wants the lock" },
    { id: "lock", label: "Lock service", kind: "service", x: 50, y: 50, state: "free" },
    { id: "store", label: resource, kind: "db", x: 92, y: 50, state: initial },
  ]);
  sys.set({ "lock TTL": "10 s", fencing: "off" });
  sys.note(`A distributed lock lets one client at a time touch a shared resource, here ${item}. Because clients can die while holding it, the lock is a lease with a TTL, and that expiry is where the trouble starts.`);
  sys.msg("A", "lock", `acquire(${itemTag}, TTL 10 s)`, `${A} asks for the lock.`);
  sys.state("lock", `held by ${A} · token 33 · 10 s`, "active");
  sys.state("A", "holds lock (token 33)", "done");
  sys.msg("lock", "A", "granted · token 33", `Granted, with token 33. The service records the holder and starts the 10 s lease; ${A} must renew or finish before then.`, { tone: "done" });
  sys.msg("B", "lock", `acquire(${itemTag})`, `${B} asks too.`);
  sys.state("B", "waiting", "compare");
  sys.msg("lock", "B", `denied (held by ${A})`, `Denied: ${B} waits and retries. So far mutual exclusion works.`, { tone: "compare" });
  sys.state("A", "GC PAUSE (15 s)…", "danger");
  sys.note(`Failure mode: ${A} stops for 15 s: a stop-the-world GC, a page fault to swap, a VM live migration. It is not dead, only late, and it cannot tell.`, "pause");
  sys.state("lock", "expired → free", "danger");
  sys.note(`The lease expires. The lock service cannot distinguish a paused client from a dead one; releasing is the only way not to block forever.`, "expire");
  sys.state("lock", `held by ${B} · token 34`, "active");
  sys.state("B", "holds lock (token 34)", "done");
  sys.msg("B", "lock", "acquire → granted · token 34", `${B} acquires the lock with the next token, 34, and starts working.`, { tone: "done" });
  sys.state("store", `${writeB} (by ${B})`, "done");
  sys.msg("B", "store", writeB, `${B} writes to the ${lc(resource)}. Legitimate: it holds the lock.`, { tone: "done" });
  sys.state("A", "resumes: still 'holds' lock", "danger");
  sys.note(`${A} wakes up. From its point of view nothing happened: it acquired the lock, ran some code, and is about to write. It has no idea 15 s passed.`, "resume");
  sys.state("store", `${writeA} on top: CORRUPTED`, "danger");
  sys.msg("A", "store", `${writeA} (no check)`, `With no check at the ${lc(resource)}, ${A}'s write lands on top of ${B}'s. Two clients wrote under one lock: mutual exclusion is broken. No TTL choice fixes this; a pause can always be longer.`, { tone: "danger" });
  if (conditional) {
    sys.set({ fencing: "the storage's conditional write", check });
    sys.state("store", `${writeB} (by ${B})`, "done");
    sys.note(`Fix: let the ${lc(resource)} do the check it already can. Every write is conditional: ${check}. That condition is a fencing token the ${lc(resource)} keeps for free.`, "fix");
    sys.msg("A", "store", `${writeA} (conditional)`, `Replay with the conditional write: ${A} tries ${writeA} again.`, { tone: "compare" });
    sys.state("A", "write rejected → steps down", "visited");
    sys.msg("store", "A", "0 rows: condition failed", `${B}'s write already changed ${item}, so ${A}'s condition no longer holds and the write changes nothing. ${A} learns it lost ownership and steps down; ${B}'s work is safe.`, { tone: "done" });
    sys.note(`Trade-off: the lock is now only an efficiency measure that keeps two clients from doing the same work; correctness comes from the conditional write at the ${lc(resource)}, with no second system to keep consistent.`, "done");
    return sys.f.done();
  }
  sys.set({ fencing: "on", "highest token seen": 34 });
  sys.state("store", `${writeB} · token 34`, "done");
  sys.note(`Fix: fencing tokens. The lock service hands out a strictly increasing token with each grant, every write carries it, and the ${lc(resource)} remembers the highest token it has seen.`, "fix");
  sys.msg("A", "store", `${writeA} (token 33)`, `Replay with fencing: ${A}'s write carries its stale token 33.`, { tone: "compare" });
  sys.state("A", "write rejected", "visited");
  sys.msg("store", "A", "REJECT: 33 < 34", `The ${lc(resource)} sees a token lower than 34 and rejects it. The old holder is fenced off; ${B}'s work is safe. Fencing puts the safety check on the resource, the only party that can enforce it.`, { tone: "done" });
  sys.set({ "lock service must be": "consensus-backed (ZooKeeper, etcd) for correctness", Redlock: "relies on timing assumptions; fine for efficiency, not for correctness" });
  sys.note(`Trade-off: ask what the lock is for. For efficiency (avoid duplicate work) a simple TTL lock is fine and the occasional double run is harmless. For correctness you need a consensus-backed lock service and fencing tokens on every resource, and both add latency and complexity.`, "done");
  return sys.f.done();
};

/**
 * Leader lease. The default is a lease held in a lease store, with renewal,
 * a partition, self-enforced expiry and a drift grace. `fencing: true` makes
 * the holder pause instead and shows the epoch (fencing token) the resource
 * checks; `holders`, `resource`, `epoch`, `writes` label it. `variant:
 * "raft"` builds the lease from followers' promises instead of a store.
 */
const leaderLease: SysGen = (input) => {
  if (input.variant === "raft") return raftLeaseReads();
  if (input.fencing === true) return fencedLease(input);
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

/** A lease plus an epoch carried in every write: a paused holder wakes up and is rejected by the store. */
const fencedLease = (input: SystemInput) => {
  const hs = Array.isArray(input.holders) ? (input.holders as unknown[]).map(String) : [];
  const A = label(hs[0], "Node A");
  const B = label(hs[1], "Node B");
  const resource = label(input.resource, "Store");
  const e = clampInt(input.epoch, 1, 1_000_000, 1);
  const ws = Array.isArray(input.writes) ? (input.writes as unknown[]).map(String) : [];
  const w1 = label(ws[0], "write w1");
  const w2 = label(ws[1], "write w2");
  const w3 = label(ws[2], "write w3");
  const sys = new Sys([
    { id: "lease", label: "Lease store", kind: "service", x: 50, y: 10, state: "no holder" },
    { id: "A", label: A, kind: "node", x: 12, y: 55, state: "candidate" },
    { id: "B", label: B, kind: "node", x: 88, y: 55, state: "standby" },
    { id: "res", label: resource, kind: "db", x: 50, y: 92, state: "highest epoch: –" },
  ]);
  sys.set({ "lease": "10 s", "fencing": "every write carries the holder's epoch; the store rejects older epochs" });
  sys.note(`Ownership as a lease with a fencing token. The lease store hands out a lease with a strictly increasing epoch, the holder stamps that epoch on every write, and the ${lc(resource)} remembers the highest epoch it has accepted.`);
  sys.state("lease", `${A} · epoch ${e} · 10 s`, "active");
  sys.state("A", `owner · epoch ${e}`, "done");
  sys.msg("lease", "A", `granted · epoch ${e}`, `${A} acquires the lease with epoch ${e}.`, { tone: "done" });
  sys.state("res", `highest epoch: ${e}`, "done");
  sys.msg("A", "res", `${w1} · epoch ${e}`, `${A} writes with epoch ${e}; the store accepts and records ${e}.`, { tone: "done" });
  sys.state("A", `GC PAUSE · epoch ${e}`, "danger");
  sys.note(`${A} stops: a long GC pause. It is not partitioned and not dead, only frozen, so it cannot renew and cannot notice that time is passing.`, "pause");
  sys.state("lease", `${B} · epoch ${e + 1}`, "active");
  sys.state("B", `owner · epoch ${e + 1}`, "done");
  sys.msg("lease", "B", `expired → ${B} · epoch ${e + 1}`, `The lease expires. The store cannot tell a paused holder from a dead one, so it grants the lease to ${B} with the next epoch, ${e + 1}.`, { tone: "done" });
  sys.state("res", `highest epoch: ${e + 1}`, "done");
  sys.msg("B", "res", `${w2} · epoch ${e + 1}`, `${B} writes with epoch ${e + 1}. Accepted; the store's highest epoch is now ${e + 1}.`, { tone: "done" });
  sys.state("A", `wakes · still thinks epoch ${e}`, "danger");
  sys.msg("A", "res", `${w3} · epoch ${e}`, `${A} wakes up. From its point of view nothing happened: it still owns the work and goes on writing, stamped with epoch ${e}.`, { tone: "danger" });
  sys.state("A", "rejected → steps down", "visited");
  sys.msg("res", "A", `REJECT: ${e} < ${e + 1}`, `The store's conditional write sees epoch ${e}, older than ${e + 1}, and rejects it. ${A} learns it was deposed and steps down. Two owners existed for a moment, but only one could write.`, { tone: "done" });
  sys.note(`A lease alone cannot stop a holder that is paused rather than cut off: no timeout runs while it is frozen. The epoch check at the store is what makes the lease safe, because the store is the one party that sees both writers.`, "done");
  return sys.f.done();
};

/** Raft lease reads: the lease comes from followers' promise not to elect anyone before their election timeout. */
const raftLeaseReads = () => {
  const sys = new Sys([
    { id: "A", label: "A (leader)", kind: "node", x: 40, y: 20, state: "term 2", tone: "active" },
    { id: "B", kind: "node", x: 85, y: 20, state: "follower" },
    { id: "C", kind: "node", x: 85, y: 80, state: "follower" },
    { id: "clients", label: "Clients", kind: "client", x: 8, y: 80 },
  ]);
  sys.set({ "election timeout": "≥ 150 ms", "drift margin": "subtracted from the lease", "no lease store": "the lease comes from the followers" });
  sys.note(`Lease reads in Raft. There is no lease store: the lease comes from the followers. A follower that has just heard from the leader will not start an election until its own election timeout runs out, and that promise is the lease.`);
  sys.fanout("A", ["B", "C"], "heartbeat (t = 0)", `At t = 0 the leader sends a heartbeat round.`, "muted", "heartbeat");
  sys.state("B", "promise: no election before t + 150 ms", "compare");
  sys.state("C", "promise: no election before t + 150 ms", "compare");
  sys.fanin(["B", "C"], "A", "ack", `A majority acknowledges. Each ack means: I heard a leader at t, and I will not vote anyone else in before my election timeout passes.`, "compare");
  sys.state("A", "lease until t + 150 ms − drift", "done");
  sys.note(`So no other leader can be elected before t plus the minimum election timeout. A measures the lease from the moment it sent the round, subtracts a margin for clock drift, and for that long knows it is still the leader.`, "lease");
  sys.msg("clients", "A", "READ x → 7 (local)", `Reads during the lease are answered from local state: no heartbeat round per read, unlike ReadIndex.`, { tone: "done" });
  sys.state("A", "partitioned", "danger");
  sys.msg("A", "B", "heartbeat", `A is cut off. Its next heartbeat round gets no acks, so its lease is not extended.`, { tone: "danger", dashed: true });
  sys.state("A", "lease expired · no lease reads", "muted");
  sys.note(`When the lease runs out by A's own clock, A stops answering reads locally. It may still think it is leader, but without a fresh majority it can no longer prove it.`, "expire");
  sys.state("B", "follower · term 3", "visited");
  sys.state("C", "LEADER · term 3", "done");
  sys.msg("C", "B", "RequestVote(term 3)", `Only after their election timeouts expire, as promised, do B and C elect a new leader: C wins term 3. By then A has already stopped serving, so the two never answer reads at the same time.`);
  sys.msg("clients", "C", "READ x", `Clients move to C.`, { tone: "done" });
  sys.note(`The catch: this rests on clocks. If the followers' clocks run fast or the leader's runs slow by more than the margin, an election can finish while the old leader still believes its lease, and it serves a stale read. ReadIndex costs a round trip per read but needs no clock assumption.`, "done");
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
  sys.state(ids[0]!, fmt(V[0]!));
  sys.fanout(ids[0]!, ids.slice(1), `state [${V[0]!.join(",")}]`, `The partition heals and ${ids[0]} sends its state to everyone.`, "active");
  for (let i = 1; i < n; i++) merge(i, 0);
  show(ids.map((_, i) => i).slice(1), "done");
  sys.note(`Each replica merges ${ids[0]}'s vector. Their own slots are untouched (max with a smaller number), ${ids[0]}'s slot jumps to 2.`, "merge");
  for (let i = 1; i < n; i++) merge(0, i);
  show([0], "done");
  sys.fanin(ids.slice(1), ids[0]!, "state", `The others reply with their states and ${ids[0]} merges them too: max per slot gives ${fmt(V[0]!)}.`, "done");
  const behind = ids.map((_, i) => i).filter((i) => i > 0 && V[i]!.some((x, j) => x !== V[0]![j]));
  for (const i of behind) merge(i, 0);
  show(ids.map((_, i) => i), "done");
  if (behind.length) sys.fanout(ids[0]!, behind.map((i) => ids[i]!), `state [${V[0]!.join(",")}]`, `${behind.map((i) => ids[i]).join(" and ")} still lacked a slot it had never heard from directly, so one more exchange from ${ids[0]} carries it over. Gossip keeps exchanging until every pair agrees.`, "done");
  const total = V[0]!.reduce((a, b) => a + b, 0);
  sys.set({ converged: `every replica = ${total}`, "messages needed": "any spanning pattern, in any order, any number of times" });
  sys.note(`Converged: all replicas read ${total}, and they would have reached ${total} in any delivery order, with duplicates, or with messages dropped and resent later. That is strong eventual consistency.`, "converged");
  sys.note(`Why a vector and not one integer with max? Because max(2, 2) = 2 would lose an increment when two replicas each counted 2. Per-replica ownership of a slot is what makes concurrent increments add instead of collide.`, "why");
  sys.note(`Decrements: a PN-Counter is two G-Counters, P minus N. Failure mode: one slot per replica that ever existed, so churn bloats the state until you garbage-collect retired replica ids; and there is no "reset to zero" or "never exceed 100": invariants that need agreement need consensus, not CRDTs.`, "caveat");
  sys.note(`Trade-off: always-available, coordination-free writes and guaranteed convergence, but only for operations that commute; anything with a global invariant is out of scope. Used for counters, sets, and collaborative text (Yjs, Automerge, Riak data types).`, "done");
  return sys.f.done();
};

// ---------- storage engines ----------

/** MVCC at table scale (Iceberg-style): snapshots list immutable data files; a catalog pointer swap commits; expiry is vacuum. */
const tableSnapshots = () => {
  const sys = new Sys([
    { id: "reader", label: "Long query", kind: "client", x: 8, y: 20, state: "idle" },
    { id: "writer", label: "Writer (DELETE)", kind: "client", x: 8, y: 80, state: "idle" },
    { id: "cat", label: "Catalog", kind: "service", x: 50, y: 50, state: "→ v42 (snapshot S42)" },
    { id: "store", label: "Object store", kind: "db", x: 90, y: 50, state: "files 1, 2, 17" },
    { id: "reader2", label: "New query", kind: "client", x: 50, y: 92, state: "idle" },
  ]);
  const snaps: (string | number)[][] = [["S42", "file 1, file 2, file 17", "current"]];
  const show = (tones?: (Tone | undefined)[]) => sys.table({ title: "Snapshots (each lists immutable data files)", head: ["snapshot", "data files", "status"], rows: snaps.map((r) => [...r]), tones });
  show();
  sys.set({ "row versions in a database": "whole files in a table format", "vacuum": "snapshot expiry" });
  sys.note(`A table format does MVCC with whole files. Each snapshot is a list of immutable data files; the catalog holds one pointer per table, to the current metadata, which names the current snapshot.`);
  sys.state("reader", "pinned S42", "active");
  show(["active"]);
  sys.msg("reader", "cat", "plan query → S42", `A long query starts and pins snapshot S42: it will read exactly files 1, 2 and 17, whatever commits happen while it runs.`);
  sys.state("writer", "rewriting file 17", "active");
  sys.state("store", "files 1, 2, 17, 17′", "compare");
  sys.msg("writer", "store", "write file 17′ (rows deleted)", `A writer deletes some rows with copy-on-write. Files are immutable, so it writes a new file 17′ without those rows; file 17 is untouched.`);
  snaps.push(["S43", "file 1, file 2, file 17′", "committing"]);
  show([undefined, "active"]);
  sys.msg("writer", "store", "manifest + metadata v43", `It writes a new manifest and metadata file describing snapshot S43: files 1, 2 and 17′. Nothing anyone reads has changed yet.`, { tone: "compare" });
  sys.state("cat", "→ v43 (snapshot S43)", "done");
  snaps[0]![2] = "old (pinned)";
  snaps[1]![2] = "current";
  show(["active", "done"]);
  sys.state("writer", "committed", "done");
  sys.msg("writer", "cat", "swap v42 → v43 if still v42", `The commit is one compare-and-swap of the catalog pointer from v42 to v43. Readers see the old snapshot or the new one, never half of a commit.`, { tone: "done" });
  sys.msg("store", "reader", "files 1, 2, 17", `The long query keeps reading file 17, with the deleted rows still in it: its snapshot is S42, just as a database transaction keeps seeing an old row version.`, { tone: "compare" });
  sys.state("reader2", "pinned S43", "done");
  sys.msg("reader2", "cat", "plan query → S43", `A query that starts now resolves the pointer to v43 and reads files 1, 2 and 17′: the rows are gone. Two queries, two snapshots, both correct.`, { tone: "done" });
  sys.state("reader", "finished", "visited");
  snaps[0]![2] = "expired";
  show(["danger", undefined]);
  sys.state("store", "files 1, 2, 17′", "done");
  sys.note(`Snapshot expiry is the vacuum: once no query needs S42 and it passes the retention window, S42 is expired and file 17, referenced by no live snapshot, is deleted. Until then the deleted rows still exist on disk and time travel to S42 still works, which matters for privacy deletions.`, "expire");
  sys.note(`Same ideas, bigger unit: database MVCC versions rows and vacuums dead tuples; a table format versions file lists and expires snapshots. Both let readers and writers proceed without blocking each other, and both bloat if old versions are never cleaned up.`, "done");
  return sys.f.done();
};

/** MVCC snapshot isolation in one database; `variant: "table"` is the table-format form. */
const mvcc: SysGen = (input) => {
  if (input.variant === "table") return tableSnapshots();
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
  sys.msg("db", "client", "COMMIT OK", `The commit is acknowledged when the log record is on disk, not when the page is. Commit latency is about one fsync: tens of microseconds on a fast NVMe drive, a few milliseconds on a typical cloud volume or VM disk.`, { tone: "done" });
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
  sys.msg("wal", "db", "redo LSN 1, LSN 2", `Redo: reapply every record whose LSN is newer than the page's own LSN (each page stores the LSN of its last change, so replay is idempotent). What happens to transactions that never committed depends on the engine: ARIES-style engines such as InnoDB then undo them from undo logs; Postgres has no undo phase, because rows written by a transaction that never committed are simply invisible.`, { tone: "done" });
  sys.state("data", "checkpoint LSN 2", "done");
  sys.state("db", "buffer pool: clean", "visited");
  sys.msg("db", "data", "checkpoint: flush pages 7, 9", `Checkpoint: dirty pages are written to the data files and the checkpoint LSN advances. Log before it can be recycled, and recovery time is bounded by the log since the last checkpoint.`, { tone: "done" });
  sys.set({ "write amplification": "every change written twice (log, then page)", "bonus": "the log doubles as the replication and CDC stream", "fsync off": "acknowledged commits can vanish" });
  sys.note(`Trade-off: every change is written twice, but the first write is sequential and batched, and the second is deferred and coalesced. Commit latency is dominated by fsync; disabling it (or a disk that lies about fsync) means losing acknowledged commits. Postgres, InnoDB, SQLite (WAL mode), RocksDB all work this way.`, "done");
  return sys.f.done();
};

/** A composite index (target_kind, target_slug, created_at): two equalities, then the sort column, served by one range walk. */
const compositeIndex = () => {
  const leaves = [
    ["lesson · arrays · 09-01 10:00", "lesson · arrays · 09-03 14:20", "lesson · b-trees · 08-30 09:15"],
    ["lesson · b-trees · 09-02 11:40", "lesson · b-trees · 09-05 16:05", "lesson · heaps · 09-01 08:30"],
    ["problem · two-sum · 08-28 12:00", "problem · two-sum · 09-04 19:45"],
  ];
  const sys = new Sys([
    { id: "q", label: "Q6 query", kind: "client", x: 8, y: 15 },
    { id: "root", label: "root page", kind: "node", x: 50, y: 15, state: "2 separators" },
    { id: "L1", label: "leaf 1", kind: "db", x: 18, y: 82, state: "3 entries" },
    { id: "L2", label: "leaf 2", kind: "db", x: 50, y: 82, state: "3 entries" },
    { id: "L3", label: "leaf 3", kind: "db", x: 82, y: 82, state: "2 entries" },
  ]);
  const show = (hi: [number, number][] = [], tone: Tone = "active") => {
    const rows: (string | number)[][] = [];
    const tones: (Tone | undefined)[] = [];
    leaves.forEach((l, i) => l.forEach((e, j) => {
      rows.push([`leaf ${i + 1}`, e]);
      tones.push(hi.some(([a, b]) => a === i && b === j) ? tone : undefined);
    }));
    sys.table({ title: "idx_comments_target: entries sorted by (target_kind, target_slug, created_at)", head: ["page", "key"], rows, tones });
  };
  show();
  sys.set({ query: "WHERE target_kind = 'lesson' AND target_slug = 'b-trees' ORDER BY created_at LIMIT 3" });
  sys.note(`Q6 reads the comments on one lesson in order. The index sorts its entries by target_kind, then target_slug, then created_at, so all comments on one lesson sit next to each other, already in time order.`);
  sys.tone("root", "active");
  sys.msg("q", "root", "seek (lesson, b-trees, start)", `The query seeks the first entry with target_kind 'lesson' and target_slug 'b-trees'. The root's separators send that key to leaf 1, because it sorts before the first separator (lesson, b-trees, 09-02 11:40).`, { tone: "compare" });
  sys.tone("root", undefined);
  sys.tone("L1", "done");
  show([[0, 2]], "done");
  sys.set({ rows: 1 });
  sys.msg("root", "L1", "→ leaf 1", `In leaf 1 the arrays comments sort first; the first b-trees entry is the comment from 08-30 09:15. Row 1, with no sort step: the order is the index's order.`, { tone: "done" });
  sys.tone("L2", "done");
  show([[0, 2], [1, 0], [1, 1]], "done");
  sys.set({ rows: 3 });
  sys.msg("L1", "L2", "sibling pointer →", `Leaf 1 ends, so the walk follows the sibling pointer to leaf 2: 09-02 11:40 and 09-05 16:05. That is three rows, and LIMIT 3 stops the scan right here.`, { tone: "done" });
  sys.tone("L1", undefined);
  sys.tone("L2", undefined);
  show([[1, 2]], "compare");
  sys.note(`Even without the limit the walk would stop at the next entry, (lesson, heaps, …): it is past the prefix, so no later entry can match. Leaf 3, the problem comments, is never read.`, "stop");
  sys.note(`Column order is the whole design: equality columns first, then the sort column. An index on (created_at, target_kind, target_slug) holds the same data, but one lesson's comments are scattered across the whole time range, so the query scans and sorts.`, "order");
  sys.note(`Newest first is the same index read backwards from the end of the lesson's range, one backward index scan. Q6 costs a descent of a few pages plus the rows it returns, however many comments other lessons have.`, "done");
  return sys.f.done();
};

/** B-tree index lookup, range scan and splits; `variant: "composite"` is a multi-column index serving equality-then-sort. */
const bTreeIndex: SysGen = (input) => {
  if (input.variant === "composite") return compositeIndex();
  const { keys } = input;
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
      sys.msg("root", leaf.id, `INSERT ${k}`, `Insert ${k}: routed to leaf ${i + 1}, which had a free slot. The key slides into place in the page, which now holds ${leaf.keys.length} of ${CAP} keys${leaf.keys.length === CAP ? ", full" : ""}; nothing else changes. This write goes through the WAL like any page change.`, { tone: "done" });
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

/**
 * LSM tree. `log` and `client` relabel the boxes; `grace` (a phrase such as
 * "gc_grace_seconds, 10 days") keeps the tombstone through compaction until the
 * grace period ends, as Cassandra does; `checkpoint: true` adds the incremental
 * checkpoints a stream processor takes of its RocksDB state; `variant: "parts"`
 * is the OLAP form (ClickHouse MergeTree), where every insert is a part.
 */
const lsmTree: SysGen = (input) => {
  if (input.variant === "parts") return mergeTreeParts(input);
  const logLabel = label(input.log, "WAL");
  const grace = typeof input.grace === "string" && input.grace.trim() ? input.grace.trim() : "";
  const checkpoint = input.checkpoint === true;
  const sys = new Sys([
    { id: "client", label: label(input.client, "Client"), kind: "client", x: 6, y: 50 },
    { id: "wal", label: logLabel, kind: "db", x: 42, y: 12, state: "empty" },
    { id: "mem", label: "Memtable", kind: "cache", x: 42, y: 50, state: "0 / 4" },
    { id: "L0", label: "L0 SSTables", kind: "db", x: 88, y: 25, state: "0 files" },
    { id: "L1", label: "L1 (merged)", kind: "db", x: 88, y: 80, state: "0 files" },
    ...(checkpoint ? [{ id: "ckpt", label: "Checkpoint store", kind: "external" as const, x: 42, y: 92, state: "SST-1" }] : []),
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
  sys.set({ "write path": `${logLabel} append + memtable insert`, "read path": "memtable → L0 (newest first) → L1", "memtable flush at": `${CAP} entries` });
  sys.note(`LSM-tree (log-structured merge): writes go to an in-memory sorted table and are flushed as immutable sorted files, which are later merged. Every disk write is sequential; reads may have to look in several places.`);
  mem = { a: "1", b: "2" };
  show("memtable");
  sys.state("wal", "2 records", "active");
  sys.msg("client", "mem", "put a=1, put b=2", `Each put is appended to the ${logLabel === "WAL" ? "WAL" : logLabel.toLowerCase()} (crash safety) and inserted into the memtable, a sorted in-memory structure (skip list or red-black tree). Sub-millisecond, no disk seeks.`);
  mem = { a: "4", b: "2", c: "3" };
  show("memtable");
  sys.state("wal", "4 records", "active");
  sys.msg("client", "mem", "put c=3, put a=4", `Overwriting a in the memtable just replaces the in-memory value; the ${logLabel === "WAL" ? "WAL" : logLabel.toLowerCase()} still has both records.`);
  mem = { a: "4", b: "2", c: "3", d: "5" };
  show("memtable", "danger");
  sys.state("mem", `${CAP} / ${CAP} FULL`, "danger");
  sys.state("wal", "5 records", "active");
  sys.msg("client", "mem", "put d=5", `The fifth put, d=5, is logged and inserted; the memtable now holds 4 distinct keys and reaches its size limit.`);
  l0 = [["a=4", "b=2", "c=3", "d=5"]];
  mem = {};
  show("L0 SST-1", "done");
  sys.state("wal", "truncated", "visited");
  sys.state("mem", "0 / 4 (fresh)");
  sys.msg("mem", "L0", "flush → SST-1", `Flush: the memtable is written as one sorted, immutable SSTable with a sparse index and a Bloom filter, in a single sequential write. The ${logLabel === "WAL" ? "WAL" : logLabel.toLowerCase()} segment can now be dropped; a fresh memtable takes new writes.`, { tone: "done" });
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
  if (checkpoint) {
    sys.set({ "last checkpoint": "SST-1 (uploaded earlier)", "this checkpoint uploads": "SST-2 only" });
    sys.state("ckpt", "SST-1, SST-2", "done");
    sys.msg("L0", "ckpt", "checkpoint: upload SST-2", `A checkpoint: the files are immutable, so the snapshot is the set of files that exist now. SST-1 was uploaded by the previous checkpoint, so only SST-2 goes to durable storage. That is an incremental checkpoint.`, { tone: "compare", tag: "checkpoint" });
  }
  l1 = grace ? ["a=4", "b=9", "c=⊥", "d=5", "e=6", "f=7"] : ["a=4", "b=9", "d=5", "e=6", "f=7"];
  l0 = [];
  show("L1", "done");
  sys.msg("L0", "L1", "compact SST-1 + SST-2 → L1", grace ? `Compaction: a background merge-sort of the two files into one non-overlapping L1 file. Newer values win (b=9) and c=3 is gone, but the tombstone c=⊥ is kept until the grace period (${grace}) passes, so a replica that missed the delete cannot bring c back during repair.` : `Compaction: a background merge-sort of the two files into one non-overlapping L1 file. Newer values win (b=9), and the tombstone for c drops both c=3 and itself since nothing older remains.`, { tone: "done" });
  if (checkpoint) sys.set({ "this checkpoint uploads": "the new L1 file; SST-1 and SST-2 are no longer referenced" });
  sys.msg("client", "L1", "get b → L1 → b=9", `Read b now: memtable empty, L0 empty, one L1 file. Compaction pays a write cost now to make every later read cheaper.${checkpoint ? " The next checkpoint uploads the new L1 file and stops referencing SST-1 and SST-2." : ""}${grace ? " After the grace period, a later compaction drops c's tombstone too." : ""}`, { tone: "done" });
  sys.set({ "write amplification": "each byte rewritten once per level (≈10× per level with size-tiered ratios)", "read amplification": "one lookup per overlapping file, cut by Bloom filters", "space amplification": "old versions live until compacted" });
  sys.note(`Failure modes: compaction competes with foreground I/O and can fall behind, and then write stalls kick in as L0 piles up; tombstones must survive until they reach the bottom level or deleted keys resurrect; a burst of writes to the same key wastes space until compaction.`, "caveat");
  sys.note(`Trade-off: sequential writes and excellent write throughput and compression (no in-place updates, no fragmentation), at the cost of slower point reads and range scans and background compaction that must be tuned. The B-tree makes the opposite bet. RocksDB, LevelDB, Cassandra, HBase, and most modern KV stores are LSM-based.`, "done");
  return sys.f.done();
};

/** ClickHouse MergeTree: no memtable; each INSERT is a sorted, immutable part, and background merges combine parts. */
const mergeTreeParts: SysGen = () => {
  const sys = new Sys([
    { id: "client", label: "Writers", kind: "client", x: 6, y: 30 },
    { id: "query", label: "Query", kind: "client", x: 6, y: 85 },
    { id: "parts", label: "Partition 202405", kind: "db", x: 50, y: 55, state: "0 parts" },
    { id: "merge", label: "Merge threads", kind: "service", x: 90, y: 55, state: "idle" },
  ]);
  let parts: { name: string; rows: string; level: number }[] = [];
  const show = (hi: string[] = [], tone: Tone = "active") => {
    sys.table({ title: "Active parts in partition 202405 (name = partition_minblock_maxblock_level)", head: ["part", "rows", "level"], rows: parts.map((p) => [p.name, p.rows, p.level]), tones: parts.map((p) => (hi.includes(p.name) ? tone : undefined)) });
    sys.state("parts", `${parts.length} part${parts.length === 1 ? "" : "s"}`);
  };
  show();
  sys.note(`ClickHouse's MergeTree has no memtable. Every INSERT is sorted by the table's sort key and written as its own immutable part; background merges combine parts, the same idea as LSM compaction.`);
  for (let b = 1; b <= 3; b++) {
    const name = `202405_${b}_${b}_0`;
    parts.push({ name, rows: "8,192", level: 0 });
    show([name], "done");
    sys.msg("client", "parts", `INSERT 8,192 rows → ${name}`, b === 1 ? `A batched insert of 8,192 rows becomes part ${name}: partition 202405, block ${b} to ${b}, level 0. Its columns, sparse index and marks are written once and never modified.` : `Another insert, another part: ${name}. Parts are cheap to write because nothing existing is touched.`, { tone: "done" });
  }
  show(parts.map((p) => p.name), "compare");
  sys.msg("query", "parts", "SELECT … WHERE title_id = 81234", `A query must consult every active part: each has its own sparse index and its own files. Three parts, three index lookups.`, { tone: "compare" });
  parts = [{ name: "202405_1_2_1", rows: "16,384", level: 1 }, parts[2]!];
  show(["202405_1_2_1"], "done");
  sys.state("merge", "merging", "active");
  sys.msg("merge", "parts", "merge 1_1_0 + 2_2_0 → 1_2_1", `A background merge reads two parts in sort order and writes one: the block range widens to 1–2 and the level goes up to 1. The inputs are deleted once the merge commits. Merges are the only way rows ever move.`, { tone: "done" });
  parts = [{ name: "202405_1_3_2", rows: "24,576", level: 2 }];
  show(["202405_1_3_2"], "done");
  sys.msg("merge", "parts", "merge 1_2_1 + 3_3_0 → 1_3_2", `Another merge folds in the third part. The partition is one part again, sorted end to end.`, { tone: "done" });
  sys.state("merge", "idle", undefined);
  sys.msg("query", "parts", "SELECT … → 1 part", `The same query now opens one part. Merging paid a rewrite to make reads cheaper, exactly the LSM trade.`, { tone: "done" });
  parts = Array.from({ length: 6 }, (_, i) => ({ name: `202405_${i + 4}_${i + 4}_0`, rows: "1", level: 0 }));
  parts.unshift({ name: "202405_1_3_2", rows: "24,576", level: 2 });
  show(parts.slice(1).map((p) => p.name), "danger");
  sys.state("parts", "1,000+ parts", "danger");
  sys.state("merge", "saturated", "danger");
  sys.msg("client", "parts", "500 servers × INSERT 1 row", `Failure mode: 500 application servers each inserting one row at a time. Every insert is a part, and parts arrive far faster than merges can combine them. Past parts_to_delay_insert (1,000 by default) inserts are slowed, and past parts_to_throw_insert (3,000 since release 23.6) they fail with a "too many parts" error.`, { tone: "danger" });
  sys.note(`The fix is on the writer's side: batch thousands of rows per insert about once a second, turn on async inserts so the server buffers small ones, or write through Kafka and let a consumer batch.`, "fix");
  sys.note(`Druid and Pinot segments follow the same pattern: immutable sorted runs written once and merged in the background. Write cost is deferred to merges; reads get cheaper as runs get fewer and larger.`, "done");
  return sys.f.done();
};

const PROBE_WORDS = ["blue", "green", "news", "team", "docs", "shop", "home", "jobs", "help", "beta", "zeta", "misc"];
const SIZES = ["S", "M", "XL", "XS"];

/** Absent-key candidates shaped like the author's keys (evt-1 → evt-101, colour=red → colour=blue), for the "definitely not" and false-positive probes. */
const probeCandidates = (keyIds: string[], count = 400): string[] => {
  const out: string[] = [];
  for (let i = 0; out.length < count && i < count * 3; i++) {
    const base = keyIds[i % keyIds.length]!;
    const round = Math.floor(i / keyIds.length);
    const word = `${PROBE_WORDS[round % PROBE_WORDS.length]}${round >= PROBE_WORDS.length ? Math.floor(round / PROBE_WORDS.length) : ""}`;
    const m = /^(.*?)([A-Za-z0-9]+)([^A-Za-z0-9]*)$/.exec(base);
    let c: string;
    if (base.includes("/")) c = base.replace(/\/[^/]*$/, `/${word}`);
    else if (!m) c = `${base}${word}`;
    else {
      const [, pre, token, post] = m as unknown as [string, string, string, string];
      const num = /^(\D*?)(\d+)$/.exec(token);
      if (/^[0-9a-f]+$/.test(token) && /[a-f]/.test(token) && /\d/.test(token)) c = `${pre}${fnv(`${base}#${i}`).toString(16).padStart(8, "0").slice(0, token.length)}${post}`;
      else if (num) c = `${pre}${num[1]}${Number(num[2]) + 100 + i}${post}`;
      else if (/^[A-Z]{1,2}$/.test(token)) c = `${pre}${SIZES[round % SIZES.length]}${post}`;
      else c = `${pre}${word}${post}`;
    }
    if (!keyIds.includes(c) && !out.includes(c)) out.push(c);
  }
  return out;
};

/** Anti-entropy with a Bloom filter as a set digest: A sends a filter of its keys; B sends the keys the filter says A definitely lacks. */
const bloomDigest = (input: SystemInput) => {
  const M = 16;
  const K = 3;
  const given = keyList(input.keys, ["k1", "k2", "k3", "k7", "k9"], 6, 3);
  const aKeys = given.slice(0, -1);
  const missing = given[given.length - 1]!;
  const bits = Array.from({ length: M }, () => 0);
  const hashes = (k: string) => Array.from({ length: K }, (_, i) => fnv(`${i}:${k}`) % M);
  for (const k of aKeys) for (const h of hashes(k)) bits[h] = 1;
  const isMiss = (k: string) => hashes(k).some((h) => bits[h] === 0);
  const fp = probeCandidates(given).find((c) => !isMiss(c));
  const sys = new Sys([
    { id: "A", label: "Replica A", kind: "db", x: 10, y: 50, state: `${aKeys.length} keys` },
    { id: "B", label: "Replica B", kind: "db", x: 90, y: 50, state: `${given.length + (fp ? 1 : 0)} keys` },
  ]);
  const show = (hi: number[] = [], tone: Tone = "active", upto = bits) => sys.table({ title: `Replica A's digest: a Bloom filter (m = ${M} bits, k = ${K})`, head: ["bit", ...upto.map((_, i) => String(i))], rows: [["value", ...upto.map((b, i) => (hi.includes(i) ? `[${b}]` : String(b)))]], tones: [hi.length ? tone : undefined] });
  const building = Array.from({ length: M }, () => 0);
  show([], "active", building);
  sys.set({ "A holds": aKeys.join(", "), "B holds": [...given, ...(fp ? [fp] : [])].join(", ") });
  sys.note(`Anti-entropy between two replicas. Instead of sending its whole key list, replica A sends a Bloom filter of it: ${M} bits instead of every key.`);
  for (const k of aKeys) {
    const hs = hashes(k);
    for (const h of hs) building[h] = 1;
    show(hs, "done", building);
    sys.state("A", `filter: ${aKeys.indexOf(k) + 1} keys`, "active");
    sys.f.push(`A adds ${k}: bits ${[...new Set(hs)].join(", ")}.`, "add");
  }
  sys.state("A", `${aKeys.length} keys`, undefined);
  show();
  sys.msg("A", "B", `digest (${M} bits)`, `A sends the filter to B.`);
  const shared = aKeys;
  sys.state("B", "testing its keys", "compare");
  sys.note(`B tests each of its own keys against A's filter. ${shared.join(", ")} all find their bits set: "A probably has it", so B sends nothing for them.`, "test");
  const hm = hashes(missing);
  const zero = hm.find((h) => bits[h] === 0)!;
  show(hm, "danger");
  sys.msg("B", "A", `${missing} (bit ${zero} = 0)`, `${missing} hashes to bits ${[...new Set(hm)].join(", ")}, and bit ${zero} is 0: A definitely lacks ${missing}. A Bloom filter never says no wrongly, so B sends it.`, { tone: "done" });
  if (fp) {
    const hf = hashes(fp);
    show(hf, "danger");
    sys.state("B", `${fp}: assumed present`, "danger");
    sys.note(`${fp} also exists only on B, but its bits ${[...new Set(hf)].join(", ")} were all set by A's other keys: a false positive. B wrongly concludes A has it and sends nothing, so this difference survives until the next round (with a different filter) or a Merkle-tree comparison finds it.`, "false positive");
  }
  sys.state("A", `${aKeys.length + 1} keys`, "done");
  sys.note(`The digest cost ${M} bits rather than a list of keys, and every key it said was missing really was. Its error is one-sided: it can only hide a difference for a round, never invent one.`, "done");
  return sys.f.done();
};

/** Bloom filter. `app` and `store` relabel the boxes; `variant: "digest"` is the anti-entropy set digest. */
const bloomFilter: SysGen = (input) => {
  if (input.variant === "digest") return bloomDigest(input);
  const { keys } = input;
  const M = 16;
  const K = 3;
  const keyIds = keyList(keys, ["evt-1", "evt-2", "evt-3"], 6);
  const storeLabel = label(input.store, "SSTable / DB");
  const custom = typeof input.store === "string" && input.store.trim() !== "";
  const readWord = custom ? `lookup in the ${storeLabel}` : "disk read";
  const counter = custom ? "lookups" : "disk reads";
  const bits = Array.from({ length: M }, () => 0);
  const hashes = (k: string) => Array.from({ length: K }, (_, i) => fnv(`${i}:${k}`) % M);
  const sys = new Sys([
    { id: "app", label: label(input.app, "App"), kind: "service", x: 8, y: 50 },
    { id: "bloom", label: "Bloom filter", kind: "cache", x: 50, y: 50, state: `${M} bits · k=${K}` },
    { id: "disk", label: storeLabel, kind: "db", x: 92, y: 50, state: `${counter}: 0` },
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
  sys.state("disk", `${counter}: ${diskReads}`, "visited");
  sys.msg("app", "disk", `read ${present} → found`, `Only now does the app pay for the ${readWord}, and it finds the key.`, { tone: "done" });
  const candidates = probeCandidates(keyIds);
  const absent = candidates.find((c) => hashes(c).some((h) => bits[h] === 0));
  const fp = candidates.find((c) => hashes(c).every((h) => bits[h] === 1));
  if (absent) {
    const ha = hashes(absent);
    const zero = ha.find((h) => bits[h] === 0)!;
    show(ha, "danger");
    sys.msg("app", "bloom", `contains ${absent}?`, `Query "${absent}": bits ${[...new Set(ha)].join(", ")}.`, { tone: "compare" });
    sys.msg("bloom", "app", `bit ${zero} = 0 → definitely no`, `Bit ${zero} is 0, so "${absent}" was never added: definitely absent. The ${readWord} is skipped entirely. This is the win: most lookups for missing keys cost zero I/O.`, { tone: "done" });
  }
  if (fp) {
    const hf = hashes(fp);
    show(hf, "danger");
    sys.msg("app", "bloom", `contains ${fp}?`, `Query "${fp}", which was never added: bits ${[...new Set(hf)].join(", ")}.`, { tone: "compare" });
    diskReads++;
    sys.state("disk", `${counter}: ${diskReads}`, "danger");
    sys.msg("bloom", "app", "all set → probably yes", `All its bits happen to have been set by ${keyIds.length === 1 ? "the one key added" : "the keys that were added"}: a false positive. The app pays for the ${readWord} and finds nothing. Harmless for correctness, but it is the cost you tune away.`, { tone: "danger" });
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
