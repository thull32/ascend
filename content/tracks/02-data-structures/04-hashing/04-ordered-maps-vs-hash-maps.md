---
slug: ordered-maps-vs-hash-maps
title: Ordered maps vs hash maps
description: When you need floor, ceiling, range scans or sorted iteration, a hash map cannot help; this lesson traces balanced trees, B-trees and skip lists as ordered maps, gives the honest per-node and per-lookup costs, shows what Java, Rust, Redis, RocksDB and the Linux scheduler run, and what to do in Python and JavaScript, which have none built in.
minutes: 45
difficulty: medium
tags: [hashing, ordered-map, treemap, btreemap, skip-list, bisect, range-query, sortedcontainers]
problems: [time-based-kv, meeting-rooms-ii, minimum-interval-query]
---
"Given a timestamp, return the value that was current at that moment." "Is there a booking that overlaps this one?" "How many events happened between 9:00 and 9:15?" "Who are the ten users immediately above me on the leaderboard?" None of these is a lookup by exact key, so a hash map answers none of them. They are questions about *order*: the largest key not above `x`, the neighbours of `x`, everything in a range. Those need a map that keeps its keys sorted, and the price is a logarithm.

Knowing when to pay that logarithm, and what to reach for in a language that does not ship an ordered map, is a distinctly senior skill. Junior code sorts the whole collection on every query; mid-level code uses a hash map and a linear scan; senior code names the operation ("I need `floor(x)`") and picks the structure that provides it, knowing what each one costs per node and per lookup.

## What an ordered map provides

An ordered map stores key–value pairs sorted by key and supports, in O(log n) each:

| Operation | Meaning | Hash map equivalent |
|---|---|---|
| `get(k)`, `put(k, v)`, `remove(k)` | Exact-key operations | O(1) expected |
| `floor(k)` / `ceiling(k)` | Largest key ≤ k / smallest key ≥ k | None |
| `lower(k)` / `higher(k)` | Strict versions | None |
| `min()` / `max()` | First and last keys | O(n) scan |
| `range(lo, hi)` | Iterate keys in `[lo, hi)` in order, O(log n + k) | O(n) scan and sort |
| `rank(k)` / `select(i)` | Number of keys below k / the i-th smallest key | None; needs an augmented tree or a skip list with spans |
| Ordered iteration | All keys ascending | O(n log n) sort each time |

Java calls this `TreeMap`/`TreeSet` (`floorKey`, `ceilingKey`, `subMap`, `headMap`, `tailMap`); C++ has `std::map` (`lower_bound`, `upper_bound`); Rust has `BTreeMap` (`range`); Go, Python and JavaScript have nothing in the standard library, which is where the second half of this lesson goes.

## Balanced binary search trees, traced

A binary search tree keeps every node's left subtree below it and right subtree above it, rebalanced on insert and delete so the height stays O(log n). Red-black trees (Java `TreeMap`, C++ `std::map`, the Linux scheduler) and AVL trees are the classic choices; [Balanced trees](/learn/data-structures/trees/balanced-trees) covers the rotations. Every ordered operation is a root-to-leaf walk that remembers the best candidate seen so far. Trace `floor(45)` and `ceiling(45)` on the tree built from `[30, 10, 50, 20, 40, 60]`:

| Step | Node | Compare with 45 | `floor` candidate | `ceiling` candidate | Go |
|---|---|---|---|---|---|
| 1 | 30 | 30 < 45 | 30 | – | right |
| 2 | 50 | 50 > 45 | 30 | 50 | left |
| 3 | 40 | 40 < 45 | 40 | 50 | right |
| 4 | null | | **40** | **50** | stop |

Three comparisons for both answers, and a range scan `[20, 50)` finds 20 the same way and then walks in-order: 20, 30, 40, stopping at 50. A hash map would scan all six keys for either question.

```viz
{"type": "tree", "algorithm": "bst-search", "values": [30, 10, 50, 20, 40, 60], "target": 45, "title": "Searching for 45 finds where it would go: the last nodes passed on each side are floor and ceiling"}
```

