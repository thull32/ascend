---
slug: consistent-hashing-and-routing
title: "Consistent hashing, rendezvous hashing and request routing"
description: Why hash-mod-N collapses a cache tier when you add a server, how the hash ring, virtual nodes, rendezvous hashing, jump hash and Maglev each fix it (traced by hand and measured), how bounded loads cap a hot node, and how load balancers and meshes use them to route requests by key.
minutes: 45
difficulty: hard
tags: [networking, consistent-hashing, rendezvous-hashing, virtual-nodes, maglev, load-balancing, sharding, caching]
problems: []
---
You run ten cache servers. Clients pick a server with `hash(key) % 10`, the hit rate is 95%, and the database behind the cache sees 5% of reads. Traffic grows, so you add an eleventh server. The client code now computes `hash(key) % 11`, and a key stays on the same server only if `h % 10 == h % 11`, which is true for one hash value in eleven. About 91% of keys now map to a server that does not have them (a simulation over 100,000 keys moved 91.0%). The hit rate falls to roughly 9% within a minute, the database receives nearly twenty times its normal read load, and adding capacity has caused an outage. Losing a server does the same in reverse: `% 9` remaps about 90% of keys, at exactly the moment you are already down a machine.

The requirement is **minimal disruption**: when the set of servers changes from N to N + 1, only about $1/(N+1)$ of the keys should move, and only to the new server. Every scheme in this lesson achieves that. They differ in how evenly they spread load, how much memory and time a lookup costs, and what happens when the server that leaves is not the one you expected. The same algorithms decide which cache node holds a key, which Cassandra replica owns a row, which backend an L4 load balancer sends a flow to, and which instance a service mesh routes a user's request to.

```viz
{"type": "system", "scenario": "sharding-hash", "title": "Hash-mod-N sharding", "caption": "Each key goes to shard hash(key) mod N. The spread is even, but N is part of the formula: change the number of shards and almost every key maps somewhere new, which for a cache means almost every key misses."}
```

## The hash ring

Map the hash space, say $[0, 2^{32})$, onto a circle. Hash each server's name to a point on the circle, and each key to a point too. A key belongs to the **first server clockwise** from it, wrapping past the top.

```viz
{"type": "system", "scenario": "consistent-hashing", "nodes": 4, "title": "Keys owned by the next node clockwise", "caption": "Each key walks clockwise to the first node. When N5 joins, only the keys on the arc between N5 and its predecessor change owner, and they all move to N5. With hash mod N almost every key would have moved."}
```

Adding a server at point `p` takes over exactly the arc between `p` and the previous server point: every key on that arc moves from the arc's old owner to the new server, and no other key moves. Removing a server hands its arc to its clockwise successor. A lookup is a binary search over the sorted points:

```python
import bisect

# hash32: any well-mixed 32-bit string hash (the exercises below provide one)
class HashRing:
    def __init__(self, nodes, vnodes=100, h=hash32):
        self.h = h
        self.points = sorted((h(f"{n}#{i}"), n) for n in nodes for i in range(vnodes))
        self.positions = [p for p, _ in self.points]

    def owner(self, key: str) -> str:
        i = bisect.bisect_left(self.positions, self.h(key))
        return self.points[i % len(self.points)][1]   # wrap past the top
```

The `vnodes` parameter is the part the textbook diagram leaves out, and it is not optional.

## Why one point per server is not enough

Drop N points uniformly at random on a circle and the arcs between them are far from equal. The expected *largest* arc is $H_N / N$, where $H_N \approx \ln N + 0.58$ is the harmonic number. For ten servers $H_{10} \approx 2.93$: the unluckiest server expects about 29% of the keys instead of its fair 10%. Your tier's capacity is set by its busiest node, so you pay for ten servers and get the headroom of about three and a half. Failure makes it worse: a dead server's entire arc goes to one successor, which suddenly carries two servers' load, may fall over, and hands both arcs to *its* successor.

**Virtual nodes** fix both. Each physical server is hashed to V points (`cache-a#0`, `cache-a#1`, and so on), so it owns V small arcs scattered around the ring. A server's share becomes a sum of V arc lengths, whose relative spread shrinks like $1/\sqrt{V}$; a dead server's V arcs have V different successors; and a server with twice the memory can take twice the points.

