---
slug: priority-queues-in-practice
title: "Priority queues in practice: APIs, stability and schedulers"
description: What the standard libraries actually give you, how to make a heap stable and comparable for arbitrary objects, what runtimes chose for timers and why, and the three production workloads that are a priority queue in disguise.
minutes: 50
difficulty: medium
tags: [heaps, priority-queue, scheduling, event-simulation, stability, heapq]
problems: [task-scheduler, design-twitter, reorganize-string]
---
A binary heap is a data structure; a priority queue is an interface: `push(item, priority)` and `pop()` the item with the best priority. The distinction matters because production code almost never calls sift-down directly. It calls `heapq.heappush`, `PriorityQueue.poll()`, `BinaryHeap::push`, or a timer API that hides a heap entirely, and the bugs come from the gap between the interface you think you are using and the one the library gives you: a max-heap when you wanted min, an unstable order when you assumed FIFO, a comparison error when two priorities tie and the payloads are not comparable, or a priority mutated while the item sits in the heap.

## What the standard libraries actually ship

| Language | API | Min or max | Custom priority | O(n) build | Delete arbitrary | Notes |
|---|---|---|---|---|---|---|
| Python | `heapq` functions over a plain `list` | Min (`_max` variants since 3.14) | Tuples `(priority, item)` or a class with `__lt__` | `heapify` | no (`list.remove` is O(n)) | `nsmallest`/`nlargest` are stable; `merge` is lazy; C-accelerated |
| Java | `java.util.PriorityQueue<E>` | Min | `Comparator` in the constructor | constructor from a `Collection` | `remove(Object)` is O(n) | initial capacity 11; not thread-safe; iterator is in array order |
| C++ | `std::priority_queue<T>` | **Max** | Comparator type parameter, `std::greater<T>` for min | `std::make_heap` on the underlying vector | no | adapter over `vector`; `push_heap`/`pop_heap` are usable directly |
| Rust | `std::collections::BinaryHeap<T>` | **Max** | `Reverse<T>` for min, or implement `Ord` | `From<Vec<T>>` | no (`retain` is O(n)) | `peek_mut` re-sifts the top on drop; `f64` refused because it is not `Ord` |
| Go | `container/heap` | Whatever `Less` says | Implement `heap.Interface` on your slice | `heap.Init` | `heap.Remove(h, i)` O(log n) if you track `i` | `heap.Fix(i)` after a priority change; zero allocation |
| JavaScript | **None** | — | — | — | — | Write ~40 lines or take a dependency; `Array.prototype.sort` per operation is a common accidental O(n² log n) |

Two of the six default to a **max**-heap. Getting this wrong is silent: the code runs, the tests with one element pass, and the scheduler picks the *least* urgent task in production. Read the docs for the language you are in and write the direction in a comment. The "delete arbitrary" column is the one to remember from this table: only Go's API makes it cheap, and only if you store each element's index yourself. The [indexed heaps lesson](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) is about that column.

## Priorities on arbitrary objects

The heap compares elements, so it needs a total order on what you push. Three ways to provide one:

**Tuples.** `heapq.heappush(h, (priority, item))`. Python compares tuples lexicographically, so priority decides first. The trap: on a tie it compares `item`, and if `item` is a dict, a custom object without `__lt__`, or two tasks that happen to be equal, you get a `TypeError` at the worst moment. The fix is a tiebreaker in the middle: `(priority, seq, item)`, where `seq` is a counter. That fixes stability at the same time, so it is the shape you should always write.

```python
import heapq, itertools

class PQ:
    def __init__(self):
        self._h = []
        self._seq = itertools.count()
    def push(self, item, priority):
        heapq.heappush(self._h, (priority, next(self._seq), item))
    def pop(self):
        return heapq.heappop(self._h)[2]
```

**Comparators.** Java, C++, Rust and Go take a comparison function or trait. The rule is that it must be a *strict weak ordering*: `a < b` and `b < a` cannot both be true, and it must be transitive. A comparator that reads a mutable field is a time bomb (below). A comparator that subtracts two ints (`return a.p - b.p`) overflows for priorities of opposite sign near the limits and silently breaks transitivity; use `Integer.compare`.

