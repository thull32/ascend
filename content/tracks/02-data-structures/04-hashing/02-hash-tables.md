---
slug: hash-tables
title: "Hash tables: from hash function to O(1)"
description: How chaining and open-addressing tables actually store data, a hand trace of a probe cluster forming, the load-factor mathematics behind every runtime's resize threshold, and what CPython, Rust, Java, Go and V8 really do per entry.
minutes: 40
difficulty: medium
tags: [hashing, hash-map, dictionary, open-addressing, chaining, load-factor, tombstones, swisstable, cpython-dict]
problems: [two-sum, group-anagrams]
---
You need to look up a value by key in constant time, and the keys are not small integers you can use as array indices. That single requirement is behind `dict`, `HashMap`, `map[string]T`, `Set`, every cache you have deployed, and roughly a third of all interview problems. A hash table solves it by *turning the key into an array index* and then dealing with the consequences of two keys landing on the same index.

Everything follows from those two halves: the hash function that produces the index and the collision strategy that resolves conflicts. Get either wrong and the "O(1)" quietly becomes O(n). [Hash functions](/learn/data-structures/hashing/hash-functions) covers the function; this lesson is about the table: both collision strategies traced by hand on real hash values, the load-factor arithmetic behind every resize threshold, and the exact layouts CPython, Rust, Java, Go and V8 use, with byte counts.

## The core mechanism

A hash table is an array of `m` slots (often called buckets) plus a hash function `h(key)` that maps any key to an integer. The slot for a key is `h(key) mod m`, or `h(key) & (m − 1)` when `m` is a power of two, which every runtime below chooses so that the modulus is a one-cycle mask instead of a 20–40-cycle division.

```python
class NaiveTable:
    def __init__(self, m=8):
        self.m = m
        self.slots = [None] * m
    def _index(self, key):
        return hash(key) % self.m
    def set(self, key, value):
        self.slots[self._index(key)] = (key, value)   # collisions clobber!
    def get(self, key):
        entry = self.slots[self._index(key)]
        return entry[1] if entry and entry[0] == key else None
```

With `m = 8` and 32-bit FNV-1a as the hash, `"melon"` hashes to `1927437660`, which is `4 mod 8`, and `"lime"` hashes to `132336572`, also `4 mod 8`. The naive table silently overwrites one with the other. Every real hash table is a strategy for *not* losing that data while keeping lookups fast, and there are two families:

| Strategy | Where colliding entries go | Memory | Cache behaviour |
|---|---|---|---|
| **Separate chaining** | A linked list (or small vector) hanging off the slot | One pointer per slot plus a node per entry | Poor: each probe follows a pointer to a separate allocation |
| **Open addressing** | Another slot in the same array, found by probing | Entries stored inline; no nodes | Good: probing walks contiguous memory |

## Separate chaining

Each slot holds a pointer to a chain of entries. Insert walks the chain to check for an existing key, then appends. Lookup walks the chain comparing keys.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 5,
 "operations": [["set","apple",1],["set","grape",2],["set","melon",3],["set","kiwi",4],["get","grape"],["delete","apple"],["get","apple"]]}