### Virtual nodes, traced

Three servers with the exercise's `hash32`, positions shown as fractions of the circle:

| V | Points in ring order (fraction of the circle) | cache-a | cache-b | cache-c |
|---|---|---|---|---|
| 1 | c 0.181, a 0.410, b 0.978 | 22.9% | **56.8%** | 20.3% |
| 4 | b 0.067, c 0.181, a 0.319, b 0.392, a 0.410, b 0.443, c 0.538, a 0.643, c 0.715, a 0.748, c 0.872, b 0.978 | 29.4% | 30.1% | 40.5% |

With one point each, cache-b owns everything from 0.410 to 0.978, and eight sample keys (`user:9` to `user:16`, at 0.777, 0.681, 0.673, 0.376, 0.837, 0.468, 0.228, 0.868) land six on b, two on a and none on c: exactly the first exercise test. With four points each, the same keys move towards c, and the shares are closer, but three servers with four points is still lumpy. Balance needs more points.

### Measured balance

I placed ten servers on the ring for 50 different sets of server names and computed each server's exact arc share:

| Points per server (V) | Busiest server ÷ fair share (mean) | Worst of 50 | Relative std. deviation |
|---|---|---|---|
| 1 | 3.06 | 5.93 | 94% |
| 10 | 1.55 | 2.31 | 29% |
| 100 | 1.15 | 1.29 | 8.6% |
| 1,000 | 1.05 | 1.08 | 2.7% |

The V = 1 row reproduces $H_{10} \approx 2.93$; the standard deviation falls by about $\sqrt{10}$ per row, as $1/\sqrt{V}$ predicts. The cost is memory and rebuild time: 1,000 servers with 200 points each is 200,000 entries, a few megabytes, rebuilt on every membership change. That is fine for a cache client or a storage coordinator, which is why memcached clients (the "ketama" scheme places 160 points per server when weights are equal), Dynamo-style stores and many proxies use it. Netflix's EVCache, a memcached-based cache tier, shards keys across its nodes with a ketama-style ring in the client for exactly this reason: nodes come and go without flushing the tier.

### Beyond random placement

Random placement never gets perfectly even, so mature systems stop placing points at random. Cassandra defaulted to 256 random tokens per node until version 4.0 lowered the default to 16 and switched on an allocation algorithm that chooses token positions to balance ownership. The limit of that idea is **fixed slots**: Redis Cluster maps every key to one of 16,384 slots with `CRC16(key) mod 16384` (a CRC from [Error detection](/learn/networking/network-algorithms/error-detection) doing duty as a hash) and keeps an explicit slot-to-node map, so moving a slot moves exactly that slot's keys and balancing is editing the map. Kafka's partitions are the same design. The ring and its variants remain the right tool when there is no central map to keep consistent.

## Rendezvous hashing

Rendezvous hashing, also called **highest random weight**, needs no ring. For each key, score every server with `hash(server + key)`; the **highest** score owns the key.

```python
def rendezvous_owner(nodes: list[str], key: str) -> str:
    return max(nodes, key=lambda n: hash32(f"{n}:{key}"))
```

Four keys scored with the exercise's `hash32` (as fractions of $2^{32}$):

| Key | cache-a | cache-b | cache-c | Owner of {a, b, c} | Runner-up | With cache-d added (d scores) |
|---|---|---|---|---|---|---|
| user:9 | **0.697** | 0.071 | 0.245 | a | c | **d** (0.779 beats 0.697) |
| user:10 | 0.633 | **0.838** | 0.745 | b | c | b (d scores 0.495) |
| user:11 | **0.931** | 0.321 | 0.591 | a | c | a (d scores 0.256) |
| user:12 | 0.103 | **0.741** | 0.380 | b | c | b (d scores 0.710) |

Its properties fall straight out of the table:

- **Adding a server** moves a key only if the new server's score beats the current winner: here only user:9 moves, to d. That happens for $1/(N+1)$ of keys, drawn evenly from every existing server.
- **Removing a server** moves only its own keys, each to that key's runner-up: remove a and user:9 goes to c, user:11 to c. Runners-up are independent across keys, so a dead server's load spreads over all survivors with no virtual nodes.
- **Replication is free.** The top r servers by score are a key's r replicas, stable as membership changes.
- **Weights** work with a small change: if $u = \text{hash}/2^{32}$ is uniform in (0, 1), a score of $-w / \ln u$ makes a server win in proportion to its weight w.

