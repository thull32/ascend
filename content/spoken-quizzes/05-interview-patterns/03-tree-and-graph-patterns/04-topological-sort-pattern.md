---
lesson: topological-sort-pattern
source: fbecd516dc3b99dc
---
## 1

Course Schedule gives prerequisites as pairs a, b, meaning b must be taken before a. A candidate builds the edge from a to b, and runs Kahn's algorithm. With 3 courses and the pairs 1, 0 and 2, 1, what is the output?

A, an empty list, since the edges now form a cycle. B, 1, 0, 2, an order that satisfies one pair only. C, 0, 1, 2, which is the correct order. D, 2, 1, 0, the valid order exactly reversed.

[think]

The answer is D: 2, 1, 0, the valid order reversed.

Reversing every edge reverses every valid order, so the output fails any test that checks the constraints. Cycle detection is unaffected, because a reversed cycle is still a cycle and a reversed chain is still acyclic. That is why the bug survives the cyclic test cases.

## 2

Kahn's algorithm runs on 5 nodes, with edges 0 to 1, 1 to 2, 2 to 3, 3 to 1, and 3 to 4. It emits only node 0. Which statement about the four nodes it never emits is right?

A, only node 4 is a problem, since its in-degree is 1. B, all four lie on one cycle, and form the answer. C, nodes 1, 2 and 3 form the cycle, and 4 is stuck downstream. D, they are isolated nodes that the loop never reached.

[think]

The answer is C: 1, 2 and 3 form the cycle, and 4 is stuck downstream.

Nodes on a cycle keep an in-degree of at least one from their predecessor on the cycle, and anything reachable only through them also waits. Node 4 has in-degree 1 from node 3 but is not on the cycle, so Kahn's leftovers over-report the cycle. A three-colour depth-first search finds it exactly, as the grey stack 1, 2, 3.

## 3

In a three-colour depth-first search for topological order, the search at node 2 finds an edge to node 3, which is already black. What does that mean?

A, no cycle: 3 finished earlier, and precedes nothing of 2's. B, a cycle through 2 and 3, since 3 was already visited. C, node 3 must be moved after 2 in the final output. D, the search must restart from node 3 to recolour it.

[think]

The answer is A: no cycle; 3 finished earlier.

Black means node 3 and everything below it have finished, so 3 already sits later than 2 in the reversed post-order, which is what the edge requires. Only an edge to a grey node, one still on the current path, closes a cycle. Treating any visited node as a cycle rejects the diamond, where 0 points to 1 and 2, and both point to 3.

## 4

How can Kahn's algorithm tell whether the topological order is unique?

A, if the queue never holds more than one node at a time. B, if the depth-first order and Kahn's order happen to be equal. C, if the graph has exactly n minus 1 edges. D, if exactly one node has in-degree zero at the start.

[think]

The answer is A: the order is unique when the queue never holds more than one node.

Two nodes in the queue at once are both ready, and either could go first, which gives two different valid orders. A single source at the start is not enough: the diamond, where 0 points to 1 and 2, and both point to 3, has one source and still two orders, because the fork is in the middle. And the edge count says nothing about how free the order is.

## 5

In an Alien Dictionary input, the word a b c appears directly before the word a b. What should happen?

A, report the input invalid, since no alphabet sorts it. B, ignore the pair, since prefixes carry no information. C, add an edge from c to an end-of-word marker. D, treat it as a cycle between the letters a and b.

[think]

The answer is A: report the input invalid.

A proper prefix sorts before its extension under every alphabet. No position differs, and the earlier word is longer, so the pair yields no edge, and the check has to be explicit. Ignoring it returns an alphabet for an impossible input.

## 6

Minimum Height Trees strips leaves round by round, and stops when at most two nodes remain. Why can there never be three answers?

A, there can be three; returning two is only a convention. B, because every tree has an odd number of nodes. C, because a longest path has one middle node or one middle edge. D, because each round removes at least half of the nodes.

[think]

The answer is C: a longest path has one middle node or one middle edge.

Each round removes one node from each end of every longest path. What survives is the middle of a longest path: one node when that path has an odd number of nodes, and the two ends of the middle edge when it has an even number.
