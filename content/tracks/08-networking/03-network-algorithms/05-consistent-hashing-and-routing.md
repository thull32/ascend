---
slug: consistent-hashing-and-routing
title: "Consistent hashing, rendezvous hashing and request routing"
description: Why hash-mod-N collapses a cache tier when you add a server, how the hash ring, virtual nodes, rendezvous hashing, jump hash and Maglev each fix it, and how load balancers and meshes use them to route requests by key.
minutes: 41
difficulty: hard
tags: [networking, consistent-hashing, rendezvous-hashing, virtual-nodes, maglev, load-balancing, sharding, caching]
problems: []
---
You run ten cache servers. Clients pick a server with `hash(key) % 10`, the hit rate is 95%, and the database behind the cache sees 5% of reads. Traffic grows, so you add an eleventh server. The client code now computes `hash(key) % 11`, and a key stays on the same server only if `h % 10 == h % 11`, which is true for one hash value in eleven. About 91% of keys now map to a server that does not have them. The hit rate falls to roughly 9% within a minute, the database receives nearly twenty times its normal read load, and adding capacity has caused an outage. Losing a server does the same thing in reverse: `% 9` remaps about 90% of keys, at exactly the moment you are already down a machine.

The requirement is **minimal disruption**: when the set of servers changes from N to N + 1, only about $1/(N+1)$ of the keys should move, and they should move only to the new server. Every scheme in this lesson achieves that. They differ in how evenly they spread load, how much memory and time a lookup costs, and what happens when the server that leaves is not the one you expected. The same algorithms decide which cache node holds a key, which Cassandra replica owns a row, which backend an L4 load balancer sends a flow to, and which instance a service mesh routes a user's request to.

## The hash ring

Map the hash space, say $[0, 2^{32})$, onto a circle. Hash each server's name to a point on the circle. Hash each key to a point too. A key belongs to the **first server clockwise** from it, wrapping past the top.

```viz
{"type": "system", "scenario": "consistent-hashing", "nodes": 4, "title": "Keys owned by the next node clockwise", "caption": "Each key walks clockwise to the first node. When N5 joins, only the keys on the arc between N5 and its predecessor change owner, and they all move to N5. With hash mod N almost every key would have moved."}
```

Adding a server at point `p` takes over exactly the arc between `p` and the previous server point, and every key on that arc moves from one server (the old owner of the arc) to the new one. No other key moves. Removing a server hands its arc to its clockwise successor. With N servers placed uniformly, the moving arc is about $1/(N+1)$ of the circle.

A lookup is a binary search over the sorted server positions:

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

Drop N points uniformly at random on a circle and the arcs between them are far from equal. The expected length of the *largest* arc is $H_N / N$, where $H_N \approx \ln N + 0.58$ is the harmonic number. For ten servers, $H_{10} \approx 2.93$: the unluckiest server expects to own about 29% of the keys instead of its fair 10%, nearly three times its share. Your cache tier's capacity is set by its busiest node, so you have paid for ten servers and received the headroom of about three and a half.

Failure makes it worse. When a server dies, its entire arc goes to one successor, which suddenly carries two servers' load, may fall over itself, and hands both arcs to *its* successor. A cascade around the ring is a real failure mode.

**Virtual nodes** fix both. Each physical server is hashed to V points (`cache-a#0`, `cache-a#1`, and so on), so it owns V small arcs scattered around the ring instead of one large one.

- **Balance.** A server's share is now the sum of V independent arc lengths, and its relative standard deviation falls as $1/\sqrt{V}$. With V = 100, a server's load is typically within about 10% of the mean; with V = 1,000, about 3%.
- **Failure spreads.** A dead server's V arcs have V different successors, so its load is spread across most of the cluster instead of doubling one neighbour.
- **Heterogeneous hardware.** Give a server with twice the memory twice the virtual nodes.

The cost is memory and rebuild time: 1,000 servers with 200 points each is 200,000 ring entries, a few megabytes, rebuilt on every membership change, and a lookup is a binary search over them. That is fine for a cache client and a storage coordinator, and it is why memcached client libraries (the "ketama" scheme places on the order of 100 to 200 points per server), Dynamo-style stores and many proxies use it.

