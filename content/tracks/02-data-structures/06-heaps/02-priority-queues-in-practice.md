---
slug: priority-queues-in-practice
title: "Priority queues in practice: APIs, stability and schedulers"
description: What the standard libraries actually give you, how to make a heap stable and comparable for arbitrary objects, and the three production workloads that are a priority queue in disguise.
minutes: 35
difficulty: medium
tags: [heaps, priority-queue, scheduling, event-simulation, stability, heapq]
problems: [task-scheduler, design-twitter, reorganize-string]
---
A binary heap is a data structure; a priority queue is an interface: `push(item, priority)` and `pop()` the item with the best priority. The distinction matters because production code almost never calls sift-down directly. It calls `heapq.heappush`, `PriorityQueue.poll()`, `BinaryHeap::push`, or a timer API that hides a heap entirely, and the bugs come from the gap between the interface you think you are using and the one the library gives you: a max-heap when you wanted min, an unstable order when you assumed FIFO, a comparison error when two priorities tie and the payloads are not comparable, or a priority mutated while the item sits in the heap.

## What the standard libraries actually ship

| Language | API | Min or max | Custom priority | Notes |
|---|---|---|---|---|
| Python | `heapq` module: functions over a plain `list` | Min | Push tuples `(priority, item)` or wrap in a class with `__lt__` | No class; `heapify` is O(n); `nsmallest`/`nlargest` for top-k; `merge` for k-way merge |
| Java | `java.util.PriorityQueue<E>` | Min | `Comparator` in the constructor | `poll` / `peek` / `offer`; not thread-safe; `PriorityBlockingQueue` for producers and consumers |
| C++ | `std::priority_queue<T>` | **Max** | Comparator template parameter, `std::greater<T>` for min | Adapter over `vector` with `push_heap`/`pop_heap`; `std::make_heap` is O(n) |
| Rust | `std::collections::BinaryHeap<T>` | **Max** | Wrap in `Reverse<T>` for min, or implement `Ord` | `into_sorted_vec`; `peek_mut` lets you modify the top and re-sift |
| Go | `container/heap` package | Whatever your `Less` says | Implement `heap.Interface` (5 methods) on your slice | Verbose but zero-allocation; `heap.Fix(i)` reorders after a priority change |
| JavaScript | **None** | — | — | Write ~40 lines or take a dependency; `Array.prototype.sort` per operation is O(n log n) each and a common accidental O(n² log n) |

Two of the six default to a **max**-heap. Getting this wrong is silent: the code runs, the tests with one element pass, and the scheduler picks the *least* urgent task in production. Read the docs for the language you are in and write the direction in a comment.

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

**Comparators.** Java, C++, Rust and Go take a comparison function or trait. The rule is that it must be a *strict weak ordering*: `a < b` and `b < a` cannot both be true, and it must be transitive. A comparator that reads a mutable field is a time bomb (below).

**Key extraction.** Push `(key(item), item)` and never compare items. This is what `sorted(key=…)` does; it costs one extra field per entry and avoids every comparison surprise.

## Stability, or why ties break "randomly"

A heap is **not stable**. Push `A`, `B`, `C` all with priority 1 and pop three times: you might get `A`, `C`, `B`. Sift operations swap elements across the array with no regard to insertion order, and the order you observe depends on the sequence of pushes and pops in between. If your job queue has a thousand jobs at the same priority and the business expects FIFO within a priority, an unstable heap will reorder them and someone will file a bug titled "old jobs starve".

The fix is the sequence counter above: `(priority, seq)` is unique and monotonically increasing, so equal priorities pop in push order. It costs one integer per entry. Every serious job scheduler does this, and the interview question "how would you make this FIFO among equal priorities?" is answered in one sentence.

A related subtlety: for a **max**-heap with FIFO ties, the sequence number must be *negated* (or compared in reverse), because the max-heap pops the largest tuple and a larger `seq` means *later*.