**Key extraction.** Push `(key(item), item)` and never compare items. This is what `sorted(key=…)` does; it costs one extra field per entry and avoids every comparison surprise. Floating-point keys need one more rule: reject NaN at push, because every comparison with NaN is false and a single NaN corrupts the order around it without raising anything.

## Stability: watching ties drift

A heap is **not stable**. Push five jobs `A` to `E`, all at priority 1, into `heapq` and pop five times. Pushes never swap (the new element is never strictly less than its parent), so the array is `[A, B, C, D, E]`. Pops use CPython's sift, which moves the hole to a leaf and, on a tie between children, takes the *right* one:

| Pop | Array before | What the sift does | Array after | Returned |
|---|---|---|---|---|
| 1 | `[A, B, C, D, E]` | E leaves the end; children B, C tie, C moves up; index 2 is now a leaf, E lands there | `[C, B, E, D]` | A |
| 2 | `[C, B, E, D]` | D leaves the end; children B, E tie, E moves up; D lands at index 2 | `[E, B, D]` | C |
| 3 | `[E, B, D]` | D leaves the end; only child B moves up; D lands at index 1 | `[B, D]` | E |
| 4 | `[B, D]` | D moves to the root | `[D]` | B |
| 5 | `[D]` | | `[]` | D |

The output order is A, C, E, B, D. Nothing is wrong with the heap: every pop returned a minimum. But if those were jobs in a queue and the business expected FIFO within a priority, job B, submitted second, ran fourth, and with a thousand equal-priority jobs the drift is large enough that someone files a bug titled "old jobs starve". With three jobs the same experiment happens to come out in order, which is why unit tests do not catch it.

The fix is the sequence counter: `(priority, seq)` is unique and monotonically increasing, so equal priorities pop in push order. It costs one integer per entry. Every serious job scheduler does this, and the interview question "how would you make this FIFO among equal priorities?" is answered in one sentence.

For a **max**-heap with FIFO ties, the sequence number must be *negated* (or compared in reverse), because the max-heap pops the largest tuple and a larger `seq` means *later*. Python's `heapq.nlargest` does exactly this internally, which is why its output is stable and the raw heap's is not.

## Mutating a priority inside the heap

This is the production bug. An object is pushed with priority 5. Later, code sets `obj.priority = 1` while it is still in the heap. The heap's array is no longer a valid heap (the object should have sifted up), but nothing re-checks; the next pop returns the wrong element, and the corruption compounds with every operation after that. Comparators that read live fields make this possible; tuples with copied priorities make it impossible, at the cost that the stale entry has the old priority.

The correct options, covered in [indexed heaps and decrease-key](/learn/data-structures/heaps/indexed-heaps-and-decrease-key), are: push a fresh entry and lazily discard the stale one on pop, or use an indexed heap that can re-sift the moved element (`heap.Fix` in Go, `peek_mut` in Rust for the top only). The wrong option is to mutate and hope.

## Workload 1: scheduling

"Run the highest-priority ready task" is the priority queue's home turf. The interview version is **shortest-job-first**: tasks arrive over time, each with a duration; whenever the CPU is free, run the shortest task that has arrived. That is a heap keyed by duration, fed from a list sorted by arrival, and the exercise below asks you to write it.

### Shortest-job-first, traced

Tasks as `[arrival, duration]`: task 0 = [0, 5], task 1 = [1, 2], task 2 = [2, 1], task 3 = [3, 3]. Heap entries are `(duration, arrival, index)`.

| Clock | Arrived and pushed | Heap (sorted view) | Pop and run | Clock after |
|---|---|---|---|---|
| 0 | task 0 | `[(5, 0, 0)]` | task 0 for 5 | 5 |
| 5 | tasks 1, 2, 3 (all arrived by 5) | `[(1, 2, 2), (2, 1, 1), (3, 3, 3)]` | task 2 for 1 | 6 |
| 6 | none | `[(2, 1, 1), (3, 3, 3)]` | task 1 for 2 | 8 |
| 8 | none | `[(3, 3, 3)]` | task 3 for 3 | 11 |

