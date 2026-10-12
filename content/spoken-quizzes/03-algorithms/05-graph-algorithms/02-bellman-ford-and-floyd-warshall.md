---
lesson: bellman-ford-and-floyd-warshall
source: 753512a69af9e26a
---
## 1

A graph has no negative cycle, and the shortest path from the source to node X uses 4 edges. After how many full rounds of Bellman-Ford is X's distance guaranteed to be correct, whatever the edge order?

A, it depends on the weights. B, 4. C, 1. D, always V minus 1.

[think]

The answer is B: 4.

Round i finalises every node whose shortest path has at most i edges, by induction along the path. V minus 1 is the worst case over all nodes, not the bound for a specific one. With a lucky edge order it can be faster, but 4 rounds is the guarantee.

## 2

In Bellman-Ford, you leave out the guard that skips edges whose tail is still at infinity, and you represent infinity as the integer 10 to the 18. What can go wrong?

A, unreachable nodes can gain finite distances, and phantom cycles. B, only the early exit breaks, so it always runs V minus 1 rounds. C, nothing; the comparison still fails for unreachable nodes. D, it overflows on the first addition and crashes the program.

[think]

The answer is A: unreachable nodes can gain finite distances, and phantom cycles.

10 to the 18, plus minus 3, is less than 10 to the 18, so relaxation goes ahead from an unreachable node. That produces bogus finite distances, and lets a negative cycle the source cannot reach trigger the final-round check. A 64-bit integer holds about 9 times 10 to the 18, so small weights do not overflow; the bug is silent. Float infinity happens to behave, which is why this hides in Python and appears in C plus plus.

## 3

Why must k, the intermediate node, be the outermost loop in Floyd-Warshall?

A, for cache locality: the inner loop then scans a single row. B, so the diagonal entry for k is updated before any pair uses it. C, it need not be; any loop order converges to the same distances. D, stage k must finish for all pairs before stage k plus 1 uses it.

[think]

The answer is D: stage k must finish for all pairs before stage k plus 1 uses it.

At stage k, each entry is the best path using only intermediates below k, and the next stage builds on the paths into k and out of k from that stage. If k varies innermost, you compute paths with at most one intermediate, and miss multi-hop improvements. Locality is a real but secondary concern.

## 4

You need the cheapest route between two airports with at most 3 stops. What is the right approach?

A, Floyd-Warshall, then read the pair from the matrix. B, 4 rounds of Bellman-Ford, relaxing in place to save memory. C, Dijkstra, stopping as soon as the destination is popped. D, 4 rounds of Bellman-Ford, relaxing against a copied array.

[think]

The answer is D: 4 rounds of Bellman-Ford, relaxing against a copied array.

Three stops means at most four flights, and k rounds against a copy of the previous round's distances computes the cheapest route using at most k edges, exactly. Relaxing in place can chain several edges within one round and break the limit. Dijkstra's settled-node rule fails when a cheaper path may be disqualified by its edge count, and Floyd-Warshall ignores the limit entirely.

## 5

After Floyd-Warshall finishes, the diagonal entry for node 3, its distance to itself, is minus 5. What does that mean?

A, the cheapest edge out of node 3 has weight minus 5. B, it is a bug; the diagonal is set to zero and can never change. C, node 3 lies on a cycle whose total weight is negative. D, node 3 cannot reach itself, so minus 5 marks it as unreachable.

[think]

The answer is C: node 3 lies on a cycle whose total weight is negative.

The diagonal starts at zero and can only decrease if some cycle through that node has a negative total, so shortest paths through node 3 are undefined. This is the global negative-cycle check that Bellman-Ford from a single source cannot provide.

## 6

Johnson's algorithm reweights every edge from u to v as its weight plus h of u minus h of v, where h comes from one Bellman-Ford run. Why are the new weights never negative, and why are shortest paths preserved?

A, Bellman-Ford ends with h of v at most h of u plus the weight, and the h terms telescope along paths. B, the reweighting is a heuristic; it preserves paths only when h is admissible. C, h is the shortest distance to v, so the new weight is at most zero. D, h is the node degree, so the shift cancels out on every cycle.

[think]

The answer is A: h of v is at most h of u plus the weight, and the h terms telescope.

When Bellman-Ford finishes, no edge can relax, which is exactly that inequality, so every new weight is zero or more. Along any path from a to b, the intermediate h values cancel, leaving the old path weight plus h of a minus h of b: a constant shift for that pair, so the order of paths between them is unchanged. Admissibility is an A star idea and does not apply.
