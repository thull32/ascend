---
slug: hashing-at-scale
title: Hashing at scale
description: Why key mod n falls apart when n changes, consistent hashing traced on a real ring with virtual nodes, rendezvous, jump and Maglev hashing traced as alternatives, Bloom filters with the arithmetic, what Cassandra, Redis Cluster, Kafka, memcached and Envoy actually do, and how to choose a sharding key.
minutes: 45
difficulty: hard
tags: [hashing, consistent-hashing, rendezvous-hashing, jump-hash, maglev, bloom-filter, sharding, distributed-systems]
problems: [design-hashmap, lru-cache]
---
Your cache is spread over four servers, and a key goes to server `hash(key) mod 4`. You add a fifth server to handle growth. Now a key goes to `hash(key) mod 5`, and for 80% of keys that is a different server than before. The cache is effectively empty; every request misses and hits the database, and the database, which was fine at a 95% cache hit rate, falls over. Adding capacity caused an outage.

Hashing is how systems decide *where* data lives once it no longer fits on one machine, and the question at scale is not only "does the function spread keys evenly?" but "what happens to the mapping when the set of destinations changes?". The same hash-function ideas from [Hash functions](/learn/data-structures/hashing/hash-functions) reappear here at the level of clusters, with new failure modes, and every algorithm in this lesson is traced on numbers you can recompute.

## The problem with `mod n`

A key stays on the same server across a change from `n` to `n + 1` servers only if `hash mod n == hash mod (n + 1)`. Counting over 100,000 consecutive hash values: growing from 4 to 5 servers moves **80.0%** of keys, from 9 to 10 moves **90.0%**, from 99 to 100 moves **98.9%**. In general the fraction that moves is about `n / (n + 1)`, and it moves them *to servers that have to fetch them from scratch*. The ideal is that only `1 / (n + 1)` of the keys move: exactly the share the new server should take, and nothing else.

```viz
{"type": "hash-table", "algorithm": "resize", "buckets": 4, "operations": [["set", "k1", 1], ["set", "k2", 2], ["set", "k3", 3], ["set", "k4", 4], ["set", "k5", 5], ["set", "k6", 6]], "title": "A local hash table has the same problem: changing the modulus moves almost every key"}
```

Inside a single process a rehash is a few milliseconds of CPU. Across a cluster it is a thundering herd of cache misses, minutes of elevated latency, and possibly a cascading failure. That difference is why consistent hashing was invented (Karger et al., 1997, for web caches) and why it underlies Dynamo, Cassandra, Riak, memcached client libraries and most load balancers.

## Consistent hashing, traced on a real ring

Hash both keys and servers onto the same circular space, the 32-bit integers `0..2³²−1` arranged as a ring. A key is owned by the first server whose point is at or after the key's point, walking clockwise and wrapping around. With three virtual nodes per server placed at `hash32(server + "#" + i)` (the exercise's hash: FNV-1a plus a finaliser), servers A, B and C produce nine points; positions are shown as a percentage of the way around the ring:

| Point | Position | | Point | Position | | Point | Position |
|---|---|---|---|---|---|---|---|
| B#1 | 3.9% | | A#1 | 35.2% | | B#2 | 76.8% |
| C#0 | 14.5% | | A#0 | 54.8% | | C#1 | 89.9% |
| C#2 | 27.3% | | A#2 | 68.6% | | | |
| B#0 | 29.7% | | | | | | |

Now hash eight keys and walk clockwise to the first point:

| Key | Position | First point at or after | Owner |
|---|---|---|---|
| user:1 | 41.1% | A#0 (54.8%) | A |
| user:2 | 13.1% | C#0 (14.5%) | C |
| user:3 | 79.8% | C#1 (89.9%) | C |
| user:4 | 75.9% | B#2 (76.8%) | B |
| user:5 | 61.3% | A#2 (68.6%) | A |
| user:6 | 4.8% | C#0 (14.5%) | C |
| user:7 | 57.6% | A#2 (68.6%) | A |
| user:8 | 95.6% | none: wrap to B#1 (3.9%) | B |