Order 0, 2, 1, 3. The subtlety is the idle gap: if the heap is empty and tasks remain, the clock must jump to the next arrival rather than busy-wait or, worse, pop from an empty heap. The second subtlety is that "shortest first" is the scheduling policy that minimises mean waiting time and also the one that **starves** long tasks under continuous load.

### Starvation and aging

A pure priority queue never runs a low-priority item while higher ones keep arriving. On a job queue that is fed faster than it drains, priority-3 jobs wait forever, and the symptom is a p99 job latency that grows without bound while p50 looks fine. The classic fix is **aging**: the effective priority improves with time waited, for example `effective = base − waited / T`, so a job of base 3 that has waited 3T outranks a fresh job of base 1. Because a heap cannot update keys in place, implement aging by computing the effective key at *push* time as `base·T + enqueue_time` (a lower value pops first): a job's rank is fixed at enqueue and every job eventually reaches the front, because arrivals push ever-larger enqueue times. Linux's CFS solved the same problem differently: rather than strict priorities it kept runnable tasks in a red-black tree keyed by weighted virtual runtime, so the task that had received the least CPU time relative to its weight ran next, and nothing starved. EEVDF, its replacement since 6.6, keeps the tree but orders it by virtual deadline and runs the eligible task whose deadline is earliest.

### What real schedulers chose

- **Timers.** Every event loop keeps pending timers keyed by deadline and pops the earliest to learn how long it may sleep. Node's libuv and Python's asyncio use heaps; Go uses a 4-ary heap per processor; Tokio and Kafka use hierarchical timing wheels. The "Under the hood" section below says why they differ.
- **CPU scheduling.** Linux's CFS (and its EEVDF successor since 6.6) uses a red-black tree with a cached leftmost node, because it must *remove arbitrary tasks* when they block, O(log n) in a tree and O(n) in a plain heap. This is the canonical example of "a heap is the wrong structure when you delete by key".
- **Job queues.** Sidekiq, Celery and cloud task queues keep queued and scheduled work in the broker, not in an in-process heap, because the queue must survive the process: Sidekiq's scheduled jobs sit in a Redis sorted set (a skip list plus a hash), and Celery's Redis transport emulates priorities with one list per priority level. The in-memory heap is right for work that dies with the process.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min",
 "operations": [["push", 5], ["push", 2], ["push", 1], ["pop"], ["push", 3], ["pop"], ["pop"], ["pop"]],
 "title": "A scheduler's inner loop", "caption": "Arrivals are pushes keyed by duration; each pop is the next task to run. Ties between equal durations are resolved by whatever the sift happens to do unless you add a tiebreaker."}
