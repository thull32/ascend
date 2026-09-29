---
slug: indexed-heaps-and-decrease-key
title: "Indexed heaps, decrease-key and lazy deletion"
description: The one operation a plain binary heap cannot do, the two ways to get it (stale entries you skip, or a position map you maintain) traced by hand, who ships each in production, what Fibonacci heaps promise and why nobody uses them, and when a balanced tree is the honest answer.
minutes: 45
difficulty: hard
tags: [heaps, decrease-key, indexed-heap, lazy-deletion, dijkstra, priority-queue]
problems: [network-delay-time, sliding-window-median, task-scheduler]
---
Dijkstra's algorithm pushes every vertex with a tentative distance and later discovers a shorter path to some of them. A timer system pushes a deadline and later the caller cancels it. A task scheduler pushes a job at priority 5 and an operator bumps it to priority 1. In all three, an element *already inside the heap* needs its key changed or needs to leave. The binary heap from the [mechanics lesson](/learn/data-structures/heaps/binary-heap-mechanics) has no answer: it can find its minimum in O(1) but finding *anything else* is a linear scan, because siblings are unordered.

There are two engineering answers, a theoretical one that mostly is not used, and an honest alternative that is not a heap at all. Knowing which to pick is the difference between an O(E log V) Dijkstra and one that is O(V²) because someone wrote `heap.remove(x)`.

## Option 1: lazy deletion (push a duplicate, skip stale entries)

Do not touch the entry in the heap at all. Push a *new* entry with the new key. When you pop, check whether the entry is still current; if not, discard it and pop again.

For Dijkstra, "current" means "this vertex has not been finalised yet":

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

The heap may contain several entries for the same vertex; only the one with the smallest distance matters, and it pops first because the heap orders by distance. The others surface later, fail the `done` check, and are discarded. The [priority queues lesson](/learn/data-structures/heaps/priority-queues-in-practice) traces this on a four-vertex graph: six pushes, two stale pops.

### How much garbage, really

Total pushes are bounded by the number of *successful* relaxations, so the heap holds O(E) entries in the worst case instead of O(V), and the running time is O(E log E) = O(E log V) since log E ≤ 2 log V. The bound is loose on typical inputs. Measured on a random directed graph with V = 1,000 and E ≈ 5 × 10⁵ (every edge present with probability one half, weights uniform in 1 to 1,000): 5,490 pushes, 4,490 stale pops, and the heap peaked at 4,824 entries, about 5V and nowhere near E. On a sparse random graph with E = 4V the peak was 567 entries and one pop in four was stale. An adversary can order the weights so that almost every edge relaxation succeeds and the heap really does reach E, which is the case to quote in an interview, with the measured numbers as the honest expectation.

### Deletion as a multiset of pending removals

For **deletion** rather than decrease-key, the same trick is a multiset of pending removals. `remove(x)` records `pending[x] += 1`. `pop()` discards roots while `pending[root] > 0`, decrementing as it goes. `size()` must report live elements, so track `live = pushes − removals` separately. This is exactly how a sliding-window median works with two heaps: the element leaving the window is marked, not removed, and each heap's *logical* size (live elements) drives the rebalancing while the stale entries sit harmlessly until they reach a root.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min",
 "operations": [["push", 7], ["push", 3], ["push", 9], ["push", 3], ["pop"], ["pop"], ["push", 1], ["pop"], ["pop"]],
 "title": "Lazy decrease-key by duplicate push", "caption": "The second push of 3 stands in for a decrease from 7 to 3. Both entries sit in the heap; the caller keeps a record of which one is current and skips the stale one when it surfaces."}
```

The trap with lazy deletion: a `remove(x)` for a value that is **not present** must be a no-op, or a later `push(x)` will be silently eaten. Track live counts per value, and only record a pending removal when `live[x] > 0`. The exercise below tests exactly that.

### Garbage needs a bound

Lazy deletion is the right default: a few lines, no changes to the heap, and memory overhead bounded by the number of updates. It becomes the wrong choice when updates vastly outnumber pops. Measured on CPython 3.14: a heap of 10⁶ timer entries of which 99% are cancelled holds about 124 MB of tuples to deliver 10,000 timers, and draining it takes 1.65 s of pure stale-skipping. Python's asyncio bounds this: it counts cancelled handles and, once more than 100 handles are scheduled and over half are cancelled, rebuilds the heap without them in one O(n) pass. That pair of constants is what "lazy deletion with a garbage threshold" looks like in shipped code, and any lazy heap you write for a cancel-heavy workload needs the same guard.

## Option 2: the indexed heap (a position map)

Give the heap a second map, `pos`, from each *key* (a vertex id, a timer id, a job id) to its current index in the heap array. Every swap in sift-up and sift-down updates `pos` for both elements moved. Now the heap can locate any key in O(1), which makes three new operations O(log n):

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

    def delete(self, key):
        i = self.pos[key]
        self._swap(i, len(self.keys) - 1)
        self.keys.pop()
        del self.pos[key]; del self.pri[key]
        if i < len(self.keys):
            self._up(i)
            self._down(i)
```