The cost that matters is per level. A red-black tree of a million entries is about 20 levels deep (its height is at most `2 log₂(n + 1)`, typically closer to `log₂ n`), and every level is a pointer dereference to a separately allocated node. When the tree is larger than the CPU cache each level is a DRAM miss, roughly 100 ns on a current server, so a cold lookup is on the order of 2 µs against 50–100 ns for a hash lookup. Per node, a Java `TreeMap.Entry` holds key, value, left, right, parent and a colour flag: 12 bytes of header, five 4-byte compressed references and a boolean, padded to **40 bytes**, plus the key and value objects. A C++ `std::map` node is 32 bytes of colour and three pointers plus the pair. A million entries is 40–70 MB of nodes before the payload.

## B-trees: wide nodes for cache lines

A B-tree node holds many keys in a small sorted array and has one child per gap. Rust's `BTreeMap` uses `B = 6`: every node except the root holds 5–11 keys, an internal node up to 12 children. For `BTreeMap<u64, u64>` a leaf is a 16-byte header (parent pointer, parent index, length) plus 11 keys and 11 values, **192 bytes, three cache lines**, and the whole node is one allocation. A million entries needs at most `log₆ 10⁶ ≈ 7.7`, so 6–8 levels, each a contiguous block where Rust searches the keys linearly (faster than binary search for 11 keys, because the branch predictor wins). A lookup is 6–8 cache misses plus a few dozen comparisons, against 20 misses in a red-black tree: Rust chose a B-tree over a red-black tree for exactly this reason, and the standard library documents `BTreeMap` as the ordered map because of it. Databases chose B-trees for the same reason one level down: a node maps to a 4–16 KB disk page, so a billion-row index is four or five page reads. [B-trees and B+ trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) has the split and merge mechanics. For an in-memory ordered map, expect a B-tree to be 2–3× faster than a red-black tree with the same asymptotics; the figure depends on key size and cache footprint.

## Skip lists, traced

A sorted linked list with extra "express lanes": each node is promoted to level `i + 1` with probability `p` (½ in the textbook, ¼ in Redis), so level 1 has about `pn` nodes, level 2 about `p²n`, giving O(log n) *expected* height. A search starts at the top level, moves right while the next key is below the target, drops a level, and repeats.

```text
level 3:  1 ------------------------> 30 ------------------> ∞
level 2:  1 --------> 9 ------------> 30 -------> 55 -----> ∞
level 1:  1 --> 5 --> 9 --> 17 -----> 30 --> 42 -> 55 -----> ∞
level 0:  1 --> 5 --> 9 --> 17 --> 21 --> 30 --> 42 --> 55 --> 61 --> ∞
```

Search for 42:

| Step | Level | At | Next | Action |
|---|---|---|---|---|
| 1 | 3 | 1 | 30 ≤ 42 | move right to 30 |
| 2 | 3 | 30 | ∞ > 42 | drop to level 2 |
| 3 | 2 | 30 | 55 > 42 | drop to level 1 |
| 4 | 1 | 30 | 42 = target | found |

Four steps for nine keys; `floor(43)` is the same walk ending at level 0 on 42, and `ceiling(43)` is the node after it. Insertion inserts into level 0 and then flips a coin per level, splicing the new node into each level it wins; nothing is rotated and no other node's height changes, which is why concurrent insertion needs only local locking (or a compare-and-swap on a few pointers) and why Java's `ConcurrentSkipListMap` exists. Memory is `1/(1 − p)` pointers per node on average (2 at `p = ½`, 1.33 at `p = ¼`) plus the key and value. The weakness is the same as any linked structure: every hop is a potential cache miss, so a skip list lookup is about as slow as a red-black tree's and slower than a B-tree's.

| | Red-black / AVL | B-tree | Skip list |
|---|---|---|---|
| Height | ≤ 2 log₂ n guaranteed | ≤ log_B n guaranteed (6–8 at 10⁶ for Rust) | O(log n) expected |
| Cache misses per lookup | ~log₂ n (20 at 10⁶) | ~log_B n (6–8 at 10⁶) | ~log n, poor locality |
| Concurrency | Hard (rotations touch many nodes) | Moderate (latch coupling per node) | Easy (local pointer updates) |
| Memory per entry | 40 B node (Java) + payload | Amortised over 5–11 keys per node | 1.33–2 pointers on average + payload |
| Used in | Java `TreeMap`, C++ `std::map`, Linux scheduler | Rust `BTreeMap`, every database index | Redis `ZSET`, `ConcurrentSkipListMap`, LSM memtables |