```

## Workload 2: discrete-event simulation

A simulation of a queueing system, a network, a game, or a market advances time by jumping to the *next scheduled event*, not by ticking a clock. The event list is a min-heap keyed by timestamp; the loop pops an event, advances the clock to its time, handles it, and pushes any events it causes.

Trace a single server with service time 1.5 and customers arriving at t = 0, 1, 2. Entries are `(time, seq, kind, customer)`; the table shows the heap after handling each event:

| Clock | Event popped | Effect | Heap after (time, kind, customer) | Waiting line |
|---|---|---|---|---|
| 0 | arrive 0 | server idle, start 0, schedule its departure at 1.5 | `(1, arrive, 1)`, `(1.5, depart, 0)`, `(2, arrive, 2)` | |
| 1 | arrive 1 | server busy, join the line | `(1.5, depart, 0)`, `(2, arrive, 2)` | 1 |
| 1.5 | depart 0 | take 1 from the line (waited 0.5), departure at 3.0 | `(2, arrive, 2)`, `(3.0, depart, 1)` | |
| 2 | arrive 2 | busy, join the line | `(3.0, depart, 1)` | 2 |
| 3.0 | depart 1 | take 2 (waited 1.0), departure at 4.5 | `(4.5, depart, 2)` | |
| 4.5 | depart 2 | line empty, server idle | | |

Mean wait (0 + 0.5 + 1.0)/3 ≈ 0.5. Ten million events run in seconds because each is O(log n) and the heap holds only *pending* events, not the whole timeline. The two classic bugs: pushing an event with a timestamp in the past (breaks causality, and the heap will happily pop it next), and comparing floating-point timestamps that tie (a `(time, seq)` key removes both the comparison crash and the non-determinism, which matters when a simulation must be reproducible from a seed). SimPy runs exactly this loop on a `heapq` of `(time, priority, id, event)` entries; ns-3 runs it on a `std::map` by default, with a heap-based scheduler as an option.

## Workload 3: graph search

Dijkstra's algorithm pops the unvisited vertex with the smallest tentative distance, which is a priority queue keyed by distance, with the twist that a vertex's distance can *decrease* after it is pushed. The standard answer is to push a duplicate and skip stale entries on pop. On the graph A→B (1), A→C (4), B→C (2), B→D (5), C→D (1):

| Pop | Relaxations | Heap after (distance, vertex) | Note |
|---|---|---|---|
| (0, A) | B = 1, C = 4 | `(1, B)`, `(4, C)` | |
| (1, B) | C = 3 (better than 4), D = 6 | `(3, C)`, `(4, C)`, `(6, D)` | `(4, C)` is now stale |
| (3, C) | D = 4 (better than 6) | `(4, C)`, `(4, D)`, `(6, D)` | `(6, D)` is now stale |
| (4, C) | skipped, C already final | `(4, D)`, `(6, D)` | |
| (4, D) | nothing to relax | `(6, D)` | |
| (6, D) | skipped | | |

Six pushes and two stale pops for four vertices. The heap size is bounded by the number of relaxations, O(E), not O(V); the [Dijkstra lesson](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) covers the algorithm and the [decrease-key lesson](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) the alternatives. A* and best-first search are the same loop with a different key. Huffman coding pops the two lightest trees and pushes their merge, `n − 1` times.

## Under the hood: timers, wheels, locks and brokers

### Runtime timer queues

Python's asyncio keeps its timers in `loop._scheduled`, a `heapq` list of `TimerHandle` objects ordered by deadline. Cancelling a timer does not remove it: the handle is flagged and a counter of cancelled handles is kept; when more than 100 handles are scheduled and over half of them are cancelled, the loop rebuilds the heap without them in one O(n) pass. That is lazy deletion with a garbage threshold, in the standard library, and the two constants are the honest answer to "how much dead weight is acceptable".

libuv (Node) keeps timers in a binary heap implemented with left/right/parent *pointers* rather than an array, with the heap node embedded in each `uv_timer_t`, so `uv_timer_stop` removes a timer in O(log n) by following pointers from the node itself: an intrusive, indexed heap. Java's `ScheduledThreadPoolExecutor` does the array version: each task stores its own `heapIndex`, which makes removal O(log n) instead of O(n). A cancelled task is removed at once only after `setRemoveOnCancelPolicy(true)`; the default leaves it in the queue until its delay elapses.

Go keeps timers in a 4-ary heap per processor (since Go 1.14; the timer implementation was reworked again in 1.23 but is still heap-based) and flags deleted timers for lazy removal. Tokio chose a **hierarchical timing wheel**: six levels of 64 slots each at 1 ms resolution, covering about two years, where insert and cancel are O(1) array operations and the price is that a far-off timer's precision is coarser until it migrates to a lower level. Kafka's request purgatory made the same choice, replacing a `DelayQueue`, on the observation that in a healthy cluster most requests complete before their timeout. Linux uses both designs: high-resolution timers live in a red-black tree, coarse timeouts in a multi-level wheel, on the kernel documentation's reasoning that most timeouts never expire because the expected event arrives in time (a TCP retransmit timer cancelled by the ACK).

The rule the four choices share: a heap is exact and O(log n) per operation; a wheel is approximate and O(1); pick the wheel when cancellations dominate and millisecond precision is enough, the heap when every deadline must fire in exact order.

### Thread safety

None of the standard heaps are safe for concurrent push and pop. Java's `PriorityBlockingQueue` wraps the same array in a single `ReentrantLock` plus a `notEmpty` condition; Python's `queue.PriorityQueue` wraps `heapq` in a mutex with `not_empty`/`not_full` conditions. Under contention every operation serialises on that lock, so throughput is bounded by roughly one operation per lock hand-off, on the order of a few million per second per queue regardless of core count. Lock-free priority queues exist (skip-list based) and are rare in application code; the usual production answer is one queue per worker with work stealing.

### Persistence

An in-process heap dies with the process. Sidekiq's scheduled and retry sets are Redis sorted sets keyed by the run-at timestamp; `ZADD` is O(log n) into a skip list, a by-score range query (`ZRANGE … BYSCORE`, which superseded `ZRANGEBYSCORE` in Redis 6.2) fetches what is due, and the structure survives restarts and is shared by every worker. The cost is a network round trip (tens of microseconds on a local network, versus the tens of nanoseconds of a local `heappush`), which is why a runtime's own timers never go through a broker.

## Performance realities

- Measured on CPython 3.14 with the C-accelerated `heapq`: `heappush` of a `(float, int, str)` tuple averages about 0.06 µs and `heappop` about 0.4 µs at heap sizes up to 100,000. Your numbers depend on the CPU and on how expensive the element comparison is.
- The anti-pattern "append then `sort()`" measured 41 µs per insert at 10,000 elements, about 700 times slower than `heappush`, and it grows linearly with the queue length even though Timsort handles nearly-sorted input in O(n). `list.sort()` after every `append` is a recognisable code-review smell.
- If you have all the items up front and need them *all* in order, sort. Heap sort and `n` pops are both O(n log n) but `sort()` is faster and stable. The heap wins when items arrive interleaved with extractions, or when you need only the first `k`.
- Tuple entries allocate a tuple per push (72 bytes for a 3-tuple on CPython 3.14, before the fields). A heap of plain ints measured 0.23 µs per push-plus-pop against about 0.45 µs for tuples. In Rust or Go the heap is allocation-free.

## Trade-offs: what to hold your priorities in

| Structure | insert | pop-min | cancel by id | ordered iteration | precision | survives restart |
|---|---|---|---|---|---|---|
| Binary heap (array) | O(log n) | O(log n) | O(n), or O(log n) with an index | no | exact | no |
| Indexed heap (libuv, `ScheduledThreadPoolExecutor`) | O(log n) | O(log n) | O(log n) | no | exact | no |
| Red-black tree (CFS, Java `TreeMap`) | O(log n) | O(log n), O(1) with cached leftmost | O(log n) | yes | exact | no |
| Timing wheel (Tokio, Kafka, Linux timeouts) | O(1) | O(1) amortised | O(1) | no | slot granularity | no |
| Skip list in Redis (`ZSET`) | O(log n) plus a round trip | O(log n) plus a round trip | O(log n) | yes | exact | yes |

## Production failure modes

**Low-priority jobs never run.** Symptom: p50 queue latency is fine, p99 grows without bound, and the stuck jobs all share the lowest priority. Diagnosis: arrival rate of higher-priority work exceeds the drain rate, so a strict priority queue starves the tail; confirm by plotting wait time by priority. Fix: aging (encode enqueue time into the key), or separate queues with weighted fair pulling.

**`TypeError: '<' not supported between instances of 'dict' and 'dict'`.** Symptom: a Python worker crashes only when two entries have equal priority, so it passes every test with distinct priorities. Diagnosis: `(priority, payload)` tuples compare the payload on ties. Fix: `(priority, seq, payload)`.

**The wrong task runs after a "bump priority" feature ships.** Symptom: an urgent task sits behind routine ones; no error. Diagnosis: the priority field was mutated in place while the entry was in the heap, so the array is no longer a heap; assert the parent–child invariant after each operation in a staging build and it fails at the first bump. Fix: push a fresh entry and skip the stale one on pop, or an indexed heap with `Fix`.

**A simulation produces impossible states.** Symptom: an order is filled before it was placed; results differ between runs with the same seed. Diagnosis: an event was pushed with a timestamp earlier than the clock, or equal timestamps tie-broke on memory addresses. Fix: assert `t >= clock` at push and key on `(t, seq)`.

**Memory grows in a timer-heavy service.** Symptom: heap size climbs although few timers ever fire. Diagnosis: cancelled timers are marked but never removed; asyncio's 50% threshold exists precisely to bound this, and a hand-written lazy heap without a threshold does not. Fix: compact when the dead fraction crosses a threshold, or switch to a timing wheel.

**Corrupted queue under load.** Symptom: `NullPointerException` inside `PriorityQueue.siftDown`, or elements that vanish, only in production. Diagnosis: two threads push and pop the same unsynchronised heap. Fix: `PriorityBlockingQueue`, `queue.PriorityQueue`, or a queue per thread.

## Interviewer follow-ups

**"Jobs at the same priority must run in submission order. How?"** Model answer: a monotonically increasing sequence number as the second key, negated for a max-heap; one integer per entry. Common wrong answer: "heaps are FIFO among equal keys", which the trace above disproves.

**"Millions of timeouts, almost all cancelled before they fire. Heap or something else?"** Model answer: a hierarchical timing wheel, because insert and cancel are O(1) and the ordering only needs slot precision; a heap pays O(log n) per cancel or carries the dead entries. Common wrong answer: "a heap, since timers need to fire in order", which ignores that a wheel also fires in order at its granularity.

**"How does a scheduler avoid starving low-priority work?"** Model answer: aging, encoded into the key at enqueue time so it never needs an in-place update; or a fair-share design like CFS keyed by consumed time. Common wrong answer: "periodically walk the heap and decrease priorities", which is O(n) and mutates keys in place.

**"Why does Sidekiq keep scheduled jobs in Redis rather than a heap in the worker?"** Model answer: the queue must survive process death and be visible to every worker; a sorted set gives O(log n) insert and a range query for everything due, at the cost of a network round trip. Common wrong answer: "Redis is faster than an in-memory heap".

**"Dijkstra decreases a vertex's distance after it is already in the heap. What happens to the old entry?"** Model answer: it stays; the new smaller entry pops first, and the old one is recognised as stale and skipped, bounding the heap at O(E) entries. Common wrong answer: "the heap updates it in place", which no standard library heap can do in O(log n).

## What mid-level engineers get wrong

- **Assuming the default direction.** C++ and Rust give you a max-heap; the scheduler quietly runs the least urgent task first.
- **Iterating a `PriorityQueue` and expecting sorted order.** The iterator walks the array; only the head is ordered.
- **Sorting the list on every insert.** O(n) per operation hidden inside a loop; measured 700× slower than a push at 10,000 elements.
- **Using a `PriorityQueue` from two threads** because it "worked in dev" with one.
- **Putting mutable objects in the heap and updating their priority fields.** Silent corruption that appears as a scheduling bug three services away.
- **Keeping cancelled timers forever** in a hand-rolled lazy heap with no compaction threshold.
- **Subtracting ints in a comparator.** Overflow breaks transitivity and the heap invariant with it.

## Exercises

```exercise
id: stable-priority-queue
title: A stable priority queue
prompt: |
  Implement `StablePQ` with `push(item, priority)` and `pop()`. `pop` returns
  the item with the **smallest** priority; among equal priorities, the one
  pushed **first**. Return `None`/`null` when empty.

  Build it on a binary heap (write the sift operations, or use `heapq` in
  Python) with a sequence counter as the tiebreaker. Items are strings and
  must never be compared with each other.
