---
lesson: priority-queues-in-practice
source: 527f6a1efcbbb2cf
fit: great
desk:
  - "The standard-library table: min or max, custom priority, build, delete, per language"
  - "The stable PQ class with a sequence counter, and the five-pop stability trace"
  - "The shortest-job-first trace and the discrete-event simulation trace"
  - "The Dijkstra trace with stale entries"
  - "The timer-structure trade-off table and the measured performance numbers"
  - "Exercises: a stable priority queue, and shortest-job-first scheduling order"
---
## Introduction

A binary heap is a data structure. A priority queue is an interface: push an item with a priority, and pop the item with the best one. The distinction matters because production code almost never calls sift-down directly. It calls heapq, or Java's PriorityQueue, or Rust's BinaryHeap, or a timer API that hides a heap entirely.

And the bugs come from the gap between the interface you think you are using and the one the library gives you. A max-heap when you wanted min. An unstable order when you assumed first in, first out. A crash when two priorities tie. Or a priority changed while the item sits in the heap.

Three parts. The traps in what libraries ship: direction, ties, stability and mutation. The three production workloads that are a priority queue in disguise. And what real runtimes chose for their timers, and why most of them did not choose a plain heap.

## What libraries actually give you

Python's heapq is functions over a plain list, and it is a min-heap. Java's PriorityQueue is min by default. Go's container heap is whatever your less function says. But C++'s priority queue and Rust's BinaryHeap are max-heaps by default. And JavaScript ships none at all.

Getting the direction wrong is silent. The code runs, the test with one element passes, and in production the scheduler picks the least urgent task first. Read the docs for the language you are in, and write the direction in a comment.

The other column to remember is deleting an arbitrary element. Java's remove by object is a linear search. Python has no such operation; removing from the list is linear too. Only Go makes it cheap, and only if you track each element's index yourself. That gap is what the module's last lesson is about.

## Ties, crashes and stability

The heap compares what you push, so it needs a total order on it. In Python the usual move is a tuple of priority and item. Tuples compare left to right, so the priority decides first. But on a tie, Python compares the items. If the item is a dictionary, or an object with no ordering, you get a type error, and only when two priorities happen to be equal. So it passes every test with distinct priorities and crashes in production.

The fix is a tiebreaker in the middle: priority, then a sequence counter, then the item. The counter is unique, so the comparison never reaches the item. And it fixes a second problem at the same time.

That second problem: a heap is not stable. Here is the lesson's experiment. Push five jobs, A, B, C, D and E, all at priority 1, into Python's heapq, and pop five times. Every pop returns a valid minimum, since they are all equal. But they come out A, C, E, B, D. Job B, submitted second, ran fourth. With a thousand equal-priority jobs, the drift is large enough that someone files a bug titled "old jobs starve". And with three jobs, the same experiment happens to come out in order, which is why unit tests do not catch it.

The sequence counter makes equal priorities pop in push order, for one integer per entry. Every serious job scheduler does this.

Now a question. In a max-heap, with priority and an increasing sequence number, which of two equal-priority jobs pops first?

[pause]

The later one. A max-heap pops the largest tuple, and the larger sequence number is the more recent push. So you get last in, first out. For first in, first out in a max-heap, negate the sequence number.

In other languages you pass a comparator, and it must be a consistent ordering: transitive, and never saying both a is less than b and b is less than a. A comparator that subtracts two integers overflows near the limits and silently breaks that. Use the library's compare function. And floating-point keys need one more rule: reject not-a-number at push, because every comparison with it is false, and one such value corrupts the order around it without raising anything.

## Never change a priority in place

This is the production bug. An object is pushed with priority 5. Later, some code sets its priority to 1 while it is still in the heap. The array is no longer a valid heap: that object should have sifted up. Nothing re-checks. The next pop returns the wrong element, and the corruption compounds with every operation after it. The symptom, after a "bump priority" feature ships, is an urgent task sitting behind routine ones, with no error anywhere.

Comparators that read live fields make this possible. Tuples with a copied priority make it impossible. The correct options are to push a fresh entry and skip the stale one when it pops, or to use an indexed heap that can re-sift the changed element, like Go's fix function. The wrong option is to mutate and hope.

## Three workloads in disguise

The first is scheduling. The interview version is shortest job first: tasks arrive over time, each with a duration, and whenever the CPU is free you run the shortest task that has arrived. A heap keyed by duration, fed from a list sorted by arrival. Two subtleties. If the heap is empty and tasks remain, jump the clock to the next arrival, rather than popping from an empty heap. And shortest-first minimises mean waiting time, but starves long tasks under continuous load.

