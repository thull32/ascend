---
lesson: breadth-first-search
source: 8c53fa324c25c8f8
fit: partial
desk:
  - "The BFS code and the eight-vertex hand trace with its queue, distance and parent columns"
  - "The proof by induction that the first discovery is the shortest path"
  - "The mark-on-dequeue trace on the complete graph of five vertices"
  - "The level-size loop and its boundary table, and the rotting-oranges grid trace"
  - "The 0-1 BFS and bidirectional BFS code, including the finish-the-level termination rule"
  - "Under the hood: deque blocks, ArrayDeque, frontier vectors and direction-optimising BFS"
  - "Exercises: shortest hop counts from a source, and distance to the nearest source on a grid"
---
## Introduction

What is the fewest number of hops from A to B? Degrees of separation in a social network, a router's hop count, the fewest moves to solve a puzzle, the fewest edits to turn one word into another. All of them are shortest paths where every edge costs the same. Breadth-first search answers them with a queue and one invariant you should be able to prove: vertices leave the queue in non-decreasing order of distance from the start.

Everything BFS is good for follows from that invariant. Everything it is bad for, weighted edges above all, follows from where it breaks. Three ideas: the mechanism and the details that are not optional, the variants that come up in interviews, and what a fast BFS looks like underneath.

## The mechanism

Put the source in a queue and mark it visited. Then repeat: take a vertex off the front, and for each neighbour you have not seen, mark it, record its distance as one more than the current vertex's, and put it on the back.

Here is a graph of five vertices to walk through. A is joined to B and to C. B and C are both joined to D. And D is joined to E. Start at A.

The queue holds A. Take A off, and discover B and C at distance 1. The queue is B, then C. Take B off: it discovers D, at distance 2. Take C off: C also touches D, but D is already discovered, so nothing happens. First discovery wins, and D keeps B as its parent. Take D off, discover E at distance 3. Take E off, and the queue is empty.

Look at the queue at every moment: some vertices at one distance, followed by some at the next. Never three different distances. That is the invariant you can see. To get the path to E, follow parents backwards, E to D to B to A, and reverse it.

The cost: each vertex enters and leaves the queue once, and each adjacency list is scanned once, so order V plus E. Memory is the visited set plus the queue, which can hold an entire level. On a wide graph that is far more than depth-first search's stack.

## Three details that are not optional

First, mark visited when you enqueue, not when you dequeue. Before I give you the count: on a complete graph of five vertices, every pair joined, how many times do vertices get enqueued if you mark on dequeue?

[pause]

Eleven, for five vertices. The source enqueues the other four. The next one popped is marked, but the three after it are still unmarked, so it enqueues them all again. And so on. In general it is one plus n times n minus 1 over two: 4,951 enqueues for a hundred vertices, about half a million for a thousand. The queue grows to the size of the edge count, not the vertex count. And the nasty part: distances are still correct, so the tests pass, and only memory and time blow up.

Second, use a real queue. Popping the front of a Python list or calling shift on a JavaScript array is order n, because everything behind it moves. Measured: draining 10 thousand elements with a list's pop of index zero took 2 milliseconds; 50 thousand took 52. Five times the elements, 26 times the time, which is the signature of quadratic. A deque drained them in 0.2 and 0.9. In JavaScript, use an array and a head index that only moves forward.

Third, record the distance and parent at discovery. That is correct because of the invariant, and there is no later relaxation step as in Dijkstra.

## Why the first discovery is shortest, and when it is not

The proof is by induction on distance. All vertices at distance k leave the queue before any at distance k plus 1, because the queue is first in, first out. A vertex at distance k plus 1 has a neighbour at distance k, so it gets labelled when that neighbour is processed, and it cannot have been labelled earlier with a smaller value without a closer neighbour existing.

That proof uses one assumption: every edge costs the same. Give one edge weight 5 and another weight 1, and the first discovery is no longer the cheapest. If an interviewer adds weights to a BFS problem, the answer is "then BFS is wrong, and I need Dijkstra", said before they finish the sentence. Dijkstra replaces the queue with a priority queue keyed by distance.

There is a bridge between the two. If edges cost exactly zero or one, use a deque: push a vertex reached by a free edge to the front, and one reached by a cost-1 edge to the back. The deque only ever holds two consecutive distances, in order, so it is Dijkstra with two buckets instead of a heap, still linear. But it needs exactly zero and one. Costs of one and two break it.