**Remove B.** Its three points vanish and only the keys that were walking to them move: user:4 (75.9%) now continues past 76.8% to C#1, and user:8 wraps to C#0. The other six keys do not change owner. With only three points per server both of B's keys happen to land on C, at two different points; with many points per server (next section), a departing server's keys spread across all the others.

**Add D** with points at 46.1%, 59.9% and 97.6%. Each new point claims only the arc immediately before it: user:1 (41.1%) now stops at D#2 (46.1%) instead of A#0; user:7 (57.6%) stops at D#0 (59.9%) instead of A#2; user:8 (95.6%) stops at D#1 (97.6%) instead of wrapping. user:5 (61.3%) still walks to A#2. Three of eight keys moved, all of them *to* D, which is the `1/n` ideal within rounding.

```viz
{"type": "system", "scenario": "consistent-hashing", "nodes": 4, "keys": 12, "title": "Keys and servers share a ring; adding a server claims one arc"}
```

Implementation is a sorted array of points with binary search: `get(key)` hashes the key, finds the first point `≥` the hash (`bisect_left`), wrapping to index 0 if it runs off the end. That is the `ceiling` operation from [Ordered maps vs hash maps](/learn/data-structures/hashing/ordered-maps-vs-hash-maps), and a lookup costs O(log V) for `V` points: 12 comparisons for a 1,000-server ring with 256 virtual nodes each.

## Virtual nodes

With one point per server the arcs are wildly uneven: three random points on a ring routinely give one server half the keys, and the expected largest arc among `n` random points is about `(ln n) / n` of the ring rather than `1/n`. Placing each server at `v` points shrinks the spread: the standard deviation of a server's share falls roughly as `1/√v`, so 100 points brings a typical server within about 10% of its fair share and 1,000 within about 3%. Two more things become possible:

- **Weighting.** A server with twice the capacity gets twice the virtual nodes.
- **Spread on failure.** When a server dies, its arcs were scattered around the ring, so its load is spread across *all* the remaining servers rather than dumped on one neighbour.

Cassandra's default was 256 tokens per node until 4.0, which lowered it to 16 alongside a token allocator that places new tokens where they balance load best; the original memcached ring (ketama) uses 160 points per server (40 MD5 hashes, each cut into four 32-bit points); Amazon's Dynamo paper describes the same design. The cost is a larger sorted array (`n × v` points) and, for replication, the rule that the "next `r` *distinct physical* servers clockwise" hold the replicas, so that a server does not replicate to its own virtual node.

## A hash function detail that matters here

The point positions need a hash with good avalanche on *short, similar* strings (`node1#0`, `node1#1`, …). FNV-1a alone is not good enough: two strings that differ only in the last character produce hashes that differ by a small multiple of the FNV prime, so a server's virtual nodes land in a tight cluster instead of spreading around the ring, and the server ends up owning one big arc instead of many small ones. Production rings use MurmurHash3, xxHash or MD5, or apply a finaliser (a few XOR-shift-multiply rounds) to FNV's output, which is what the exercise's `hash32` does.

## Alternatives to the ring, traced

**Rendezvous (highest random weight) hashing.** For a key, compute `score(key, server) = hash(key + "|" + server)` for *every* server and pick the highest. Using the same `hash32`:

| Key | Score A | Score B | Score C | Owner | Runner-up |
|---|---|---|---|---|---|
| user:1 | 3604514518 | 1340119393 | 3122627982 | A | C |
| user:2 | 275144987 | 2575744233 | 1011384708 | B | C |
| user:3 | 3807539178 | 563183916 | 1492962332 | A | C |
| user:4 | 1715004512 | 3612048384 | 63238818 | B | A |

Remove B: user:2 goes to its runner-up C and user:4 to A; user:1 and user:3 do not move. No ring, no sorted array, no virtual nodes: the assignment is balanced in expectation, only the departed server's keys move, and the runner-up column is a replica list for free. Lookup is O(n) in the number of servers, fine for tens and wrong for thousands. Used in some CDNs, load balancers and cache clients.

## Jump and Maglev hashing, traced

