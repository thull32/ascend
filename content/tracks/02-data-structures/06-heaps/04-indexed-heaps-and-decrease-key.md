---
slug: indexed-heaps-and-decrease-key
title: "Indexed heaps, decrease-key and lazy deletion"
description: The one operation a plain binary heap cannot do, the two ways to get it (stale entries you skip, or a position map you maintain), what Fibonacci heaps promise and why nobody ships them, and when a balanced tree is the honest answer.
minutes: 40
difficulty: hard
tags: [heaps, decrease-key, indexed-heap, lazy-deletion, dijkstra, priority-queue]
problems: [network-delay-time, sliding-window-median, task-scheduler]
---
Dijkstra's algorithm pushes every vertex with a tentative distance and later discovers a shorter path to some of them. A timer system pushes a deadline and later the caller cancels it. A task scheduler pushes a job at priority 5 and an operator bumps it to priority 1. In all three, an element *already inside the heap* needs its key changed or needs to leave. The binary heap from the [mechanics lesson](/learn/data-structures/heaps/binary-heap-mechanics) has no answer: it can find its minimum in O(1) but finding *anything else* is a linear scan, because siblings are unordered.

There are two engineering answers, a theoretical one that mostly is not used, and an honest alternative that is not a heap at all. Knowing which to pick is the difference between an O(E log V) Dijkstra and one that is O(V²) because someone wrote `heap.remove(x)`.

## Option 1: lazy deletion (push a duplicate, skip stale entries)

Do not touch the entry in the heap at all. Push a *new* entry with the new key. When you pop, check whether the entry is still current; if not, discard it and pop again.

For Dijkstra, "current" means "this distance equals the best known distance for this vertex", or more simply "this vertex has not been finalised yet":

```python
import heapq

def dijkstra(adj, source):
    dist = {source: 0}
    heap = [(0, source)]
    done = set()
    while heap:
        d, u = heapq.heappop(heap)
        if u in done:               # stale entry: a shorter path already finalised u
            continue
        done.add(u)
        for v, w in adj[u]:
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))   # duplicate; the old entry is now stale
    return dist
```

The heap may contain several entries for the same vertex; only the one with the smallest distance matters, and it pops first because the heap orders by distance. The others surface later, fail the `done` check, and are discarded. Total pushes are bounded by the number of edge relaxations, so the heap holds O(E) entries instead of O(V), and the running time is O(E log E) = O(E log V) since log E ≤ 2 log V. Memory is the price: a dense graph can have E ≈ V², so the heap holds a million entries for a thousand vertices where an indexed heap would hold a thousand.

For **deletion** rather than decrease-key, the same trick is a multiset of pending removals. `remove(x)` records `pending[x] += 1`. `pop()` discards roots while `pending[root] > 0`, decrementing as it goes. `size()` must report live elements, so track `live = pushes − removals` separately. This is exactly how a sliding-window median works with two heaps: the element leaving the window is marked, not removed, and each heap's *logical* size (live elements) drives the rebalancing while the stale entries sit harmlessly until they reach a root.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min",
 "operations": [["push", 7], ["push", 3], ["push", 9], ["push", 3], ["pop"], ["pop"], ["push", 1], ["pop"], ["pop"]],
 "title": "Lazy decrease-key by duplicate push", "caption": "The second push of 3 stands in for a decrease from 7 to 3. Both entries sit in the heap; the caller keeps a record of which one is current and skips the stale one when it surfaces."}
