---
review: tree-and-graph-patterns
source: 488d4c5acb0680e7
---
## Introduction

Twelve questions from the tree-and-graph-patterns module. Answer out loud before the answer comes.

They run through the module in order: tree breadth-first search, tree depth-first search, graph traversal, topological sort, union-find, shortest paths, and the trie. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

A binary tree is a single chain of 100 thousand nodes, each with only a right child. You need the values grouped by depth. Which traversal is the safer choice, and why?

A, recursive depth-first search, because it uses less memory than a queue on a chain. B, either one, since both use linear extra memory on a chain. C, breadth-first search, because its queue holds one node, not 100 thousand stack frames. D, neither, until the tree is converted to an array first.

[think]

The answer is C: breadth-first search, because its queue holds one node at a time.

Breadth-first memory is proportional to the widest level, which is 1 here. Recursive depth-first search goes as deep as the chain is long, and that overflows the call stack in Python and most JavaScript engines. On a wide, balanced tree the comparison flips: the queue holds about half the nodes, and the recursion only log n frames.

## Question 2

The interviewer asks for every node at distance k from a given target node in a binary tree. Why does the tree breadth-first template not apply directly, and what is the fix?

A, it applies directly: run the level loop from the target and take level k. B, the tree must first be converted to a binary search tree so that distance is well defined. C, breadth-first search cannot count distance; only a recursive depth-first search can. D, distance runs through parents too, so build a parent map, then search outward with a visited set.

[think]

The answer is D: distance runs through parents, so build a parent map first.

Nodes at distance k can sit above the target, or in a sibling subtree, reachable only by an upward step that tree nodes do not provide. One depth-first pass records each node's parent. Then a breadth-first search from the target expands left, right and parent, with a visited set, because the parent edge turns the tree into a graph. A downward-only search misses every node reached through an ancestor.

## Question 3

In the single-pass diameter solution, why does the recursive function return one plus the larger child height, rather than the left height plus the right height?

A, either works; the two values are interchangeable here. B, because returning left plus right would make the recursion never terminate. C, because a parent can extend a path through only one arm of this node. D, because left plus right is never larger than the height anyway.

[think]

The answer is C: a parent can extend a path through only one arm.

A path that goes down into both children of a node is complete at that node; it cannot continue upward. Returning it would let the parent build an impossible path. The height, one arm, is what the parent needs. The two-arm sum is a candidate answer, recorded on the side.

## Question 4

Maximum path sum, on a tree where every value is negative. A solution starts its best at zero, and clamps each child's contribution at zero. What does it return, and why is that wrong?

A, the largest single value, which is the correct answer. B, negative infinity, since the best is never updated at all. C, the sum of all values, since every arm is clamped at zero. D, zero, an empty path, though a path needs at least one node.

[think]

The answer is D: it returns zero, which is an empty path.

Clamping arms at zero is correct, because an arm that hurts the total should be dropped. But the best itself must be able to hold a negative single-node path, so it has to start at negative infinity. Starting at zero silently returns an empty path instead of the largest single value.

## Question 5

In a grid breadth-first search, a candidate marks cells visited when they are dequeued, rather than when they are enqueued. What is the consequence?

A, none; the visit order and the cost stay exactly the same. B, cells get enqueued several times, so time and memory balloon. C, the search never terminates, since cells keep being added again. D, distances come out wrong, since cells land in the wrong level.

[think]

The answer is B: cells get enqueued several times, and the work balloons.

Marking late lets a cell be enqueued by each of its up to four neighbours before it is processed. The first copy dequeued still carries the correct distance, so the answers are fine, but every duplicate is processed and fans out to its neighbours again. The search still ends, because processed cells do get marked eventually. Mark on enqueue, so each cell enters the queue once.

## Question 6

Pacific Atlantic Water Flow is solved by traversing from the ocean edges inward, climbing to equal or higher cells, rather than from every cell outward. Why is that valid, and what does it save?

A, reversing the edges keeps reachability, and two searches replace one search per cell. B, it saves memory, but the time stays quadratic in the number of cells. C, it is an approximation that happens to be right on most grids. D, it is valid only when every height in the grid is distinct.

[think]

The answer is A: reversing the edges preserves reachability.

Water flows from a cell to an ocean exactly when a climb from that ocean reaches the cell. Reversing every edge preserves reachability between the same endpoints. Two traversals, each seeded with an entire edge of the grid, replace one traversal per cell, so the cost is linear in the cells instead of quadratic. Equal heights are handled by allowing equal-or-higher climbs.