**Jump consistent hash** (Lamping and Veach, Google, 2014) is a loop with no memory: starting from `j = 0`, it repeatedly steps the key through a linear congruential generator and jumps `j` forward to the next bucket index at which the key's assignment would change, stopping when `j ≥ n`; the last bucket below `n` is the answer. It runs in O(log n) expected iterations and moves exactly `1/(n + 1)` of keys when `n` grows by one, because a key only ever moves *to the newest bucket*. Computed with the reference implementation, key 42 lands in bucket `0, 1, 2, 2, 2, 2, 2, 2` for `n = 1..8` and key 2 in `0, 0, 0, 3, 3, 3, 6, 6`: each key changes bucket only when a bucket is added that claims it, and never moves between existing buckets. The restriction is that buckets are numbered and can only be added or removed *at the end*, so it suits sharding by number, not clusters where arbitrary machines fail.

**Maglev hashing** (Google's load balancer, 2016) builds a lookup table of prime size `M` (65,537 in Google's deployment; below, `M = 7`). Each backend gets a permutation of the slots from two hashes of its name, `offset` and `skip`: `perm[j] = (offset + j × skip) mod M`. Backends then take turns claiming the next unclaimed slot in their permutation until the table is full:

| Backend | offset | skip | Permutation |
|---|---|---|---|
| B0 | 5 | 1 | 5, 6, 0, 1, 2, 3, 4 |
| B1 | 2 | 6 | 2, 1, 0, 6, 5, 4, 3 |
| B2 | 0 | 4 | 0, 4, 1, 5, 2, 6, 3 |

| Step | Backend | Claims slot | Table |
|---|---|---|---|
| 1 | B0 | 5 | `_ _ _ _ _ B0 _` |
| 2 | B1 | 2 | `_ _ B1 _ _ B0 _` |
| 3 | B2 | 0 | `B2 _ B1 _ _ B0 _` |
| 4 | B0 | 6 | `B2 _ B1 _ _ B0 B0` |
| 5 | B1 | 1 | `B2 B1 B1 _ _ B0 B0` |
| 6 | B2 | 4 (0 taken) | `B2 B1 B1 _ B2 B0 B0` |
| 7 | B0 | 3 (0, 1, 2 taken) | `B2 B1 B1 B0 B2 B0 B0` |

A key goes to `table[hash(key) mod 7]`: O(1), and every backend owns two or three of seven slots. Remove B1 and rebuild: the table becomes `B2 B0 B2 B0 B2 B0 B0`, and the only slots that changed are the two B1 owned. The cost is the rebuild (`O(M)` per change) and, at real sizes, a table of tens of thousands of entries per virtual IP.

| | Ring (consistent) | Rendezvous | Jump | Maglev |
|---|---|---|---|---|
| Lookup | O(log V) | O(n) | O(log n) | O(1) |
| Memory | O(n v) | O(1) | O(1) | O(M), M ≫ n |
| Balance | Needs ~100+ virtual nodes | Excellent | Excellent | Within 1/M of even |
| Arbitrary node removal | Yes | Yes | No (end only) | Yes (rebuild) |
| Weighted nodes | Via virtual node count | Via weighted scores | Awkward | Via slot share |
| Replication (top-k) | Walk clockwise | Runner-up scores | Awkward | Awkward |
| Used in | Cassandra, Dynamo, ketama, Envoy ring hash | Some CDNs and cache clients | Sharding by number | Google's load balancer, Envoy |

## Bloom filters: a preview with the arithmetic

Once data is spread over many servers or many files, the question "does this key exist *here*?" gets expensive: it may be a disk read or a network round trip. A Bloom filter answers "definitely not here" or "possibly here" from a small bit array, and hashing is the whole mechanism.

An `m`-bit array, all zeros, and `k` hash functions. To add an item, set the `k` bits `h₁(item) mod m, …, h_k(item) mod m`. To query, check those `k` bits: if any is 0 the item was never added; if all are 1 it *probably* was, but other items' bits may have covered them (a false positive). No false negatives, and no deletion (clearing a bit could clear another item's bit).

