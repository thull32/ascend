---
slug: hash-tables
title: "Hash tables: from hash function to O(1)"
description: How chaining and open-addressing tables actually store data, why lookups are O(1) on average and O(n) in the worst case, and what Python, Rust and Go really do.
minutes: 40
difficulty: medium
tags: [hashing, hash-map, dictionary, open-addressing, chaining]
problems: [two-sum, group-anagrams]
---
You need to look up a value by key in constant time, and the keys are not small integers you can use as array indices. That single requirement is behind `dict`, `HashMap`, `map[string]T`, `Set`, every cache you have deployed, and roughly a third of all interview problems. A hash table solves it by *turning the key into an array index* and then dealing with the consequences of two keys landing on the same index.

Everything about hash tables follows from those two halves: the hash function that produces the index, and the collision strategy that resolves conflicts. Get either wrong and the "O(1)" quietly becomes O(n).

## The core mechanism

A hash table is an array of `m` slots (often called buckets) plus a hash function `h(key)` that maps any key to an integer. The slot for a key is `h(key) mod m`.

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

With `m = 8`, the keys `"apple"` and `"grape"` might both hash to slot 3. The naive table silently overwrites one with the other. Every real hash table is a strategy for *not* losing that data while keeping lookups fast.

There are two families of strategy:

| Strategy | Where colliding entries go | Memory | Cache behaviour |
|---|---|---|---|
| **Separate chaining** | A linked list (or small vector) hanging off the slot | One pointer per slot plus per-entry node overhead | Poor: each probe follows a pointer to a separate allocation |
| **Open addressing** | Another slot in the same array, found by probing | Entries stored inline; no nodes | Good: probing walks contiguous memory |

## Separate chaining

Each slot holds a pointer to a chain of entries. Insert walks the chain to check for an existing key, then appends. Lookup walks the chain comparing keys.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 5,
 "operations": [["set","apple",1],["set","grape",2],["set","melon",3],["set","kiwi",4],["get","grape"],["delete","apple"],["get","apple"]]}
```

The cost of a lookup is the length of the chain you walk. If the hash function spreads `n` keys evenly over `m` slots, each chain has about `n/m` entries. That ratio, `α = n/m`, is the **load factor**, and it is the single number that governs hash table performance.

- Successful lookup: about `1 + α/2` comparisons on average.
- Unsuccessful lookup: about `1 + α` comparisons.
- Worst case: every key in one chain, `O(n)`.

Keep `α` bounded by a constant (Java's `HashMap` resizes at 0.75) and the average lookup is `O(1)`. The "on average" is doing real work in that sentence: it assumes the hash function behaves like a uniform random function on your keys.

Java's `HashMap` converts a chain into a red-black tree once it exceeds 8 entries, which caps the worst case at `O(log n)` for a single bucket. That change shipped in Java 8 specifically because attackers were crafting colliding keys to trigger `O(n²)` behaviour in web servers.

## Open addressing

Open addressing keeps everything in the array. On collision, you probe a sequence of alternative slots until you find an empty one (insert) or the key (lookup) or an empty slot proves the key is absent.

The simplest probe sequence is **linear probing**: try `i`, `i+1`, `i+2`, … wrapping around.

```viz
{"type": "hash-table", "algorithm": "open-addressing", "buckets": 8,
 "operations": [["set","apple",1],["set","grape",2],["set","melon",3],["set","kiwi",4],["get","kiwi"],["delete","grape"],["get","melon"],["set","plum",5]]}