## The honest comparison with a hash map

| | Hash map | Ordered map |
|---|---|---|
| Exact lookup | O(1) expected, ~50–100 ns warm | O(log n), ~0.5–2 µs at 10⁶ entries when cold |
| Worst-case lookup | O(n) with a bad or adversarial hash | O(log n) guaranteed (trees) |
| Ordered / range operations | Not available | O(log n + k) |
| Memory per entry | 20–100 bytes depending on runtime ([Hash tables](/learn/data-structures/hashing/hash-tables)) | 40+ bytes per node (trees) or amortised (B-tree) plus payload |
| Key requirement | Hashable and equality-comparable | Totally ordered (comparable), and the comparator must agree with equality |
| Iteration order | Arbitrary (or insertion order in Python/JS) | Sorted |
| Latency profile | Occasional O(n) resize pause | Smooth; no rehash, but rotations or node splits on some inserts |

Two consequences that experienced engineers act on:

- **Predictability.** A tree's O(log n) is a guarantee, not an expectation. Systems that must bound worst-case latency, or that key on attacker-chosen input, sometimes choose a tree over a hash map even for exact lookups; Java's `HashMap` converts a long chain into a red-black tree for the same reason.
- **Insertion-ordered is not sorted.** Python's `dict` and JavaScript's `Map` remember insertion order, and `OrderedDict.move_to_end` is what makes them usable for LRU caches. That is a different property from *sorted* order and answers none of the range questions.

## Under the hood: the ordered maps you already run

- **The Linux scheduler** keeps every runnable task in a red-black tree keyed by virtual runtime (by deadline since the EEVDF scheduler in kernel 6.6, 2023) and caches the leftmost node, so "pick the next task" is `min()` in O(1) and inserting a woken task is O(log n). It is a tree, not a heap, because tasks are also removed from the middle when they block.
- **Redis sorted sets (`ZSET`)** are a hash table (member → score, for O(1) `ZSCORE`) plus a skip list ordered by score with `p = ¼`, up to 32 levels, a backward pointer per node and a *span* per forward pointer counting the nodes it skips, which is what makes `ZRANK` and `ZRANGE` by rank O(log n) without a tree. Sets of up to 128 short members are stored as a flat listpack instead, because a linear scan of a few hundred bytes beats any pointer structure.
- **LSM-tree memtables** (LevelDB, RocksDB) are skip lists in an arena: readers never lock, a single writer appends nodes, and the sorted order is what makes flushing to an SSTable a sequential write. [LSM trees and SSTables](/learn/advanced-data-structures/log-structured-and-disk-structures/lsm-trees-and-sstables) follows the data down to disk.
- **Database B-tree indexes** answer `WHERE ts <= ? ORDER BY ts DESC LIMIT 1` as a `floor`: descend to the leaf, position on the last key ≤ the bound, read one row. The same query on an unindexed column is the hash-map-and-scan pattern at a million rows per second.

## Python and JavaScript: no ordered map, three substitutes

## A sorted array with binary search

Keep the keys in a sorted list and use `bisect` (Python) or a hand-written binary search (JavaScript). Lookups, floor and ceiling are O(log n); insertion into the middle is O(n) because of the shift, but the shift is a `memmove` running at memory bandwidth.

```python
import bisect

class SortedMap:
    def __init__(self):
        self.keys, self.vals = [], []

    def put(self, k, v):
        i = bisect.bisect_left(self.keys, k)
        if i < len(self.keys) and self.keys[i] == k:
            self.vals[i] = v
        else:
            self.keys.insert(i, k); self.vals.insert(i, v)

    def floor(self, k):                       # largest key <= k, or None
        i = bisect.bisect_right(self.keys, k)
        return None if i == 0 else self.keys[i - 1]

    def ceiling(self, k):                     # smallest key >= k, or None
        i = bisect.bisect_left(self.keys, k)
        return None if i == len(self.keys) else self.keys[i]
```