Random placement never gets perfectly even, so mature systems stop placing points randomly. Cassandra historically defaulted to 256 random tokens per node and later lowered the default, pairing far fewer tokens with an allocation algorithm that chooses token positions to balance ownership. The Dynamo paper describes a similar evolution towards a fixed number of equal-sized partitions that are assigned to nodes. The limit of that idea is **fixed slots**: Redis Cluster hashes every key to one of 16,384 slots with `CRC16(key) mod 16384` (a CRC from [Error detection](/learn/networking/network-algorithms/error-detection) doing duty as a hash function) and keeps an explicit map from slot to node. Moving a slot moves exactly that slot's keys, and balancing is a matter of editing the map. Kafka's partitions are the same design. The ring and its variants are still the right tool when there is no central map to keep consistent.

## Rendezvous hashing

Rendezvous hashing, also called **highest random weight**, needs no ring. For each key, compute a score for every server, `score(server, key) = hash(server + key)`, and the server with the **highest** score owns the key.

```python
def rendezvous_owner(nodes: list[str], key: str) -> str:
    return max(nodes, key=lambda n: hash32(f"{n}:{key}"))
```

Its properties fall straight out of the definition:

- **Adding a server** moves a key only if the new server's score beats the current winner, which happens for $1/(N+1)$ of keys, drawn evenly from every existing server.
- **Removing a server** moves only its own keys, and each goes to that key's *second-highest* scorer, which is a different server for different keys. The load of a dead server spreads evenly across all survivors with no virtual nodes at all.
- **Balance** is as good as the hash: each server wins each key with probability $1/N$.
- **Replication is free.** The top r servers by score are the key's r replicas, and they stay stable as membership changes, because removing one server only promotes the next one in each key's ranking.
- **Weights** work with a small change: if $u = \text{hash}/2^{32}$ is uniform in (0, 1), a score of $-w / \ln u$ makes a server win in proportion to its weight w.

The cost is $O(N)$ hashes per lookup. For 50 backends that is 50 short hashes, on the order of a microsecond, which is nothing next to a network call. For thousands of nodes you either cache results or use a hierarchical variant that arranges nodes in a tree of clusters and runs rendezvous at each level. Rendezvous hashing shows up wherever N is modest and simplicity matters: choosing replicas, assigning shards to workers, routing in CDNs and in load balancers that want minimal disruption without the memory of a big ring.

## Jump hash and Maglev: two specialists

**Jump consistent hash** (Lamping and Veach, 2014) uses no memory at all. It maps a 64-bit key to a bucket in `[0, N)` with a short loop that "jumps" forward through bucket numbers:

```python
def jump_hash(key: int, num_buckets: int) -> int:
    b, j = -1, 0
    while j < num_buckets:
        b = j
        key = (key * 2862933555777941757 + 1) & 0xFFFFFFFFFFFFFFFF
        j = int((b + 1) * ((1 << 31) / ((key >> 33) + 1)))
    return b
```

It runs in $O(\log N)$ time, balances perfectly, and moves exactly $1/(N+1)$ of keys when N grows by one. The catch is that buckets are *numbers*, not named servers: you can add or remove only the last bucket. It suits sharded storage where shard 7 is a logical, replicated unit that never disappears, and it does not suit a set of hosts that fail at random.

**Maglev hashing** comes from Google's software network load balancer (described at NSDI 2016). It builds a lookup table whose size M is a prime much larger than the number of backends (65,537 is a typical size). Each backend derives its own preference order over the table's slots from two hashes of its name, and the backends take turns claiming their next preferred empty slot until the table is full. The result: every backend holds almost exactly $M/N$ slots, a lookup is one array index (`table[hash(flow) % M]`), and when a backend is removed and the table rebuilt, most slots keep their owner. Disruption is small but not perfectly minimal, so Maglev pairs the table with connection tracking so that established flows keep their backend while new ones use the new table. Envoy implements both `RING_HASH` and `MAGLEV` as load-balancing policies; Maglev is often preferred for its constant-time lookup and near-perfect balance.