```

Two things the animation makes visible:

1. **Clustering.** Runs of occupied slots grow, and every key that hashes anywhere into a run has to walk to its end. Linear probing degrades sharply as `α` approaches 1; the expected probe count for an unsuccessful search is roughly `(1 + 1/(1-α)²)/2`, which is 2.5 at `α = 0.5` and 50 at `α = 0.9`. Open-addressing tables therefore resize at lower load factors (Rust's hashbrown at 7/8, Python's dict at 2/3).
2. **Deletion needs tombstones.** If you simply empty `grape`'s slot, the lookup for `melon` (which probed *past* `grape`) would hit the empty slot and wrongly conclude `melon` is absent. So deletion leaves a *tombstone* marker: "something was here, keep probing". Tombstones count toward the load factor and are cleared on the next resize.

Alternatives to linear probing trade cache locality for less clustering: **quadratic probing** (`i + 1, i + 4, i + 9, …`) and **double hashing** (`i + k·h₂(key)`). Modern implementations mostly stick with linear probing over small groups because CPUs love sequential memory.

## Resizing

When `α` crosses the threshold, allocate a new array of `2m` slots and re-insert every entry (their indices change because `mod m` changed). That is an `O(n)` operation, but it happens once per doubling, so the amortised cost per insert stays `O(1)`; the same argument as the dynamic array in [Amortised analysis](/learn/foundations/complexity/amortized-analysis).

```viz
{"type": "hash-table", "algorithm": "resize", "buckets": 4,
 "operations": [["set","a",1],["set","b",2],["set","c",3],["set","d",4],["set","e",5]]}
```

Two production consequences:

- **Latency spikes.** A single insert can pause for the whole rehash. Redis avoids the pause with *incremental rehashing*: it keeps both tables and migrates a few buckets per operation. If you write a latency-sensitive service in a GC-free language, your map's resize is on your p99 graph.
- **Pre-sizing.** If you know you will insert 1,000,000 keys, construct the table with that capacity (`HashMap::with_capacity`, `make(map[K]V, n)`). You skip ~20 rehashes and the associated allocations.

## What your language actually does

| Language | Structure | Collision strategy | Notes |
|---|---|---|---|
| Python `dict` | Open addressing over a compact entries array | Pseudo-random probing using the hash's upper bits | Insertion-ordered since 3.7 because entries live in a separate dense array; resize at 2/3 full |
| Java `HashMap` | Chaining | Linked list, treeified above 8 entries | Resize at 0.75; power-of-two capacity; hash bits are spread with `h ^ (h >>> 16)` |
| Rust `HashMap` (hashbrown) | Open addressing, SwissTable | Linear probing over 16-slot groups using SIMD on 7-bit tags | SipHash by default (DoS-resistant); `FxHash`/`ahash` when you control the keys |
| Go `map` | Buckets of 8 entries with overflow chaining | Top-8-bits tag array per bucket, then key compare | Incremental growth; iteration order is deliberately randomised |
| C++ `std::unordered_map` | Chaining (required by the standard's iterator guarantees) | Per-node allocation | Famously slow; `absl::flat_hash_map` is the open-addressing replacement |

The pattern: the fastest modern tables are open-addressing with a small **tag** per slot (the top 7–8 bits of the hash) checked before the full key comparison. A probe compares 16 tags with one SIMD instruction and touches the actual keys only on a tag match.

## When O(1) is a lie

A senior engineer knows the three ways a hash table stops being constant time.

**Bad hash function.** If `hash(key)` clusters, chains grow. Classic mistakes: hashing only part of a compound key (`hash(user.id)` while ignoring `tenant_id`), or hashing floats/strings in a way that collides on common prefixes. Test it: bucket a sample of real keys and look at the distribution.

**Adversarial keys (HashDoS).** If an attacker can choose your keys (query parameters, JSON field names, form fields) and knows your hash function, they can generate thousands of keys that all land in one bucket. Parsing a single request then costs `O(n²)`. This was a real vulnerability in PHP, Python, Ruby, Java and Node around 2011–2012. The fix is a *keyed* hash: Python randomises string hashing per process; Rust uses SipHash with a random key. If you write a service that hashes untrusted input with a fast non-cryptographic hash (`FxHash`, `FNV`), you have reintroduced the bug.

**Pathological resize timing.** A table that grows and shrinks around a threshold (insert 1000, delete 1000, repeat) can rehash on every batch. Most libraries only grow, never shrink, for exactly this reason; if yours shrinks, use hysteresis.

## Hash tables in interviews

The interview reflex is: "I need to look something up by value, so I use a hash map, so lookups are O(1)". That reflex is correct, and it is worth saying out loud. The senior version adds three things:

1. **Name the key.** "The map is keyed by the *sorted characters* of the word" or "keyed by `target - x`". The key design *is* the algorithm in most hash-map problems.
2. **State the memory cost.** A hash map of `n` entries costs `O(n)` extra space. If the interviewer asks for `O(1)` space, the hash map is off the table and you need sorting or two pointers.
3. **Mention the constant.** A hash map lookup is 20–100 ns; an array index is 1 ns. For small `n` (say under 50), a linear scan over a vector beats a hash map, and for keys that are small dense integers, a plain array *is* the perfect hash table.

Try it now with the exercise, then with [Two Sum](/practice/two-sum) and [Group Anagrams](/practice/group-anagrams).

## Exercise

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

## Senior signals

- You describe a hash table by its **load factor and collision strategy**, not by "it's O(1)".
- You know that deletion in open addressing needs **tombstones**, and that tombstones are why some tables degrade under churn.
- You can name the **HashDoS** attack and why Python/Rust use keyed hashes by default, and you know that switching to `FxHash` on untrusted keys reintroduces it.
- You pre-size maps when you know `n`, and you know that resize pauses show up in **p99 latency**.
- You reach for an **array** when keys are small dense integers and a **linear scan** when `n` is tiny, and you can say why.
- You can explain why Java treeifies long chains and why Rust's SwissTable probes 16 slots at a time.

## Check yourself

```quiz
- q: >-
    A chaining hash table has 1,000 slots and 2,500 entries. What is the expected number of key comparisons for an unsuccessful lookup, assuming a uniform hash?
  options: ["About 2.5", "About 1", "About 1,000", "About 3.5"]
  answer: 3
  explanation: >-
    Load factor α = 2.5, so the average chain has 2.5 entries; an unsuccessful search walks the whole chain (2.5) plus the slot check, ≈ 1 + α = 3.5. "About 1" is the answer only when α is small.
