---
slug: ordered-maps-vs-hash-maps
title: Ordered maps vs hash maps
description: When you need floor, ceiling, range scans or sorted iteration, a hash map cannot help; this lesson covers balanced trees, B-trees and skip lists as ordered maps, the honest cost comparison, and what to do in Python and JavaScript, which have none built in.
minutes: 45
difficulty: medium
tags: [hashing, ordered-map, treemap, btreemap, skip-list, bisect, range-query]
problems: [time-based-kv, meeting-rooms-ii, minimum-interval-query]
---
"Given a timestamp, return the value that was current at that moment." "Is there a booking that overlaps this one?" "How many events happened between 9:00 and 9:15?" "Who are the ten users just above me on the leaderboard?" None of these is a lookup by exact key, so a hash map answers none of them. They are questions about *order*: the largest key not above `x`, the neighbours of `x`, everything in a range. Those need a map that keeps its keys sorted, and the price is a logarithm.

Knowing when to pay that logarithm, and what to reach for in a language that does not ship an ordered map, is a distinctly senior skill. Junior code sorts the whole collection on every query; mid-level code uses a hash map and a linear scan; senior code names the operation ("I need `floor(x)`") and picks the structure that provides it.

## What an ordered map provides

An ordered map stores key–value pairs sorted by key and supports, in O(log n) each:

| Operation | Meaning | Hash map equivalent |
|---|---|---|
| `get(k)`, `put(k, v)`, `remove(k)` | Exact-key operations | O(1) expected |
| `floor(k)` / `ceiling(k)` | Largest key ≤ k / smallest key ≥ k | None |
| `lower(k)` / `higher(k)` | Strict versions | None |
| `min()` / `max()` | First and last keys | O(n) scan |
| `range(lo, hi)` | Iterate keys in `[lo, hi)` in order, O(log n + k) | O(n) scan and sort |
| `rank(k)` / `select(i)` | Number of keys below k / the i-th smallest key | None; needs an augmented tree |
| Ordered iteration | All keys ascending | O(n log n) sort each time |

Java calls this `TreeMap`/`TreeSet` (`floorKey`, `ceilingKey`, `subMap`, `headMap`, `tailMap`); C++ has `std::map` (`lower_bound`, `upper_bound`); Rust has `BTreeMap` (`range`); Go, Python and JavaScript have nothing in the standard library, which is where the second half of this lesson goes.

## Three ways to build one

### Balanced binary search trees

A binary search tree with every node's left subtree below it and right subtree above it, rebalanced on insert and delete so the height stays O(log n). Red-black trees (Java `TreeMap`, C++ `std::map`, the Linux scheduler) and AVL trees are the classic choices. Every operation is a root-to-leaf walk: `floor(k)` walks down, remembering the last node whose key was `≤ k`; a range scan finds the start and then walks in-order.

```viz
{"type": "tree", "algorithm": "bst-insert", "values": [50, 30, 70, 20, 40, 60, 80, 35], "title": "A BST keeps keys ordered: in-order traversal is sorted iteration"}
```

The cost that matters: a tree of a million entries is about 20 levels deep, and each level is a pointer dereference to a separately allocated node, so a lookup is ~20 cache misses, roughly 20 × 100 ns = 2 µs in the worst case versus 50–100 ns for a hash lookup. Trees also carry three pointers plus colour per node, so memory per entry is 40+ bytes on top of the key and value. [Balanced trees](/learn/data-structures/trees/balanced-trees) covers the rotations.

### B-trees

