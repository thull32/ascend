---
lesson: shortest-paths-dijkstra
source: f288d117032c71ff
fit: partial
desk:
  - "The six-node trace with the lazy-deletion heap, pop by pop, and the proof run on its cut"
  - "The heap code with the stale-entry guard, and the 0-1 BFS deque code"
  - "The continental road-graph cost numbers and the table of Dijkstra variants"
  - "Exercises: Dijkstra with lazy deletion, and 0-1 BFS through walls"
---
## Introduction

BFS finds the path with the fewest edges. The moment edges have different costs, milliseconds between routers, metres between intersections, dollars between airports, the fewest-edge path is usually not the cheapest. A two-hop path of cost 3 has to be discovered before a one-hop path of cost 10, and a first-in, first-out queue cannot do that.

Dijkstra's algorithm repairs BFS with one substitution: replace the plain queue with a priority queue keyed on tentative distance. That is the whole algorithm. Everything else, the proof, the complexity, the failure with negative weights and the classic bug, follows from asking why pulling the smallest tentative distance is safe.

Three ideas, then. The invariant, and the exact sentence of its proof that needs non-negative weights. The heap implementation that real code uses, and the bug almost everyone writes. And the problems that look like Dijkstra but are not.

## The invariant

Keep a tentative distance for every node, infinity until you find any path, and a set of settled nodes whose distance is final. The source starts at zero. Then repeat: take the unsettled node with the smallest tentative distance, settle it, and relax each of its outgoing edges. Relaxing an edge from u to v means: if the distance to u plus the edge weight beats the distance to v, lower v's distance.

The invariant: when a node is settled, its tentative distance is its true shortest distance.

Here is why, in words. Suppose u is the unsettled node with the smallest tentative distance, but some shorter path to u exists. That path starts at the source, inside the settled set, so at some point it crosses from a settled node x to an unsettled node y. When x was settled, that edge was relaxed, so y's tentative distance is at most the cost of the path up to y. Now the key sentence: with non-negative weights, the rest of the path from y to u can only add cost. So y's tentative distance is less than u's. But u was the smallest. Contradiction.

Remember where non-negativity was used: "the rest of the path can only add cost." A single negative edge later on the path breaks that step, and the whole algorithm with it.

Here is the smallest example that shows the mechanism. Three nodes, all edges directed. A to B, weight 4. A to C, weight 2. C to B, weight 1. Start at A.

Settle A at zero. Relax its edges: B gets 4, C gets 2. The smallest unsettled is C, at 2, so settle C. Relax C to B: 2 plus 1 is 3, which beats 4, so B drops to 3. Now settle B at 3. Is 3 safe? Any other path to B must leave the settled set, A and C, through one of their edges, and every such edge was already relaxed. Nothing can come back cheaper, because no edge subtracts cost.

## The heap, and the bug

Textbooks describe Dijkstra with a decrease-key operation: when a distance improves, lower that node's priority inside the heap. Python's heapq has no decrease-key, nor does JavaScript, nor most production code. Real code uses lazy deletion instead. Every time a distance improves, push a new entry with the new distance. When you pop an entry, skip it if its distance is worse than the node's current best.

In the three-node example, when C improves B from 4 to 3, the old entry for B at 4 is still in the heap. The algorithm does not touch it; it pushes a second entry, B at 3. The 3 pops first, B is settled, and later the stale 4 surfaces and the guard throws it away.

That one guard line is where people go wrong, in two directions. Before I tell you which one is harmless: one mistake is deleting the guard, the other is replacing it with a visited set checked when you push. Which one returns wrong answers?

[pause]

Deleting the guard is harmless to correctness. Re-expanding a stale entry cannot lower any distance below what the fresh entry already achieved. It only wastes work, re-scanning the node's edges. So the guard is a performance guard, not the correctness fix.

The visited set checked at push time is the real bug. On the same three nodes, A pushes B at 4 and marks it visited. When C finds the cheaper route at 3, B is already marked, so the push is refused, and B keeps 4. The answer is silently wrong. The rule to carry: a node is settled when it is popped for the first time, never when it is pushed.

Now the complexity, and why it is what it is. With lazy deletion the heap holds at most one entry per successful relaxation, so at most E entries, one per edge, not one per node. Each push or pop costs a logarithm of that, which is the same order as log V. So the total is order V plus E, times log V. On a dense graph, where E is close to V squared, that log factor is pure overhead, and the old array-scan version wins: find the minimum by scanning V entries, V times, order V squared, no heap at all. The lesson's quiz case: 10 thousand nodes and 50 million edges. That is dense, so scan the array.

## What it cannot do

