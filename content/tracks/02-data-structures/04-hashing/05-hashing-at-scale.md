---
slug: hashing-at-scale
title: Hashing at scale
description: Why key mod n falls apart when n changes, consistent hashing with virtual nodes, rendezvous and jump hashing as alternatives, Bloom filters as a preview of probabilistic hashing, and how to choose a sharding key.
minutes: 50
difficulty: hard
tags: [hashing, consistent-hashing, rendezvous-hashing, bloom-filter, sharding, distributed-systems]
problems: [design-hashmap, lru-cache]
---
Your cache is spread over four servers, and a key goes to server `hash(key) mod 4`. You add a fifth server to handle growth. Now a key goes to `hash(key) mod 5`, and for roughly 80% of keys that is a different server than before. The cache is effectively empty; every request misses and hits the database, and the database, which was fine at a 95% cache hit rate, falls over. Adding capacity caused an outage.

Hashing is how systems decide *where* data lives once it no longer fits on one machine, and the question at scale is not just "does the function spread keys evenly?" but "what happens to the mapping when the set of destinations changes?". The same hash-function ideas from earlier lessons reappear here at the level of clusters, with new failure modes.

## The problem with `mod n`

Count how many of the keys `0..19` stay on the same server when the cluster grows from 4 to 5 servers: a key stays iff `k mod 4 == k mod 5`, which for `k < 20` holds only for `k = 0, 1, 2, 3`. Four of twenty stay; sixteen move. In general growing from `n` to `n + 1` moves about `n / (n + 1)` of the keys, and it moves them *to servers that have to fetch them from scratch*. The ideal is that only `1 / (n + 1)` of the keys move: exactly the share the new server should take, and nothing else.

```viz
{"type": "hash-table", "algorithm": "resize", "buckets": 4, "operations": [["set", "k1", 1], ["set", "k2", 2], ["set", "k3", 3], ["set", "k4", 4], ["set", "k5", 5], ["set", "k6", 6]], "title": "A local hash table has the same problem: changing the modulus moves almost every key"}
```

Inside a single process a rehash is a few milliseconds of CPU. Across a cluster it is a thundering herd of cache misses, minutes of elevated latency, and possibly a cascading failure. That difference is why consistent hashing was invented (Karger et al., 1997, for web caches) and why it underlies Dynamo, Cassandra, Riak, memcached client libraries and most load balancers.

## Consistent hashing

Hash both keys and servers onto the same circular space, say the integers `0..2³²−1` arranged as a ring. A key is owned by the first server whose point is at or after the key's point, walking clockwise and wrapping around.

Small worked ring with positions `0..99`: servers `A@10`, `B@45`, `C@80`. Keys: `k1@5 → A`, `k2@30 → B`, `k3@50 → C`, `k4@90 → wraps → A`.

Add `D@60`. Only keys in `(45, 60]` change owner, from `C` to `D`: `k3@50` moves; `k1`, `k2`, `k4` stay. Remove `B`: keys in `(10, 45]` go to the next server clockwise, `C`; nothing else moves. Each server's arrival or departure touches only the arc immediately before it, which on average holds `1/n` of the keys.

```viz
{"type": "system", "scenario": "consistent-hashing", "nodes": 4, "keys": 12, "title": "Keys and servers share a ring; adding a server claims one arc"}
```

Implementation is a sorted array of server points with binary search: `get(key)` hashes the key, finds the first point `≥` the hash (`bisect_left`), wrapping to index 0 if it runs off the end. That is the `ceiling` operation from [Ordered maps vs hash maps](/learn/data-structures/hashing/ordered-maps-vs-hash-maps), and lookups cost O(log V) where `V` is the number of points.

### Virtual nodes

With one point per server, the arcs are wildly uneven: three random points on a ring routinely give one server half the keys. The fix is to place each server at many points (100–200 "virtual nodes" or "tokens" per server, hashed as `server + "#" + i`). With `v` points per server the largest arc converges toward the average, the standard deviation of load drops roughly as `1/√v`, and two more things become possible:

- **Weighting.** A server with twice the capacity gets twice the virtual nodes.
- **Spread on failure.** When a server dies, its arcs were scattered around the ring, so its load is spread across *all* the remaining servers rather than dumped on one neighbour.

Cassandra runs 256 tokens per node by default (fewer in newer versions with a smarter allocator); Amazon's Dynamo paper describes the same design. The cost is a larger sorted array (`n × v` points) and, for replication, the rule that the "next `r` distinct physical servers clockwise" hold the replicas, which needs care so that a server does not replicate to itself.

### A hash function detail that matters here