languages: [python, javascript]
entry: StablePQ
starter:
  python: |
    import heapq

    class StablePQ:
        def __init__(self):
            self.h = []
            self.seq = 0

        def push(self, item, priority):
            pass

        def pop(self):
            return None
  javascript: |
    class StablePQ {
      constructor() { this.h = []; this.seq = 0; }
      // entries: [priority, seq, item]
      less(i, j) {
        const a = this.h[i], b = this.h[j];
        return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
      }
      push(item, priority) {
      }
      pop() {
        return null;
      }
    }
tests:
  - args: [["push", "a", 2], ["push", "b", 1], ["push", "c", 1], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, null, "b", "c", "a"]
  - args: [["pop"]]
    expected: [null]
    label: empty
  - args: [["push", "x", 5], ["push", "y", 5], ["push", "z", 5], ["pop"], ["push", "w", 5], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, null, "x", null, "y", "z", "w"]
    label: FIFO among equal priorities across interleaved pops
  - args: [["push", "low", 10], ["push", "high", -3], ["pop"], ["push", "mid", 0], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, "high", null, "mid", "low", null]
  - args: [["push", "a", 1], ["push", "b", 0], ["push", "c", 1], ["push", "d", 0], ["pop"], ["pop"], ["pop"], ["pop"]]
    expected: [null, null, null, null, "b", "d", "a", "c"]
    hidden: true
