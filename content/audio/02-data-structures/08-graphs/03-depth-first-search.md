---
lesson: depth-first-search
source: d38c916121cba983
fit: partial
desk:
  - "The recursive DFS with colours and timestamps, and the eight-vertex event log with every edge type"
  - "The edge-type table with its interval rules, and the parenthesis written out as brackets"
  - "The three iterative forms side by side, and the stack-of-iterators code with its stack trace"
  - "The backtracking path finder, and the simple-path counts on grids from 2 by 2 to 6 by 6"
  - "Under the hood: CPython, JVM and Node stack budgets and thread stack sizes"
  - "Exercises: DFS discovery order without recursion, and find a path with backtracking"
---
## Introduction

Breadth-first search spreads out in rings and needs memory for the widest ring. Depth-first search commits. It follows one edge as deep as it can, backs up only when stuck, and needs memory only for the current path.

That one difference makes it the tool for a different family of questions. Is there any path? What does this component contain? Does this graph have a cycle? In what order can these tasks run? Those are questions about structure, and the structure DFS reveals, through the order it enters and leaves vertices, is richer than BFS's distances.

It is also the traversal that crashes. A chain of a hundred thousand vertices overflows the default stack in Python, in the JVM and in Node, and the fix is one specific iterative form, not the obvious one. Three ideas, then: timestamps and the four kinds of edge, the iterative stack done right, and backtracking.

## Colours and timestamps

Give every vertex a colour. White means undiscovered. Grey means discovered and still being explored: it is on the current path. Black means finished. Keep one clock, and stamp each vertex twice: when it turns grey, its discovery time, and when it turns black, its finish time. A vertex finishes only when everything reachable from it through white vertices is done.

Here is a directed graph of four vertices, small enough to hold in your head. A points to B, and A points to C, in that order. B points to C. C points back to A. And a fourth vertex, D, points to C.

Start at A, time 1. A's first edge goes to B, which is white, so follow it: B discovered at time 2. B's edge goes to C, white: C discovered at time 3. C's edge goes to A. A is grey, still on the current path. Hold that thought. C has nothing else, so it finishes at time 4. B finishes at 5. Back in A, its second edge goes to C, which is now black. A finishes at 6. The outer loop finds D still white: discovered at 7. D's edge goes to C, black. D finishes at 8.

So the intervals are: A from 1 to 6, B from 2 to 5, C from 3 to 4, and D from 7 to 8. The cost of all this is still order V plus E: each vertex visited once, each list scanned once.

## The four edge types

The colour of the target, at the moment you examine an edge, classifies it. Our tiny graph has all four.

An edge to a white vertex is a tree edge: DFS follows it. A to B, and B to C.

An edge to a grey vertex is a back edge: it points to an ancestor on the current path. C to A. And here is the fact that matters most in this lesson: a back edge exists if and only if the graph has a cycle. A, B, C, back to A.

An edge to a black vertex discovered after you is a forward edge, a shortcut to a descendant. A to C: C was discovered at 3, after A at 1, and finished before A did.

An edge to a black vertex discovered before you is a cross edge, between subtrees or components. D to C: C finished at 4, long before D was discovered at 7.

Now the interview trap. Before I say it: if an edge leads to a vertex you have already visited, is that a cycle?

[pause]

Not necessarily. Only if the vertex is grey. D to C reaches a visited vertex, and there is no cycle through D. A to C reaches a visited vertex too, by a second route, not a loop. Treating "already visited" as "cycle" is the classic false positive, and it reports a cycle in every dependency graph shaped like a diamond.

Two theorems sit under this. The parenthesis theorem: any two intervals are either nested or disjoint, never partly overlapping. A's contains B's, which contains C's; D's sits apart. Write an open bracket at each discovery and a close bracket at each finish, and they match perfectly. So ancestry becomes an interval test. And the white-path theorem: v becomes a descendant of u exactly when, at the moment u is discovered, there is a path from u to v through white vertices only. That theorem is why reverse finish order is a topological order, which comes back two lessons from now. One more consequence: in an undirected graph there are only tree and back edges, and the edge back to your immediate parent is the same tree edge seen from the other side, which is why the undirected cycle check skips exactly that one edge.

## The explicit stack, done right

There are three iterative forms, and only one is DFS in the full sense.