Trace the exercise's filter (`m = 64`, `k = 3`, bit `i` at `hash32(i + ":" + item) mod 64`):

| Operation | Bits | Result |
|---|---|---|
| add `apple` | 36, 12, 56 | set |
| add `banana` | 33, 59, 62 | set |
| query `cherry` | 58, 61, 50 | bit 58 is 0 → **definitely absent** |
| query `plum` | 56, 59, 5 | 56 and 59 are set by other items, 5 is 0 → absent |
| add `fig` | 46, 46, 11 | two hashes collide: only two distinct bits set |
| query `fig` | 46, 46, 11 | all set → present (a filter must not require `k` *distinct* bits) |

The false-positive rate after `n` insertions is approximately

$$p \approx \left(1 - e^{-kn/m}\right)^k$$

For this 64-bit filter: 0.23% after 3 items, 5.2% after 10. At production sizes with 10 bits per key (`m/n = 10`) and the optimal `k ≈ 0.69 × m/n ≈ 7`, `p ≈ 0.82%`; with `k = 5` it is 0.94%, and at 8 bits per key with `k = 6` it is 2.2%. One byte per key to skip 99% of pointless disk reads. RocksDB builds no filter unless one is configured (`filter_policy` defaults to null) and its header recommends about 9.9 bits per key for a ~1% false-positive rate, Cassandra targets a 1% false-positive chance for size-tiered tables and 10% for levelled ones (whose reads touch fewer tables), and both keep one filter per SSTable so that a read for a missing key touches no file. [Bloom filters](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) does the mathematics and the counting and cuckoo variants; the second exercise builds this one.

```viz
{"type": "system", "scenario": "bloom-filter", "keys": ["apple", "banana", "cherry"], "title": "Three hashes per key set bits; a query with any zero bit is a definite miss"}
```

## Under the hood: what real systems do

- **Cassandra** hashes the partition key with MurmurHash3 to a 64-bit token on a ring from −2⁶³ to 2⁶³−1; each node owns the arcs before its tokens, the replication strategy walks clockwise to the next distinct racks or data centres, and clients cache the token map so that a request goes straight to a replica.
- **Redis Cluster** does not use a ring. It has 16,384 fixed hash slots (`CRC16(key) mod 16384`), a slot-to-node table, and explicit migration of whole slots; a key with a `{...}` hash tag is hashed on the tag only, so related keys share a slot. A fixed slot table is the simplest consistent scheme when the number of buckets can be chosen once.
- **Kafka** assigns a record to partition `murmur2(key) & 0x7fffffff mod partitions` (the default partitioner; null keys go to a "sticky" partition per batch since 2.4). Existing records never move, so raising the partition count changes the mapping for most keys and splits each key's ordering across two partitions from that moment.
- **memcached clients** (ketama, mcrouter) and **Envoy** implement rings with virtual nodes; Envoy also offers Maglev, with a default table size of 65,537 (the default the Maglev paper reports using in production). The ring lives in the client, which is why every client of one cluster must run the same hash and the same virtual-node count.
- **Netflix's EVCache** shards each cache across memcached nodes in every availability zone with a consistent-hash ring per zone, and replicates writes to all zones, so a zone loss or a node replacement moves only that node's arcs.

## Choosing a sharding key

Consistent hashing decides which server owns a key; something must first decide what the key *is*. That choice is the one that is hard to change later.

- **High cardinality and even spread.** `user_id` (millions of values, roughly uniform) is good; `country` (a few values, one of them 40% of traffic) is not; `created_at` sends all new writes to one shard.
- **Query locality.** Queries that need many rows should hit one shard. If you always read a user's orders together, shard orders by `user_id`, not `order_id`, even though `order_id` spreads more evenly. A compound key (`tenant_id` for locality, hashed together with `id` for spread) is the usual compromise.
- **Hot keys.** A celebrity account or a viral item concentrates load on one shard regardless of the hash: a key carrying 5% of all traffic gives its shard 5% of the total, which with 100 shards is five times the average. Mitigations: split the hot key into `key#0..key#9` sub-keys and fan out, cache it in front of the shards, or isolate it.
- **Resharding cost.** Changing the shard key means rewriting everything. Changing the shard *count* with consistent hashing moves `1/n`; with `mod n` it moves nearly all, which is why teams over-provision Kafka partitions up front.