A B-tree node holds many keys (Rust's `BTreeMap` stores up to 11 per node; database pages hold hundreds) in a small sorted array, and has one child per gap. The tree is much shallower (a million entries is 5–6 levels with 11 keys per node) and each node is a contiguous block, so a lookup is a few cache misses plus some in-node binary or linear search. Rust chose a B-tree over a red-black tree for exactly this cache reason; databases chose them because a node maps to a disk page. [B-trees and B+ trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees) has the details. For an in-memory ordered map, a B-tree is usually 2–3× faster than a red-black tree with the same asymptotics.

### Skip lists

A sorted linked list with extra "express lanes": each node is promoted to level `i + 1` with probability ½, so level 1 has about half the nodes, level 2 a quarter, and so on, giving O(log n) *expected* height. A search starts at the top level, moves right while the next key is below the target, drops a level, and repeats.

```text
level 3:  1 ------------------------> 30 ------------------> ∞
level 2:  1 --------> 9 ------------> 30 -------> 55 -----> ∞
level 1:  1 --> 5 --> 9 --> 17 -----> 30 --> 42 -> 55 -----> ∞
level 0:  1 --> 5 --> 9 --> 17 --> 21 --> 30 --> 42 --> 55 --> 61 --> ∞
```

Skip lists trade the guaranteed height of a balanced tree for simplicity: insertion never rotates anything, so concurrent insertion needs only local locking (or CAS on a few pointers), which is why Java's `ConcurrentSkipListMap` exists and why Redis uses a skip list for sorted sets (`ZSET`, alongside a hash for O(1) score lookup) and LevelDB/RocksDB use one for the in-memory memtable. Their weakness is the same as any linked structure: cache misses on every hop.

| | Red-black / AVL | B-tree | Skip list |
|---|---|---|---|
| Height | ≤ 2 log n guaranteed | ~log_B n guaranteed | O(log n) expected |
| Cache behaviour | Poor (one node per level) | Good (many keys per node) | Poor |
| Concurrency | Hard (rotations touch many nodes) | Moderate (latch coupling) | Easy (local pointer updates) |
| Memory per entry | ~3 pointers + colour | Small (amortised over node) | ~2 pointers on average |
| Used in | Java TreeMap, C++ std::map, Linux CFS | Rust BTreeMap, every database index | Redis ZSET, ConcurrentSkipListMap, LSM memtables |

## The honest comparison with a hash map

| | Hash map | Ordered map |
|---|---|---|
| Exact lookup | O(1) expected, ~50–100 ns | O(log n), ~0.5–2 µs at 10⁶ entries |
| Worst-case lookup | O(n) with a bad or adversarial hash | O(log n) guaranteed (trees) |
| Ordered / range operations | Not available | O(log n + k) |
| Memory per entry | Low for open addressing | Higher (pointers) or moderate (B-tree) |
| Key requirement | Hashable and equality-comparable | Totally ordered (comparable) |
| Iteration order | Arbitrary (or insertion order in Python/JS) | Sorted |
| Latency profile | Occasional O(n) resize pause | Smooth; no rehash |

Two consequences that experienced engineers act on:

- **Predictability.** A tree's O(log n) is a guarantee, not an expectation. Systems that must bound worst-case latency (kernel schedulers, real-time trading) or that hash attacker-chosen keys sometimes choose a tree over a hash map even for exact lookups. The Linux CFS scheduler keeps runnable tasks in a red-black tree keyed by virtual runtime; picking the next task is `min()`.
- **Insertion-ordered is not sorted.** Python's `dict` and JavaScript's `Map` remember insertion order, and `OrderedDict.move_to_end` is what makes them usable for LRU caches. That is a different property from *sorted* order and answers none of the range questions.

## Python and JavaScript: no ordered map, three substitutes

### A sorted array with binary search

Keep the keys in a sorted list and use `bisect` (Python) or a hand-written binary search (JavaScript). Lookups, floor and ceiling are O(log n); insertion into the middle is O(n) because of the shift, but the shift is a `memmove` running at memory bandwidth, so for `n` up to around 10⁵ it is competitive with a tree and far simpler.

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

`bisect_left(a, k)` returns the first index whose key is `≥ k`; `bisect_right` returns the first index whose key is `> k`. `floor` is the element *before* `bisect_right`; `ceiling` is the element *at* `bisect_left`. Getting these two right is the whole difficulty, and it pays to write them down with an example: keys `[1, 3, 5, 7]`, `k = 5`: `bisect_left = 2`, `bisect_right = 3`, so `floor(5) = keys[2] = 5` and `ceiling(5) = keys[2] = 5`; for `k = 6`: `bisect_left = bisect_right = 3`, `floor = keys[2] = 5`, `ceiling = keys[3] = 7`.

If the keys arrive already sorted (timestamps in a log, append-only ids), insertion is an O(1) append and the sorted array is strictly the best structure: this is the [Time-Based Key-Value Store](/practice/time-based-kv) problem and the second exercise.

### `sortedcontainers`

The `sortedcontainers` package (`SortedList`, `SortedDict`) is a list of sorted sub-lists of bounded size, giving O(log n) lookups and roughly O(√n)-to-O(log n) inserts with excellent constants; it is faster than most C tree implementations for realistic sizes. It is not in the standard library, so in an interview say "I'd use `sortedcontainers` in production; here I'll use `bisect` on a list and note that insert is O(n)".

### A heap, when you only need one end

If the only ordered operation is `min()` (or `max()`), a binary heap gives O(log n) insert and pop-min with O(1) peek, in a contiguous array. Scheduling, "k smallest", and merge-by-timestamp want a heap, not a tree. The [Heaps](/learn/data-structures/heaps/binary-heap-mechanics) module covers it; the tell is that you never need `floor` of an arbitrary key, only the extreme.

## Worked example: calendar booking without double-booking

"Book `[start, end)` if it overlaps no existing booking." With bookings in an ordered map keyed by start time, the only two candidates for overlap are the booking with the largest start `≤ start` (does it end after our start?) and the booking with the smallest start `≥ start` (does it start before our end?). Two O(log n) queries, no scan.

Bookings `{10: 20, 30: 40, 50: 60}` (start → end). Request `[15, 25)`: `floor(15) = 10`, ends at 20 > 15: conflict. Request `[20, 30)`: `floor(20) = 10`, ends at 20, not > 20; `ceiling(20) = 30`, not < 30: no conflict, book it. Request `[45, 55)`: `floor(45) = 30`, ends 40 ≤ 45 fine; `ceiling(45) = 50 < 55`: conflict.

With a hash map you would scan every booking: O(n) per request. With a sorted array and `bisect`, each request is O(log n) to find plus O(n) to insert, which is fine for a calendar and wrong for a reservation system with millions of rows, where the database's B-tree index does the same two lookups. [Meeting Rooms II](/practice/meeting-rooms-ii) and [Minimum Interval to Include Each Query](/practice/minimum-interval-query) are the sorted-order relatives.

```viz
{"type": "tree", "algorithm": "bst-search", "values": [30, 10, 50, 20, 40, 60], "target": 45, "title": "Searching for 45 finds where it would go: the neighbours are floor and ceiling"}
```

## Choosing, in one paragraph

Exact lookups only: hash map. Any of floor/ceiling/range/sorted iteration: ordered map (tree or B-tree in languages that have one; sorted list with binary search, or `sortedcontainers`, in Python; sorted array in JavaScript). Only min or max: heap. Bounded worst case or adversarial keys: tree. Massive scale with range scans: a database B-tree index or an LSM tree, which is the same decision made on disk.

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
  - "Find the first index whose key is greater than `x` (bisect_right); the answer is the element just before it, if any."
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

- You name the operation you need (`floor`, `ceiling`, `range`) before naming the structure.
- You quote the constant-factor gap (a tree lookup is ~20 pointer chases; a hash lookup is one or two) and still choose the tree when order or worst-case guarantees matter.
- You know why Rust picked a B-tree and why Redis and LSM memtables picked skip lists.
- In Python you reach for `bisect` and can state the `bisect_left`/`bisect_right` semantics for floor and ceiling without looking them up.
- You use a heap when only the extreme is needed and do not over-build an ordered map.
- You connect the in-memory choice to database indexes: floor/ceiling on a B-tree index is what makes "latest row before t" queries fast.

## Check yourself

```quiz
- q: >-
    Which query can a hash map NOT answer efficiently?
  options: ["What value is currently stored for key k?", "What is the largest stored key ≤ k?", "Remove key k and its value, if present", "Is key k present among the stored keys?"]
  answer: 1
  explanation: >-
    Hash maps place keys by hash, destroying order, so the largest key ≤ k (floor) needs a full scan. Membership, lookup and removal are exact-key operations and stay O(1) expected. Floor, ceiling, range and sorted iteration need an ordered structure (tree, B-tree, skip list or sorted array).
- q: >-
    Rust's standard ordered map is a B-tree rather than a red-black tree mainly because:
  options: ["Red-black trees cannot be written in safe Rust at all", "It uses much less memory per key, which decided the choice", "Wide nodes keep keys contiguous, so lookups miss cache less", "Its worst-case height is lower than a red-black tree's"]
  answer: 2
  explanation: >-
    Both have logarithmic height; the B-tree's advantage in memory is cache behaviour: a few wide nodes instead of ~20 separately allocated ones. Memory per key is comparable or better, but locality is the decisive reason.
- q: >-
    In Python, to find the largest key ≤ x in a sorted list `keys`, which expression is correct?
  options: ["keys[i - 1] where i = bisect_right(keys, x), if i > 0", "keys[i] where i = bisect_right(keys, x), if i < len(keys)", "keys[i - 1] where i = bisect_left(keys, x), if i > 0", "keys[i] where i = bisect_left(keys, x), if i < len(keys)"]
  answer: 0
  explanation: >-
    bisect_right returns the first index with a key > x, so the element before it is the floor; guard the index-0 case. Using bisect_left − 1 fails when x is present (it returns the previous key), and keys[bisect_left] is the ceiling, not the floor.
- q: >-
    Redis sorted sets use a skip list alongside a hash table. Why not a red-black tree?
  options: ["Skip lists are faster than trees for exact score lookups", "Rank ranges are easy and updates are local, no rotations", "Red-black trees cannot keep a score alongside each member", "Skip lists use less memory than any balanced tree design"]
  answer: 1
  explanation: >-
    Skip lists give O(log n) expected ordered operations with simple local pointer updates, making range-by-rank and concurrent modification easy and the code simpler. Exact lookups in Redis go through the companion hash table, not the skip list.
- q: >-
    A calendar service checks new bookings against existing ones with a linear scan over a hash map and is slow. The appropriate fix is:
  options: ["Order bookings by start and check only floor and ceiling", "Cache the last overlap result, keyed by the request range", "Use a bigger hash map so each lookup has fewer collisions", "Sort the bookings on each request, then binary search them"]
  answer: 0
  explanation: >-
    Only the nearest booking on each side can overlap a new interval, so floor(start) and ceiling(start) are two O(log n) queries. An ordered map (or a sorted array with binary search, or a B-tree index in the database) answers both. Sorting per request costs O(n log n) every time.
```
