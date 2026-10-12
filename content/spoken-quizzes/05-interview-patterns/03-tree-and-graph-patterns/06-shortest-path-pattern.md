---
lesson: shortest-path-pattern
source: 2cd694d16bca0e9a
---
## 1

Dijkstra pops a distance and a node from the heap, and finds that the popped distance is greater than the best distance recorded for that node. What should happen, and why?

A, stop the search, because the heap has become corrupted. B, push it back with the recorded distance so the heap order is repaired. C, update the recorded distance to the popped one, since the heap holds the latest value. D, skip it, because a cheaper path to that node was found after this entry was pushed.

[think]

The answer is D: skip it; it is a stale entry.

Without decrease-key, a node is pushed again every time its distance improves, and the older, larger entries stay in the heap. Relaxing from them repeats work with worse values. The answers would survive, but on a dense graph the edge scans more than quadruple. The skip is a performance guard.

## 2

Cheapest Flights Within K Stops, with k equal to 1. The flights, in this order, are: 0 to 1 for 100, 1 to 2 for 100, 2 to 0 for 100, 1 to 3 for 600, and 2 to 3 for 200. The source is 0 and the destination 3. Bellman-Ford, relaxing in place in that edge order, returns what?

A, minus 1, since no route to 3 fits within one stop. B, 600, since only the direct fare from 1 to 3 is counted. C, 400, since updates within the same round chain into longer routes. D, 700, which is the correct cheapest one-stop fare.

[think]

The answer is C: 400, since same-round updates chain into longer routes.

The round invariant, at most i edges after round i, needs every read to come from the previous round. In place, the distances to 1 and then to 2 are written and read within the first round, so the two-stop route through 1 and 2, costing 400, leaks in. Copying the array each round gives 700.

## 3

In 0-1 BFS, why does a node reached over a zero-weight edge go to the front of the deque?

A, it marks the node as settled, so it is never revisited. B, nodes behind it will then be skipped as stale entries. C, front insertion is faster than appending in a deque. D, it has the current minimum distance, so it must come first.

[think]

The answer is D: it has the current minimum distance.

The deque holds distance d at the front and d plus 1 at the back. A zero edge from a node at distance d yields d, which belongs with the front. A one edge yields d plus 1, which belongs at the back. That keeps the front a minimum, which is all Dijkstra needs, without a heap.

## 4

Swim in Rising Water replaces distance plus weight with the larger of distance and weight, in Dijkstra. Why does settle-on-pop still hold?

A, it does not hold; the minimax version is a heuristic. B, it holds because the goal cell has the largest value. C, the maximum is monotone, so extending a path never lowers its cost. D, it holds only because every elevation in the grid is distinct.

[think]

The answer is C: the maximum is monotone.

Dijkstra needs only one thing: a path's cost never decreases as the path is extended. Then a smaller key can never be beaten by going through a larger one. Sums with non-negative weights have that property, and so does a running maximum, with any values. Distinct heights are not required.

## 5

A graph has edges S to A costing 2, S to B costing 4, B to A costing minus 3, and A to T costing 1. Dijkstra, with an early exit when it pops T, returns what, and what is the true cost?

A, it returns 3, but the path S, B, A, T actually costs 2. B, it returns 2, and 2 is the true cheapest cost. C, it returns 5, but the path S, A, T actually costs 3. D, it raises an error when it meets the negative edge.

[think]

The answer is A: it returns 3, but the path through B costs 2.

A is popped at 2 and relaxes T to 3. T is popped at 3, before B, at 4, is ever expanded, and the search returns. The path through B uses the negative edge, and costs 4 minus 3 plus 1, which is 2. Nothing detects the problem, which is why the precondition has to be stated.

## 6

Min Cost to Connect All Points, on 2 thousand points with Manhattan distances. Which approach, and why?

A, Dijkstra from point 0, summing the final distances. B, breadth-first search from point 0, since every point is reachable. C, Floyd-Warshall, then sum the shortest pairwise paths. D, array-based Prim's, order n squared, without listing the edges.

[think]

The answer is D: array-based Prim's, without listing the edges.

Connecting every point is a minimum spanning tree, not a shortest path. On a complete graph, array-based Prim's is order n squared, and never materialises the 2 million edges that heap-based Prim's or Kruskal's sort would need. Summing Dijkstra's distances builds a shortest-path tree, which can cost more.