- q: >-
    In an open-addressing table you delete a key by setting its slot back to empty. What goes wrong?
  options: ["Lookups for keys that probed past it now stop early", "Nothing, because probing skips over empty slots anyway", "Later inserts fail, because the slot stays reserved", "Lookups of the deleted key still find its old value"]
  answer: 0
  explanation: >-
    Probing stops at the first empty slot. Keys inserted after the deleted one may have probed past it; an empty slot now terminates their search prematurely and reports them missing. Probing does not skip empty slots, which is exactly why tombstones exist to say "keep probing".
- q: >-
    Why does Rust's default HashMap use SipHash, which is slower than FxHash?
  options: ["It produces fewer collisions on random keys than FxHash", "It keeps iteration order stable across runs of a program", "Its random key stops attackers precomputing colliding keys", "It is the only one of the two that hashes non-string keys"]
  answer: 2
  explanation: >-
    SipHash is a keyed hash chosen for HashDoS resistance, not raw speed or distribution quality. FxHash is faster and fine when you control the keys; on attacker-chosen keys it allows O(n²) collision attacks. The random key makes iteration order vary between runs, not stay stable.
- q: >-
    Your service builds a HashMap of 5 million entries on startup and shows a saw-tooth of allocation pauses. The cheapest fix is:
  options: ["Construct the map with capacity for 5 million entries", "Switch to a chaining table so entries never need to move", "Insert the keys in sorted order to avoid rehash work", "Lower the load factor so the table resizes less often"]
  answer: 0
  explanation: >-
    Pre-sizing removes the ~22 doublings and rehashes. A smaller load factor would cause more resizes, not fewer; chaining changes memory layout but still rehashes when the slot array grows.
- q: >-
    You need to look up counts for keys that are integers in the range 0–255, with millions of lookups per second. The best structure is:
  options: ["A balanced BST keyed by the integer, for ordered access", "A hash map keyed by the integer, for O(1) lookups", "A plain array of 256 counters indexed by the integer", "A Bloom filter over the integers, for compact counts"]
  answer: 2
  explanation: >-
    Small dense integer keys make the array a perfect hash table: one memory access, no hashing, no probing, and 1 KiB fits in L1 cache. A hash map is also O(1) but does strictly more work for the same result, and a Bloom filter cannot count at all.
```