The cost is $O(N)$ hashes per lookup. Measured in pure Python on this machine, one lookup took 10 µs over 10 servers and 77 µs over 100 (a C implementation is roughly two orders of magnitude faster, and the ratio is what matters). For thousands of nodes you cache results or arrange nodes in a tree of clusters and run rendezvous at each level. It shows up where N is modest: choosing replicas, assigning shards to workers, CDN and load-balancer routing.

## Jump hash and Maglev: two specialists

### Jump consistent hash

Jump hash (Lamping and Veach, 2014) uses no memory. It maps a 64-bit key to a bucket in `[0, N)` with a loop that "jumps" forward through bucket numbers:

```python
def jump_hash(key: int, num_buckets: int) -> int:
    b, j = -1, 0
    while j < num_buckets:
        b = j
        key = (key * 2862933555777941757 + 1) & 0xFFFFFFFFFFFFFFFF   # 64-bit LCG step
        j = int((b + 1) * ((1 << 31) / ((key >> 33) + 1)))           # next bucket this key would jump to
    return b
```

It runs in $O(\log N)$ time, balances perfectly, and moved exactly 9.1% of 100,000 keys from 10 to 11 buckets in the simulation. The catch: buckets are *numbers*, not named servers, so you can add or remove only the last one. It suits sharded storage where shard 7 is a replicated logical unit that never disappears, not a set of hosts that fail at random.

### Maglev, traced

Maglev hashing comes from Google's software network load balancer (NSDI 2016). It builds a lookup table of prime size M, much larger than the number of backends (65,537 is typical). Each backend derives a preference order over the slots from two hashes of its name, an `offset` and a `skip`: its j-th preference is `(offset + j × skip) mod M`. The backends then take turns, each claiming its next preferred slot that is still empty, until the table is full. A lookup is one array index: `table[hash(flow) % M]`.

With M = 7 and three backends whose preferences are B0 = 3, 0, 4, 1, 5, 2, 6; B1 = 0, 2, 4, 6, 1, 3, 5; B2 = 3, 4, 5, 6, 0, 1, 2 (the example in the Maglev paper):

| Turn | Backend | Preferences tried | Claims slot |
|---|---|---|---|
| 1 | B0 | 3 | 3 |
| 2 | B1 | 0 | 0 |
| 3 | B2 | 3 (taken), 4 | 4 |
| 4 | B0 | 0 (taken), 4 (taken), 1 | 1 |
| 5 | B1 | 2 | 2 |
| 6 | B2 | 5 | 5 |
| 7 | B0 | 5 (taken), 2 (taken), 6 | 6 |

The table is `[B1, B0, B1, B0, B2, B2, B0]`. Remove B1 and rebuild: B0 claims 3, 0, 1, 2 and B2 claims 4, 5, 6, giving `[B0, B0, B0, B0, B2, B2, B2]`. B1's slots 0 and 2 went to B0, as they must, but slot 6 also moved, from B0 to B2, although B0 is still alive. That is Maglev's trade: near-perfect balance and O(1) lookup in exchange for slightly more than minimal disruption. At realistic sizes the extra movement is small: with M = 65,537 and ten backends the simulation gave every backend 6,553 or 6,554 slots, and removing one backend moved 10.0% of slots (its own) plus 0.19% between survivors. Maglev pairs the table with connection tracking so established flows keep their backend while new ones use the new table.

## Measured: disruption and lookup cost

One simulation, 100,000 keys, growing from 10 to 11 servers (ideal: 1/11 = 9.1% of keys move), with lookup cost timed in pure Python on this machine (hash computed separately where the scheme allows):

| Scheme | Keys moved, 10 → 11 | Lookup cost (pure Python) | What dominates the cost |
|---|---|---|---|
| `hash mod N` | 91.0% | one modulo | nothing; the disruption is the problem |
| Ring, 100 vnodes per server | 10.3% | 0.15 µs after hashing | binary search over 1,000 points |
| Rendezvous | 9.3% (20,000 keys) | 10 µs for 10 servers | N hash computations |
| Jump hash | 9.1% | 0.33 µs | about ln N loop iterations |
| Maglev, M = 65,537 | 9.3% of slots | 0.07 µs after hashing | one array index; each membership change repopulates all M slots |