```

The trap with lazy deletion: a `remove(x)` for a value that is **not present** must be a no-op, or a later `push(x)` will be silently eaten. The exercise below tests exactly that. Track live counts per value, and only record a pending removal when `live[x] > 0`.

Lazy deletion is the right default. It is a few lines, needs no changes to the heap, and its memory overhead is bounded by the number of updates, which in most workloads is small. It becomes the wrong choice when updates vastly outnumber pops (a timer system where 99% of timers are cancelled would carry 100× dead weight) or when memory is tight.

## Option 2: the indexed heap (a position map)

Give the heap a second array, `pos`, that maps each *key* (a vertex id, a timer id, a job id) to its current index in the heap array. Every swap in sift-up and sift-down updates `pos` for both elements moved. Now the heap can locate any key in O(1), which makes three new operations O(log n):

- `decrease_key(k, new_priority)`: update the priority at `pos[k]`, sift up.
- `increase_key(k, new_priority)`: update, sift down.
- `delete(k)`: swap the element at `pos[k]` with the last, shrink, then sift the swapped-in element *both* ways (it may be smaller than its new parent or larger than its new children).

```python
class IndexedMinPQ:
    def __init__(self):
        self.keys = []       # heap array of keys
        self.pri = {}        # key -> priority
        self.pos = {}        # key -> index in self.keys

    def _swap(self, i, j):
        a = self.keys
        a[i], a[j] = a[j], a[i]
        self.pos[a[i]], self.pos[a[j]] = i, j

    def _less(self, i, j):
        return self.pri[self.keys[i]] < self.pri[self.keys[j]]

    def _up(self, i):
        while i > 0 and self._less(i, (i - 1) // 2):
            self._swap(i, (i - 1) // 2)
            i = (i - 1) // 2

    def _down(self, i):
        n = len(self.keys)
        while True:
            l, r, s = 2 * i + 1, 2 * i + 2, i
            if l < n and self._less(l, s): s = l
            if r < n and self._less(r, s): s = r
            if s == i: return
            self._swap(i, s)
            i = s

    def insert(self, key, priority):
        self.pri[key] = priority
        self.pos[key] = len(self.keys)
        self.keys.append(key)
        self._up(self.pos[key])

    def decrease(self, key, priority):
        self.pri[key] = priority
        self._up(self.pos[key])

    def pop(self):
        top = self.keys[0]
        self._swap(0, len(self.keys) - 1)
        self.keys.pop()
        del self.pos[top]; del self.pri[top]
        if self.keys:
            self._down(0)
        return top
```

The two data structures must stay consistent through every operation, which is why the indexed heap is about three times the code of a plain one and where the bugs live. Go's `container/heap` exposes this design directly: your `Swap` method is where you update the index field on your items, and `heap.Fix(h, i)` sifts item `i` in whichever direction it needs after you have changed its priority. Rust's `BinaryHeap::peek_mut` gives you the same for the *top* element only, which covers the common "adjust the minimum" case.

### A worked decrease-key

Insert `a:5`, `b:3`, `c:8`. After sift-ups the heap array is `[b, a, c]` with `pos = {b: 0, a: 1, c: 2}`. Now `decrease(c, 1)`: set `pri[c] = 1` and sift up from `pos[c] = 2`. Parent of index 2 is index 0 (`b`, priority 3); 1 < 3, so swap: array `[c, a, b]`, and the swap writes `pos[c] = 0`, `pos[b] = 2`. Index 0 has no parent; done, two array writes and two map writes. A `pop` now returns `c`: swap root with last (`[b, a, c]`, `pos[b] = 0`, `pos[c] = 2`), drop `c`, sift `b` down: its only child `a` has priority 5 > 3, so it stays. The map is consistent after every operation, which is the invariant the tests below check by interleaving `decrease` with `pop` and `contains`.

The subtle case is `delete` of a middle element: after swapping it with the last element and shrinking, the swapped-in element may need to go *up* (it came from a different branch and may be smaller than its new parent) or *down*. Calling both sift-up and sift-down is correct because at most one of them will move it.

Dijkstra with an indexed heap holds exactly V entries and runs in O(E log V) with V pushes, V pops and up to E decrease-keys. Compared with lazy deletion, memory drops from O(E) to O(V), the number of heap operations drops (decrease-key does not add an entry), and the constant per operation rises (the `pos` updates on every swap). Benchmarks on sparse road-network graphs typically show the two within 20% of each other; on dense graphs the indexed version wins on memory.

The indexed heap is also what a **cancellable timer wheel** needs when it is a heap: libuv keeps timers in a heap with a stored index so `uv_timer_stop` can remove one in O(log n) rather than marking it dead.

## What Fibonacci heaps promise, and why they are not used

The textbook says Dijkstra is O(E + V log V) with a Fibonacci heap, because decrease-key becomes O(1) *amortised*. That is a real asymptotic improvement over O(E log V) for dense graphs. The catch is in the constants: a Fibonacci heap node has four pointers and a mark bit, the structure is a forest of trees that is consolidated lazily on pop, and every operation involves pointer chasing across scattered allocations. On real hardware, for real graphs, a binary or 4-ary heap with lazy deletion is faster until E is enormous, and even then a **pairing heap** (simpler, same amortised bounds in practice though not all proven) is what you would reach for. Knowing the Fibonacci bound is an interview point; having implemented one is a curiosity. If an interviewer asks "can you do better than E log V?", the senior answer names the Fibonacci heap bound and then says why you would not use it.

## When to stop using a heap

The heap's contract is *find-min fast, everything else slow*. Each workaround above patches one gap. When you need several of the following, a balanced BST (or a skip list, or a B-tree) is the honest structure:

| Need | Plain heap | Lazy heap | Indexed heap | Balanced BST |
|---|---|---|---|---|
| insert, pop-min | O(log n) | O(log n) | O(log n) | O(log n) |
| decrease-key / change priority | O(n) | O(log n), leaves garbage | O(log n) | O(log n) delete + insert |
| delete by key | O(n) | O(log n) lazily, garbage | O(log n) | O(log n) |
| find-min after deletes | O(1) | O(1) amortised, may skip stale | O(1) | O(log n), or O(1) with a cached pointer |
| iterate in order, floor/ceiling, range | no | no | no | yes |
| pop-max *and* pop-min | no (one kind) | no | no | yes |
| memory per element | 1 slot | up to updates × 1 slot | 1 slot + index entry | node + 2–3 pointers |

The Linux CFS scheduler needs delete-by-key (a task blocks), find-min (leftmost runnable), and ordered iteration for load balancing, so it uses a red-black tree. A leaderboard needs rank queries and both ends, so it uses a skip list (Redis) or an order-statistic tree. A queue of futures sorted by deadline that are frequently cancelled is where Tokio chose a timing wheel: O(1) insert and cancel, approximate ordering, because exact ordering was not a requirement.

The decision rule: if the *only* things you do are push and pop-min, plus occasional decrease-key, use a heap with lazy deletion. If you need decrease-key on most operations and memory matters, use an indexed heap. If you need any ordered query beyond the minimum, or deletes dominate, use a tree. If ordering can be approximate and the volume is huge, use a wheel or a bucket structure.

## Exercises

```exercise
id: indexed-min-pq
title: An indexed min-priority queue with decrease-key
prompt: |
  Implement `IndexedMinPQ` with:

  - `insert(key, priority)` (keys are unique strings, not already present),
  - `decrease(key, priority)` (the new priority is strictly smaller than the
    current one),
  - `pop()` returning the key with the smallest priority, or `None`/`null`
    if empty,
  - `contains(key)` returning a boolean.

  Maintain a position map from key to heap index and update it on every
  swap so that `decrease` is O(log n). Priorities are unique in the tests,
  so tie-breaking does not matter.
languages: [python, javascript]
entry: IndexedMinPQ
starter:
  python: |
    class IndexedMinPQ:
        def __init__(self):
            self.keys = []    # heap array of keys
            self.pri = {}     # key -> priority
            self.pos = {}     # key -> index in self.keys

        def insert(self, key, priority):
            pass

        def decrease(self, key, priority):
            pass

        def pop(self):
            return None

        def contains(self, key):
            return key in self.pos
  javascript: |
    class IndexedMinPQ {
      constructor() {
        this.keys = [];           // heap array of keys
        this.pri = new Map();     // key -> priority
        this.pos = new Map();     // key -> index in this.keys
      }
      insert(key, priority) {
      }
      decrease(key, priority) {
      }
      pop() {
        return null;
      }
      contains(key) { return this.pos.has(key); }
    }
tests:
  - args: [["insert", "a", 5], ["insert", "b", 3], ["insert", "c", 8], ["decrease", "c", 1], ["pop"], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, null, null, "c", "b", "a", null]
  - args: [["insert", "x", 2], ["contains", "x"], ["pop"], ["contains", "x"]]
    expected: [null, true, "x", false]
    label: contains tracks membership
  - args: [["insert", "a", 10], ["insert", "b", 11], ["decrease", "b", 9], ["pop"]]
    expected: [null, null, null, "b"]
    label: decrease moves an element past the root
  - args: [["pop"]]
    expected: [null]
    label: empty
  - args: [["insert", "a", 4], ["insert", "b", 6], ["insert", "c", 2], ["insert", "d", 9], ["decrease", "d", 3], ["decrease", "b", 1], ["pop"], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, null, null, null, null, "b", "c", "d", "a"]
    hidden: true
hints:
  - "Write one swap(i, j) helper that swaps keys[i] and keys[j] and then sets pos[keys[i]] = i and pos[keys[j]] = j; use it everywhere."
  - "decrease: set pri[key], then sift up from pos[key]. pop: swap root with last, remove last, delete its pos/pri entries, sift down from 0."
```

```exercise
id: lazy-delete-pq
title: A min-priority queue with lazy deletion
prompt: |
  Implement `LazyMinPQ` over a plain min-heap of integers (duplicates
  allowed, so it is a multiset) with:

  - `push(x)`,
  - `remove(x)`: remove **one** copy of `x` if any copy is currently present;
    if `x` is not present this is a **no-op**,
  - `pop()`: remove and return the smallest live value, or `None`/`null`,
  - `size()`: the number of live values.

  Do not search the heap array in `remove`. Keep a map of pending removals
  and a map of live counts, and discard stale roots inside `pop`.
languages: [python, javascript]
entry: LazyMinPQ
starter:
  python: |
    import heapq
    from collections import defaultdict

    class LazyMinPQ:
        def __init__(self):
            self.h = []
            self.live = defaultdict(int)      # value -> live copies
            self.pending = defaultdict(int)   # value -> copies to discard
            self.n = 0                        # live size

        def push(self, x):
            pass

        def remove(self, x):
            pass

        def pop(self):
            return None

        def size(self):
            return self.n
  javascript: |
    class LazyMinPQ {
      constructor() {
        this.h = [];
        this.live = new Map();      // value -> live copies
        this.pending = new Map();   // value -> copies to discard
        this.n = 0;                 // live size
      }
      _push(x) { const a = this.h; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p] <= a[i]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
      _pop() { const a = this.h; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2*i+1, r = 2*i+2; let s = i; if (l < a.length && a[l] < a[s]) s = l; if (r < a.length && a[r] < a[s]) s = r; if (s === i) break; [a[i], a[s]] = [a[s], a[i]]; i = s; } } return top; }
      push(x) {
      }
      remove(x) {
      }
      pop() {
        return null;
      }
      size() { return this.n; }
    }