## Levels and multiple sources

Many problems need the level itself: minimum depth, minutes until all the oranges rot, all nodes at distance exactly k. Record the queue's length before you start a level, and pop exactly that many. Everything appended during the level sits behind the boundary and belongs to the next one. Get this wrong, by counting per vertex or per enqueue, and the answer comes out one too high or one too low.

Stopping early has its own rule. With one target, check when you discover it, not when you dequeue it, or you expand a whole extra level, which on a wide graph can be most of the work. With several targets, or "all vertices at distance k", the reverse: finish the level before you answer. And if the start is already the target, return zero before the loop.

Now multi-source. For each cell, the distance to the nearest gate. The naive way runs one search per gate. The right way seeds the queue with every gate at distance zero and runs once. It is the same as adding one imaginary super-source joined to all of them. The lesson's numbers: a 2 thousand by 2 thousand grid with 5 thousand hospitals is 4 million cells. One search per hospital is 5 thousand times 4 million visits. Multi-source is about 4 million, one pass. Rotting oranges is exactly this: seed every rotten orange, and the level count is the minutes.

On grids, one cost to know. In Python, a visited set of coordinate pairs took about 97 nanoseconds a check, against 36 for a two-dimensional list of booleans.

## Bidirectional BFS, and BFS at scale

When you have one specific target, search from both ends and stop when the frontiers meet. With branching factor b and distance d, a one-way search touches about b to the power d vertices. Two searches of half the depth touch about two times b to the power d over two. With a branching factor of 10 and a distance of 6, that is a million against 2 thousand, a factor of 500. The saving is exponential in the depth, not a factor of two. For word ladder, that is a hundredfold to a thousandfold.

The part people get wrong is when to stop. Do not return the first meeting you see in the middle of a level. Finish expanding the whole level, and return the smallest meeting distance found in it, because a later vertex in the same level can give a shorter total. And you need to follow edges backwards from the target, which for a directed graph means building the reversed adjacency list first.

Underneath, the queue matters. Python's deque is a linked list of blocks of 64 slots, so appending and popping from either end touch one slot and occasionally allocate a block: constant time with no copying. Java's ArrayDeque is a ring buffer, an array whose head and tail wrap around, and it beats a linked list for BFS.

Production BFS on big graphs, the Graph500 reference code among them, drops the queue object entirely. It works on the compact CSR layout, keeps the frontier as a plain vector and the visited set as a bitmap, and swaps vectors each level, which lets threads split the frontier.

And on social graphs there is a better trick: direction-optimising BFS, from Beamer, Asanović and Patterson in 2012. On a small-world graph the frontier covers most of the graph after two or three levels. Top-down BFS then scans nearly every edge to discover very few new vertices. So flip it: for each unvisited vertex, look through its neighbours and stop at the first one in the frontier, which usually takes one or two reads. The paper reported an average speed-up of 3.9 times, never below 2.4.

## In the interview

A follow-up from the lesson. Shortest path on a grid where you may remove up to k walls. What is a vertex?

[pause]

Not the cell. The vertex is the cell plus the number of walls you can still remove. Moving into a wall spends one. On a 100 by 100 grid with k equal to 5, that is 100 times 100 times 6, so 60 thousand states, and BFS over them is still linear in the states. The wrong answer carries a counter along with the cell. Then a later arrival with more walls left is thrown away because the cell is already visited, and you miss the answer.

Another: how many distinct shortest paths are there from s to t? Keep a count per vertex. When u first discovers v, v's count becomes u's. When u meets an already-discovered v exactly one level deeper, add u's count to v's. Same linear cost. The wrong answer enumerates paths with depth-first search, which is exponential.

## Recap

Four things to remember. BFS's invariant is that vertices leave the queue in order of distance, at most two distances at a time, and it holds only when every edge costs the same; weights mean Dijkstra, and zero-or-one weights mean a deque. Mark on enqueue and use a real queue, or you get a queue the size of the edge count and quadratic pops while the tests still pass. Count levels by recording the queue's size, and seed every source at once for nearest-of-many problems. And for one distant target, bidirectional search turns b to the d into roughly two times b to the d over two, as long as you finish the level before answering.

At your desk: the eight-vertex trace, the proof, the complete-graph count, the level and orange traces, the 0-1 and bidirectional code, the under-the-hood section, and the two exercises.