hints:
  - "Push (priority, seq, item) and increment seq each time; the tuple order makes seq the tiebreaker and keeps item out of comparisons."
  - "In JavaScript, use the provided less(i, j) inside sift-up and sift-down instead of comparing raw entries."
```

```exercise
id: shortest-job-first
title: Shortest-job-first scheduling order
prompt: |
  `tasks[i] = [arrival, duration]`. A single CPU runs tasks non-preemptively.
  Whenever the CPU is free, it starts the task with the **shortest duration**
  among those that have already arrived (arrival <= current time); ties go
  to the earlier arrival, then the lower index. If no task has arrived, the
  clock jumps to the next arrival. Return the list of task indices in the
  order they run.

  Sort by arrival, then use a min-heap keyed by (duration, arrival, index).
languages: [python, javascript]
entry: sjf_order
starter:
  python: |
    import heapq

    def sjf_order(tasks):
        order = []
        return order
  javascript: |
    function sjf_order(tasks) {
      // you will need a small heap; write push/pop over an array of [duration, arrival, index]
      const order = [];
      return order;
    }
tests:
  - args: [[[0, 5], [1, 2], [2, 1], [3, 3]]]
    expected: [0, 2, 1, 3]
  - args: [[[0, 3], [5, 1], [6, 1]]]
    expected: [0, 1, 2]
    label: idle gap, clock must jump
  - args: [[[0, 2], [0, 2], [0, 1]]]
    expected: [2, 0, 1]
    label: ties by index
  - args: [[]]
    expected: []
    label: no tasks
  - args: [[[0, 4], [1, 1], [1, 1]]]
    expected: [0, 1, 2]
  - args: [[[2, 3], [0, 5], [1, 1]]]
    expected: [1, 2, 0]
    hidden: true
    label: first task is not index 0
  - args: [[[0, 10], [2, 2], [3, 2], [4, 1]]]
    expected: [0, 3, 1, 2]
    hidden: true