tests:
  - args: [["push", 5], ["push", 3], ["push", 8], ["remove", 3], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, null, null, 5, 8, null]
  - args: [["push", 1], ["remove", 1], ["pop"], ["size"]]
    expected: [null, null, null, 0]
    label: remove the only element
  - args: [["push", 2], ["push", 2], ["remove", 2], ["pop"], ["pop"]]
    expected: [null, null, null, 2, null]
    label: multiset removes one copy
  - args: [["push", 4], ["push", 1], ["remove", 4], ["size"], ["pop"], ["size"]]
    expected: [null, null, null, 1, 1, 0]
  - args: [["remove", 9], ["push", 9], ["pop"]]
    expected: [null, null, 9]
    hidden: true
    label: removing an absent value must not poison a later push
  - args: [["push", 6], ["push", 2], ["push", 6], ["remove", 6], ["remove", 6], ["remove", 6], ["pop"], ["pop"], ["size"]]
    expected: [null, null, null, null, null, null, 2, null, 0]
    hidden: true
hints:
  - "remove(x): only if live[x] > 0: live[x] -= 1, pending[x] += 1, n -= 1."
  - "pop(): while the heap root has pending[root] > 0, pop it and decrement pending. Then pop the real root, decrement live and n."
```

## Senior signals

- You know that a plain heap cannot change or delete an arbitrary element in O(log n), and you say so before the interviewer asks.
- You default to **lazy deletion** with a staleness check, and you can state its memory cost (O(E) for Dijkstra) and its failure mode (removing an absent value).
- You can describe the **indexed heap**: a position map updated on every swap, and the three operations it unlocks.
- You can quote the Fibonacci heap bound for Dijkstra and explain why binary or pairing heaps win in practice.
- You recognise when the requirements have outgrown a heap (ordered iteration, delete-heavy, both ends) and switch to a balanced tree without ceremony.
- You know at least one runtime (Go, libuv, Tokio) and what it chose for timers, and why.

## Check yourself

```quiz
- q: >-
    Dijkstra with lazy deletion (duplicate pushes) has heap size bounded by:
  options: ["E, since each relaxation can push an entry", "V, since each vertex is finalised only once", "V log V, since each vertex re-enters log V times", "Max degree, since one vertex relaxes at a time"]
  answer: 0
  explanation: >-
    Each successful relaxation pushes an entry and there are at most E relaxations, so the heap can hold O(E) entries even though each vertex is finalised once; the indexed heap variant holds at most V. Running time stays O(E log V) because log E ≤ 2 log V.