Hashing the key itself cost 0.6 µs in pure Python; in C or Rust every row is tens of nanoseconds or less, so the choice is about disruption, balance and memory, not speed.

## Routing requests by key

Most load balancing does not care which backend gets a request, and least-connections or round-robin is right (see [Load balancing](/learn/networking/application-protocols/load-balancing)). You route by key when **locality** is worth something:

- **Cache affinity.** Every request for product 123 reaches the instance whose in-process cache holds it; spread randomly, every instance caches everything and the effective cache is one instance's memory, not the fleet's.
- **Stateful sessions.** WebSocket servers, game servers and chat rooms keep live state in memory.
- **Ordering and aggregation.** All events for one account go to one worker, in order, with no coordination for counters.

NGINX's `hash $request_uri consistent`, HAProxy's `hash-type consistent` and Envoy's ring-hash and Maglev policies all do this, hashing a header, a cookie, the path or the source address. The trade is that hashing is **blind to load**:

```viz
{"type": "network", "scenario": "load-balancer-least-conn", "title": "Least connections balances load and ignores keys", "caption": "Each request goes to the backend with the fewest in-flight requests. Load stays even even when one backend slows down, but the same user's requests land on different backends, so per-instance caches and in-memory sessions are useless."}
```

### Hot keys

Hashing balances *keys*, not *traffic*. A celebrity's profile, a viral video or the one tenant ten times bigger than the rest lands on one node however many virtual nodes you have. The fixes live above the hash: replicate hot keys to k nodes and choose among them at random for reads; split a hot counter into `key#0` to `key#7` and sum on read; coalesce identical in-flight requests; put a small in-process cache in front so the hottest keys never leave the client.

### Bounded loads, traced

A slow or unlucky node keeps receiving its share while its queue grows. **Consistent hashing with bounded loads** (Mirrokni, Thorup and Zadimoghaddam) caps every node at $\lceil c \cdot \text{average load} \rceil$ for a factor c such as 1.25: if a key's owner is at capacity, the request walks clockwise to the next node with room. Take the V = 1 ring above, where cache-b owns 57% of the circle, c = 1.25, and the eight sample keys arriving in order and staying in flight. After k arrivals the cap is $\lceil 1.25 \cdot k / 3 \rceil$; clockwise order is b → c → a → b.

| k | Key | Ring owner | Cap | Loads before (a, b, c) | Placed on |
|---|---|---|---|---|---|
| 1 | user:9 | b | 1 | 0, 0, 0 | b |
| 2 | user:10 | b | 1 | 0, 1, 0 | b is full: **c** |
| 3 | user:11 | b | 2 | 0, 1, 1 | b |
| 4 | user:12 | a | 2 | 0, 2, 1 | a |
| 5 | user:13 | b | 3 | 1, 2, 1 | b |
| 6 | user:14 | b | 3 | 1, 3, 1 | b is full: **c** |
| 7 | user:15 | a | 3 | 1, 3, 2 | a |
| 8 | user:16 | b | 4 | 2, 3, 2 | b |

Final loads are a 2, b 4, c 2, against 2, 6, 0 on the plain ring. Two requests lost their cache affinity; in exchange no node exceeds the cap, $\lceil 1.25 \times \text{mean} \rceil$ (4 here, against 6 on the plain ring). Vimeo contributed an implementation to HAProxy (`hash-balance-factor`) after using it in front of its video caches.

### Routing in a mesh

In a service mesh every client sidecar runs the load balancer, and they agree on where a key goes without talking, because each computes the same ring (or Maglev table, or rendezvous scores) from the same endpoint list. The fragile part: the algorithms are deterministic only **given the same membership**. During a rollout, endpoint updates reach different sidecars seconds apart, so for a short window two clients route the same key to different instances. Treat routing by key as a performance optimisation (a cache hit, a warm session), never as the only thing between you and a correctness bug; if two instances must never both own a key, that is a job for leases and fencing. The proxies are the subject of [Service meshes and proxies](/learn/networking/networking-in-practice/service-meshes-and-proxies), and moving data when ownership changes is [Partitioning and rebalancing](/learn/system-design/distributed-systems/partitioning-and-rebalancing).