hints:
  - "Sort indices by (arrival, index). Keep a pointer into that sorted list; while the next task has arrived, push it onto the heap."
  - "If the heap is empty and tasks remain, set time = arrival of the next task. Otherwise pop, append its index, and add its duration to the time."
```

## Senior signals

- You know whether your language's priority queue is **min or max** by default and you write the direction in a comment.
- You push `(priority, seq, item)` by reflex, and you can show with a five-element trace why a plain heap reorders equal priorities.
- You never mutate a priority while the item is in the heap, and you know the two correct alternatives.
- You can name a production system that chose a red-black tree (CFS), a timing wheel (Tokio, Kafka, Linux timeouts), an indexed heap (libuv, `ScheduledThreadPoolExecutor`) or a skip list (Redis) over a plain heap, and say what property forced the choice.
- You know asyncio's cancelled-timer threshold exists because lazy deletion needs a garbage bound, and you would put one in your own.
- You recognise "sort after every insert" in a code review as an O(n) per operation smell and can quote the measured gap.
- You know starvation is a property of strict priority scheduling and that aging is encoded into the key, not applied by mutation.
- You know when to sort instead: all items up front, all needed in order.

## Check yourself

```quiz
- q: >-
    In Python you push (priority, task) tuples where task is a dict. Everything works until two tasks share a priority, then you get TypeError. Why, and what is the fix?
  options: ["Ties fall through to comparing dicts; put a counter before them", "Heap priorities must be unique; add a small random jitter to each", "heapq accepts only numbers; push id(task) instead of the dict", "Dicts are unhashable, which heapq forbids; wrap each in a class"]
  answer: 0
  explanation: >-
    Tuple comparison is lexicographic and only stops at the first differing element, so on a priority tie Python compares the dicts, which is unsupported. A monotonically increasing counter in position two guarantees a difference before the payload is reached and gives FIFO order among ties as a bonus. heapq never hashes anything, and priorities may repeat freely.