## Mutating a priority inside the heap

This is the production bug. An object is pushed with priority 5. Later, code sets `obj.priority = 1` while it is still in the heap. The heap's array is no longer a valid heap (the object should have sifted up), but nothing re-checks; the next pop returns the wrong element, and the corruption compounds with every operation after that. Comparators that read live fields make this possible; tuples with copied priorities make it impossible, at the cost that the stale entry has the old priority.

The correct options, covered in [indexed heaps and decrease-key](/learn/data-structures/heaps/indexed-heaps-and-decrease-key), are: push a fresh entry and lazily discard the stale one on pop, or use an indexed heap that can re-sift the moved element (`heap.Fix` in Go, `peek_mut` in Rust for the top only). The wrong option is to mutate and hope.

## Workload 1: scheduling

"Run the highest-priority ready task" is the priority queue's home turf, and the choices real schedulers make are instructive.

- **Timers.** Every event loop keeps pending timers in a min-heap keyed by deadline: libuv (Node) uses a binary heap, Go's runtime uses a 4-ary heap per processor, and popping the earliest deadline tells the loop how long it may sleep. Cancelling a timer is the awkward case: a heap cannot delete by identity cheaply, so libuv and Go both keep an index and re-sift, and Tokio uses a **hierarchical timing wheel** instead, trading O(log n) exactness for O(1) insert and cancel at millisecond granularity, which is the right trade for a runtime with millions of timeouts.
- **CPU scheduling.** Linux's CFS keeps runnable tasks in a red-black tree keyed by virtual runtime rather than a heap, because it needs to *remove arbitrary tasks* (when they block) and to find the leftmost node repeatedly, both O(log n) in a tree and awkward in a heap. This is the canonical example of "a heap is the wrong structure when you delete by key".
- **Job queues.** Sidekiq, Celery and cloud task queues keep priority in the broker (Redis sorted sets, which are skip lists), not in an in-process heap, because the queue must survive the process. The in-memory heap is right for work that dies with the process.

The interview version is **shortest-job-first**: tasks arrive over time, each with a duration; at every decision point run the shortest task that has arrived. That is a heap keyed by duration, fed from a list sorted by arrival, and the exercise below asks you to write it. The subtlety is the idle gap: if nothing has arrived, the clock must jump forward to the next arrival rather than busy-wait.

```viz
{"type": "heap", "algorithm": "push-pop", "kind": "min",
 "operations": [["push", 5], ["push", 2], ["push", 1], ["pop"], ["push", 3], ["pop"], ["pop"], ["pop"]],
 "title": "A scheduler's inner loop", "caption": "Arrivals are pushes keyed by duration; each pop is the next task to run. Ties between equal durations are resolved by whatever the sift happens to do unless you add a tiebreaker."}
```

## Workload 2: discrete-event simulation

A simulation of a queueing system, a network, a game, or a market advances time by jumping to the *next scheduled event*, not by ticking a clock. The event list is a min-heap keyed by timestamp; the loop pops an event, advances the clock to its time, handles it, and pushes any events it causes. Ten million events run in seconds because each is O(log n). The two classic bugs: pushing an event with a timestamp in the past (breaks causality, and the heap will happily pop it next), and comparing floating-point timestamps that tie (add the sequence number). SimPy, ns-3 and every game engine's timer system are this loop.

## Workload 3: graph search

Dijkstra's algorithm pops the unvisited vertex with the smallest tentative distance, which is a priority queue keyed by distance, with the twist that a vertex's distance can *decrease* after it is pushed. The standard answer is to push a duplicate and skip stale entries on pop; the [Dijkstra lesson](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) covers the mechanics and the [decrease-key lesson](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) covers the alternatives. A* and best-first search are the same loop with a different key. Huffman coding pops the two lightest trees and pushes their merge, `n − 1` times.

## Performance realities