| | Hash sharding | Range sharding |
|---|---|---|
| Load balance | Even by construction, except hot keys | Hot ranges from monotonic keys (timestamps, auto-increment ids) |
| Point lookup | One shard | One shard, after a range-map lookup |
| Range scan | Scatter-gather across all shards | One or a few shards |
| Rebalancing | Consistent hashing or a slot table | Split and merge ranges (needs machinery) |
| Used in | Cassandra partition key, Dynamo, Redis Cluster | HBase, Spanner, CockroachDB, Bigtable |
| Common hybrid | Hash the first component (partition key), range-order the second (clustering columns) | |

[Partitioning and sharding](/learn/databases/storage-and-scale/partitioning-and-sharding) and [Partitioning and rebalancing](/learn/system-design/distributed-systems/partitioning-and-rebalancing) take these decisions through full case studies.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Adding a cache node causes a miss storm and a database overload | `mod n` placement | Consistent hashing, a fixed slot table, or warm the new node before it takes traffic |
| One node carries 3× the average load although the ring has virtual nodes | Too few virtual nodes, or a weak hash (FNV without a finaliser) clustering each node's points | 100+ well-mixed points per node; check the arc-length histogram |
| Two services disagree about which node owns a key; each sees a 50% miss rate | Different clients with different hash functions, virtual-node counts or integer semantics (signed Java, imprecise JS multiply) | One ring implementation shared by every client, with cross-language golden tests |
| A node fails and its clockwise neighbour fails minutes later | One point per node: the whole arc lands on one neighbour (cascading failure) | Virtual nodes spread the failed node's load across the cluster |
| Replica set for a key contains the same physical node twice | Replication walked to the next *points*, not the next distinct *nodes* | Skip virtual nodes of a node already in the replica list |
| Kafka consumers see per-key events out of order after "scaling up" | Partition count increased; new records for a key went to a new partition | Over-provision partitions; if you must change the count, drain and re-key or accept a one-time ordering break |
| Bloom filter says "maybe" for almost every miss; disk reads for absent keys rise to nearly 100% | The filter was sized for `n` and holds far more, saturating the bits | Size per expected `n` with headroom, rebuild when the item count doubles (LSM engines rebuild per SSTable, which bounds this) |

## Interviewer follow-ups