```

The cost of a lookup is the length of the chain you walk. If the hash function spreads `n` keys evenly over `m` slots, each chain has about `n/m` entries. That ratio, `α = n/m`, is the **load factor**, and it is the single number that governs hash table performance:

- Successful lookup: about `1 + α/2` key comparisons on average (you stop halfway down the chain on average).
- Unsuccessful lookup: about `α` comparisons after the slot access, since you walk the whole chain.
- Worst case: every key in one chain, `O(n)`.

Keep `α` bounded by a constant and the average is `O(1)`. The "on average" assumes the hash behaves like a uniform random function on *your* keys; the next lesson's HashDoS section is what happens when it does not.

Chaining's cost is in memory and cache misses rather than probe counts. Java's `HashMap` is the canonical chained table: each entry is a `Node` object with a 12-byte header (compressed object pointers, the default below 32 GB heaps), a 4-byte cached hash, and 4-byte references to key, value and next, padded to **32 bytes**, plus a 4-byte slot in the table array. At the default load factor of 0.75 that is about 37 bytes of table overhead per entry before the key and value objects themselves (a boxed `Integer` is 16 bytes more). A lookup that misses cache costs one miss for the slot and one per node walked, each ~100 ns from DRAM on a current server (CPU-dependent; the [memory hierarchy lesson](/learn/foundations/complexity/space-complexity-and-memory-hierarchy) has the ladder).

Since Java 8 (2014), a chain longer than 8 in a table of at least 64 slots is converted into a red-black tree, and converted back when it shrinks below 6. That caps one bucket's worst case at `O(log n)`, and the motivation was hash flooding: attackers were crafting thousands of colliding keys to turn a request parse into `O(n²)`. Tree nodes cost about twice the memory of list nodes, which is why the conversion waits for 8. `LinkedHashMap` adds two references per node to keep insertion or access order, which is how Java builds an LRU cache in one class.

## Open addressing: watch a cluster form

Open addressing keeps everything in the array. On collision you probe a sequence of alternative slots until you find an empty one (insert), the key (lookup), or an empty slot that proves the key is absent. The simplest probe sequence is **linear probing**: slot `i`, then `i + 1`, `i + 2`, … wrapping around.

Here are five inserts into an 8-slot table with real 32-bit FNV-1a values. `home` is the hash mod 8; `probes` counts the slots examined.

| Step | Key | FNV-1a | home | Slots examined | Lands in | Table after (slot: key) |
|---|---|---|---|---|---|---|
| 1 | `melon` | 1927437660 | 4 | 4 | 4 | 4:melon |
| 2 | `lime` | 132336572 | 4 | 4 (melon), 5 | 5 | 4:melon 5:lime |
| 3 | `fig` | 3252984341 | 5 | 5 (lime), 6 | 6 | 4:melon 5:lime 6:fig |
| 4 | `pear` | 3491742317 | 5 | 5, 6, 7 | 7 | 4:melon 5:lime 6:fig 7:pear |
| 5 | `mango` | 242548693 | 5 | 5, 6, 7, 0 (wrap) | 0 | 0:mango 4:melon 5:lime 6:fig 7:pear |

Only two home slots were ever involved (4 and 5), yet the occupied run now spans slots 4, 5, 6, 7 and 0: a **primary cluster** of five. Every key whose home falls anywhere inside that run pays to walk to its end. Look up `"peach"` (FNV-1a `2698319462`, home 6): probe 6 (fig, no), 7 (pear, no), 0 (mango, no), 1 (empty, stop). Four probes and three full key comparisons to learn that a key that collides with nothing is absent. At load factor `5/8 = 0.625` a "random" table would predict about 3 probes for a miss; this one takes 4 because clusters grow faster than linearly: a run of length `k` is hit by `k + 1` home slots, so the longer it gets the more keys join it.

Now delete `"lime"` (slot 5) and look up `"pear"` (home 5). If deletion emptied slot 5, the lookup would stop at slot 5 and report `pear` missing, although it sits in slot 7. So deletion writes a **tombstone**: "occupied once, keep probing". The lookup then reads 5 (tombstone, continue), 6 (fig), 7 (pear): found. An insert that passes a tombstone remembers the first one it saw and, if the key turns out to be absent, reuses that slot. Tombstones count toward the load factor for probing purposes and are only cleared when the table is rebuilt.

```viz
{"type": "hash-table", "algorithm": "open-addressing", "buckets": 8,
 "operations": [["set","melon",1],["set","lime",2],["set","fig",3],["set","pear",4],["set","mango",5],["get","peach"],["delete","lime"],["get","pear"]]}