## Routing requests by key

Most load balancing does not care which backend gets a request, and least-connections or round-robin is the right answer (see [Load balancing](/learn/networking/application-protocols/load-balancing)). You route by key when **locality** is worth something:

- **Cache affinity.** Send every request for product 123 to the same instance, and that instance's in-process cache holds product 123. Spread them randomly and every instance caches everything, so the effective cache size is one instance's memory instead of the fleet's.
- **Stateful sessions.** WebSocket servers, game servers and chat rooms keep live state in memory; the user's requests must reach the instance that holds it.
- **Ordering and aggregation.** All events for one account go to one partition or one worker, so they are processed in order and counters need no coordination.

The tools are everywhere once you look: NGINX's `hash $request_uri consistent`, HAProxy's `hash-type consistent`, and Envoy's ring-hash and Maglev policies, all hashing on a header, a cookie, the path or the source address.

The trade is that hashing is **blind to load**. Least-connections sends each request to whichever backend is least busy right now:

```viz
{"type": "network", "scenario": "load-balancer-least-conn", "title": "Least connections balances load and ignores keys", "caption": "Each request goes to the backend with the fewest in-flight requests. Load stays even even when one backend slows down, but the same user's requests land on different backends, so per-instance caches and in-memory sessions are useless."}
```

Consistent hashing does the opposite: it sends each key to the same backend no matter how busy that backend is. Two failure modes follow.

**Hot keys.** Hashing balances *keys*, not *traffic*. A celebrity's profile, a viral video or the one tenant who is ten times bigger than the rest lands on one node regardless of how many virtual nodes you have. The fixes live above the hash: replicate hot keys to k nodes and choose among them at random for reads; split a hot counter into `key#0` to `key#7` and sum on read; coalesce identical in-flight requests; and put a small in-process cache in front so the hottest keys never leave the client.

**Overloaded owners.** A slow or unlucky node keeps receiving its share while its queue grows. **Consistent hashing with bounded loads** (Mirrokni, Thorup and Zadimoghaddam) caps every node at $\lceil c \cdot \text{average load} \rceil$ for a factor c such as 1.25. If a key's owner is at capacity, the request walks clockwise to the next node with room. The maximum load is now guaranteed to be within 25% of the mean, at the cost of a little locality for keys that overflow. Vimeo contributed an implementation to HAProxy (`hash-balance-factor`) after using it in front of its video caches.

### Routing in a mesh

In a service mesh, every client sidecar runs the load balancer. They agree on where a key goes without talking to each other, because each computes the same ring (or the same Maglev table, or the same rendezvous scores) from the same list of endpoints. That is the elegant part, and it hides the fragile part: the algorithms are deterministic only **given the same membership**. During a rollout, endpoint updates reach different sidecars seconds apart, so for a short window two clients may route the same key to different instances. Design for it: treat routing by key as a performance optimisation (a cache hit, a warm session), never as the only thing standing between you and a correctness bug. If two instances must never both own a key, that is a job for leases and fencing, not for a hash ring. The proxies themselves are the subject of [Service meshes and proxies](/learn/networking/networking-in-practice/service-meshes-and-proxies), and moving data when ownership changes is covered in [Partitioning and rebalancing](/learn/system-design/distributed-systems/partitioning-and-rebalancing).

The same idea appears one layer down. Routers spread flows across equal-cost paths by hashing the 5-tuple modulo the number of next hops, and when one path fails, naive modulo reshuffles every flow. Switches that implement "resilient hashing" keep a fixed table of buckets and reassign only the failed path's buckets, which is Maglev's idea in silicon. [Routing algorithms](/learn/networking/network-algorithms/routing-algorithms) has the ECMP side of that story.

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