The two structures must stay consistent through every operation, which is why the indexed heap is about three times the code of a plain one and where the bugs live. Every write to the array goes through `_swap`, so there is exactly one place where `pos` can be forgotten.

### A worked decrease-key

Insert `a:5`, `b:3`, `c:8`, then `decrease(c, 1)`, then `pop()`:

| Operation | Sift steps | `keys` (priorities) | `pos` |
|---|---|---|---|
| insert a:5 | root | `[a]` (5) | a→0 |
| insert b:3 | 3 < 5, swap with parent | `[b, a]` (3, 5) | b→0, a→1 |
| insert c:8 | 8 ≥ 3, stays | `[b, a, c]` (3, 5, 8) | b→0, a→1, c→2 |
| decrease c→1 | from index 2: 1 < 3, swap with root | `[c, a, b]` (1, 5, 3) | c→0, a→1, b→2 |
| pop → c | swap root with last, drop c, sift b down: child a is 5 > 3, stays | `[b, a]` (3, 5) | b→0, a→1 |

Two array writes and two map writes for the decrease. The map is consistent after every row, which is the invariant the exercise checks by interleaving `decrease` with `pop` and `contains`.

### Delete from the middle: why both sifts

The swapped-in element comes from the bottom of a *different* branch, so it may need to move either way. Build a heap by inserting `a:1, b:10, c:2, d:11, e:12, f:3, g:4` (no insert ever swaps, so the array is insertion order) and delete `d`:

| Step | `keys` (priorities) |
|---|---|
| before | `[a, b, c, d, e, f, g]` (1, 10, 2, 11, 12, 3, 4) |
| swap d (index 3) with last g (index 6), pop d | `[a, b, c, g, e, f]` (1, 10, 2, 4, 12, 3) |
| sift up from index 3: parent b is 10 > 4, swap | `[a, g, c, b, e, f]` (1, 4, 2, 10, 12, 3) |
| sift down from index 1: no children below index 1 in range with smaller priority | unchanged |

Had the code called only `_down`, `g:4` would have stayed under `b:10` and the heap would be silently invalid. Calling both is correct because at most one of them moves the element.

### Dijkstra with an indexed heap

Dijkstra with an indexed heap holds exactly V entries and runs in O(E log V) with V pushes, V pops and up to E decrease-keys. Compared with lazy deletion, memory drops from O(E) worst case to O(V), the number of heap operations drops (decrease-key does not add an entry), and the constant per operation rises (two map updates on every swap, and a hash lookup per comparison in the Python version above; a systems-language version uses an array indexed by vertex id and pays almost nothing). On sparse graphs expect the two to be close, for the reason the measured garbage numbers above show: lazy deletion carries far fewer stale entries than its bound suggests. Benchmark on your own graphs before switching. On dense graphs the indexed version wins on memory.

## Under the hood: who ships an indexed heap