First, negative edges. Three nodes again. A to B, weight 2. A to C, weight 5. C to B, minus 4. Dijkstra settles B at 2, then C at 5, then relaxes C to B and finds 5 minus 4, which is 1. But B is already settled. Its true distance is 1, it was recorded as 2, and anything downstream of B inherits the error. Some implementations re-push B and get this graph right by accident, which is worse: the algorithm is now exponential in the worst case, and still fails with negative cycles. If edges can be negative, use Bellman-Ford.

Second, constrained paths. "Cheapest flight with at most k stops" is not a Dijkstra problem, even with every weight positive. The cheapest way into an intermediate node might use too many edges and be disqualified, so "settled means final" no longer holds for a node. It only holds for a pair: the node and the number of stops used. Either run Dijkstra over those pairs, or run k plus 1 rounds of Bellman-Ford relaxation against a copied array.

Third, a problem that looks different but is Dijkstra: the path whose maximum edge is smallest, a bottleneck path. Change the relaxation from a sum to a maximum. The proof only needed "cost never decreases along a path", and maximum satisfies that too. Dijkstra works for any monotone path cost. Recognising that is a senior signal.

## Small weights, paths, and early exit

When every weight is 0 or 1, knock down a wall for 1, walk free for 0, the heap is overkill. Use a double-ended queue. Relaxing a zero-weight edge pushes the neighbour to the front; a one-weight edge pushes it to the back. The deque only ever holds two distances, d at the front and d plus 1 at the back, in order. That is exactly the guarantee the heap gave you, at constant cost per operation, so the whole thing is linear, order V plus E. This is zero-one BFS. Its generalisation to small integer weights up to some C is Dial's algorithm: C plus 1 buckets, scanned in rotation.

Interviewers almost always follow "return the distance" with "return the path". Store a predecessor for each node whenever you relax into it successfully, then walk back from the target. Because it is only rewritten on a strict improvement, it always points along a shortest path. The wrong answer is carrying the whole path inside each heap entry, which makes every push cost order V.

If you only care about one target, stop when the target is popped, not when it is pushed. Popped means settled; pushed means nothing. And for many sources at once, nearest hospital from every house, push every source at distance zero before the loop. The invariant does not care how many nodes start at zero.

## Where it runs, with numbers

Link-state routing protocols, OSPF and IS-IS, flood the topology to every router, and each router runs Dijkstra from itself. That is why they are called "shortest path first" protocols. In practice the algorithm is not the bottleneck: routers throttle recomputation on purpose, so a flapping link does not trigger a run per flap, and they recompute only the part of the tree below a changed link.

Map services are the other home, and here the numbers matter. A continental road network has on the order of 10 million intersections and 25 million road segments. A full single-source run does roughly a billion heap comparisons. Tuned compiled code does that in a few seconds; pure Python lands in minutes. Neither is acceptable for an interactive query, which is why route planners precompute, and why A-star exists. Memory too: an adjacency list of Python tuples costs about 2.4 gigabytes for those edges, against about 200 megabytes as three flat arrays.

The textbook's better bound comes from a Fibonacci heap, and almost nobody uses it. Each node carries four pointers, every operation chases pointers, and on sparse road graphs the binary heap wins on wall-clock time. SciPy made exactly that trade in 2025, replacing its Fibonacci heap with a plain binary heap and the same lazy stale check, as a speed-up.

Two production bugs from the lesson. In Rust, Go, Java or C, if infinity is the largest integer, infinity plus a weight wraps around to a huge negative number that wins every comparison, and every distance comes out wildly negative. Skip infinite nodes, or use saturating addition. And if heap entries tie on distance and the payload cannot be compared, Python raises an error, but only on the one graph with two equal-cost routes. Add a counter as a tie-breaker.

## In the interview

A follow-up the lesson expects. The weights are all 1. What changes?

[pause]

The heap is unnecessary. A plain queue already pops nodes in non-decreasing distance when every edge costs the same, so BFS gives the same answer in linear time. The weak answer is "Dijkstra still works, so nothing changes". That is true, and it is the answer that gets you asked why you did not notice.

And a harder one: how do you stop a bidirectional Dijkstra? Run one search forward from the source and one backward from the target. The tempting answer is "stop when the frontiers touch", and it is wrong, because the first meeting node is not necessarily on the cheapest path. Stop when the two heap tops together are at least the best combined distance seen at any node both searches have reached.

## Recap

Four things to remember. Settled means final, and the proof uses non-negative weights in exactly one sentence: the rest of the path can only add cost. Settle on pop, never on push; the stale check is a performance guard, and a visited set at push time is the real bug. The lazy heap holds up to E entries, so the cost is order E log V, and on a dense graph the plain array scan wins. And Dijkstra fits any monotone path cost, sums or maxima, but not negative edges and not a stop limit, unless the stop count becomes part of the state.

At your desk: the six-node trace and the proof run on its cut, the heap and deque code, the road-graph numbers and the variant table, and the two exercises.