The same idea appears one layer down. Routers spread flows across equal-cost paths by hashing the 5-tuple modulo the number of next hops, so when one path fails naive modulo reshuffles every flow. Switches with "resilient hashing" keep a fixed table of buckets and reassign only the failed path's buckets: Maglev's idea in silicon. [Routing algorithms](/learn/networking/network-algorithms/routing-algorithms) has the ECMP side.

## Under the hood: what real proxies build

| Implementation | Scheme | Defaults worth knowing |
|---|---|---|
| Envoy `RING_HASH` | Ring with points spread by host weight | `minimum_ring_size` 1,024 and `maximum_ring_size` 8,388,608 entries; xxHash by default; the ring is rebuilt when endpoints change |
| Envoy `MAGLEV` | Maglev table | `table_size` 65,537 (must be prime); with hosts far fewer than slots, each gets close to M/N slots (within one slot for ten backends in the simulation above) |
| Istio `DestinationRule` | Envoy's policies | `consistentHash` on a header, cookie, source IP or query parameter, choosing ring hash or Maglev |
| memcached "ketama" clients | Ring | 160 points per server when weights are equal, four per MD5 digest |
| Redis Cluster | Fixed slots | 16,384 slots, `CRC16(key) mod 16384`; `{tag}` in a key hashes only the tag, keeping related keys in one slot |

## Production failure modes

| Failure | Symptom | Diagnosis | Fix |
|---|---|---|---|
| Scaling a `mod N` tier | Hit rate collapses and the database saturates minutes after adding or losing a cache node | Client uses `hash % len(servers)`; almost every key changed owner | A ring with virtual nodes, rendezvous or Maglev; warm new nodes before they take traffic |
| Too few virtual nodes | One cache node runs at 2 to 3 times the others' memory and CPU on a "balanced" tier | Compute each node's arc share from the ring; the busiest is far above $1/N$ | 100 to 1,000 points per server, or deliberate token allocation, or fixed slots |
| Hot key | One node saturates while the tier's average is low; its key-level metrics show one key dominating | Top-keys sampling on the node | Replicate or split the key, coalesce requests, in-process cache |
| Membership disagreement | During deploys, cache hit rate dips and sessions bounce between instances | Different clients hold different endpoint lists for a few seconds | Accept it as a performance dip; never rely on hashing for exclusive ownership; use leases |
| Cascade after a failure | After one node dies, its successor overloads and dies, then the next | One point per node, so one successor inherits the whole arc | Virtual nodes or rendezvous so the load spreads; bounded loads to cap any one node |

## Choosing a scheme

| Scheme | Lookup | Memory | Keys moved when one node is added | Balance | Remove any node? | Typical use |
|---|---|---|---|---|---|---|
| `hash mod N` | O(1) | None | Nearly all | Good | Nearly all keys move | Fixed N only |
| Ring, 1 point per node | O(log N) | N points | ~1/(N+1), from one neighbour | Poor: busiest node up to ~$H_N$× fair share | Arc goes to one successor | Diagrams |
| Ring + V virtual nodes | O(log NV) | N·V points | ~1/(N+1), from many nodes | Within ~$1/\sqrt{V}$ | Load spreads | Dynamo-style stores, memcached clients |
| Rendezvous (HRW) | O(N) | N names | ~1/(N+1), from many nodes | Good | Load spreads evenly | Replica choice, modest N |
| Jump hash | O(log N) | None | Exactly 1/(N+1) | Perfect | Only the last bucket | Numbered shards |
| Maglev | O(1) | M table entries | Small, near-minimal | Near-perfect | Yes | L4 load balancers, Envoy |
| Fixed slots + map | O(1) | Slot map | Only the slots you choose to move | By assignment | Explicit | Redis Cluster, Kafka |

## Interviewer follow-ups

**"Design the client-side routing for a 50-node cache tier that autoscales."** Model answer: a ring with a few hundred virtual nodes per server (or rendezvous at 50 nodes), rebuilt from the service-discovery view, bounded loads to protect hot nodes, and warm-up for new nodes so a scale-out does not become a miss storm. Common wrong answer: "`hash % N` with a longer TTL", which moves 98% of keys on every scaling event.