`bisect_left(a, k)` returns the first index whose key is `≥ k`; `bisect_right` returns the first index whose key is `> k`. `floor` is the element *before* `bisect_right`; `ceiling` is the element *at* `bisect_left`. Getting these two right is the whole difficulty:

| keys | `k` | `bisect_left` | `bisect_right` | `floor` | `ceiling` |
|---|---|---|---|---|---|
| `[1, 3, 5, 7]` | 5 | 2 | 3 | `keys[2] = 5` | `keys[2] = 5` |
| `[1, 3, 5, 7]` | 6 | 3 | 3 | `keys[2] = 5` | `keys[3] = 7` |
| `[1, 3, 5, 7]` | 0 | 0 | 0 | none | `keys[0] = 1` |
| `[1, 3, 5, 7]` | 9 | 4 | 4 | `keys[3] = 7` | none |

The insert cost is concrete: `list.insert` moves the pointers after the insertion point, on average `n/2` of them at 8 bytes each. At 10⁴ keys that is 40 KB, a few microseconds; at 10⁶ keys it is 4 MB, several hundred microseconds per insert against about 1 µs for a tree. Below 10⁴–10⁵ keys the sorted array is competitive and far simpler; above that, random inserts need a real ordered structure. If the keys arrive already sorted (timestamps in a log, append-only ids), insertion is an O(1) append and the sorted array is strictly the best structure: this is the [Time-Based Key-Value Store](/practice/time-based-kv) problem and the second exercise.

## `sortedcontainers`

The `sortedcontainers` package (`SortedList`, `SortedDict`) is a list of sorted sub-lists, each kept between 500 and 2,000 elements, plus a positional index tree for rank queries. An insert is a binary search over the sub-list maxima, an insert into one sub-list (a `memmove` of at most 16 KB, about a microsecond), and an O(log n) index update; a split when a sub-list exceeds its bound. That is why it is faster than most C tree implementations for realistic sizes. It is not in the standard library, so in an interview say "I'd use `sortedcontainers` in production; here I'll use `bisect` on a list and note that insert is O(n)".

## A heap, when you only need one end

If the only ordered operation is `min()` (or `max()`), a binary heap gives O(log n) insert and pop-min with O(1) peek, in a contiguous array with no pointers. Scheduling, "k smallest", and merge-by-timestamp want a heap, not a tree. The [Heaps](/learn/data-structures/heaps/binary-heap-mechanics) module covers it; the tell is that you never need `floor` of an arbitrary key, only the extreme, and a heap cannot do `floor` at all short of an O(n) scan.

## Worked example: calendar booking without double-booking

"Book `[start, end)` if it overlaps no existing booking." With bookings in an ordered map keyed by start time, the only two candidates for overlap are the booking with the largest start `≤ start` (does it end after our start?) and the booking with the smallest start `≥ start` (does it start before our end?). Two O(log n) queries, no scan.

Bookings `{10: 20, 30: 40, 50: 60}` (start → end):

| Request | `floor(start)` | Its end `> start`? | `ceiling(start)` | Its start `< end`? | Result |
|---|---|---|---|---|---|
| `[15, 25)` | 10 → 20 | 20 > 15: yes | | | conflict |
| `[20, 30)` | 10 → 20 | 20 > 20: no | 30 | 30 < 30: no | booked |
| `[45, 55)` | 30 → 40 | 40 > 45: no | 50 | 50 < 55: yes | conflict |