Starvation is a property of strict priorities. On a queue fed faster than it drains, the lowest priority waits forever, and the symptom is a healthy median latency with a 99th percentile that grows without bound. The fix is aging: a job's effective priority improves with time waited. Because a heap cannot update keys in place, compute that at push time: base priority times a constant, plus the enqueue time, lowest first. Every job eventually reaches the front, because new arrivals bring ever-later enqueue times.

The second workload is discrete-event simulation. A simulated queue, network or market does not tick a clock; it jumps to the next scheduled event. The event list is a min-heap keyed by time. Pop an event, advance the clock to it, handle it, push whatever it causes. Ten million events run in seconds, because the heap only holds pending events. Two classic bugs: pushing an event earlier than the current clock, which breaks causality, and ties between equal timestamps, which break reproducibility. A key of time then sequence fixes both.

The third is graph search. Dijkstra's algorithm pops the unvisited vertex with the smallest tentative distance. The twist is that a distance can decrease after the vertex is pushed. The standard answer: push a duplicate with the new distance, and when the old entry eventually pops, recognise it as stale and skip it. The heap then holds up to one entry per relaxed edge, not one per vertex.

## What runtimes chose for timers

Every event loop keeps pending timers by deadline and pops the earliest to learn how long it may sleep. The choices differ, and the reasons are the lesson.

Python's asyncio uses a heapq list. Cancelling a timer does not remove it; it is flagged, and when more than 100 timers are scheduled and over half are cancelled, the loop rebuilds the heap without them in one linear pass. That is lazy deletion with a garbage threshold. A hand-written lazy heap without a threshold grows forever in a timer-heavy service.

Node's libuv keeps timers in a heap linked by pointers, with the heap node embedded in each timer, so stopping a timer removes it in log n: an indexed heap. Java's scheduled thread pool does the array version, each task storing its own heap index. Go uses a 4-ary heap per processor.

Tokio and Kafka chose something else: a hierarchical timing wheel. Tokio's has six levels of 64 slots at one-millisecond resolution, covering about two years. Insert and cancel are constant-time array operations. The price is coarser precision for far-off timers. Kafka made that switch because in a healthy cluster most requests complete before their timeout. Linux uses both: a red-black tree for high-resolution timers, and a wheel for coarse timeouts, because most timeouts never fire.

The shared rule: a heap is exact and log n per operation; a wheel is approximate and constant time. Pick the wheel when cancellations dominate and slot precision is enough.

And CPU scheduling? Linux keeps runnable tasks in a red-black tree, not a heap, because a task that blocks must be removed from the middle. That is log n in a tree and linear in a plain heap. It is the canonical example of a heap being the wrong structure once you delete by key.

Two more realities. None of the standard heaps are safe for concurrent push and pop; the blocking variants put the whole array behind one lock, so throughput is bounded by lock hand-offs, on the order of a few million operations a second, whatever the core count. And an in-process heap dies with the process. Sidekiq keeps scheduled jobs in a Redis sorted set, which survives restarts and is shared by every worker, at the cost of a network round trip of tens of microseconds against tens of nanoseconds for a local push.

## When not to use a heap

Measured on CPython, the anti-pattern of appending then sorting the whole list on every insert cost 41 microseconds per insert at 10 thousand elements, about 700 times slower than a heap push, and it grows with the queue. Sort after every append is a code review smell.

The opposite mistake is reaching for a heap when you should just sort. If you receive a batch of 100 thousand records and need all of them in order, sort once. Heapify is linear, but the pops are still n log n, with worse constants and no stability. A heap earns its keep when insertions interleave with extractions, or when you only need the first k.

## In the interview

A follow-up the lesson expects. Millions of timeouts, almost all cancelled before they fire. Heap, or something else?

[pause]

A hierarchical timing wheel. Insert and cancel are constant time, and slot precision is enough. A heap pays log n per cancel, or carries the dead entries. The wrong answer is "a heap, because timers must fire in order"; a wheel also fires in order, at its granularity.

And: how does a scheduler avoid starving low-priority work? Aging, encoded into the key at enqueue time so nothing is updated in place. Or a fair-share design keyed by consumed CPU time, as Linux does. Periodically walking the heap to lower priorities is linear, and mutates keys in place.

## Recap

Four things to remember. Know your library's direction: C++ and Rust default to max-heaps. Push priority, sequence, item by reflex: it prevents tie crashes and makes equal priorities first in, first out, negated for a max-heap. Never mutate a priority while the item is in the heap; push a fresh entry and skip stale ones, or use an indexed heap. And a plain heap is wrong when you cancel or delete by key at scale: runtimes use indexed heaps, timing wheels or red-black trees, and lazy deletion needs a garbage threshold.

At your desk: the library table, the stable queue code and the five-pop trace, the scheduling, simulation and Dijkstra traces, the timer trade-off table, and the two exercises.