The point positions need a hash with good avalanche on *short, similar* strings (`node1#0`, `node1#1`, …). FNV-1a alone is not good enough: two strings that differ only in the last character produce hashes that differ by exactly a multiple of the FNV prime, so a server's virtual nodes land in a tight cluster instead of spreading around the ring. Production rings use MurmurHash3, xxHash or MD5 (ketama, the original memcached ring, uses MD5 for this reason), or apply a finaliser (a few XOR-shift-multiply rounds) to FNV's output. The exercise below provides such a finalised hash so the tests are deterministic.

## Alternatives to the ring

**Rendezvous (highest random weight) hashing.** For a key, compute `score(key, server) = hash(key + server)` for *every* server and pick the highest. No ring, no sorted array, no virtual nodes: the assignment is perfectly balanced in expectation, and when a server leaves, only the keys for which it had the top score move (to whichever server had the second-highest score, which is uniformly spread). Lookup is O(n) in the number of servers, which is fine for tens of servers and wrong for thousands. It also naturally supports "pick the top `k` servers" for replication. Used in some CDNs, load balancers and cache clients.

**Jump consistent hash** (Lamping and Veach, Google, 2014): a tiny function that maps a 64-bit key and a bucket count `n` to a bucket in `0..n−1`, in O(log n) time with no memory, such that growing from `n` to `n + 1` moves exactly `1/(n + 1)` of keys. The restriction: buckets are numbered and can only be added or removed *at the end*, so it suits sharding by number, not clusters where arbitrary machines fail.

**Maglev hashing** (Google's load balancer): builds a large lookup table (a prime size, tens of thousands of entries) by having each backend fill slots in a permutation order, giving O(1) lookups, near-perfect balance, and minimal disruption on change at the cost of a table rebuild.

| | Ring (consistent) | Rendezvous | Jump | Maglev |
|---|---|---|---|---|
| Lookup | O(log V) | O(n) | O(log n) | O(1) |
| Memory | O(n v) | O(1) | O(1) | Large table |
| Balance | Needs virtual nodes | Excellent | Excellent | Excellent |
| Arbitrary node removal | Yes | Yes | No (end only) | Yes (rebuild) |
| Weighted nodes | Via virtual node count | Via weighted scores | Awkward | Via slot share |
| Replication (top-k) | Walk clockwise | Top-k scores | Awkward | Awkward |

## Bloom filters: a preview

Once data is spread over many servers or many files, the question "does this key exist *here*?" gets expensive: it may be a disk read or a network round trip. A Bloom filter answers "definitely not here" or "possibly here" from a small bit array, and hashing is the whole mechanism.

An `m`-bit array, all zeros, and `k` independent hash functions. To add an item, set the `k` bits `h₁(item) mod m, …, h_k(item) mod m`. To query, check those `k` bits: if any is 0 the item was never added; if all are 1 it *probably* was, but another item's bits may have covered them (a false positive). No false negatives, and deletion is not supported (clearing a bit could clear another item's bit).

The false-positive rate after `n` insertions is approximately

$$p \approx \left(1 - e^{-kn/m}\right)^k$$

With 10 bits per item (`m/n = 10`) and the optimal `k ≈ 0.7 × m/n ≈ 7`, `p ≈ 0.8%`. One byte per key, and a lookup that touches seven bits, to skip 99% of pointless disk reads. LSM-tree storage engines (RocksDB, Cassandra) keep a Bloom filter per SSTable so a read for a missing key touches no file; CDNs use them to avoid caching one-hit-wonder objects; browsers used them for malicious-URL lists. [Bloom filters](/learn/advanced-data-structures/probabilistic-structures/bloom-filters) does the mathematics and the counting and cuckoo variants; the second exercise builds a tiny one.

```viz
{"type": "system", "scenario": "bloom-filter", "keys": ["apple", "banana", "cherry"], "title": "Three hashes per key set bits; a query with any zero bit is a definite miss"}
```

## Choosing a sharding key

Consistent hashing decides which server owns a key; something must first decide what the key *is*. That choice is the one that is hard to change later.

