---
lesson: indexed-heaps-and-decrease-key
source: 79d0f3728c7734ca
fit: partial
desk:
  - "Dijkstra with lazy deletion, as code, and the measured garbage numbers on random graphs"
  - "The indexed min-priority-queue class, with its single swap helper"
  - "The decrease-key trace with the position map after each step, and the delete-from-the-middle trace"
  - "The heap variants table: binary, d-ary, pairing and Fibonacci"
  - "The when-to-stop-using-a-heap table against a balanced tree"
  - "Exercises: an indexed min-priority queue, and a min-priority queue with lazy deletion"
---
## Introduction

Dijkstra's algorithm pushes every vertex with a tentative distance, and later discovers a shorter path to some of them. A timer system pushes a deadline, and later the caller cancels it. A scheduler pushes a job at priority 5, and an operator bumps it to 1. In all three, an element already inside the heap needs its key changed, or needs to leave.

The binary heap has no answer. It finds its minimum in constant time, but finding anything else is a linear scan, because siblings are unordered. That is the difference between a Dijkstra that runs in E log V and one that is quadratic because someone wrote remove on the heap.

There are two engineering answers, a theoretical one that is mostly not used, and an honest alternative that is not a heap at all. In that order.

## Option one: lazy deletion

Do not touch the entry in the heap at all. Push a new entry with the new key. When you pop, check whether the entry is still current; if not, discard it and pop again.

For Dijkstra, current means "this vertex has not been finalised yet". The heap may hold several entries for one vertex. The one with the smallest distance pops first, because the heap orders by distance, and the others surface later, fail the check, and are thrown away.

So how big does the heap get? Before I answer, think about it. Is it bounded by the number of vertices?

[pause]

No. Every successful relaxation pushes an entry, and there can be one per edge. So the heap holds order E entries in the worst case, not order V. The running time stays E log V, because log E is at most twice log V. That worst case is what an adversary can force, and it is the one to quote. The honest expectation is much lower. Measured on a dense random graph of a thousand vertices and half a million edges: the heap peaked under 5 thousand entries, about five times V, nowhere near E. On a sparse graph, one pop in four was stale.

Deletion works the same way, with a record of pending removals. Remove x just notes that one copy of x is pending. Pop discards roots while they have a pending removal. And size must count live elements, not the array length, or any balance built on it breaks. That is exactly how a sliding-window median works with two heaps: the value leaving the window is marked, not removed, and each heap's live size drives the rebalancing.

There is one trap, and it is the lesson's exercise. Suppose remove records a pending removal unconditionally. Now run: remove 9, then push 9, then pop. What comes out? Nothing. The pending removal of a 9 that was never there eats the 9 you pushed afterwards. A pushed value silently vanishes. The fix: keep live counts per value, and only record a removal when a live copy exists.

And garbage needs a bound. Lazy deletion is the right default: a few lines, no change to the heap. It goes wrong when updates vastly outnumber pops. Measured on CPython, a heap of a million timers with 99 percent cancelled holds about 124 megabytes to deliver 10 thousand timers, and draining it spends over a second and a half skipping stale entries. Python's asyncio bounds this: when more than 100 handles are scheduled and over half are cancelled, it rebuilds the heap without them in one linear pass. Any lazy heap you write for a cancel-heavy workload needs the same guard.

## Option two: the indexed heap

Give the heap a second map, from each key, a vertex ID, a timer ID or a job ID, to its current index in the heap array. Every swap during a sift updates that map for both elements moved. Now the heap can locate any key in constant time, which makes three new operations logarithmic. Decrease a key: update the priority, sift up. Increase a key: update, sift down. And delete: swap the element with the last one, shrink the array, then sift the swapped-in element.

A tiny run. Insert a with priority 5. Insert b with priority 3: it is smaller, so it swaps to the root. Now b is at position zero and a at position one. Insert c with priority 8: it lands at position two and stays. Now decrease c to 1. The map says c is at position two, so sift up from there: 1 is smaller than the root's 3, so swap. c is at the root, b moves to position two, and the map records both moves. Pop returns c. Two array writes and two map writes for the decrease.

Now the delete question interviewers ask. After swapping in the last element, which way do you sift it?

[pause]