**"Why does a ring need virtual nodes if the hash is uniform?"** Model answer: the hash places N points uniformly *at random*, and random arcs are uneven: the largest expected arc is $H_N/N$, about three times the fair share for ten nodes; virtual nodes sum many arcs so the spread falls as $1/\sqrt{V}$. Common wrong answer: "a better hash function would fix it".

**"When would you choose rendezvous over a ring?"** Model answer: when N is small enough that O(N) scoring is cheap, when you need the top-r replicas for a key, or when you want failures spread evenly without tuning virtual nodes. Common wrong answer: "never, it is O(N)", ignoring that N = 20 hash computations cost less than a single network round trip by several orders of magnitude.

**"Maglev claims O(1) lookup and near-perfect balance. What does it give up?"** Model answer: strictly minimal disruption, since a rebuild can move a few slots between surviving backends, and cheap updates, since the table is rebuilt on changes; connection tracking hides the first from established flows. Common wrong answer: "nothing, it is strictly better than a ring".

## What mid-level engineers get wrong

- **Using `hash % N` for anything whose N changes.** Scaling events become cache-miss storms.
- **Drawing the ring with one point per server** and deploying it that way, so the busiest node carries about three times its share.
- **Adding virtual nodes to fix a hot key.** Every scheme maps one key to one owner; hot keys need replication, splitting or coalescing.
- **Relying on consistent hashing for exclusive ownership.** Two clients with different membership views route the same key to different nodes during every deploy.
- **Using Python's built-in `hash()` for placement.** String hashing is randomised per process (`PYTHONHASHSEED`), so every client builds a different ring.
- **Forgetting weights for heterogeneous hardware**, so a node with half the memory evicts twice as often.
## Exercises

Both exercises use the same 32-bit hash, `hash32`, provided in the starter code (FNV-1a followed by a finalising mix so that similar strings land far apart). Keep it exactly as given so your answers match the tests.

```exercise
id: hash-ring-with-vnodes
title: Hash ring with virtual nodes
prompt: |
  Build a consistent-hash ring and return the owner of each key.

  - Each node `n` is placed at `vnodes` points: hash32(n + "#" + i) for
    i = 0, 1, ..., vnodes - 1.
  - A key's position is hash32(key). Its owner is the node of the first
    point whose position is greater than or equal to the key's position,
    wrapping around to the smallest point if there is none.
  - Sort points by (position, node name).

  Return the list of owners, in the order of `keys`.
languages: [python, javascript]
entry: ring_owner
starter:
  python: |
    def hash32(s):
        h = 0x811C9DC5
        for b in s.encode():
            h ^= b
            h = (h * 0x01000193) & 0xFFFFFFFF
        h ^= h >> 16
        h = (h * 0x85EBCA6B) & 0xFFFFFFFF
        h ^= h >> 13
        h = (h * 0xC2B2AE35) & 0xFFFFFFFF
        h ^= h >> 16
        return h

    def ring_owner(nodes, vnodes, keys):
        # TODO: build sorted (position, node) points, then binary search
        return []
  javascript: |
    function hash32(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      h >>>= 0;
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
      h ^= h >>> 16;
      return h >>> 0;
    }

    function ring_owner(nodes, vnodes, keys) {
      // TODO: build sorted [position, node] points, then binary search
      return [];
    }
tests:
  - args: [["cache-a", "cache-b", "cache-c"], 1, ["user:9", "user:10", "user:11", "user:12", "user:13", "user:14", "user:15", "user:16"]]
    expected: ["cache-b", "cache-b", "cache-b", "cache-a", "cache-b", "cache-b", "cache-a", "cache-b"]
    label: one point per node (cache-c owns none of these keys)
  - args: [["cache-a", "cache-b", "cache-c"], 4, ["user:9", "user:10", "user:11", "user:12", "user:13", "user:14", "user:15", "user:16"]]
    expected: ["cache-c", "cache-c", "cache-c", "cache-b", "cache-c", "cache-c", "cache-a", "cache-c"]
    label: four virtual nodes each
  - args: [["solo"], 3, ["x", "y"]]
    expected: ["solo", "solo"]
    label: a single node owns everything
  - args: [["cache-a"], 2, []]
    expected: []
    label: no keys
  - args: [["cache-a", "cache-b", "cache-c", "cache-d"], 4, ["user:9", "user:10", "user:11", "user:12", "user:13", "user:14", "user:15", "user:16"]]
    expected: ["cache-d", "cache-d", "cache-d", "cache-b", "cache-c", "cache-c", "cache-a", "cache-c"]
    label: adding cache-d moves keys only to cache-d
    hidden: true
hints:
  - "Build every (position, node) pair, sort, and keep a separate sorted list of positions for binary search."
  - "Use bisect_left (or a lower-bound loop in JavaScript): the first position >= the key's hash. If that index equals the number of points, wrap to 0."
```

