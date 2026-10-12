---
lesson: priority-queues-in-practice
source: 3c55d1e6b0b33872
---
## 1

In Python, you push tuples of priority and task, where the task is a dict. Everything works until two tasks share a priority, then you get a type error. Why, and what is the fix?

A, ties fall through to comparing the dicts: put a counter before them. B, heap priorities must be unique: add a small random jitter to each. C, heapq accepts only numbers: push the task's id instead of the dict. D, dicts are unhashable, which heapq forbids: wrap each in a class.

[think]

The answer is A: ties fall through to comparing the dicts, so put a counter before them.

Tuple comparison goes element by element and stops at the first difference, so on a priority tie Python compares the dicts, which is unsupported. An increasing counter in the second position guarantees a difference before the payload is reached, and gives first-in, first-out order among ties as a bonus. Heapq never hashes anything, and priorities may repeat freely.

## 2

A max-heap job queue uses tuples of priority and sequence number, with the sequence number increasing. Among equal priorities, which job pops first?

A, the earliest pushed, since the sequence keeps first-in, first-out order. B, the latest pushed, since its larger sequence number wins. C, any of them, since heaps are not stable. D, the one nearest the root, whatever its sequence number.

[think]

The answer is B: the latest pushed, since its larger sequence number wins.

A max-heap pops the largest tuple, and with equal priorities, the larger sequence number, the most recent push, wins. The sequence number makes every tuple unique, so the order is deterministic, but it is last in, first out. For first in, first out in a max-heap, negate the sequence number.

## 3

Why does Linux's CFS scheduler keep runnable tasks in a red-black tree rather than a binary heap?

A, heaps need a fixed maximum size, set when they are created. B, red-black trees find the minimum faster than a heap's root. C, blocked tasks leave from the middle of the queue, which heaps delete poorly. D, heaps cannot hold structs, only plain integer priorities.

[think]

The answer is C: blocked tasks leave from the middle of the queue, which heaps delete poorly.

Tasks are removed from the middle when they block. Both structures give logarithmic insert and extract-min, and a heap's minimum is right at the root, but the tree also gives logarithmic delete by node, and ordered iteration. A heap needs an extra index map to delete by identity.

## 4

A service schedules millions of request timeouts per minute and cancels almost all of them when the response arrives. Tokio and Kafka both chose a hierarchical timing wheel over a heap for this. Why?

A, a wheel needs no memory per timer, only per slot. B, heaps cannot hold more than a few million entries at once. C, insert and cancel are constant time, and slot precision is enough. D, a wheel fires timers in exact deadline order, and a heap does not.

[think]

The answer is C: insert and cancel are constant time, and slot precision is enough.

With cancellations dominating, both the log n cost of heap operations and the dead entries left by lazy deletion hurt. A wheel makes both constant-time array operations, at the price of coarser precision for far-off timers. The heap is the more exact structure, not the less exact one, and both hold one entry per timer.

## 5

A strict priority job queue shows a healthy median latency, but a 99th percentile that grows without bound. What is the likely cause, and the fix?

A, heap corruption from ties: add a sequence number to the key. B, starvation of low priorities: encode the enqueue time into the key. C, cache misses at the heap's bottom levels: switch to a 4-ary heap. D, lock contention on pop: shard the queue across workers.

[think]

The answer is B: starvation of low priorities, so encode the enqueue time into the key.

When high-priority work arrives faster than the queue drains, the lowest priorities never reach the root, and their wait grows forever, which shows up only in the tail. Aging fixes it by making the key improve with time waited, computed at enqueue, so no in-place update is needed. Ties, cache misses and lock contention affect throughput or determinism, not an unbounded tail for one priority class.

## 6

You receive a batch of 100 thousand records, and must output all of them sorted by score. What is the best choice?

A, push each into a heap, and pop 100 thousand times. B, heapify in linear time, then pop 100 thousand times. C, insert into a balanced binary search tree, and traverse inorder. D, sort the batch once with the built-in sort.

[think]

The answer is D: sort the batch once with the built-in sort.

When everything is available up front and everything is needed in order, the built-in sort is n log n with better constants, stability and cache behaviour. Heapify is linear, but the 100 thousand pops are still n log n, with worse constants. Heaps earn their keep when insertions interleave with extractions, or when only the first k are needed.