- You can compute the **disruption** of a scheme on the spot: `mod N` moves about $N/(N+1)$ of keys, a ring moves about $1/(N+1)$, and you connect that directly to cache hit rate and database load.
- You never propose a bare ring. You say **virtual nodes**, you know balance improves as $1/\sqrt{V}$, and you know they also spread a failed node's load.
- You reach for **rendezvous hashing** when N is small or you need r stable replicas, **jump hash** for numbered shards, **Maglev** for connection-level load balancing, and **fixed slots with an explicit map** when you want rebalancing under operator control.
- You point out that consistent hashing balances keys, not traffic, and you have an answer for **hot keys** (replicate, split, coalesce, cache in front) and for overloaded owners (**bounded loads**).
- You know key-based routing in a mesh is only as consistent as the **membership view**, so you treat it as an optimisation and use leases or fencing when ownership must be exclusive.

## Check yourself

```quiz
- q: >-
    A cache tier grows from 10 to 11 servers and clients use hash(key) % N. Roughly what fraction of keys now map to a different server?
  options: ["About 0%", "About 50%", "About 9%", "About 91%"]
  answer: 3
  explanation: >-
    A key keeps its server only when h mod 10 equals h mod 11, which holds for 1 value in 11, however good the hash is. So about 10/11 ≈ 91% of keys move and the hit rate collapses. A consistent hash moves only about 1/11 ≈ 9%, all onto the new server.
- q: >-
    A ring with one point per node loses a node. What happens to that node's keys, and why do virtual nodes help?
  options: ["They are lost until the failed node comes back", "They spread evenly; vnodes only speed up lookups", "They go to the node that currently holds the fewest keys", "One successor gets them all; vnodes spread the arcs"]
  answer: 3
  explanation: >-
    Each arc is inherited by the next point clockwise. With one point per node that is a single successor, whose load doubles and which can overload and cascade. With V points per node the failed node's many small arcs have V different successors, so its load spreads across the cluster.
- q: >-
    With 100 virtual nodes per server placed at random, how close to the average load does a server typically stay, and what would get you to about 3%?
  options: ["Within about 1%, so nothing further is needed", "Exactly average, since vnodes guarantee balance", "Within about 50%; switch the whole tier to mod N", "Within about 10%; roughly 1,000 vnodes per server"]
  answer: 3
  explanation: >-
    A server's share is a sum of V random arcs, so its relative spread shrinks like 1/sqrt(V): about 10% for V = 100 and about 3% for V = 1,000. Getting exact balance needs deliberate placement (token allocation, Maglev tables or fixed slots), not more randomness.
- q: >-
    Using rendezvous hashing across 8 nodes, one node is removed. Where do its keys go?
  options: ["All to the node with the next-highest name", "To a randomly chosen survivor on each request", "They are rehashed across the rest with mod 7", "Each to its runner-up, spread across all 7"]
  answer: 3
  explanation: >-
    Every key has a full ranking of nodes by score. Removing the winner promotes the runner-up (second-highest score) for that key, and runners-up are independent across keys, so the load spreads evenly across all 7 survivors without virtual nodes. Keys owned by other nodes do not move at all.
- q: >-
    A consistent-hash load balancer keeps sending one viral video's requests to a single, overloaded cache node. Which change actually helps?
  options: ["Add more virtual nodes per server to the ring", "Widen the hash output from 32 to 64 bits", "Switch from the ring to rendezvous hashing instead", "Replicate the hot key and spread its reads"]
  answer: 3
  explanation: >-
    Every consistent-hashing scheme maps one key to one owner by design, so no amount of better hashing, more virtual nodes or a different scheme splits a single hot key. Replicating it to several nodes and spreading its reads, key splitting, request coalescing or a small cache in front address traffic skew; bounded-load hashing can also overflow requests to the next node.
- q: >-
    What does consistent hashing with bounded loads (capacity factor 1.25) trade away to guarantee that no node exceeds 125% of the average load?
  options: ["Some locality, since overflow goes to the next node", "Simplicity, as each request needs a central coordinator", "Nothing, since it is strictly better than plain hashing", "Determinism, since requests are assigned at random"]
  answer: 0
  explanation: >-
    The owner is still found on the ring, but a node at capacity is skipped and the request walks clockwise to the next node with room. Those overflow requests lose their cache affinity; in exchange the maximum load is capped. Routing stays deterministic and needs no coordinator.
```