The first pushes all neighbours, in reverse, and marks a vertex when it is popped. It reproduces the recursive discovery order. But a vertex can be pushed several times, so the stack can grow to the size of the edge count, and there is no moment at which a vertex finishes. No finish times means no topological order and no edge classification.

The second is the tempting fix: mark on push, the way BFS marks on enqueue. It visits every reachable vertex once, which is fine for flood fill and component counting. But it is not a DFS order. A vertex gets claimed by whichever ancestor pushes it first, so the parents are wrong, and grey no longer means "on the current path". Cycle detection, finish order and articulation points all give wrong answers. The rule: BFS marks on enqueue; DFS marks when a vertex is expanded.

The third is the right one. Keep a stack of pairs: a vertex, and the position of the next neighbour to look at. Look at the top. If it has neighbours left, advance its position and examine the next one; if that one is white, discover it and push it. If it has none left, pop it and record its finish. That is the recursion with the call frames made explicit. It produces identical discovery times, finish times and parents, and its stack never holds more than the current path.

## Where the stack lives

Python's default recursion limit is 1,000 frames. In the lesson's measurement a recursive DFS down a path of 901 vertices succeeded, and one of 2,001 raised a recursion error. The JVM and Node give you roughly 10 thousand frames by default. So a chain of a hundred thousand vertices overflows all three.

Raising the limit moves the cliff; it does not remove it. Before Python 3.11, a raised limit could exhaust the C stack and segfault. And worker threads may get far smaller stacks than the main thread: on Alpine images, the C library defaults to 128 kilobytes. That is where "works in the script, overflows in the worker" comes from. The fix in every language is the stack of iterators, whose stack lives on the heap and is limited only by memory.

Grids are where this bites. A recursive flood fill on a thousand by a thousand all-land grid recurses a million deep. And mark each cell on entry, not after its neighbour loop, or the fill re-enters cells from every side and turns exponential on an open grid. One more grid trick: for problems like Pacific Atlantic and surrounded regions, start from the boundary and flood inward. What you reach escapes; what you do not is trapped.

## Backtracking and iterative deepening

DFS finds a path, not the shortest one. Keep the current path on a stack; push a vertex when you enter, pop it when it fails. That push, recurse, pop discipline is backtracking, and permutations, N-queens, sudoku and word search are all DFS over an implicit graph of partial solutions.

The question that decides the cost: when you back out of a vertex, do you unmark it? For plain reachability, no. If a vertex could not reach the target once, it cannot from any other entry, because reachability does not depend on the route. Keep it marked, and the search stays linear. But when the constraint depends on the route, like a grid path that may not reuse a cell, you must undo the mark, and the search becomes exponential. Counting the simple corner-to-corner paths in a grid that way gives 184 for a four by four, 8,512 for five by five, and 1,262,816 for six by six.

When the space is too wide for BFS but too deep, or infinite, for plain DFS, use iterative deepening: DFS with a depth limit of 1, then 2, then 3, until you find a solution. Memory stays proportional to depth, and the shallowest solution is found first. The repeated shallow work is a constant factor, b over b minus 1: double for a branching factor of 2, 11 percent extra for 10, about 3 percent for a chess-like 35. That is why game engines search depth-first.

## In the interview

A follow-up from the lesson. Make your recursive topological sort iterative without changing its output. What do you write?

[pause]

The stack of vertex and next-index pairs, emitting a vertex when its index reaches the end of its list. It reproduces the recursive finish order exactly, with a stack no deeper than the path. The wrong answer pushes all neighbours and emits on pop, which emits in discovery order, and that is not a topological order. It fails only on some inputs, which makes it worse.

And the other classic: why is a visited set not enough to detect a cycle in a directed graph? Because an edge to a visited and finished vertex is a forward or cross edge. Only an edge to a grey vertex, one still on the current path, closes a cycle.

## Recap

Four things to remember. Discovery and finish times nest like brackets, so ancestry is an interval test and reverse finish order is a topological order. A back edge, to a grey vertex, is the cycle test; an edge to a finished vertex is never one. The only iterative form that keeps finish order is a stack of vertex and next-index pairs, and it is also the fix for deep graphs, where Python gives you about a thousand frames and the JVM and Node about ten thousand. And in backtracking, keep visited marked for plain reachability and undo it only when the constraint depends on the route.

At your desk: the eight-vertex event log and edge table, the three iterative forms and the iterator trace, the path finder and grid path counts, the runtime stack details, and the two exercises.