With a hash map you would scan every booking: O(n) per request. With a sorted array and `bisect`, each request is O(log n) to find plus O(n) to insert, fine for a calendar and wrong for a reservation system with millions of rows, where the database's B-tree index does the same two lookups. [Meeting Rooms II](/practice/meeting-rooms-ii) and [Minimum Interval to Include Each Query](/practice/minimum-interval-query) are the sorted-order relatives, and [Interval problems](/learn/algorithms/greedy/interval-problems) generalises the sweep.

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [50, 30, 70, 20, 40, 60, 80, 35], "title": "A BST keeps keys ordered: in-order traversal is sorted iteration"}
```

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| "Latest value before t" endpoint is O(n) per call; CPU scales with table size | Range question answered by a hash map plus a scan | Ordered map, or a sorted array if writes are append-only, or a B-tree index in the database |
| A batch loader slows to a crawl as its sorted list grows past ~10⁵ entries | `bisect.insort` into a large list: each insert is a multi-megabyte `memmove` | `sortedcontainers`, or sort once after bulk loading, or a tree |
| `TreeMap` "loses" entries or `contains` disagrees with `get` | `compareTo` inconsistent with `equals` (compares one field, equality uses two), or a mutable key changed after insertion | Make the comparator a total order consistent with equality; immutable keys |
| Java throws "Comparison method violates its general contract"; Python sorts produce different orders on different runs | `NaN` or a non-transitive comparator | Reject or canonicalise NaN before insertion; test the comparator for transitivity |
| Leaderboard rank query is O(n) although the map is ordered | A plain tree has no rank operation | An order-statistics tree (subtree sizes) or a skip list with spans (Redis `ZRANK`) |
| A heap-based "scheduler" cannot cancel or reschedule an event | A heap supports only the extreme; arbitrary removal is O(n) | Ordered map keyed by time, or lazy deletion with a tombstone set |
| Time-based store returns the wrong value when two writes share a timestamp | Ties in the sort key with an ambiguous floor | Compose the key `(timestamp, sequence)` so it is unique, and define which tie wins |

## Interviewer follow-ups

**"Why is Rust's `BTreeMap` faster than a red-black tree in memory when both are O(log n)?"** Model answer: cache misses, not comparisons: a B-tree with 11 keys per node is 6–8 contiguous nodes deep at a million entries, a red-black tree is about 20 separately allocated nodes deep, and a DRAM miss costs about the same as a hundred comparisons. Common wrong answer: "B-trees have a lower big-O height", which is true only in the base of the logarithm, not the complexity class.

**"Implement floor with `bisect`: left or right?"** Model answer: `bisect_right(keys, x) − 1`, because `bisect_right` returns the first index with a key strictly greater than `x`, so the element before it is the largest key `≤ x`, including an exact match; guard index 0. Common wrong answer: `bisect_left − 1`, which skips an exact match.

**"Design a leaderboard with 'my rank' and 'the ten users around me'."** Model answer: a hash map from user to score for O(1) score lookup plus an order-statistics structure keyed by `(score, user)`: a tree augmented with subtree sizes or a skip list with spans, so rank and select are O(log n), which is exactly Redis's `ZSET` (`ZSCORE`, `ZRANK`, `ZRANGE`). Common wrong answer: sort all users on each request, or a heap, which cannot answer rank.

**"When is a sorted array the right ordered map?"** Model answer: when writes are rare, append-only or batched (build once, query many), or `n` is below about 10⁴, because binary search over a contiguous array is the most cache-friendly ordered lookup there is and the O(n) insert never runs; above that with random inserts the `memmove` dominates. Common wrong answer: "never, because insert is O(n)".

**"How does the database answer `ORDER BY ts DESC LIMIT 1 WHERE ts <= ?`?"** Model answer: it descends the B-tree index to the leaf containing the bound, positions on the last key not above it, and reads one row: a `floor` in 3–5 page reads; without the index it scans. Common wrong answer: "it sorts the matching rows and takes the first".

## What mid-level engineers get wrong

- **Answering an order question with a hash map and a scan**, which is O(n) per query and looks fine until the table grows.
- **Using a heap when `floor` or arbitrary removal is needed**, then bolting on an O(n) scan.
- **Confusing insertion order with sorted order**: `dict` and `Map` give the former; neither answers a range query.
- **Using `bisect_left − 1` for floor** and losing exact matches, or forgetting the index-0 guard.
- **Keying a tree by floats that may be `NaN`**, or by objects whose comparator disagrees with their equality.
- **Inserting a million random keys into a sorted list with `insort`** and reporting that "Python is slow".
- **Quoting O(log n) for a tree lookup without the constant**: 20 cache misses is 2 µs, and the interviewer wants to hear that against 100 ns for the hash map.

## Exercises

```exercise
id: floor-key
title: Floor of a key in a sorted array
prompt: |
  `keys` is a sorted array of distinct integers. Return the largest key
  that is less than or equal to `x`, or `None`/`null` if every key is
  greater than `x`. Use binary search (O(log n)); no linear scan.