```exercise
id: rendezvous-hashing
title: Rendezvous (highest random weight) hashing
prompt: |
  For each key, score every node with hash32(node + ":" + key) and return
  the node with the highest score. If two nodes tie, the one whose name
  sorts first wins. Return the owners in the order of `keys`.

  Compare the first two tests: adding a node only moves the keys that the
  new node wins. The hidden tests check the reverse: removing a node only
  moves that node's keys.
languages: [python, javascript]
entry: rendezvous_owner
starter:
  python: |
    def hash32(s):
        h = 0x811C9DC5
        for b in s.encode():
            h ^= b
            h = (h * 0x01000193) & 0xFFFFFFFF
        h ^= h >> 16
        h = (h * 0x85EBCA6B) & 0xFFFFFFFF
        h ^= h >> 13
        h = (h * 0xC2B2AE35) & 0xFFFFFFFF
        h ^= h >> 16
        return h

    def rendezvous_owner(nodes, keys):
        # TODO
        return []
  javascript: |
    function hash32(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      h >>>= 0;
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
      h ^= h >>> 16;
      return h >>> 0;
    }

    function rendezvous_owner(nodes, keys) {
      // TODO
      return [];
    }
tests:
  - args: [["cache-a", "cache-b", "cache-c"], ["user:9", "user:10", "user:11", "user:12", "user:13", "user:14", "user:15", "user:16"]]
    expected: ["cache-a", "cache-b", "cache-a", "cache-b", "cache-b", "cache-a", "cache-c", "cache-b"]
  - args: [["cache-a", "cache-b", "cache-c", "cache-d"], ["user:9", "user:10", "user:11", "user:12", "user:13", "user:14", "user:15", "user:16"]]
    expected: ["cache-d", "cache-b", "cache-a", "cache-b", "cache-b", "cache-a", "cache-c", "cache-b"]
    label: adding a node moves only the keys it wins
  - args: [["solo"], ["x", "y"]]
    expected: ["solo", "solo"]
  - args: [["cache-a", "cache-b"], []]
    expected: []
    label: no keys
  - args: [["n1", "n2", "n3", "n4", "n5"], ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"]]
    expected: ["n3", "n2", "n5", "n4", "n3", "n3", "n1", "n1", "n5", "n4"]
    hidden: true
  - args: [["n1", "n2", "n3", "n5"], ["k0", "k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9"]]
    expected: ["n3", "n2", "n5", "n2", "n3", "n3", "n1", "n1", "n5", "n2"]
    label: removing n4 moves only n4's keys
    hidden: true
hints:
  - "Loop over nodes, keeping the best score so far; replace it on a strictly higher score, or on an equal score with a smaller name."
  - "hash32 returns an unsigned 32-bit integer in both languages, so plain numeric comparison works."
```

## Senior signals

- You can compute the **disruption** of a scheme on the spot: `mod N` moves about $N/(N+1)$ of keys, a ring about $1/(N+1)$, and you connect that directly to cache hit rate and database load.
- You never propose a bare ring. You say **virtual nodes**, you know balance improves as $1/\sqrt{V}$ (about 15% above fair for the busiest of ten servers at V = 100, about 5% at V = 1,000), and you know they also spread a failed node's load.
- You can build a **Maglev table** by hand and explain why its rebuild moves a few extra slots, and trace **rendezvous** removal to each key's runner-up.
- You reach for **rendezvous** when N is small or you need r stable replicas, **jump hash** for numbered shards, **Maglev** for connection-level load balancing, and **fixed slots with an explicit map** when you want rebalancing under operator control.
- You point out that consistent hashing balances keys, not traffic, and you have an answer for **hot keys** (replicate, split, coalesce, cache in front) and for overloaded owners (**bounded loads**, with the locality it costs).
- You know key-based routing in a mesh is only as consistent as the **membership view**, so you treat it as an optimisation and use leases or fencing when ownership must be exclusive.

