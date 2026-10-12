---
lesson: graph-traversal
source: 9fa510552c610feb
---
## 1

In a grid breadth-first search, a candidate marks cells visited when they are dequeued, rather than when they are enqueued. What is the consequence?

A, none; the visit order and the cost stay exactly the same. B, cells get enqueued several times, so time and memory balloon. C, the search never terminates, since cells keep being added again. D, distances come out wrong, since cells land in the wrong level.

[think]

The answer is B: cells get enqueued several times, and the work balloons.

Marking late lets a cell be enqueued by each of its up to four neighbours before it is processed. The first copy dequeued still carries the correct distance, so the answers are fine, but every duplicate is processed and fans out to its neighbours again. The search still ends, because processed cells do get marked eventually. Mark on enqueue, so each cell enters the queue once.

## 2

Rotting Oranges on a 3 by 3 grid. The top row is rotten, fresh, fresh. The middle row is fresh, fresh, empty. The bottom row is empty, fresh, fresh. The level-by-level search runs while the queue is non-empty, and adds a minute after each level. Without a guard on the number of fresh oranges, what does it return?

A, 3, because the first level is never counted. B, 5, because the final empty level still counts. C, 4, which is the correct number of minutes. D, minus 1, because one fresh orange is never reached.

[think]

The answer is B: 5, because the final empty level still counts.

The bottom-right orange rots at minute 4, and is then dequeued in a fifth level that rots nothing new but still increments the counter. Guarding the loop on fresh oranges remaining, or subtracting one at the end, gives 4. Every fresh orange is reachable here, so minus 1 is not in play.

## 3

Pacific Atlantic Water Flow is solved by traversing from the ocean edges inward, climbing to equal or higher cells, rather than from every cell outward. Why is that valid, and what does it save?

A, reversing the edges keeps reachability, and two searches replace one search per cell. B, it saves memory, but the time stays quadratic in the number of cells. C, it is an approximation that happens to be right on most grids. D, it is valid only when every height in the grid is distinct.

[think]

The answer is A: reversing the edges preserves reachability.

Water flows from a cell to an ocean exactly when a climb from that ocean reaches the cell. Reversing every edge preserves reachability between the same endpoints. Two traversals, each seeded with an entire edge of the grid, replace one traversal per cell, so the cost is linear in the cells instead of quadratic, and each cell is visited at most once per ocean. Equal heights are handled by allowing equal-or-higher climbs.

## 4

A 2000 by 2000 grid is a single snake-shaped island. Which Number of Islands implementation is safe, and why?

A, either one, since the whole grid fits in memory anyway. B, recursive depth-first search, since the runtime optimises the tail calls. C, iterative depth-first or breadth-first search, since recursion could need four million frames. D, neither; only union-find can handle a grid of that size.

[think]

The answer is C: an iterative search, since recursion could need four million frames.

Recursion depth equals the length of the path the search follows, which can be the whole island: up to four million frames. An explicit stack or queue holds the same cells on the heap, without the call-stack limit. Union-find also works, but it is more code for no benefit here.

## 5

In Word Ladder, the candidate finds neighbours by comparing the current word against every dictionary word and counting the letters that differ. For N words of length L, what is the cost per word, and what is the better approach?

A, order L per word, which is already optimal for this step. B, order N times L; instead, generate the 26 times L one-letter edits and look each one up in a set. C, order N squared per word; sort the dictionary and binary search. D, order 26 to the L per word; switch to depth-first search to prune.

[think]

The answer is B: N times L per word; generate the one-letter edits and look them up in a set.

Scanning the dictionary for every dequeued word costs N times L each, and N squared times L overall. Generating the 26 times L one-letter edits and checking hash-set membership costs 26 times L per word, which makes the neighbour step independent of N.

## 6

To check whether an undirected edge list forms a valid tree, a candidate runs a depth-first search and reports a cycle whenever a neighbour is already visited. On two nodes with the single edge from 0 to 1, what is the result?

A, true, which is the correct answer for this tree. B, false, because node 1 sees its parent, 0, as visited. C, true, but only because the edge list is sorted. D, an infinite loop, since 0 and 1 keep revisiting each other.

[think]

The answer is B: false, because node 1 sees its parent as visited.

Every undirected edge is seen from both ends, so when the search at node 1 looks back at node 0, it finds a visited node. The traversal must skip the node it arrived from, or the edge's identifier when parallel edges are allowed. Also check that the edge count is n minus 1, and that every node was reached.
