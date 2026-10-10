---
lesson: shortest-path-pattern
source: 77fa09bcdce4af41
fit: partial
desk:
  - "The lazy-deletion Dijkstra, k-round Bellman-Ford and 0-1 BFS templates, and the JavaScript min-heap"
  - "The Network Delay Time trace heap pop by heap pop, and the 0-1 BFS deque trace"
  - "The K Stops copy-against-in-place table, the Swim in Rising Water trace and the Prim trace"
  - "The ladder, near-misses and variations tables, and the Reconstruct Itinerary trace"
  - "The Dijkstra and Bellman-Ford visualisations"
  - "Exercises: network delay time, and fewest walls to break"
---
## Introduction

Edges now have weights. A network hop takes 3 milliseconds, a flight costs 400, crossing a cell takes as long as its height. Breadth-first search counts edges, and counting edges is wrong the moment one edge is worth more than another. "What is the cheapest way from here to there" needs an algorithm that tracks the best known cost to every node and improves it as cheaper routes appear.

That improvement has a name: relaxation. If the cost to u plus the edge weight beats the best known cost to v, update v. Every shortest-path algorithm is just a policy for which edge to relax next. Dijkstra relaxes from the cheapest unsettled node, which is correct when weights are non-negative. Bellman-Ford relaxes every edge in rounds, which handles negative weights and, more usefully in interviews, bounds the number of edges in a path. Zero-one breadth-first search swaps the heap for a double-ended queue when weights are only 0 or 1. And the minimax problems are Dijkstra with plus replaced by max.

The skill is choosing the cheapest correct rung of that ladder, and executing it without the four bugs that cost the round.

## The signal and the ladder

"Minimum time, cost or distance" over weighted edges, with non-negative weights: Dijkstra. Network Delay Time is the canonical form. "At most k stops" on top of a cost: the bound breaks Dijkstra's core invariant, so use k plus one rounds of Bellman-Ford. "Minimise the largest step along the path", or "the earliest time a route exists": minimax Dijkstra. Weights of only 0 or 1, like "walking is free, breaking a wall costs 1": zero-one breadth-first search. Negative weights, or detecting arbitrage: Bellman-Ford, and say why Dijkstra fails.

Now the ladder, from cheapest up. All edges equal: plain breadth-first search, linear. Weights of 0 or 1: the deque version, still linear. No cycles at all: one pass in topological order, linear, even with negative weights. The general non-negative case: Dijkstra with a binary heap, which adds a log factor. Negative edges or an edge-count bound: Bellman-Ford, vertices times edges, or k times edges for k rounds. And all pairs, for up to about 400 nodes: Floyd-Warshall, cubic.

Three near misses that look like shortest path and are not. "Minimum total cable to connect every building" is a spanning tree: every node connected, no single destination. "Use every ticket exactly once" is an Eulerian path, and nothing is minimised. "Fewest moves in a maze" is plain breadth-first search, because every move costs 1, and reaching for Dijkstra reads as not knowing the ladder.

## Dijkstra and its invariant

The template is lazy-deletion Dijkstra. Push pairs of distance and node onto a min-heap. Pop the smallest. If its distance is larger than the best recorded for that node, it is stale; skip it. Otherwise relax its neighbours, pushing a new entry for every improvement. The skip replaces the decrease-key operation that neither Python's heap module nor JavaScript provides. JavaScript has no priority queue at all, so have the twenty-line heap ready.

The invariant: a non-stale pop is final. Why? Suppose u pops at distance d, and some cheaper path to u exists. That path must leave the settled set through some edge into an unsettled node y, which is sitting in the heap with a key no bigger than that path's prefix. The heap popped u first, so d is at most y's key, and the rest of the path from y to u is non-negative. So the path costs at least d. Contradiction. A negative edge breaks exactly that last step.

Here is the counterexample to have ready. Four nodes. S to A costs 2. S to B costs 4. B to A costs minus 3. A to T costs 1. Dijkstra with an early exit at T: what does it return, and what is the truth?

[pause]

It pops A at 2 and relaxes T to 3. It pops T at 3, before B at 4 is ever expanded, and returns 3. The real path, S to B to A to T, costs 4 minus 3 plus 1, which is 2. Nothing detects the problem, which is why the precondition has to be said out loud.

On cost: every push follows a successful relaxation, so there are at most one more than the number of edges, and time is edges times log vertices.

## The four bugs