- q: >-
    A max-heap job queue uses (priority, seq) tuples with seq increasing. Among equal priorities, which job pops first?
  options: ["The earliest pushed, since seq keeps FIFO order", "The latest pushed, since its larger seq wins", "Any of them, since heaps are not stable", "The one nearest the root, whatever its seq"]
  answer: 1
  explanation: >-
    A max-heap pops the largest tuple; with equal priorities the larger seq, the most recent push, wins. The seq makes every tuple unique, so the order is deterministic, but it is LIFO, not FIFO. For FIFO in a max-heap, negate the sequence number.
- q: >-
    Why does Linux's CFS scheduler keep runnable tasks in a red-black tree rather than a binary heap?
  options: ["Heaps need a fixed maximum size, set when they are created", "Red-black trees find the minimum faster than a heap's root", "Blocked tasks leave mid-queue, which heaps delete poorly", "Heaps cannot hold structs, only plain integer priorities"]
  answer: 2
  explanation: >-
    Tasks are removed from the middle when they block. Both structures give O(log n) insert and extract-min (and a heap's minimum is O(1) at the root), but the tree also gives O(log n) delete-by-node and ordered iteration. A heap needs an auxiliary index map to delete by identity.
- q: >-
    A service schedules millions of request timeouts per minute and cancels almost all of them when the response arrives. Tokio and Kafka both chose a hierarchical timing wheel over a heap for this because:
  options: ["A wheel needs no memory per timer, only per slot", "Heaps cannot hold more than a few million entries at once", "Insert and cancel are O(1) and slot precision is enough", "A wheel fires timers in exact deadline order, a heap does not"]
  answer: 2
  explanation: >-
    With cancellations dominating, the O(log n) cost of heap operations and the dead entries left by lazy deletion both hurt; a wheel makes both O(1) array operations at the price of coarser precision for far-off timers. A heap is the more exact structure, not the less exact one, and both hold one entry per timer.
- q: >-
    A strict priority job queue shows healthy p50 latency but a p99 that grows without bound. The likely cause and the fix are:
  options: ["Heap corruption from ties; add a sequence number to the key", "Starvation of low priorities; encode enqueue time into the key", "Cache misses at the heap's bottom levels; switch to a 4-ary heap", "Lock contention on pop; shard the queue across workers"]
  answer: 1
  explanation: >-
    When high-priority work arrives faster than the queue drains, the lowest priorities never reach the root and their wait grows forever, which shows up only in the tail. Aging fixes it by making the key improve with time waited, computed at enqueue so no in-place update is needed. Ties, cache misses and lock contention affect throughput or determinism, not an unbounded tail for one priority class.
- q: >-
    You receive a batch of 100,000 records and must output all of them sorted by score. The best choice is:
  options: ["Push each into a heap and pop 100,000 times", "Heapify in O(n), then pop 100,000 times", "Insert into a balanced BST and traverse inorder", "Sort the batch once with the built-in sort"]
  answer: 3
  explanation: >-
    When everything is available up front and everything is needed in order, sort() is O(n log n) with better constants, stability and cache behaviour. Heapify is O(n) but the 100,000 pops are still O(n log n) with worse constants. Heaps earn their keep when insertions interleave with extractions or when only the first k are needed.
```