## Question 7

How can Kahn's algorithm tell whether the topological order is unique?

A, if the queue never holds more than one node at a time. B, if the depth-first order and Kahn's order happen to be equal. C, if the graph has exactly n minus 1 edges. D, if exactly one node has in-degree zero at the start.

[think]

The answer is A: the order is unique when the queue never holds more than one node.

Two nodes in the queue at once are both ready, and either could go first, which gives two different valid orders. A single source at the start is not enough: the diamond, where 0 points to 1 and 2, and both point to 3, has one source and still two orders, because the fork is in the middle. And the edge count says nothing about how free the order is.

## Question 8

With union by rank but no path compression, what is the worst-case cost of a single find on n nodes?

A, constant, because each node points close to its root. B, inverse Ackermann, since rank alone achieves it. C, linear, because the trees can still become chains. D, logarithmic, because rank bounds the tree height.

[think]

The answer is D: logarithmic, because rank bounds the height.

A root of rank r has at least 2 to the r nodes, because rank only grows when two trees of equal rank merge. So height is at most log n, and no chain can form. Compression alone lets a chain form but flattens it the first time it is walked, for amortised log n as well. Only the combination of the two gives inverse Ackermann.

## Question 9

Starting from a known graph, edges are only deleted over time, with connectivity queries in between, and the whole sequence is known in advance. What is the standard approach?

A, rebuild the whole structure after every deletion. B, switch to Dijkstra, which supports removing edges. C, process time backwards, so deletions become unions. D, add a delete operation that splits a set in two.

[think]

The answer is C: process time backwards, so deletions become unions.

Union-find cannot split sets. Knowing the sequence up front lets you start from the final graph and walk time in reverse, turning every deletion into a union. If additions were interleaved as well, reversing would turn them into deletions, and the standard tool becomes a rollback union-find, with no path compression, over a segment tree of time. Rebuilding after each deletion works, but throws away the near-constant cost.

## Question 10

Dijkstra pops a distance and a node from the heap, and finds that the popped distance is greater than the best distance recorded for that node. What should happen, and why?

A, stop the search, because the heap has become corrupted. B, push it back with the recorded distance so the heap order is repaired. C, update the recorded distance to the popped one, since the heap holds the latest value. D, skip it, because a cheaper path to that node was found after this entry was pushed.

[think]

The answer is D: skip it; it is a stale entry.

Without decrease-key, a node is pushed again every time its distance improves, and the older, larger entries stay in the heap. Relaxing from them repeats work with worse values. The answers would survive, but on a dense graph the edge scans more than quadruple. The skip is a performance guard, not a correctness one.

## Question 11

Swim in Rising Water replaces "distance plus weight" with "the maximum of distance and weight" in Dijkstra. Why does settle-on-pop still hold?

A, it does not hold; the minimax version is a heuristic. B, it holds because the goal cell has the largest value. C, the maximum is monotone, so extending a path never lowers its cost. D, it holds only because every elevation in the grid is distinct.

[think]

The answer is C: the maximum is monotone.

Dijkstra needs only one thing: a path's cost never decreases as the path is extended. Then a smaller key can never be beaten by going through a larger one. Sums with non-negative weights have that property, and so does a running maximum, with any values. Distinct heights are not required.

## Question 12

Word Search Two, on an 8 by 8 board of all a's, with ten words: a, then a a, and so on up to ten a's. What most reduces the search work?

A, deleting childless trie nodes once their words are found. B, marking visited cells with a set instead of on the board. C, starting the search only from cells on the board's edge. D, storing each word at its end node to avoid rebuilding strings.

[think]

The answer is A: deleting childless trie nodes once their words are found.

Once all ten words are found and cleared, deleting childless nodes on the way back empties the trie, so every later start cell stops at the root. The lesson measured 83 calls with the deletion, against about 1.2 million without it. Storing the word at its node avoids building strings but does not shrink the search, and a visited set changes nothing asymptotically.

## Recap

Three ideas kept coming back. First, the invariant is the answer: the queue holds one level, a non-stale pop is final, a rank-r root has 2 to the r nodes, and a monotone combine keeps Dijkstra correct. Second, mark and prune at the right moment: mark visited on enqueue, skip stale entries, delete dead trie leaves. And third, the shape of the data decides the memory: a queue as wide as a level, a stack as deep as a chain, and a structure that can only merge, never split.