```

**Quadratic probing** (`i + 1, i + 4, i + 9, …`) and **double hashing** (`i + k·h₂(key)`) break primary clusters at the cost of probes that jump between cache lines; the modern answer, below, keeps linear probing and checks 8 or 16 slots per step.

## The load-factor mathematics

The expected probe counts for linear probing under a uniform hash are Knuth's 1963 results (successful search `½(1 + 1/(1−α))`, unsuccessful `½(1 + 1/(1−α)²)`). Evaluating them explains every runtime's resize threshold:

| Load factor α | Linear probing, hit | Linear probing, miss | Chaining, hit (`1 + α/2`) | Chaining, miss (`α`) | Who resizes here |
|---|---|---|---|---|---|
| 0.5 | 1.5 | 2.5 | 1.25 | 0.5 | |
| 0.667 | 2.0 | 5.0 | 1.33 | 0.67 | CPython `dict` (2/3 usable) |
| 0.75 | 2.5 | 8.5 | 1.38 | 0.75 | Java `HashMap` (chaining) |
| 0.875 | 4.5 | 32.5 | 1.44 | 0.88 | Rust hashbrown, Go 1.24+ (group probing) |
| 0.9 | 5.5 | 50.5 | 1.45 | 0.9 | |
| 0.95 | 10.5 | 200.5 | 1.48 | 0.95 | |

Three readings of the table:

1. **Misses are the expensive case** for linear probing: a miss walks to the end of a cluster, a hit stops at the key, and an insert of a new key is a miss followed by a write.
2. **CPython's 2/3 keeps a miss at 5 probes** and a hit at 2; its pseudo-random probe sequence does slightly better than the linear-probing row.
3. **Rust and Go can afford 7/8** because one "probe" examines a group of 16 (Rust) or 8 (Go) tag bytes with a single SIMD comparison; 32.5 slots is 2–4 group loads, and a full key is compared only on a tag match.

Chaining's costs barely move with `α`, which is why Java tolerates 0.75 and why a chained table with a load factor of 3 still works. The price is paid elsewhere: one pointer dereference, and usually one cache miss, per chain node.

## Resizing

When `α` crosses the threshold, allocate a bigger array and re-insert every entry, because `mod m` changed. That is `O(n)` once per growth step, and growth steps are geometric, so the amortised cost per insert is `O(1)`, the same argument as the dynamic array in [Amortised analysis](/learn/foundations/complexity/amortized-analysis). The details differ per runtime:

| Runtime | New size | Trigger | How the rehash happens |
|---|---|---|---|
| CPython `dict` | Smallest power of two ≥ `3 × used` | Usable slots (2/3 of size) exhausted | Stop-the-world; entries copied in insertion order, deleted holes dropped |
| Java `HashMap` | `2 × old` | `size > 0.75 × capacity` | Stop-the-world; each bin splits into a "lo" and "hi" list by one hash bit (`hash & oldCap`), no re-hashing |
| Rust hashbrown | `2 × old` (or rehash in place if ≥ half the slots are tombstones) | Growth-left counter hits 0 at 7/8 | Stop-the-world; every entry re-inserted using its stored 7-bit tag plus a rehash |
| Go `map` (1.24+) | Doubles one 1,024-slot table at a time | Table at 7/8 | Incremental: a directory of small tables, so a resize never touches the whole map |
| Redis `dict` | `2 × old` | Load factor 1 (a higher ratio, 4–5 depending on the version, while a fork is in progress) | Incremental: both tables live; each operation migrates one bucket, plus 1 ms of background work per 100 ms |

Measured on CPython 3.14 with `sys.getsizeof`, a dict of short string keys costs 184 bytes holding 1–5 keys, 272 bytes for 6–10, 464 for 11–21, 832 for 22–42, 1,584 for 43–85: it resizes at 6, 11, 22, 43 and 86 entries, each time to the next power of two above `3 × used`, which is between 1.5× and 3× growth in slots. Because CPython sizes on `used`, not on the old capacity, a resize after a mass deletion shrinks the table; but deletion alone never triggers a resize, so a dict that once held a million keys and now holds ten keeps its 42 MB of arrays until an insert exhausts the usable slots, which for ten keys is never.

Two production consequences follow from any stop-the-world rehash:

- **Latency spikes.** Growing a one-million-entry table copies every entry, roughly 24–40 MB of reads and writes, a few milliseconds on one core, and that latency lands on whichever request performed the unlucky insert: your map's resize is on your p99 graph.
- **Pre-sizing.** If you know `n`, construct for it (`HashMap::with_capacity(n)`, `make(map[K]V, n)`, `new HashMap<>(n / 0.75 + 1)`; CPython exposes no capacity argument). From 8 slots to a million entries is 17 doublings in Rust and 12 resizes in CPython, each copying the live entries.

```viz
{"type": "hash-table", "algorithm": "resize", "buckets": 4,
 "operations": [["set","a",1],["set","b",2],["set","c",3],["set","d",4],["set","e",5]]}