Both ways. The last element comes from the bottom of a different branch, so relative to its new parent and children it may be too small or too large. In the lesson's trace, a priority of 4 lands under a parent of 10 and has to move up. Sift down only, and the heap is silently invalid. Calling both is safe, because at most one of them moves it. The same applies to any priority change you cannot classify: Go's heap fix function sifts down, and then up if down did not move it.

The cost is consistency. The array and the map must agree after every operation, which makes the indexed heap about three times the code, and that is where the bugs live. The discipline: route every array write through one swap helper, so there is exactly one place the map can be forgotten. And in tests, assert that every key's recorded position actually holds that key. The classic bug is a hand-inlined pop or delete that writes the array directly, and the map drifts.

With an indexed heap, Dijkstra holds exactly V entries: memory drops from order E to order V, but each operation costs more, with two map updates on every swap. On sparse graphs expect the two to be close, because lazy deletion carries far less garbage than its bound. Benchmark before switching. On dense graphs the indexed version wins on memory.

## Who ships which

Go's container heap is the indexed design with the index left to you: your swap method is where you write each item's index. Its fix and remove functions do the rest. Node's libuv stores timers in a heap built from pointers embedded in each timer, so the timer is its own position record and stopping it needs no lookup at all. Java's scheduled thread pool keeps each task's heap index in the task, so removal is logarithmic, but only after you turn on remove-on-cancel; by default a cancelled task stays queued until its delay elapses. Java's plain PriorityQueue remove has no index and scans: 10 thousand cancels over a 10 thousand entry queue is 100 million comparisons. Rust's peek mut is decrease-key for the root only. And graph libraries mostly pick lazy deletion: NetworkX pushes distance, counter and node tuples and skips finalised nodes.

## Fibonacci heaps, and why nobody uses them

The textbook says Dijkstra runs in E plus V log V with a Fibonacci heap, because decrease-key becomes constant time amortised. That is a real asymptotic improvement for dense graphs. The catch is constants and memory. Each node carries four pointers and a mark bit, the structure is a forest consolidated lazily on delete-min, and every operation chases pointers across scattered allocations, each a likely cache miss of around 100 nanoseconds, against a few nanoseconds for an array index. On real hardware and real graphs, a binary or 4-ary heap with lazy deletion is faster until E is enormous, and even then a pairing heap is what you would reach for. SciPy's graph Dijkstra is one of the few mainstream Fibonacci-heap users.

So if an interviewer asks whether you can do better than E log V, the senior answer names the bound, then says why you would not use it. "Fibonacci heaps are always faster for Dijkstra" is the wrong answer.

## When to stop using a heap

The heap's contract is: find the minimum fast, everything else slow. Each workaround patches one gap. When you need several of them, a balanced tree, a skip list or a B-tree is the honest structure.

Linux's scheduler needs to delete a task when it blocks and pick the next task fast, so it uses a red-black tree with a cached leftmost node. A leaderboard needs ranks and both ends, so it uses a skip list or an order-statistic tree. And a pile of frequently cancelled deadlines with no need for exact order is where Tokio chose a timing wheel: constant-time insert and cancel.

The decision rule, from the lesson. If all you do is push and pop the minimum, with occasional decrease-key, use a heap with lazy deletion and a garbage threshold. If you need decrease-key on most operations and memory matters, an indexed heap. If you need any ordered query beyond the minimum, listing in order, floor, both ends, or deletes dominate, use a tree. If order can be approximate and volume is huge, a wheel or buckets.

## In the interview

One more the lesson expects. The queue needs pop-min and pop-max. What do you do?

[pause]

A balanced tree; or a min-max heap, which alternates min and max levels; or two indexed heaps that delete from each other. The wrong answer is "keep a min-heap and a max-heap and push to both", because popping from one leaves the element sitting in the other, unless the heaps are indexed.

## Recap

Four things to remember. A plain heap cannot change or delete an arbitrary element in log n; say so before the interviewer asks. Lazy deletion is the default: push a duplicate, skip stale entries, accept order E entries for Dijkstra in the worst case, never record a removal for an absent value, count live size, and bound the garbage like asyncio does. An indexed heap keeps a position map updated in exactly one swap helper, and a delete or arbitrary change sifts both ways. And Fibonacci heaps are an interview bound, not a production choice; when you need order, both ends or heavy deletes, switch to a tree.

At your desk: Dijkstra with lazy deletion and its measured garbage, the indexed queue class, the decrease-key and middle-delete traces, the heap variants table, the decision table, and the two exercises.