**"Consistent hashing moves 1/n of keys; can you do better?"** Model answer: `1/n` is the minimum for any scheme that keeps balance, because the new server must take its fair share from somewhere; what you can improve is *where* the moved keys come from (evenly from all servers, which virtual nodes and rendezvous give) and the lookup cost (Maglev's O(1)). Common wrong answer: "use more virtual nodes to move fewer keys", which changes the spread of the moved keys, not their number.

**"Why not rendezvous hashing everywhere, given its balance and simplicity?"** Model answer: its lookup is O(n) in servers, so it is right for tens of destinations and wrong for a thousand-node ring; it also cannot express weights as cleanly without a weighted-score variant. Common wrong answer: "it moves more keys than a ring".

**"A key gets 20% of all traffic. What does consistent hashing do about it?"** Model answer: nothing; hashing places keys, it does not split them. Split the key into sub-keys with fan-out on read, put a local cache in front of the shard, or route that key specially; detect it with a heavy-hitter sketch. Common wrong answer: "add virtual nodes", which balances *keys*, not *traffic per key*.

**"Your Bloom filter has a 1% false-positive rate. What does that cost, and what happens as more keys are added?"** Model answer: 1% of lookups for absent keys pay the full read; the rate rises as `n` grows past the design size, toward 100% when the array saturates, so the filter must be sized for the maximum `n` or rebuilt; there are no false negatives at any size. Common wrong answer: "1% of lookups return wrong data".

**"How would you resize Kafka partitions without breaking per-key ordering?"** Model answer: you cannot in place; either over-provision from the start, or create a new topic with the target count and migrate producers and consumers with a cut-over that drains the old topic, accepting a one-time reordering window. Common wrong answer: "Kafka rebalances existing records".

## What mid-level engineers get wrong

- **Sharding with `hash mod n`** in a system whose `n` will change, then discovering the outage on the first scale-up.
- **Using one point per server** on a ring and reporting that "consistent hashing is unbalanced".
- **Using FNV or a string's built-in hash for ring positions**, so each server's virtual nodes cluster.
- **Letting each client library compute its own ring** with slightly different parameters.
- **Treating a Bloom "yes" as a fact**, or expecting to delete from a plain Bloom filter.
- **Choosing a shard key for spread alone** (`order_id`) and then needing every user's orders together.
- **Increasing a Kafka topic's partitions "to add throughput"** without knowing it re-maps keys.

## Exercises

```exercise
id: hash-ring
title: Consistent hash ring with virtual nodes
prompt: |
  Implement `HashRing`. `add(node)` places 3 virtual nodes for the string
  `node` at positions `hash32(node + "#" + i)` for `i` in 0, 1, 2.
  `remove(node)` removes all of its points. `get(key)` returns the node
  owning the first point at or after `hash32(key)`, wrapping to the
  smallest point if none is larger, or `None`/`null` when the ring is
  empty. Keep the points in a sorted array and use binary search (or the
  provided helper). `hash32` is provided: FNV-1a followed by a finaliser.
languages: [python, javascript]
entry: HashRing
starter:
  python: |
    import bisect

    def hash32(s):
        h = 0x811c9dc5
        for ch in s:
            h = ((h ^ ord(ch)) * 0x01000193) & 0xffffffff
        h ^= h >> 16; h = (h * 0x85ebca6b) & 0xffffffff
        h ^= h >> 13; h = (h * 0xc2b2ae35) & 0xffffffff
        return h ^ (h >> 16)

    class HashRing:
        VNODES = 3

        def __init__(self):
            self.points = []          # sorted list of (position, node)

        def add(self, node):
            # TODO: insert VNODES points, keeping self.points sorted
            pass

        def remove(self, node):
            # TODO
            pass

        def get(self, key):
            # TODO: first point >= hash32(key), wrapping around
            return None
  javascript: |
    function hash32(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
      return (h ^ (h >>> 16)) >>> 0;
    }

    class HashRing {
      constructor() {
        this.VNODES = 3;
        this.points = [];          // sorted array of [position, node]
      }
      add(node) {
        // TODO: insert VNODES points, keeping this.points sorted by position
      }
      remove(node) {
        // TODO
      }
      get(key) {
        // TODO: first point >= hash32(key), wrapping around
        return null;
      }
    }
tests:
  - args: [["add", "A"], ["add", "B"], ["add", "C"], ["get", "user:1"], ["get", "user:2"], ["get", "user:3"], ["get", "user:4"], ["get", "user:5"], ["get", "user:6"], ["get", "user:7"], ["get", "user:8"]]
    expected: [null, null, null, "A", "C", "C", "B", "A", "C", "A", "B"]
  - args: [["add", "A"], ["add", "B"], ["add", "C"], ["remove", "B"], ["get", "user:1"], ["get", "user:2"], ["get", "user:3"], ["get", "user:4"], ["get", "user:5"], ["get", "user:6"], ["get", "user:7"], ["get", "user:8"]]
    expected: [null, null, null, null, "A", "C", "C", "C", "A", "C", "A", "C"]
    label: removing B moves only B's keys (user:4 and user:8)
  - args: [["get", "k"], ["add", "A"], ["get", "x"], ["add", "B"], ["get", "x"], ["remove", "A"], ["get", "x"]]
    expected: [null, null, "A", null, "B", null, "B"]
    label: empty ring, single node, and wrap-around
  - args: [["add", "A"], ["add", "B"], ["add", "C"], ["remove", "B"], ["add", "D"], ["get", "user:1"], ["get", "user:2"], ["get", "user:3"], ["get", "user:4"], ["get", "user:5"], ["get", "user:6"], ["get", "user:7"], ["get", "user:8"]]
    expected: [null, null, null, null, null, "D", "C", "C", "C", "A", "C", "D", "D"]
    hidden: true
    label: adding D claims arcs from both A and C
hints:
  - "Python: `bisect.insort(self.points, (hash32(f'{node}#{i}'), node))`; JavaScript: find the insertion index with a binary search on position and `splice`."
  - "`get`: binary-search the first index whose position is >= the key's hash; if it equals the array length use index 0."
```

```exercise
id: bloom-filter
title: A 64-bit Bloom filter
prompt: |
  Implement `BloomFilter` with `m = 64` bits and `k = 3` hash functions.
  Bit index `i` for an item is `hash32(str(i) + ":" + item) mod 64` for
  `i` in 0, 1, 2 (so the three strings are `"0:item"`, `"1:item"`,
  `"2:item"`). `add(item)` sets the three bits; `might_contain(item)`
  returns `true` only if all three are set. Use the provided `hash32`
  (same as in the ring exercise) and store the bits in a list/array of
  64 booleans or a single integer.
languages: [python, javascript]
entry: BloomFilter
starter:
  python: |
    def hash32(s):
        h = 0x811c9dc5
        for ch in s:
            h = ((h ^ ord(ch)) * 0x01000193) & 0xffffffff
        h ^= h >> 16; h = (h * 0x85ebca6b) & 0xffffffff
        h ^= h >> 13; h = (h * 0xc2b2ae35) & 0xffffffff
        return h ^ (h >> 16)

    class BloomFilter:
        M = 64
        K = 3

        def __init__(self):
            self.bits = [False] * self.M

        def _indices(self, item):
            # TODO: the K bit positions for item
            return []

        def add(self, item):
            # TODO
            pass

        def might_contain(self, item):
            # TODO
            return False
  javascript: |
    function hash32(s) {
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
      return (h ^ (h >>> 16)) >>> 0;
    }

    class BloomFilter {
      constructor() {
        this.M = 64;
        this.K = 3;
        this.bits = new Array(this.M).fill(false);
      }
      _indices(item) {
        // TODO: the K bit positions for item
        return [];
      }
      add(item) {
        // TODO
      }
      might_contain(item) {
        // TODO
        return false;
      }
    }
tests:
  - args: [["add", "apple"], ["add", "banana"], ["might_contain", "apple"], ["might_contain", "banana"], ["might_contain", "cherry"], ["might_contain", "grape"]]
    expected: [null, null, true, true, false, false]
  - args: [["might_contain", "apple"], ["add", "apple"], ["might_contain", "apple"]]
    expected: [false, null, true]
    label: empty filter says no to everything
  - args: [["add", "fig"], ["might_contain", "fig"], ["might_contain", "kiwi"], ["might_contain", "lime"]]
    expected: [null, true, false, false]
    hidden: true
    label: two of fig's three hashes collide with each other; it must still be found
  - args: [["add", "pear"], ["add", "plum"], ["add", "olive"], ["might_contain", "peach"], ["might_contain", "plum"], ["might_contain", "onion"]]
    expected: [null, null, null, false, true, false]
    hidden: true
hints:
  - "`_indices` returns `[hash32(f'{i}:{item}') % 64 for i in range(3)]`."
  - "`might_contain` is `all(self.bits[j] for j in self._indices(item))`; never return true on a partial match."
```

## Senior signals

- You can say why `mod n` moves almost every key on a resize (80% at 4 → 5, 99% at 99 → 100) and quote the `1/n` ideal that consistent hashing achieves, and you can trace a key's owner on a ring before and after a node change.
- You explain virtual nodes as the fix for both imbalance and failure-spread, quote the `1/√v` scaling, and know the counts real systems use (16–256 per node in Cassandra, 160 in ketama).
- You can trace rendezvous, jump and Maglev on a small example and say when each one's lookup cost or removal restriction rules it out.
- You state the Bloom filter guarantee precisely (no false negatives, tunable false positives, no deletes), can evaluate `(1 − e^{−kn/m})^k` for 10 bits per key, and know it saturates past its design size.
- You know that Redis Cluster uses 16,384 fixed slots rather than a ring, that Kafka never moves existing records, and that every client of a cache cluster must run the same ring.
- You choose a shard key by cardinality, locality and hot-key risk, and you know changing the shard key is a migration.
- You know that a hash with weak avalanche on short similar strings produces clustered virtual nodes, and you name the fix.

## Check yourself

```quiz
- q: >-
    A cache cluster assigns keys with hash(key) mod n. Growing from 9 to 10 servers moves approximately what fraction of keys?
  options: ["None, since each key's hash value is unchanged", "About 90%, as few hashes agree mod 9 and mod 10", "About 10%, one server's fair share of the keys", "About 50%, as keys shift toward the new server"]
  answer: 1
  explanation: >-
    A key stays only if hash mod 9 equals hash mod 10, which happens for about 1/10 of keys; roughly n/(n+1) = 90% move (measured 90.0% over 100,000 keys). The hash is unchanged but the modulus is not. Consistent hashing reduces the movement to about 1/(n+1) = 10%, the new server's fair share.
- q: >-
    Why do consistent-hashing rings use many virtual nodes per server?
  options: ["To save memory, since each point then stores fewer keys", "To support deleting keys, which one point per server cannot", "To even out arcs, allow weighting and spread failover load", "To make lookups O(1) by indexing the ring with an array"]
  answer: 2
  explanation: >-
    With one point per server, arcs are very uneven and a failure dumps the whole arc on one neighbour. Many points per server average out the arcs (spread falls as 1/√v), let bigger servers take more points, and scatter each server's responsibility around the ring. Lookups are still O(log V) binary searches, and the ring grows to n × v points.
- q: >-
    Rendezvous hashing picks the server with the highest hash(key, server). Its main limitation compared with a ring is:
  options: ["Balance is poor unless each server has virtual nodes", "It cannot replicate, since one server scores highest", "Lookup cost is O(n) in the number of servers", "Many keys move when a server leaves the cluster"]
  answer: 2
  explanation: >-
    Every lookup scores every server. That is fine for tens of servers and excellent for balance and minimal disruption (only the leaving server's keys move, each to its runner-up), but a ring's O(log V) binary search wins at thousands of nodes. The runner-up scores give replication for free.
- q: >-
    A Bloom filter reports that a key is present. What do you know?
  options: ["It was added and not deleted, since deletes clear its bits", "It was definitely added, since there are no false positives", "Nothing, since Bloom filters err in both directions", "It was probably added; other keys may have set its bits"]
  answer: 3
  explanation: >-
    Bloom filters have no false negatives (a "no" is certain) but a tunable false-positive rate, since bits are shared, so a "yes" is only probable; at 10 bits per key with 7 hashes that is about 0.8%, rising as the filter fills past its design size. They also do not support deletion without the counting variant.
- q: >-
    A team increases a Kafka topic from 8 to 12 partitions. What happens to per-key ordering?
  options: ["Old messages move to the new partitions, keeping order", "Nothing, since Kafka rebalances existing keys automatically", "Most keys map to a new partition, splitting each key's order", "Ordering improves, since each partition holds fewer keys"]
  answer: 2
  explanation: >-
    Kafka uses murmur2(key) mod partition count and never moves existing messages. Changing the count changes the mapping for most keys, so a key's new messages are ordered separately from its old ones in a different partition. This is why partition counts are over-provisioned up front.
- q: >-
    Jump consistent hash moves exactly 1/(n+1) of keys when a bucket is added, yet clusters that lose arbitrary machines do not use it. Why?
  options: ["It needs a large lookup table rebuilt on every change", "Buckets are numbered and can only be removed from the end", "It cannot be seeded, so all clients compute different buckets", "Its lookup is O(n), which is too slow for large clusters"]
  answer: 1
  explanation: >-
    Jump hash maps a key to a bucket index in 0..n−1 with no memory and O(log n) time, and a key only ever moves to the newest bucket. That makes removing bucket 3 of 8 impossible without renumbering, so it suits sharding by number, not membership that changes arbitrarily. The table rebuild describes Maglev, and the O(n) lookup describes rendezvous.
```