```

## Under the hood: CPython's dict

Since CPython 3.6 (an implementation detail then, a language guarantee from 3.7) a dict is two arrays, not one:

- an **indices** array of `size` slots, each holding an index into the entries array or one of two markers (`−1` empty, `−2` dummy, meaning deleted). Its element width is 1 byte for tables up to 128 slots, 2 bytes up to 65,536, 4 bytes up to 2³², so a small dict's probe table is a handful of bytes;
- an **entries** array of `2/3 × size` records, appended in insertion order. A general entry is `(hash, key pointer, value pointer)`, **24 bytes**; since 3.11 a dict whose keys are all `str` uses 16-byte `(key, value)` entries, because a `str` object caches its own hash.

Iteration walks the entries array, which is why dicts are insertion-ordered: order fell out of the compact layout, and 3.7 promised it. Deleting a key writes the dummy marker into its index slot and clears the entry (the entry slot is not reused); the holes vanish at the next resize, when live entries are copied densely.

## Under the hood: CPython's probe sequence and memory

The probe sequence is not linear. With `mask = size − 1` and `perturb` initialised to the full hash:

```text
i = hash & mask
loop: perturb >>= 5; i = (5*i + perturb + 1) & mask
```

`5i + 1` on its own cycles through every slot of a power-of-two table (it is a full-period linear congruential generator); adding the shifting `perturb` feeds the hash's high bits into the early probes, so two keys with identical low bits diverge as soon as their high bits differ. Trace it with integer keys, whose hash is the integer itself, into an 8-slot table:

| Insert | hash & 7 | perturb after shift | Probe sequence | Lands in |
|---|---|---|---|---|
| 8 | 0 | | 0 | 0 |
| 16 | 0 | 0 | 0 (8), then `5·0 + 0 + 1 = 1` | 1 |
| 24 | 0 | 0 | 0 (8), 1 (16), then `5·1 + 0 + 1 = 6` | 6 |
| 32 | 0 | 1 | 0 (8), then `5·0 + 1 + 1 = 2` | 2 |
| 40 | 0 | 1, then 0 | 0 (8), 2 (32), then `5·2 + 0 + 1 = 11 & 7 = 3` | 3 |

All five keys share home slot 0, the classic "all multiples of 8" pathology, and the table ends as `[8, 16, 32, 40, _, _, 24, _]`, with the fifth key found after three probes. The sixth insert exhausts the five usable slots and rebuilds at 16 slots (`3 × 5 = 15`, rounded up). A lookup checks pointer identity before calling `__eq__`, so `d[k]` with the same string object never runs a string comparison, and the cached string hash means it never re-hashes either; the whole operation is tens of nanoseconds when the arrays are in cache.

Memory, measured on CPython 3.14: a million `int → int` entries cost 41.9 MB inside the dict (2²¹ four-byte indices plus 1,398,101 × 24-byte entries) before the 28-byte `int` objects; a million `str → int` entries cost 30.8 MB with the 16-byte entries, plus about 50 bytes per key string. Call it **80–100 bytes per entry all in** for small string keys; a `set` of a million ints is 33.6 MB because it stores hash and key with no value.

## Under the hood: SwissTable, Java, Go and V8

**Rust `HashMap` (hashbrown, the standard library's table since 1.36 in 2019, a port of Google's Abseil `flat_hash_map`).** The slots array is preceded by a **control byte** per slot: `0xFF` empty, `0x80` deleted, or `0b0hhhhhhh`, the top 7 bits of the hash (`h2`) for a full slot. A lookup takes the low bits of the hash as the starting group and then, per group of 16 control bytes on x86-64 (one SSE2 register; 8 bytes in the portable fallback):

1. broadcast `h2` to all 16 lanes and compare with one `pcmpeqb`; `pmovmskb` turns the result into a 16-bit mask of candidate slots;
2. for each set bit, compare the full key. A wrong tag matches with probability 1/128, so a group of 16 full slots yields about 0.12 false candidates, and a hit costs one key comparison on average;
3. if the group also contains an `0xFF` byte, stop: the key is absent. Otherwise move to the next group with a triangular stride (`+1, +2, +3` groups), which visits every group of a power-of-two table.

Using the FNV values from the trace: `pear`'s top seven bits are `104`, `fig`'s `96`, `mango`'s `7`. Looking up `pear` compares 16 tags at once, gets a mask with one bit (slot 7), and does one key compare. Looking up `peach` (tag `80`) gets an empty mask and, seeing an empty byte in the same group, answers "absent" after **zero** key comparisons, where the plain linear-probing table needed three.

Costs: 1 byte of control per slot plus the entry itself, so `HashMap<u64, u64>` is 17 bytes per *slot*; at the 7/8 maximum load that is 19.4 bytes per live entry, and right after a doubling (load 7/16) it is 39. Deletion writes `0x80` only when the slot sits inside a run of full slots at least a group wide; otherwise it writes `0xFF`, so tombstones are rare in sparse tables. When a growth is triggered and at least half the slots are tombstones, hashbrown rehashes in place instead of allocating. It does not use Robin Hood hashing (Rust's pre-2019 table did): Robin Hood evens out probe lengths by moving richer entries aside on insert and shifting entries back on delete, which costs writes and displacement bookkeeping, while SwissTable makes long probe runs cheap to *scan* instead of preventing them.

## Under the hood: Go and V8

**Go `map`.** Up to Go 1.23: buckets of 8 key/value pairs with an 8-byte tag array and an overflow pointer, growth at an average load of 6.5 per bucket, incremental evacuation. From Go 1.24 (February 2025): a SwissTable variant with 8-slot groups and a 64-bit control word, tables capped at 1,024 slots and organised in a directory, load factor 7/8. Iteration order has been randomised on purpose since Go 1.0.

**V8 (`Map`, `Set`, objects).** `Map` and `Set` are insertion-ordered chained tables: a bucket array of `capacity / 2` slots and an entries array of `(key, value, next)` triples, doubling on growth and compacting deleted holes on rehash. Plain objects are not hash tables while their shape is stable (hidden classes, inline properties); `delete obj.key` or adding many properties dynamically drops the object into "dictionary mode", an open-addressing table with quadratic probing, and every property access becomes a hash lookup, a common cause of a hot path getting 10× slower with no change in the loop.

## Trade-offs: choosing a collision strategy

| | Chaining (Java) | Linear probing | SwissTable (Rust, Go 1.24, Abseil) | Robin Hood (old Rust) | Cuckoo hashing |
|---|---|---|---|---|---|
| Memory per entry | Entry + node header + pointer (~37 B overhead) | Entry + empty-slot marker | Entry + 1 tag byte; 8/7–16/7 slots per entry | Entry + displacement | Entry, two tables; ~50% load with 1 slot/bucket, ~95% with 4 |
| Cache misses per hit | 1 slot + 1 per chain node | ~1 (contiguous) | ~1 (tags), 1 for the key | ~1 | ≤ 2 (two candidate buckets) |
| Max useful load | 1–3 | ~0.7 | 0.875 | ~0.9 | 0.5–0.95 by bucket size |
| Deletion | Unlink | Tombstone | Tombstone or empty by group rule | Backward shift, no tombstones | Clear slot |
| Worst-case lookup | O(n), O(log n) with treeify | O(n) cluster walk | O(n), scanned 16 at a time | O(n), but probe lengths tightly bounded | O(1): two probes, guaranteed |
| Weak hash function | Long chains | Long clusters | Long clusters | Long clusters | Insert cycles, forced rehash |
| Best for | Simplicity, huge values, stable iterators | Teaching, tiny tables | General-purpose speed | Bounded-variance lookups | Read-mostly tables, hardware/network tables |

## When O(1) is a lie: production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Cache "slow for our biggest customers"; a few buckets hold most entries | The hash covers only part of a compound key (`hash(customer_id)` for a `(customer_id, order_id)` key). Bucket a sample of live keys and plot the histogram | Hash every field with an order-sensitive combiner ([Hash functions](/learn/data-structures/hashing/hash-functions)) |
| One request pins a CPU for seconds; a profile shows key comparisons | HashDoS: attacker-chosen keys that collide under an unkeyed hash (FNV, FxHash, Java `String.hashCode`) | Keyed hash (SipHash) on untrusted input, or a table that caps chain length (Java's treeify) |
| Periodic p99 spikes exactly on inserts; heap allocation graph is a saw-tooth | Stop-the-world resizes of a large, growing table | Pre-size; or shard the table so each rehash is small; or use an incrementally-rehashing table (Redis-style) |
| Lookup latency climbs over hours in a long-running process with constant size | Tombstone accumulation: a table used as a queue (insert new, delete old) fills with tombstones that lengthen every probe until a resize clears them | Force a periodic rebuild, or use a table whose delete restores empties (SwissTable's group rule, Robin Hood backward shift) |
| p99 regressed 3× after a deploy that "only changed the key type" | The new key's `__eq__`/`equals` is slow (a dataclass comparing ten fields; a 1 KB string) or its hash is computed on every call (a Java record with no cached hash) | Cache the hash in the key, compare a cheap discriminator first, or key by an id |
| Entries silently vanish: `get` returns nothing for a key you inserted | A mutable key was modified after insertion, so it now hashes to a different slot (Java `HashMap` with a mutable key, Python with a custom `__hash__` over mutable fields) | Immutable keys, or freeze a copy at insertion |
| Memory never returns after a large batch finishes | CPython dicts (and most tables) do not shrink on delete | Rebuild the dict (`d = dict(d)`) after the batch, or scope the table to the batch |

The senior answer to "p99 lookups regressed after a deploy" walks this table in order of likelihood: load factor and resize timing (did the working set grow?), tombstone churn (did the access pattern change to delete-heavy?), a hash function or key type change (did anyone touch `__hash__`, `equals` or the key struct?), and only then the hardware (is the table now larger than L3, so every probe is a DRAM miss?).

## Hash tables in interviews

The interview reflex is: "I need to look something up by value, so I use a hash map, so lookups are O(1)". That reflex is correct, and it is worth saying out loud. The senior version adds three things:

1. **Name the key.** "The map is keyed by the *sorted characters* of the word" or "keyed by `target − x`". The key design *is* the algorithm in most hash-map problems, which is the subject of [Hash maps in interviews](/learn/data-structures/hashing/hash-maps-in-interviews).
2. **State the memory cost.** `O(n)` extra space at 20–100 bytes per entry depending on the runtime. If the interviewer asks for `O(1)` space, the map is off the table and you need sorting or two pointers.
3. **Mention the constant.** A cached hash lookup is 10–50 ns; a miss to DRAM is ~100 ns, twice that for a chained node; an array index is under 1 ns. Below about 30 keys a linear scan over a vector wins, and for small dense integer keys a plain array *is* the perfect hash table.

Try it with [Two Sum](/practice/two-sum) and [Group Anagrams](/practice/group-anagrams). At scale the same structure is everywhere: a Redis instance is one incrementally-rehashed dict, and Netflix's EVCache holds tens of millions of entries per memcached node in a chained table whose slab allocator, not its hash function, decides memory use.

## Interviewer follow-ups

**"Can you make lookups O(1) in the worst case rather than on average?"** Model answer: yes, with a bounded number of probes by construction: cuckoo hashing checks exactly two locations, and perfect hashing (two-level FKS hashing for a static key set) gives one probe with `O(n)` space; both push the cost into inserts or construction. Common wrong answer: "use a better hash function", which lowers the probability of a bad case without bounding it.

**"Why does Python's dict keep insertion order but Go's map randomises it?"** Model answer: CPython's compact layout stores entries in an append-only array, so order was free and 3.7 guaranteed it; Go's table stores entries in hash order and the team randomised iteration on purpose so no program could depend on an accident of layout. Common wrong answer: "Python sorts the keys".

**"You have 10 million small-integer keys in the range 0–20 million. Hash map or array?"** Model answer: an array of 20 million slots is 160 MB of pointers (or 80 MB of `u64`), one memory access per lookup, no hashing, and it beats every hash map; if the keys are sparse across a 2⁶⁴ range the array is impossible and the map returns. Common wrong answer: reaching for the map because "lookups are O(1)" without noticing the array is O(1) with a smaller constant.

**"Your table's load factor is 0.5 and lookups are still slow. Why?"** Model answer: the load factor bounds the *expected* probe count only if the hash is uniform over the keys; check the bucket histogram for clustering, check for tombstones (which do not count as load in the naive formula but do cost probes), and check whether the table is larger than the cache so each probe is a DRAM miss. Common wrong answer: "lower the load factor further", which makes the table bigger and the cache behaviour worse.

**"How would you implement `delete` without tombstones?"** Model answer: backward-shift deletion for linear probing: after emptying the slot, walk forward and move back any entry whose home slot is at or before the hole, repeating until an empty slot; this keeps every probe chain intact with no markers, at the cost of writes on delete. Common wrong answer: re-insert everything after the hole, which is `O(cluster)` per delete and, done naively, re-inserts entries into their own old positions.

## What mid-level engineers get wrong

- **Treating `α` as the whole story.** Tombstones, key equality cost and cache misses can each make a half-empty table slow.
- **Choosing a chained table "because deletion is easy".** In a language with per-node allocation, the chain is a cache miss per link; the SwissTable's group rule makes open-addressing deletion easy too.
- **Hashing untrusted keys with FNV or FxHash because it benchmarked faster.** It did, and it reintroduced HashDoS; the benchmark did not include an attacker.
- **Assuming delete frees memory.** CPython's dict and most tables keep their arrays until the next growth; a batch job that fills and drains a dict keeps the peak.
- **Storing a mutable object as a key.** Lists in Python refuse; Java objects and Python custom classes do not, and the entry is lost when the key changes.
- **Iterating and mutating in one loop** and reading the resulting exception as a bug in the library.

## Exercises

```exercise
id: open-addressing-table
title: Implement an open-addressing hash table
prompt: |
  Implement `HashTable` with linear probing and tombstone deletion.

  Methods: `set(key, value)`, `get(key)` (returns the value or `None`/`null`),
  `delete(key)` (returns `true` if the key existed). Start with 8 slots and
  double the capacity (rehashing all live entries) when the number of live
  entries plus tombstones exceeds 5. Keys are strings; use the language's
  built-in string hash (`hash()` in Python; write a small FNV-1a in JS).

  The tests replay a sequence of operations and compare the returned values.
