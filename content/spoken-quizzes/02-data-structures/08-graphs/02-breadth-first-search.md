---
lesson: breadth-first-search
source: fbff7825073b2231
---
## 1

A breadth-first search marks vertices visited when they are dequeued, instead of when they are enqueued. On a complete graph with V vertices, what happens?

A, nothing changes, because each vertex is still processed only once. B, the search never terminates, because vertices keep re-entering the queue forever. C, distances come out wrong, because a later duplicate overwrites the vertex's first label. D, each vertex can be enqueued up to V minus 1 times, so the queue fills with duplicates.

[think]

The answer is D: each vertex can be enqueued up to V minus 1 times, so the queue fills with duplicates.

The source enqueues every other vertex, and each of those, when popped, enqueues all the still-unmarked ones again, for about V squared over 2 enqueues in total. Distances stay correct, because the first dequeue wins and later duplicates are skipped, and the search still ends, because each vertex is marked once it is dequeued. Only the work multiplies. Mark on enqueue.

## 2

On a grid, every move costs 1, except moving through mud, which costs 3. Which algorithm finds the cheapest route?

A, Dijkstra with a priority queue, because the edge costs are unequal. B, zero-one BFS, because a deque handles two distinct edge costs. C, plain breadth-first search, because every move on a grid is still a single step. D, depth-first search with pruning, because it can abandon any branch that is already costlier.

[think]

The answer is A: Dijkstra with a priority queue, because the edge costs are unequal.

Breadth-first search's rule, that the first discovery is the shortest, relies on uniform costs. With costs of 1 and 3, a route with more steps can be cheaper. Zero-one BFS handles two costs only when they are exactly 0 and 1, because its deque then holds two consecutive distances in order, and costs of 1 and 3 break that ordering.

## 3

You need the distance from every cell of a 2,000 by 2,000 grid to the nearest of 5,000 hospitals. One breadth-first search per hospital costs about 5,000 times 4 million cell visits. What does a multi-source search cost?

A, about the same, since each hospital still needs its own wavefront. B, about 4 million cell visits, as one pass seeded with every hospital. C, about 5,000 times the log of 4 million, one heap operation per hospital. D, about 4 million times log 5,000, for a heap to pick the nearest source.

[think]

The answer is B: about 4 million cell visits, as one pass seeded with every hospital.

Seeding every hospital at distance 0 is the same as searching from one virtual super-source, and each cell is discovered once, by its nearest hospital. That is one pass over the grid, and a plain first-in, first-out queue is enough because every edge still costs 1, so there is no heap and no log factor.

## 4

A word ladder runs between two five-letter words, with a dictionary of 50,000 five-letter words. Why does bidirectional breadth-first search help so much?

A, it expands both endpoints' neighbourhoods in parallel, which halves the wall time. B, it skips building the adjacency list, so neighbours cost constant time to generate. C, it stores half as many vertices per side, so total memory is cut in half. D, each side searches only half the distance, so about 2 times b to the d over 2 vertices replace b to the d.

[think]

The answer is D: each side searches only half the distance.

With a branching factor of about 100 and a distance of about 6, a one-directional search may touch 100 to the sixth, a million million candidates, while two half-searches touch about 2 million. The saving is exponential, not a factor of two, because halving the depth takes the square root of the frontier. The meeting point gives the shortest path when both sides expand level by level and the smallest meeting distance of the level is taken.

## 5

A level-by-level breadth-first search records the queue's size before draining each level. Why must it pop exactly that many vertices, rather than draining until the queue is empty?

A, popping more would revisit vertices already marked as seen. B, vertices appended during the level belong to the next level, and must stay behind the boundary. C, draining fully would process the levels in reverse order. D, the queue must be non-empty at the end of each level for the loop condition to hold.

[think]

The answer is B: vertices appended during the level belong to the next level, and must stay behind the boundary.

Neighbours discovered while processing level k are appended behind the recorded size, so they are at distance k plus 1. Popping only that many leaves them for the next iteration, and lets the level counter rise once per distance. Draining fully would merge all the remaining levels into one and report a depth of 1. Visited marks prevent duplicates however many are popped.

## 6

In a breadth-first search on a social graph, the frontier at level 3 contains 60 percent of all vertices. Why does direction-optimising search switch to bottom-up?

A, bottom-up processes all the remaining levels in parallel, so the rest of the search finishes in a single pass. B, bottom-up needs no visited bitmap, because every unvisited vertex is examined once per level anyway. C, the queue would overflow at 60 percent of the vertices, so bottom-up replaces it with a hash set. D, each unvisited vertex stops at its first in-neighbour in the frontier, far fewer edge reads than the frontier's out-degrees.

[think]

The answer is D: each unvisited vertex stops at its first in-neighbour in the frontier, far fewer edge reads than the frontier's out-degrees.

Top-down cost is the sum of the frontier's out-degrees, nearly every edge when the frontier is most of the graph. Bottom-up asks each unvisited vertex for any parent in the frontier, and usually finds one within a couple of in-edges. The switch is a cost heuristic on edge counts, not a memory workaround: a bitmap still marks visits, and levels are still processed one at a time.