## Check yourself

```quiz
- q: >-
    A cache tier grows from 10 to 11 servers and clients use hash(key) % N. Roughly what fraction of keys now map to a different server?
  options: ["About 0%", "About 50%", "About 9%", "About 91%"]
  answer: 3
  explanation: >-
    A key keeps its server only when h mod 10 equals h mod 11, which holds for 1 value in 11, however good the hash is. So about 10/11 ≈ 91% of keys move (the lesson's simulation moved 91.0%) and the hit rate collapses. A consistent hash moves only about 1/11 ≈ 9%, all onto the new server.
- q: >-
    In the lesson's M = 7 Maglev example, removing B1 also moves slot 6 from B0 to B2, although B0 is still alive. Why does Maglev accept this?
  options: ["B0 would otherwise hold more than half of all table slots", "It is a bug that larger prime table sizes remove entirely", "Slot 6 had to move because B1 had claimed it originally", "It trades minimal disruption for balance and O(1) lookup"]
  answer: 3
  explanation: >-
    The rebuild lets survivors claim slots in turn from their preference lists, which keeps every backend within one slot of its fair share and keeps lookup to one array index, at the price of occasionally moving a slot between survivors. At M = 65,537 the lesson measured 0.19% such moves. Connection tracking keeps established flows on their old backend. Slot 6 belonged to B0, not B1.
- q: >-
    With 100 virtual nodes per server placed at random across ten servers, how far above its fair share does the busiest server typically run, and what would get you to about 5%?
  options: ["Exactly at fair share, since vnodes guarantee balance", "About 15% above; roughly 1,000 vnodes per server", "About 1% above, so nothing further is needed", "About 50% above; switch the tier over to mod N"]
  answer: 1
  explanation: >-
    A server's share is a sum of V random arcs, so the spread shrinks like 1/sqrt(V). The lesson's measurement over 50 name sets gave the busiest server 1.15 times its fair share at V = 100 and 1.05 at V = 1,000. Exact balance needs deliberate placement (token allocation, Maglev tables or fixed slots), not more randomness.
- q: >-
    Using rendezvous hashing across 8 nodes, one node is removed. Where do its keys go?
  options: ["All to the node with the next-highest name", "To a randomly chosen survivor on each request", "They are rehashed across the rest with mod 7", "Each to its runner-up, spread across all 7"]
  answer: 3
  explanation: >-
    Every key has a full ranking of nodes by score. Removing the winner promotes the runner-up for that key, and runners-up are independent across keys, so the load spreads evenly across all 7 survivors without virtual nodes. Keys owned by other nodes do not move at all.
- q: >-
    A consistent-hash load balancer keeps sending one viral video's requests to a single, overloaded cache node. Which change actually helps?
  options: ["Add more virtual nodes per server to the ring", "Widen the hash output from 32 to 64 bits", "Switch from the ring to rendezvous hashing instead", "Replicate the hot key and spread its reads"]
  answer: 3
  explanation: >-
    Every consistent-hashing scheme maps one key to one owner by design, so no amount of better hashing, more virtual nodes or a different scheme splits a single hot key. Replicating it to several nodes and spreading its reads, key splitting, request coalescing or a small cache in front address traffic skew; bounded-load hashing can also overflow requests to the next node.
- q: >-
    What does consistent hashing with bounded loads (capacity factor 1.25) trade away to cap every node at 1.25 times the average load, rounded up?
  options: ["Determinism, since requests are assigned at random", "Nothing, since it is strictly better than plain hashing", "Simplicity, as each request needs a central coordinator", "Some locality, since overflow goes to the next node"]
  answer: 3
  explanation: >-
    The owner is still found on the ring, but a node at capacity is skipped and the request walks clockwise to the next node with room; in the lesson's trace two of eight requests moved from cache-b to cache-c. Those overflow requests lose their cache affinity; in exchange the maximum load is capped. Routing stays deterministic for a given load state and needs no coordinator.
```