languages: [python, javascript]
entry: HashTable
starter:
  python: |
    class HashTable:
        TOMBSTONE = object()

        def __init__(self):
            self.cap = 8
            self.slots = [None] * self.cap   # each slot: None | TOMBSTONE | (key, value)
            self.used = 0                     # live entries + tombstones

        def _index(self, key):
            return hash(key) % self.cap

        def set(self, key, value):
            # TODO: probe for key or first free slot; grow if needed
            pass

        def get(self, key):
            # TODO
            return None

        def delete(self, key):
            # TODO: leave a tombstone
            return False
  javascript: |
    const TOMBSTONE = Symbol('tombstone');
    function fnv1a(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h;
    }
    class HashTable {
      constructor() {
        this.cap = 8;
        this.slots = new Array(this.cap).fill(null); // null | TOMBSTONE | [key, value]
        this.used = 0;
      }
      _index(key) { return fnv1a(key) % this.cap; }
      set(key, value) {
        // TODO
      }
      get(key) {
        // TODO
        return null;
      }
      delete(key) {
        // TODO
        return false;
      }
    }
tests:
  - args: [["set","a",1],["set","b",2],["get","a"],["get","b"],["get","z"]]
    expected: [null, null, 1, 2, null]
  - args: [["set","a",1],["set","a",2],["get","a"]]
    expected: [null, null, 2]
    label: overwrite keeps one entry
  - args: [["set","a",1],["delete","a"],["get","a"],["delete","a"]]
    expected: [null, true, null, false]
    label: delete leaves a tombstone
  - args: [["set","k1",1],["set","k2",2],["set","k3",3],["set","k4",4],["set","k5",5],["set","k6",6],["set","k7",7],["get","k1"],["get","k7"]]
    expected: [null, null, null, null, null, null, null, 1, 7]
    label: survives a resize
  - args: [["set","x",1],["set","y",2],["delete","x"],["set","z",3],["get","y"],["get","z"],["get","x"]]
    expected: [null, null, true, null, 2, 3, null]
    hidden: true
    label: probing past a tombstone