The lesson's Network Delay graph has four nodes. 1 to 2 costs 1. 2 to 3 costs 2. 1 to 3 costs 4. 3 to 4 costs 1. And 2 to 4 costs 5. Dijkstra from node 1 settles node 2 at 1, improves node 3 from 4 to 3 by going through 2, then improves node 4 from 6 to 4 through 3. The answer, the time until every node has the signal, is 4. Two stale entries pop along the way, the old 4 for node 3 and the old 6 for node 4, and both are skipped.

Bug one: using breadth-first order with weights added. Breadth-first on this graph fixes node 3 at 4 by the direct hop and node 4 at 6, and answers 6. Answers come out too large on weighted inputs and correct on unit weights.

Bug two: marking nodes visited when pushed, out of breadth-first habit. Same symptom: node 3 is frozen at 4 and never improved to 3. Settle on pop, not on push.

Bug three: no stale check. Answers stay correct, but every stale node re-scans its edges. The lesson measured a dense graph of 2,000 nodes and a million edges: 4.45 million edge scans instead of 1 million, 820 milliseconds against 190. The stale check is a performance guard, not a correctness one.

Bug four: pushing a distance paired with a node object. Python compares tuples element by element, so on the first tie in distance it compares the node objects and raises a type error. Use an integer identifier or a counter as the tie-breaker.

## Bounded stops and Bellman-Ford

Cheapest Flights Within K Stops. The invariant for Bellman-Ford: after round i, each distance is the cheapest path using at most i edges. Round i plus one extends each of those by one edge. k stops means k plus one edges, so k plus one rounds.

The trap is relaxing in place. The invariant needs every read to come from the previous round. Relax in place, and a value written earlier in the same round gets read later in that round, so longer paths leak in. In the lesson's example with k equal to 1, the correct answer is 700, a one-stop route. Relaxed in place, a two-stop route at 400 sneaks in during the first round. Too cheap, and wrong. Copy the distances at the start of each round.

Why not Dijkstra with one distance per city? Because a pricier route with fewer edges must survive. Dijkstra improves a city through a cheaper, longer route, cannot extend that route within the limit, then throws away the shorter, pricier entry as stale, and can return minus one when a valid route exists. The fix is to key states on the node and the number of edges used.

## Zero-one search, minimax, and spanning trees

Zero-one breadth-first search is Dijkstra with a two-bucket queue. The invariant: the deque holds distance d at the front and d plus one at the back. A zero-weight edge produces d, so that neighbour goes to the front. A one-weight edge produces d plus one, so it goes to the back. The front is always a minimum, which is all Dijkstra needs. A node can improve at most once, from d plus one to d, so it enters the deque at most twice, and the total stays linear.

Swim in Rising Water: a grid of elevations, and at time t you can stand on any cell no higher than t. What is the earliest time you can cross? A path's cost is its highest cell, so replace plus with max. Why does settle-on-pop still hold? Dijkstra needs only that extending a path never lowers its cost. A running maximum never decreases, whatever the values, so this needs no non-negativity assumption at all. Binary search on the time with a breadth-first search per probe also works, and so does union-find adding cells in height order.

Min Cost to Connect Points looks like routing and is a spanning tree. On a complete graph of Manhattan distances, array-based Prim's algorithm is quadratic and never lists the edges. For 2,000 points, a heap or Kruskal would need to handle 4 million edges.

## In the interview

Some edges are negative. The candidate suggests adding a constant to every weight so they are all positive. What is wrong with that?

[pause]

It penalises paths with more edges, so it changes which path is cheapest. Use Bellman-Ford, or topological relaxation if the graph has no cycles, and run one extra round: any relaxation in that round means a reachable negative cycle.

And the scale question: a road network of 10 million nodes and millions of queries. Plain Dijkstra explores a large part of the graph per query. Bidirectional search roughly halves the explored radius, A-star with a distance lower bound focuses it, and production routers precompute shortcuts called contraction hierarchies, so a query settles only hundreds to thousands of nodes. Floyd-Warshall once and look up is the wrong answer: 10 to the 14 table entries.

## Recap

Four things to remember. Walk down the ladder out loud and pick the cheapest rung: breadth-first for equal weights, the deque for 0 and 1, topological order for no cycles, Dijkstra for non-negative weights, Bellman-Ford for negative edges or a stop limit. Dijkstra's precondition is non-negative weights, and the four-node counterexample proves it. Settle on pop, skip stale entries, and never let an object break a tie. And k stops is k plus one edges, relaxed from a copy of the previous round; minimax is Dijkstra with max, because max never decreases.

At your desk: the three templates and the JavaScript heap, the Network Delay and zero-one traces, the K Stops, Swim and Prim traces, the tables, the visualisations, and the two exercises.