- A heap operation on a million-element heap is about 20 levels, each a compare and a possible swap on contiguous memory: on the order of 100 ns. Sorting a list of a million items on every insert instead is on the order of 100 ms. People do this; `list.sort()` after every `append` is a recognisable anti-pattern in code review.
- If you have all the items up front and need them *all* in order, sort. Heap sort and `n` pops are both O(n log n) but `sort()` is faster and stable. The heap wins when items arrive interleaved with extractions, or when you need only the first `k`.
- Python's `heapq` with tuple entries allocates a tuple per push. For a hot loop in the millions per second, that allocation is measurable; the array-of-ints heap in the previous lesson is faster if your priorities are plain numbers. In Rust or Go the heap is allocation-free.
- Thread safety: none of the standard heaps are safe for concurrent push and pop. Java's `PriorityBlockingQueue` wraps one in a lock; Python's `queue.PriorityQueue` does the same. Lock-free priority queues exist (skip-list based) and are rare in application code.

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
- You push `(priority, seq, item)` by reflex, and you can explain in one sentence why it fixes both the tie-comparison crash and stability.
- You never mutate a priority while the item is in the heap, and you know the two correct alternatives.
- You can name a production system that chose a red-black tree (CFS), a timing wheel (Tokio) or a skip list (Redis) over a heap, and say what property forced the choice.
- You recognise "sort after every insert" in a code review as an O(n² log n) smell and reach for a heap.
- You know when to sort instead: all items up front, all needed in order.

## Check yourself

```quiz
- q: >-
    In Python you push (priority, task) tuples where task is a dict. Everything works until two tasks share a priority, then you get TypeError. Why, and what is the fix?
  options: ["Dicts cannot be stored in lists; use a class", "On a priority tie, tuple comparison falls through to comparing the dicts, which is unsupported; insert a unique sequence number between them", "heapq only supports integers", "Priorities must be unique in a heap"]
  answer: 1
  explanation: >-
    Tuple comparison is lexicographic and only stops at the first differing element. A monotonically increasing counter in position two guarantees a difference before the payload is reached and gives FIFO order among ties as a bonus.
- q: >-
    A max-heap job queue uses (priority, seq) tuples with seq increasing. Among equal priorities, which job pops first?
  options: ["The earliest pushed", "The latest pushed", "Random", "It alternates"]
  answer: 1
  explanation: >-
    A max-heap pops the largest tuple; with equal priorities the larger seq, the most recent push, wins. For FIFO in a max-heap, negate the sequence number.
- q: >-
    Why does Linux's CFS scheduler keep runnable tasks in a red-black tree rather than a binary heap?
  options: ["Heaps cannot store structs", "Tasks are removed from the middle when they block, and a heap cannot delete an arbitrary element efficiently without an index", "Red-black trees are faster at finding the minimum", "Heaps require a fixed maximum size"]
  answer: 1
  explanation: >-
    Both give O(log n) insert and extract-min, but the tree also gives O(log n) delete-by-node and ordered iteration. A heap needs an auxiliary index map to delete by identity.
- q: >-
    A discrete-event simulation occasionally pushes an event whose timestamp is earlier than the current clock. What happens?
  options: ["The heap rejects it", "It is popped next and handled, which silently violates causality and can produce impossible states", "It is placed at the end and handled last", "The simulation deadlocks"]
  answer: 1
  explanation: >-
    The heap has no notion of the current time; it orders purely by key. A past-dated event becomes the minimum and runs immediately. Assert that new events are not earlier than the clock.
- q: >-
    You receive a batch of 100,000 records and must output all of them sorted by score. The best choice is:
  options: ["Push each into a heap and pop 100,000 times", "Sort the batch once", "Insert into a balanced BST and traverse inorder", "Heapify, then pop 100,000 times"]
  answer: 1
  explanation: >-
    When everything is available up front and everything is needed in order, sort() is O(n log n) with better constants, stability and cache behaviour. Heaps earn their keep when insertions interleave with extractions or when only the first k are needed.
```