hints:
  - Probe with `(index + i) % cap` for i = 0, 1, 2, … and stop at the first `None` (never at a tombstone) when searching.
  - When inserting, remember the first tombstone you pass; if the key is absent, reuse that slot.
  - Rehash by collecting live `(key, value)` pairs, doubling `cap`, and calling `set` on each.
```

```exercise
id: probe-counts
title: Count linear-probing probes
prompt: |
  `hashes` is a list of non-negative integer hash values for distinct keys,
  inserted in order into an empty linear-probing table with `capacity`
  slots (no resizing; the tests never overfill the table). A key's home
  slot is `hash mod capacity`; on collision try the next slot, wrapping
  around. Return a list with, for each insert, the number of slots examined
  before it found a free one (1 when the home slot was free). This is the
  "Slots examined" column of the lesson's trace.
languages: [python, javascript]
entry: probe_counts
starter:
  python: |
    def probe_counts(hashes, capacity):
        # your code here
        return []
  javascript: |
    function probe_counts(hashes, capacity) {
      // your code here
      return [];
    }
tests:
  - args: [[4, 4, 5, 5, 5], 8]
    expected: [1, 2, 2, 3, 4]
    label: the melon/lime/fig/pear/mango cluster from the lesson
  - args: [[0, 1, 2, 3], 4]
    expected: [1, 1, 1, 1]
  - args: [[], 8]
    expected: []
    label: no inserts
  - args: [[7, 7, 7], 8]
    expected: [1, 2, 3]
    label: probing wraps from the last slot to slot 0
  - args: [[3, 11, 19], 8]
    expected: [1, 2, 3]
    hidden: true
    label: hashes larger than the capacity still share a home slot
  - args: [[0, 0, 0, 0, 0, 0, 0, 0], 8]
    expected: [1, 2, 3, 4, 5, 6, 7, 8]
    hidden: true
    label: the last insert walks the whole table
  - args: [[6, 7, 0, 6], 8]
    expected: [1, 1, 1, 4]
    hidden: true
    label: a cluster that crosses the wrap-around
