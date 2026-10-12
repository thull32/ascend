---
lesson: strongly-connected-components
source: d88f1ae40889db41
---
## 1

In Kosaraju's algorithm, why are nodes processed on the reversed graph in decreasing finish time, rather than increasing?

A, it keeps the recursion shallow on the reversed graph. B, the latest finisher is in a source component, which becomes a sink once reversed. C, the latest finisher is in a sink component, so its search stays inside. D, either order works, since each search still finds one component.

[think]

The answer is B: the latest finisher is in a source component, a sink once reversed.

The first search orders components so that the sources of the condensation finish last. Reversing the edges turns sources into sinks, and a search started from a sink collects exactly that component and cannot leak into others. Increasing order would start from a source of the reversed graph, and swallow several components.

## 2

During Tarjan's search, node u has an edge to a visited node v that has already been popped off the stack. What should happen to u's low value?

A, nothing, because v's component is already closed. B, re-push v, so its component can be reopened with u. C, take the smaller of u's low and v's low, as after a tree edge. D, take the smaller of u's low and v's discovery time, as for any back edge.

[think]

The answer is A: nothing, because v's component is already closed.

A popped node belongs to a finished strongly connected component, which cannot be part of u's. Updating u's low value from it would wrongly merge u into a closed component. Only edges to nodes still on the stack, the open components, update low, and they use v's discovery time.

## 3

The condensation of a graph is A B C, then D E, then F, in a chain. Tarjan's algorithm outputs the components in the order F, then D E, then A B C. What does that ordering give you for free?

A, a reverse topological order of the condensation. B, nothing useful, since the order depends on the start. C, the components sorted by size, smallest first. D, a topological order of the condensation, sources first.

[think]

The answer is A: a reverse topological order of the condensation.

A component is emitted only once everything reachable from it has been emitted, so the sink, F, comes first, not the source. Processing components in emission order lets a dynamic programming pass over the condensation compute values that depend on successors, with no separate sort.

## 4

Which of these problems is 2-SAT, and so solvable in linear time?

A, each job picks slot A or slot B, and given pairs must, or must not, share a slot. B, order the jobs so every precedence pair is respected. C, jobs pick one of three slots, and given pairs must not share. D, pick the fewest jobs so that every conflict pair has one picked.

[think]

The answer is A: each job picks slot A or B, with pairs that must or must not share.

Two choices per item, with constraints on pairs, is 2-SAT: "must not share" is a or b, and not a or not b; "must share" is a or not b, and not a or b. Three slots is like 3-colouring, NP-hard in general. Minimum vertex cover is NP-hard, and ordering is a topological sort.

## 5

A condensation has 3 source components and 5 sink components. What is the minimum number of edges you must add to make the whole graph strongly connected?

A, 8. B, 15. C, 5. D, 3.

[think]

The answer is C: 5.

Every source needs an incoming edge and every sink an outgoing one, and one added edge from a sink to a source fixes one of each. So the larger of the two counts, 5, is necessary, and a matching argument shows 5 is enough.

## 6

A Tarjan implementation drops the on-stack check, and updates low from the discovery time of every visited neighbour. The graph has edges 0 to 1, 1 to 2, 2 to 1, 0 to 3, and 3 to 2. What does it report?

A, components 1 2, then 3, then 0, because popped nodes' discovery times are harmless. B, one component of all four nodes, because every node can now reach the cycle. C, an infinite loop, because node 2 is pushed on the stack a second time. D, components 1 2, and 0 3, wrongly merging 0 and 3 through the closed component.

[think]

The answer is D: components 1 2, and 0 3, wrongly merging 0 and 3.

After 1 and 2 are popped, the edge from 3 to 2 lowers 3's low value to 2, below its own discovery time of 3, so 3 stays on the stack. Then 0 pops 3 and 0 as one component, although 3 cannot reach 0. The check exists precisely so that edges into finished components are ignored. Nothing is re-pushed, and the cycle closes before 3 is discovered.