languages: [python, javascript]
entry: floor_key
starter:
  python: |
    def floor_key(keys, x):
        # your code here
        return None
  javascript: |
    function floor_key(keys, x) {
      // your code here
      return null;
    }
tests:
  - args: [[1, 3, 5, 7], 6]
    expected: 5
  - args: [[1, 3, 5, 7], 0]
    expected: null
    label: below every key
  - args: [[1, 3, 5, 7], 7]
    expected: 7
    label: exact match at the end
  - args: [[], 3]
    expected: null
    label: empty
  - args: [[2], 2]
    expected: 2
  - args: [[10, 20, 30], 25]
    expected: 20
    hidden: true
  - args: [[10, 20, 30], 100]
    expected: 30
    hidden: true
    label: above every key
hints:
  - "Find the first index whose key is greater than `x` (bisect_right); the answer is the element immediately before it, if any."
  - "Binary search with `lo = 0`, `hi = len(keys)`; while `lo < hi`, if `keys[mid] <= x` move `lo = mid + 1` else `hi = mid`."
```

```exercise
id: time-map
title: Time-based key-value store
prompt: |
  Implement `TimeMap` with `set(key, value, timestamp)` and
  `get(key, timestamp)`. `get` returns the value that was set for `key`
  with the largest timestamp `<= timestamp`, or the empty string `""` if
  there is none. Timestamps for a given key are set in strictly increasing
  order, so each key's history is a sorted array you append to; answer
  `get` with binary search.
languages: [python, javascript]
entry: TimeMap
starter:
  python: |
    class TimeMap:
        def __init__(self):
            self.store = {}      # key -> list of (timestamp, value)

        def set(self, key, value, timestamp):
            # TODO
            pass

        def get(self, key, timestamp):
            # TODO
            return ""
  javascript: |
    class TimeMap {
      constructor() {
        this.store = new Map();   // key -> array of [timestamp, value]
      }
      set(key, value, timestamp) {
        // TODO
      }
      get(key, timestamp) {
        // TODO
        return "";
      }
    }
tests:
  - args: [["set", "foo", "bar", 1], ["get", "foo", 1], ["get", "foo", 3], ["set", "foo", "bar2", 4], ["get", "foo", 4], ["get", "foo", 5]]
    expected: [null, "bar", "bar", null, "bar2", "bar2"]
  - args: [["get", "x", 1], ["set", "x", "a", 5], ["get", "x", 4], ["get", "x", 5]]
    expected: ["", null, "", "a"]
    label: missing key and timestamp before the first set
  - args: [["set", "k", "v1", 1], ["set", "k", "v2", 2], ["set", "k", "v3", 3], ["get", "k", 2], ["get", "k", 100], ["get", "k", 0]]
    expected: [null, null, null, "v2", "v3", ""]
    hidden: true
  - args: [["set", "a", "x", 10], ["set", "b", "y", 20], ["get", "a", 20], ["get", "b", 15], ["get", "b", 20]]
    expected: [null, null, "x", "", "y"]
    hidden: true
    label: keys are independent
hints:
  - "Append `(timestamp, value)` to the key's list; because timestamps increase, the list stays sorted with no insert cost."
  - "`get` is floor over the timestamps: find the last entry with timestamp <= t."