hints:
  - "Keep a boolean `occupied` array of length `capacity`."
  - "For each hash: `i = h % capacity; count = 1; while occupied[i]: i = (i + 1) % capacity; count += 1`."
```

## Senior signals

- You describe a hash table by its **load factor and collision strategy**, not by "it's O(1)", and you can trace a probe cluster forming on real hash values.
- You can quote why CPython resizes at 2/3, Java at 0.75 and hashbrown at 7/8, from the probe-count table rather than from memory.
- You know that deletion in open addressing needs **tombstones**, that tombstones lengthen probes until a rebuild, and what backward-shift deletion and the SwissTable group rule do instead.
- You can sketch CPython's two-array dict (indices plus 24- or 16-byte entries), say why that made it insertion-ordered, and quote 80–100 bytes per small string entry.
- You can explain one SwissTable probe: 16 tags compared with one SIMD instruction, key compared only on a tag match, stop on any empty byte.
- You can name the **HashDoS** attack and why Python/Rust use keyed hashes by default, and you know that switching to `FxHash` on untrusted keys reintroduces it.
- You pre-size maps when you know `n`, you know that resize pauses show up in **p99 latency**, and you diagnose a p99 regression in the order load factor, tombstones, key type, cache footprint.
- You reach for an **array** when keys are small dense integers and a **linear scan** when `n` is tiny, and you can say why.

## Check yourself

```quiz
- q: >-
    A chaining hash table has 1,000 slots and 2,500 entries. What is the expected number of key comparisons for an unsuccessful lookup, assuming a uniform hash?
  options: ["About 1,000, because the walk covers the table", "About 1, because chains stay short on average", "About 2.5, because the whole home chain is walked", "About 1.25, because the walk stops halfway"]
  answer: 2
  explanation: >-
    Load factor α = 2.5, so the average chain has 2.5 entries, and an unsuccessful search compares against every one of them. Stopping halfway (1 + α/2) is the successful-search figure. "About 1" is the answer only when α is small.