- **Go's `container/heap`** is the indexed design with the index left to you: your `Swap` method is where you write `items[i].index = i`, and `heap.Fix(h, i)` sifts item `i` in whichever direction it needs, calling `down` first and `up` only if `down` did not move it, which is the both-ways sift from the delete trace. `heap.Remove(h, i)` is `delete`.
- **libuv** (Node's event loop) stores timers in a binary heap built from left, right and parent *pointers* embedded in each `uv_timer_t`, so the timer *is* its own position record and `uv_timer_stop` removes it in O(log n) with no lookup at all. That is an intrusive indexed heap: the "map" is a field in the element.
- **Java's `ScheduledThreadPoolExecutor`** keeps a `DelayedWorkQueue`, an array heap whose `ScheduledFutureTask` entries store their own `heapIndex`, making removal O(log n); a cancel triggers that removal only after `setRemoveOnCancelPolicy(true)`, and by default a cancelled task stays queued until its delay elapses. `java.util.PriorityQueue.remove(Object)` has no index and is O(n): a cancellation storm on a plain `PriorityQueue` is quadratic.
- **Rust's `BinaryHeap::peek_mut`** is decrease-key (or increase-key) for the *root* only: the guard re-sifts on drop. Boost.Heap's `d_ary_heap<T, mutable_<true>>` returns handles that act as the position map for arbitrary elements.
- **Graph libraries** mostly pick lazy deletion: NetworkX's Dijkstra pushes `(dist, counter, node)` tuples and skips finalised nodes. SciPy's `csgraph` Dijkstra is one of the few mainstream Fibonacci-heap users, and JGraphT's defaults to a pairing heap; both are Dijkstra-specific choices where decrease-key is the hot operation.

The pattern across all of them: an index must be updated in exactly one place (`Swap`, the pointer fix-up, `siftUp`/`siftDown`), and the API either owns that place or makes you write it.

## What Fibonacci heaps promise, and why they are not used

| Heap | insert | find-min | delete-min | decrease-key | merge | node size (pointers) |
|---|---|---|---|---|---|---|
| Binary (array) | O(log n) | O(1) | O(log n) | O(log n) with an index | O(n) rebuild | 0, one array slot |
| d-ary (array) | O(log_d n) | O(1) | O(d log_d n) | O(log_d n) with an index | O(n) | 0 |
| Pairing | O(1) | O(1) | O(log n) amortised | o(log n) amortised, exact bound open | O(1) | 3 |
| Fibonacci | O(1) | O(1) | O(log n) amortised | O(1) amortised | O(1) | 4 plus a mark bit |

The textbook says Dijkstra is O(E + V log V) with a Fibonacci heap, because decrease-key becomes O(1) *amortised*. That is a real asymptotic improvement over O(E log V) for dense graphs, where E ≈ V². The catch is in the constants and the memory: a Fibonacci heap node carries four pointers and a mark bit, the structure is a forest of trees that is consolidated lazily on delete-min, and every operation involves pointer chasing across scattered allocations, each a likely cache miss of around 100 ns against a few nanoseconds for an array index. On real hardware, for real graphs, a binary or 4-ary heap with lazy deletion is faster until E is enormous, and even then a **pairing heap** (a simpler multiway tree with the same practical behaviour, though its decrease-key bound is not fully proven) is what you would reach for. Knowing the Fibonacci bound is an interview point; having implemented one is a curiosity. If an interviewer asks "can you do better than E log V?", the senior answer names the bound and then says why you would not use it.

## When to stop using a heap

The heap's contract is *find-min fast, everything else slow*. Each workaround above patches one gap. When you need several of the following, a balanced BST (or a skip list, or a B-tree) is the honest structure:

| Need | Plain heap | Lazy heap | Indexed heap | Balanced BST |
|---|---|---|---|---|
| insert, pop-min | O(log n) | O(log n) | O(log n) | O(log n) |
| decrease-key / change priority | O(n) | O(log n), leaves garbage | O(log n) | O(log n) delete + insert |
| delete by key | O(n) | O(log n) lazily, garbage | O(log n) | O(log n) |
| find-min after deletes | O(1) | O(1) amortised, may skip stale | O(1) | O(log n), or O(1) with a cached pointer |
| iterate in order, floor/ceiling, range | no | no | no | yes |
| pop-max *and* pop-min | no (one kind) | no | no (or a min-max heap) | yes |
| memory per element | 1 slot | up to updates × 1 slot | 1 slot + index entry | node + 2–3 pointers + colour |

The Linux scheduler needs delete-by-key (a task blocks) and a fast pick of the next task, so CFS used a red-black tree with a cached leftmost pointer, and EEVDF (since 6.6) keeps the tree, ordered by virtual deadline and augmented so the earliest eligible deadline is found in O(log n); the [balanced trees lesson](/learn/data-structures/trees/balanced-trees) covers what that costs. A leaderboard needs rank queries and both ends, so it uses a skip list (Redis) or an order-statistic tree. A queue of futures sorted by deadline that are frequently cancelled is where Tokio chose a timing wheel: O(1) insert and cancel, approximate ordering, because exact ordering was not a requirement.

The decision rule: if the *only* things you do are push and pop-min, plus occasional decrease-key, use a heap with lazy deletion and a garbage threshold. If you need decrease-key on most operations and memory matters, use an indexed heap. If you need any ordered query beyond the minimum, or deletes dominate, use a tree. If ordering can be approximate and the volume is huge, use a wheel or a bucket structure.

## Production failure modes

**A pushed value vanishes.** Symptom: a lazy-deletion queue occasionally drops an element that was pushed after an unrelated `remove`. Diagnosis: `remove(x)` recorded a pending removal for a value that was not present; the next `push(x)` was eaten when it reached the root. Fix: consult the live count before recording a removal, and test the sequence `remove(9), push(9), pop()`.

**Decrease-key moves the wrong element.** Symptom: an indexed heap returns non-minimal keys, or a `KeyError` appears in `pos` long after the offending operation. Diagnosis: one code path writes the array without going through `_swap`, usually a hand-inlined `pop` or `delete`, so `pos` drifted. Fix: route every array write through the one swap helper and assert `pos[keys[i]] == i` for all `i` in tests.

**Memory grows in a timer-heavy service.** Symptom: heap size climbs steadily although few timers ever fire; RSS follows. Diagnosis: cancelled timers are marked but never removed and there is no compaction threshold; the 99%-cancelled measurement above is the extreme. Fix: asyncio's rule (rebuild when over half the entries are dead), an indexed heap with real removal, or a timing wheel.

**Cancellation storms turn quadratic.** Symptom: a service that cancels thousands of pending tasks per second pegs a core in `PriorityQueue.remove`. Diagnosis: `remove(Object)` is a linear scan; 10⁴ cancels over a 10⁴-entry queue is 10⁸ comparisons. Fix: `ScheduledThreadPoolExecutor` with `setRemoveOnCancelPolicy(true)` (indexed) or a cancel flag checked on poll (lazy).

**Increase-key handled with the decrease-key path.** Symptom: an item whose priority was *raised* (made less urgent) still pops early. Diagnosis: the code updated the priority and sifted up only; the element needed to sift down. Fix: sift both ways after any priority change, as `heap.Fix` does.

## Interviewer follow-ups

**"Your Dijkstra pushes duplicates. How big can the heap get, and does it matter?"** Model answer: O(E) entries in the worst case, O(E log V) time either way since log E ≤ 2 log V; on realistic graphs the peak is a small multiple of V, and on dense graphs an indexed heap brings it to exactly V. Common wrong answer: "V, because each vertex is visited once".

**"Implement delete of an arbitrary element in O(log n)."** Model answer: a position map updated on every swap; swap the element with the last, shrink, then sift the swapped-in element up and down, because it came from a different branch. Common wrong answer: sift down only.

**"Why not a Fibonacci heap for the O(E + V log V) bound?"** Model answer: four pointers per node, lazy consolidation and cache-hostile pointer chasing make its constants large; binary or pairing heaps win until graphs are extremely dense, and even SciPy's choice to use one is the exception. Common wrong answer: "Fibonacci heaps are always faster for Dijkstra".

**"Millions of timers, nearly all cancelled. Lazy heap, indexed heap or something else?"** Model answer: a hierarchical timing wheel, O(1) insert and cancel at slot precision; if exact ordering is required, an indexed heap so cancellation actually frees memory; a lazy heap only with a compaction threshold like asyncio's. Common wrong answer: "a lazy heap, cancellations are cheap", which ignores the memory.

**"The queue needs pop-min and pop-max."** Model answer: a balanced tree, or a min-max heap (alternating min and max levels, both extremes in O(log n)), or two indexed heaps that delete from each other; a plain heap gives one end only. Common wrong answer: "keep a max-heap and a min-heap and push to both", which leaks the popped element in the other heap unless it is indexed.

## What mid-level engineers get wrong

- **`heap.remove(x)` followed by `heapify`** inside a loop: O(n) per operation, and the loop makes it quadratic.
- **Unconditional `pending[x] += 1`** in a lazy queue, which eats a future push.
- **Reporting `len(heap)` as the size** of a lazy queue, which counts dead entries and breaks any balance invariant built on it.
- **Updating a priority in place and sifting one direction**, or not sifting at all.
- **Keeping the position map only in `insert` and `pop`** and forgetting it in `delete`, which works until the first middle deletion.
- **Quoting the Fibonacci bound as the reason to implement one.**
- **Reaching for a heap when the requirements say "list in order" or "cancel by id"**, then bolting on workarounds until a tree would have been shorter.

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
- You default to **lazy deletion** with a staleness check, you can state its memory cost (O(E) worst case for Dijkstra, a small multiple of V on realistic graphs) and its two failure modes (removing an absent value; unbounded garbage), and you know asyncio's threshold as the shipped example of a fix.
- You can describe the **indexed heap**: a position map updated in exactly one place, and the three operations it unlocks, including why delete sifts both ways.
- You can name who ships which design: Go's `heap.Fix`, libuv's pointer heap, the JDK's `heapIndex`, Rust's `peek_mut`, NetworkX's lazy tuples.
- You can quote the Fibonacci heap bound for Dijkstra and explain, in terms of pointers and cache misses, why binary or pairing heaps win on real hardware.
- You recognise when the requirements have outgrown a heap (ordered iteration, delete-heavy, both ends) and switch to a balanced tree without ceremony.
- You know at least one runtime (Go, libuv, Tokio) and what it chose for timers, and why.

## Check yourself

```quiz
- q: >-
    Dijkstra with lazy deletion (duplicate pushes) has heap size bounded by:
  options: ["Max degree, since one vertex relaxes at a time", "E, since each relaxation can push an entry", "V log V, since each vertex re-enters log V times", "V, since each vertex is finalised only once"]
  answer: 1
  explanation: >-
    Each successful relaxation pushes an entry and there are at most E relaxations, so the heap can hold O(E) entries even though each vertex is finalised once; the indexed heap variant holds at most V. Running time stays O(E log V) because log E ≤ 2 log V. On random graphs the measured peak is a small multiple of V, but the bound is what an adversary can force.
- q: >-
    In an indexed heap, what must every swap during sift-up or sift-down do in addition to swapping the two array slots?
  options: ["Recompute the priorities of both moved keys", "Update the position map for both moved keys", "Re-heapify the array so the positions stay valid", "Nothing, as the position map is rebuilt on each pop"]
  answer: 1
  explanation: >-
    The position map is what makes decrease-key O(log n); it is only correct if it is updated at every move. Priorities do not change during a swap, and rebuilding the map or re-heapifying would be O(n) per operation, which defeats the purpose.
- q: >-
    Deleting a middle element of an indexed heap swaps it with the last element and shrinks the array. The swapped-in element must then be:
  options: ["Sifted up only, since the deleted slot was above it", "Left in place, since the heap shape is already restored", "Sifted both up and down, since it came from another branch", "Sifted down only, since it came from the bottom level"]
  answer: 2
  explanation: >-
    The last element belongs to some other branch, so relative to its new parent and children it may be too small or too large; the trace in the lesson shows a value of 4 landing under a parent of 10 and needing to move up. Calling both sifts is correct because at most one of them moves it. Shape is restored by the shrink, but order is not.
- q: >-
    A lazy-deletion queue implements remove(x) as pending[x] += 1 unconditionally. Sequence: remove(7), push(7), pop(). What is returned?
  options: ["An error, since removing an absent 7 raises", "7, since the removal came before the push", "None, as the pending removal eats the push", "7, since each push clears pending removals"]
  answer: 2
  explanation: >-
    The unconditional remove records a pending removal without error, and nothing clears it. The pending count for 7 is 1 when the push happens; on pop, the root 7 matches a pending removal and is discarded. remove must check that a live copy exists before recording a pending removal.
- q: >-
    Why is Dijkstra with a Fibonacci heap (O(E + V log V)) rarely faster than with a binary heap (O(E log V)) on real hardware?
  options: ["Pointer-heavy forests mean large constants and cache misses", "The bound is misquoted; it is really O(E log V) as well", "Binary heaps also get O(1) decrease-key through the index map", "Fibonacci heaps cannot handle negative edge weights at all"]
  answer: 0
  explanation: >-
    The bound is real, but the asymptotic win requires dense graphs and ignores constants. Fibonacci heap nodes carry four pointers and scattered allocations, and on sparse graphs E is only a few times V, so the difference between E and E log V is small and the binary heap's array layout wins on real hardware. An indexed binary heap's decrease-key is O(log n), not O(1).
- q: >-
    A system needs to insert tasks with priorities, pop the highest priority, cancel arbitrary tasks by id, and list tasks in priority order for a dashboard. The best structure is:
  options: ["A balanced BST or skip list on (priority, id)", "A binary heap with lazy deletion for cancelled ids", "An indexed heap with a position map keyed by id", "Two heaps, one max and one min, sharing the ids"]
  answer: 0
  explanation: >-
    Ordered iteration rules out every heap variant, which cannot produce sorted order without destroying itself; an indexed heap solves cancellation but not the listing. A balanced tree gives O(log n) insert, pop-min, delete-by-key and O(n) in-order listing.
```