```

## Senior signals

- You name the operation you need (`floor`, `ceiling`, `range`, `rank`) before naming the structure, and you can trace `floor` on a tree, a skip list and a sorted array.
- You quote the constant-factor gap (a red-black lookup is ~20 pointer chases, a B-tree ~7, a hash lookup one or two) and still choose the tree when order or worst-case guarantees matter.
- You know why Rust picked a B-tree, why Redis and LSM memtables picked skip lists, and why the Linux scheduler uses a tree rather than a heap.
- In Python you reach for `bisect`, you can state the `bisect_left`/`bisect_right` semantics for floor and ceiling from the four-row table, and you know where `insort` stops being acceptable.
- You use a heap when only the extreme is needed and do not over-build an ordered map, and you know a heap cannot do `floor`.
- You connect the in-memory choice to database indexes: floor on a B-tree index is what makes "latest row before t" queries fast.

## Check yourself

```quiz
- q: >-
    Which query can a hash map NOT answer efficiently?
  options: ["Remove key k and its value, if present", "What is the largest stored key ≤ k?", "What value is currently stored for key k?", "Is key k present among the stored keys?"]
  answer: 1
  explanation: >-
    Hash maps place keys by hash, destroying order, so the largest key ≤ k (floor) needs a full scan. Membership, lookup and removal are exact-key operations and stay O(1) expected. Floor, ceiling, range and sorted iteration need an ordered structure (tree, B-tree, skip list or sorted array).
- q: >-
    Rust's standard ordered map is a B-tree rather than a red-black tree mainly because:
  options: ["Red-black trees cannot be written in safe Rust at all", "Wide nodes keep keys contiguous, so lookups miss cache less", "Its worst-case height is lower than a red-black tree's", "It uses much less memory per key, which decided the choice"]
  answer: 1
  explanation: >-
    Both have logarithmic height; the B-tree's advantage is cache behaviour: 6–8 contiguous 192-byte nodes instead of ~20 separately allocated ones at a million entries. Memory per key is comparable or better, but locality is the decisive reason.
- q: >-
    In Python, to find the largest key ≤ x in a sorted list `keys`, which expression is correct?
  options: ["keys[i - 1] where i = bisect_right(keys, x), if i > 0", "keys[i] where i = bisect_right(keys, x), if i < len(keys)", "keys[i] where i = bisect_left(keys, x), if i < len(keys)", "keys[i - 1] where i = bisect_left(keys, x), if i > 0"]
  answer: 0
  explanation: >-
    bisect_right returns the first index with a key > x, so the element before it is the floor; guard the index-0 case. Using bisect_left − 1 fails when x is present (it returns the previous key), and keys[bisect_left] is the ceiling, not the floor.
- q: >-
    Redis sorted sets use a skip list alongside a hash table. Why not a red-black tree?
  options: ["Rank ranges are easy via spans and updates are local, no rotations", "Red-black trees cannot keep a score alongside each member", "Skip lists are faster than trees for exact score lookups", "Skip lists use less memory than any balanced tree design"]
  answer: 0
  explanation: >-
    Skip lists give O(log n) expected ordered operations with simple local pointer updates, and the span stored per forward pointer makes rank queries O(log n), which a plain tree lacks. Exact lookups in Redis go through the companion hash table, not the skip list. Memory is comparable, not decisively lower.
- q: >-
    A calendar service checks new bookings against existing ones with a linear scan over a hash map and is slow. The appropriate fix is:
  options: ["Order bookings by start and check only floor and ceiling", "Use a bigger hash map so each lookup has fewer collisions", "Cache the last overlap result, keyed by the request range", "Sort the bookings on each request, then binary search them"]
  answer: 0
  explanation: >-
    Only the nearest booking on each side can overlap a new interval, so floor(start) and ceiling(start) are two O(log n) queries. An ordered map (or a sorted array with binary search, or a B-tree index in the database) answers both. Sorting per request costs O(n log n) every time.
- q: >-
    A loader inserts a million random keys into a Python list with `bisect.insort` and takes minutes. The cause is:
  options: ["`insort` re-sorts the entire list after every insertion", "Binary search over a list is O(n), because lists are not arrays", "Each insert shifts up to a million pointers, so the total is O(n²)", "Python lists cannot exceed a few hundred thousand elements"]
  answer: 2
  explanation: >-
    The search is O(log n), but `list.insert` moves every pointer after the insertion point, on average half the list (4 MB at a million keys), so a million inserts is quadratic work. Python lists are contiguous arrays of pointers with no such size limit, and insort does not sort. Use sortedcontainers, a tree, or sort once after loading.
```