- q: >-
    In an open-addressing table you delete a key by setting its slot back to empty. What goes wrong?
  options: ["Lookups of the deleted key still find its old value", "Later inserts fail, because the slot stays reserved", "Lookups for keys that probed past it now stop early", "Nothing, because probing skips over empty slots anyway"]
  answer: 2
  explanation: >-
    Probing stops at the first empty slot. Keys inserted after the deleted one may have probed past it; an empty slot now terminates their search prematurely and reports them missing, as the lesson's pear-after-lime trace shows. Tombstones say "keep probing", and backward-shift deletion repairs the chain instead.
- q: >-
    Why can Rust's hashbrown run at a load factor of 7/8 when Knuth's formula gives 32 probes for a miss at that load?
  options: ["It compares 16 one-byte tags per step with one SIMD instruction", "Its probe sequence is random, so clusters cannot form", "It rehashes in the background before the load gets that high", "It stores keys sorted within each group for binary search"]
  answer: 0
  explanation: >-
    A SwissTable "probe" examines a whole group of 16 control bytes at once and compares a full key only on a 7-bit tag match, so 32 slots is two or three group loads. It still uses a deterministic (triangular) probe sequence and clusters still form; they are cheap to scan rather than prevented. Rehashing is stop-the-world, not background.
- q: >-
    A CPython dict grew to a million entries during a batch job, and the job then deleted all but a hundred. What happens to its memory?
  options: ["It shrinks gradually, because each delete frees one entry", "It stays at the peak until an insert exhausts the usable slots", "It shrinks at once, because delete resizes when load drops", "It stays at the peak forever, because dicts never shrink"]
  answer: 1
  explanation: >-
    Deletion writes a dummy marker and never resizes. A resize happens only when an insert finds no usable slot, and it is sized on the live count, so it would shrink then; with a hundred live keys in a two-million-slot table that insert never comes. Rebuild the dict after the batch to release the memory.
- q: >-
    Lookup p99 in a long-running service climbs over several hours although the map's size stays constant. The most likely cause is:
  options: ["Garbage collection is compacting the table more often", "The load factor rises, because deleted keys are still counted", "The hash seed rotates, so keys drift away from their slots", "Tombstones from steady insert-delete churn are lengthening probes"]
  answer: 3
  explanation: >-
    A table used as a queue accumulates tombstones, which are skipped but not counted as live, so every probe sequence grows until a rebuild clears them. The seed is fixed for the life of the process, and the live load is constant by assumption; a periodic rebuild or a delete-restores-empty scheme is the fix.
- q: >-
    You need to look up counts for keys that are integers in the range 0–255, with millions of lookups per second. The best structure is:
  options: ["A balanced BST keyed by the integer, for ordered access", "A Bloom filter over the integers, for compact counts", "A hash map keyed by the integer, for O(1) lookups", "A plain array of 256 counters indexed by the integer"]
  answer: 3
  explanation: >-
    Small dense integer keys make the array a perfect hash table: one memory access, no hashing, no probing, and 1–2 KiB fits in L1 cache. A hash map is also O(1) but does strictly more work for the same result, and a Bloom filter cannot count at all.
```