- **High cardinality and even spread.** `user_id` (millions of values, roughly uniform) is good; `country` (a few values, one of them 40% of traffic) is not; `created_at` sends all new writes to one shard.
- **Query locality.** Queries that need many rows should hit one shard. If you always read a user's orders together, shard orders by `user_id`, not `order_id`, even though `order_id` spreads more evenly. A compound key (`tenant_id` for locality, hashed together with `id` for spread) is the usual compromise.
- **Hot keys.** A celebrity account or a viral item concentrates load on one shard regardless of the hash. Mitigations: split the hot key into `key#0..key#9` sub-keys and fan out, cache it in front of the shards, or isolate it.
- **Hash vs range sharding.** Hash sharding balances load and destroys order: range scans become scatter-gather across every shard. Range sharding (by key interval, as in HBase and Spanner) keeps order and enables range queries but creates hot ranges (monotonic keys) and needs split/merge machinery. Many systems hash the *first* component and range-partition the *second* (Cassandra's partition key and clustering columns).
- **Resharding cost.** Changing the shard key means rewriting everything. Changing the shard *count* with consistent hashing moves `1/n`; with `mod n` moves nearly all. Kafka partitions messages by `hash(key) mod partitions` (Murmur2), which is why increasing a topic's partition count breaks per-key ordering for existing keys, and why teams over-provision partitions up front.

[Partitioning and sharding](/learn/databases/storage-and-scale/partitioning-and-sharding) and [Partitioning and rebalancing](/learn/system-design/distributed-systems/partitioning-and-rebalancing) take these decisions through full case studies.

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

- You can say why `mod n` moves almost every key on a resize and quote the `1/n` ideal that consistent hashing achieves.
- You explain virtual nodes as the fix for both imbalance and failure-spread, and know the order of magnitude used in practice.
- You know rendezvous hashing and can say when its O(n) lookup is acceptable and why it needs no ring.
- You state the Bloom filter guarantee precisely (no false negatives, tunable false positives, no deletes) and can give the one-byte-per-key rule of thumb.
- You choose a shard key by cardinality, locality and hot-key risk, and you know changing the shard key is a migration.
- You know that a hash with weak avalanche on short similar strings produces clustered virtual nodes, and you name the fix.

## Check yourself

```quiz
- q: >-
    A cache cluster assigns keys with hash(key) mod n. Growing from 9 to 10 servers moves approximately what fraction of keys?
  options: ["None, since each key's hash value is unchanged", "About 90%, as few hashes agree mod 9 and mod 10", "About 10%, one server's fair share of the keys", "About 50%, as keys shift toward the new server"]
  answer: 1
  explanation: >-
    A key stays only if hash mod 9 equals hash mod 10, which happens for about 1/10 of keys; roughly n/(n+1) = 90% move. The hash is unchanged but the modulus is not. Consistent hashing reduces the movement to about 1/(n+1) = 10%, the new server's fair share.
- q: >-
    Why do consistent-hashing rings use many virtual nodes per server?
  options: ["To save memory, since each point then stores fewer keys", "To support deleting keys, which one point per server cannot", "To even out arcs, allow weighting and spread failover load", "To make lookups O(1) by indexing the ring with an array"]
  answer: 2
  explanation: >-
    With one point per server, arcs are very uneven and a failure dumps the whole arc on one neighbour. Many points per server average out the arcs, let bigger servers take more points, and scatter each server's responsibility around the ring. Lookups are still O(log V) binary searches, and the ring grows to n × v points.
- q: >-
    Rendezvous hashing picks the server with the highest hash(key, server). Its main limitation compared with a ring is:
  options: ["Balance is poor unless each server has virtual nodes", "It cannot replicate, since one server scores highest", "Lookup cost is O(n) in the number of servers", "Many keys move when a server leaves the cluster"]
  answer: 2
  explanation: >-
    Every lookup scores every server. That is fine for tens of servers and excellent for balance and minimal disruption (only the leaving server's keys move), but a ring's O(log V) binary search wins at thousands of nodes. Top-k scores give replication for free.
- q: >-
    A Bloom filter reports that a key is present. What do you know?
  options: ["It was added and not deleted, since deletes clear its bits", "It was definitely added, since there are no false positives", "Nothing, since Bloom filters err in both directions", "It was probably added; other keys may have set its bits"]
  answer: 3
  explanation: >-
    Bloom filters have no false negatives (a "no" is certain) but a tunable false-positive rate, since bits are shared, so a "yes" is only probable. They also do not support deletion without the counting variant.
- q: >-
    A team increases a Kafka topic from 8 to 12 partitions. What happens to per-key ordering?
  options: ["Old messages move to the new partitions, keeping order", "Nothing, since Kafka rebalances existing keys automatically", "Most keys map to a new partition, splitting each key's order", "Ordering improves, since each partition holds fewer keys"]
  answer: 2
  explanation: >-
    Kafka uses hash(key) mod partition count and never moves existing messages. Changing the count changes the mapping for most keys, so a key's new messages are ordered separately from its old ones in a different partition. This is why partition counts are over-provisioned up front.
```