- q: >-
    In an indexed heap, what must every swap during sift-up or sift-down do in addition to swapping the two array slots?
  options: ["Re-heapify the array so the positions stay valid", "Nothing, as the position map is rebuilt on each pop", "Update the position map for both moved keys", "Recompute the priorities of both moved keys"]
  answer: 2
  explanation: >-
    The position map is what makes decrease-key O(log n); it is only correct if it is updated at every move. Priorities do not change during a swap, and rebuilding the map or re-heapifying would be O(n) per operation, which defeats the purpose.
- q: >-
    A lazy-deletion queue implements remove(x) as pending[x] += 1 unconditionally. Sequence: remove(7), push(7), pop(). What is returned?
  options: ["An error, since removing an absent 7 raises", "None, as the pending removal eats the push", "7, since each push clears pending removals", "7, since the removal came before the push"]
  answer: 1
  explanation: >-
    The unconditional remove records a pending removal without error, and nothing clears it. The pending count for 7 is 1 when the push happens; on pop, the root 7 matches a pending removal and is discarded. remove must check that a live copy exists before recording a pending removal.
- q: >-
    Why is Dijkstra with a Fibonacci heap (O(E + V log V)) rarely faster than with a binary heap (O(E log V)) in practice?
  options: ["Pointer-heavy forests mean large constants and cache misses", "The bound is misquoted; it is really O(E log V) as well", "Fibonacci heaps cannot handle negative edge weights at all", "Binary heaps also get O(1) decrease-key through the index map"]
  answer: 0
  explanation: >-
    The bound is real, but the asymptotic win requires dense graphs and ignores constants. Fibonacci heap nodes carry four pointers and scattered allocations, and on sparse graphs E is only a few times V, so the difference between E and E log V is small and the binary heap's array layout wins on real hardware. An indexed binary heap's decrease-key is O(log n), not O(1).
- q: >-
    A system needs to insert tasks with priorities, pop the highest priority, cancel arbitrary tasks by id, and list tasks in priority order for a dashboard. The best structure is:
  options: ["A binary heap with lazy deletion for cancelled ids", "An indexed heap with a position map keyed by id", "A balanced BST or skip list on (priority, id)", "Two heaps, one max and one min, sharing the ids"]
  answer: 2
  explanation: >-
    Ordered iteration rules out every heap variant, which cannot produce sorted order without destroying itself; an indexed heap solves cancellation but not the listing. A balanced tree gives O(log n) insert, pop-min, delete-by-key and O(n) in-order listing.
```
