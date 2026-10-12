---
lesson: shortest-paths-dijkstra
source: 395ab35e552a237c
---
## 1

In the heap implementation of Dijkstra, a node's tentative distance is improved twice before it is popped. What is in the heap afterwards, and what happens to the extra entries?

A, two entries; both are expanded, and the second fixes the first. B, two entries; the stale one is skipped when it is popped. C, one entry; the heap updates the existing entry in place. D, two entries; this is a bug that only decrease-key avoids.

[think]

The answer is B: two entries; the stale one is skipped when it is popped.

Lazy deletion pushes a fresh entry on every improvement and leaves the old one where it is, since Python's heap has no in-place update. When the stale entry is popped, its stored distance is larger than the node's current distance, so it is skipped. Processing it would not be wrong, only wasted work, which is why the check is a performance guard, not a correctness fix.

## 2

You mark a node as visited when you push it onto the heap, and refuse to push it again. The graph has edges A to B costing 4, A to C costing 2, and C to B costing 1. What does the algorithm report for B?

A, 1, because only the last edge, C to B, is kept for B. B, 4, because the improvement via C is discarded. C, 3, because the heap re-sorts B when C improves it. D, no value; the refused duplicate push raises an error.

[think]

The answer is B: 4, because the improvement via C is discarded.

A pushes B with 4 and marks it visited. When C is popped and finds a path to B costing 3, B is already marked, so the push is refused, and nothing re-sorts B's old entry. Settling must happen on pop; a visited check at push time throws improvements away.

## 3

Which of these problems is not solved correctly by plain Dijkstra with non-negative weights?

A, shortest path, with an early exit when the target is popped. B, the path that minimises its maximum edge weight, the bottleneck path. C, shortest paths from several sources at once. D, the cheapest path that uses at most k edges from the source.

[think]

The answer is D: the cheapest path that uses at most k edges.

An edge-count limit means the cheapest way into a node may be disqualified, so "settled means final" no longer holds per node. You need a state of node and edges used, or k plus 1 rounds of Bellman-Ford. Bottleneck paths work because the maximum is monotone, multiple sources work by seeding several zeros, and the early exit is safe because popped means settled.

## 4

A graph has 10 thousand nodes and roughly 50 million edges. Which Dijkstra variant is the better choice, and why?

A, the array scan, because with edges near V squared, the log factor is overhead. B, Bellman-Ford, because dense graphs favour edge-list scans. C, the heap version, because E log V always beats V squared. D, zero-one breadth-first search, because linear time beats both Dijkstra variants.

[think]

The answer is A: the array scan, because with edges near V squared, the log factor is overhead.

With about half of V squared edges the graph is dense. The heap does about 50 million times 13 operations and can hold tens of millions of entries, while the array version does 100 million simple scans with no heap overhead. The heap bound only wins when edges are well below V squared. Zero-one search needs weights of only 0 or 1, and Bellman-Ford is far worse.

## 5

Why does a double-ended queue give the same processing order as a heap when every edge weight is 0 or 1?

A, because it only ever holds distances d and d plus 1, in order. B, because 0-weight edges never change any distance. C, it does not; zero-one search only approximates the heap order. D, because the deque is re-sorted after every insertion.

[think]

The answer is A: it only ever holds distances d and d plus 1, in order.

Pushing cost-0 neighbours to the front and cost-1 neighbours to the back keeps the deque monotone, with at most two distinct distances: d at the front, d plus 1 at the back. The front is always a smallest tentative distance, which is exactly what the heap guaranteed, at constant cost per operation and with no sorting.

## 6

A Rust port of the lesson's code uses the largest 32-bit integer as infinity, and returns wildly negative distances for every node. What happened, and what is the fix?

A, infinity plus a weight wrapped around; skip infinite tails, or use a saturating add. B, negative edges crept in; switch to Bellman-Ford for this graph. C, stale entries were expanded; add the guard on pop. D, the heap compared node ids on ties; add a counter to each entry.

[think]

The answer is A: infinity plus a weight wrapped around; skip infinite tails, or use a saturating add.

Adding a positive weight to the maximum integer wraps to a large negative number in release builds, and that value is smaller than every real distance, so it wins every comparison. Python hides this because float infinity absorbs additions. Guard the relaxation when the tail is infinite, use a saturating add, or use half the maximum as infinity with bounded weights.
