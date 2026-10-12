---
lesson: indexed-heaps-and-decrease-key
source: afc51c294ef2c5fd
---
## 1

Dijkstra with lazy deletion, pushing duplicates, has a heap size bounded by what?

A, the maximum degree, since one vertex relaxes at a time. B, E, the number of edges, since each relaxation can push an entry. C, V log V, since each vertex re-enters log V times. D, V, the number of vertices, since each vertex is finalised only once.

[think]

The answer is B: E, the number of edges, since each relaxation can push an entry.

Each successful relaxation pushes an entry, and there are at most E of them, so the heap can hold order E entries, even though each vertex is finalised once. The indexed heap variant holds at most V. The running time stays E log V, because log E is at most twice log V. On random graphs the measured peak is a small multiple of V, but the bound is what an adversary can force.

## 2

In an indexed heap, what must every swap during sift-up or sift-down do, besides swapping the two array slots?

A, recompute the priorities of both moved keys. B, update the position map for both moved keys. C, re-heapify the array, so the positions stay valid. D, nothing, as the position map is rebuilt on each pop.

[think]

The answer is B: update the position map for both moved keys.

The position map is what makes decrease-key logarithmic, and it is only correct if it is updated at every move. Priorities do not change during a swap, and rebuilding the map or re-heapifying would be linear per operation, which defeats the purpose.

## 3

Deleting a middle element of an indexed heap swaps it with the last element and shrinks the array. What must then happen to the swapped-in element?

A, sift it up only, since the deleted slot was above it. B, leave it in place, since the heap shape is already restored. C, sift it both up and down, since it came from another branch. D, sift it down only, since it came from the bottom level.

[think]

The answer is C: sift it both up and down, since it came from another branch.

The last element belongs to some other branch, so relative to its new parent and children it may be too small or too large. The lesson's trace shows a value of 4 landing under a parent of 10 and needing to move up. Calling both sifts is correct, because at most one of them moves it. The shrink restores the shape, but not the order.

## 4

A lazy-deletion queue implements remove of x by adding one to x's pending count, unconditionally. Now run this sequence: remove 7, push 7, pop. What is returned?

A, an error, since removing an absent 7 raises. B, 7, since the removal came before the push. C, nothing, as the pending removal eats the push. D, 7, since each push clears pending removals.

[think]

The answer is C: nothing, as the pending removal eats the push.

The unconditional remove records a pending removal without any error, and nothing clears it. When 7 is pushed and reaches the root, it matches the pending removal and is discarded. Remove must check that a live copy exists before recording anything.

## 5

Dijkstra with a Fibonacci heap costs E plus V log V; with a binary heap, it costs E log V. Why is the Fibonacci version rarely faster on real hardware?

A, pointer-heavy forests mean large constants and cache misses. B, the bound is misquoted: it is really E log V as well. C, binary heaps also get constant-time decrease-key through the index map. D, Fibonacci heaps cannot handle negative edge weights at all.

[think]

The answer is A: pointer-heavy forests mean large constants and cache misses.

The bound is real, but the asymptotic win needs dense graphs and ignores constants. Fibonacci heap nodes carry four pointers and are scattered across memory, and on sparse graphs E is only a few times V, so the gap between E and E log V is small, and the binary heap's array layout wins. An indexed binary heap's decrease-key is logarithmic, not constant.

## 6

A system needs to insert tasks with priorities, pop the highest priority, cancel arbitrary tasks by id, and list tasks in priority order for a dashboard. What is the best structure?

A, a balanced binary search tree or skip list, on priority and id. B, a binary heap with lazy deletion for cancelled ids. C, an indexed heap with a position map keyed by id. D, two heaps, one max and one min, sharing the ids.

[think]

The answer is A: a balanced binary search tree or skip list, on priority and id.

Ordered iteration rules out every heap variant, since a heap cannot produce sorted order without destroying itself; an indexed heap solves cancellation, but not the listing. A balanced tree gives logarithmic insert, pop and delete by key, and a linear in-order listing.
