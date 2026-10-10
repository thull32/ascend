---
lesson: strongly-connected-components
source: c6c249ff0bd4c479
fit: partial
desk:
  - "Kosaraju's two passes on the six-node graph, with the finish order and the reversed edges"
  - "The fourteen-event Tarjan trace with discovery times, low-links and the stack"
  - "The recursive and iterative Tarjan code, and the 2-SAT code"
  - "The 2-SAT implication-graph trace, satisfiable and then unsatisfiable"
  - "The trade-offs table and the quantified costs"
  - "Exercises: strongly connected components, and 2-SAT via the implication graph"
---
## Introduction

A directed graph with a cycle in it cannot be topologically sorted, cannot be fed to a DAG dynamic program, and cannot be resolved the way build systems and package managers need. But real dependency graphs are rarely one giant cycle. They are mostly a DAG with a few knots. A microservice call graph where A calls B, B calls C and C calls A is a knot; everything else flows. Compilers see the same shape in control flow, where loops are the knots.

A strongly connected component is a maximal set of nodes where every node can reach every other. Collapse each one to a single node and you get the condensation, which is always a DAG. So finding these components is the operation that turns an arbitrary directed graph into something you can reason about, and two linear-time algorithms do it.

Three things, then: Kosaraju's two passes and the one fact that makes them work, Tarjan's one pass and its low-link value, and what you do with the DAG afterwards, including 2-SAT.

## The example

One small graph for the whole episode. Five nodes. A triangle: A to B, B to C, C back to A. A pair: D to E, and E back to D. And one edge joining them, from B to D.

A, B and C can all reach each other, so they are one component. D and E reach each other, so they are another. And B to D runs one way only: nothing in the pair can get back to the triangle. The condensation is two nodes, the triangle pointing at the pair. The triangle is a source, the pair is a sink.

## Kosaraju: two passes

Kosaraju's algorithm. First, run DFS and record each node when it finishes. Second, reverse every edge. Third, take nodes in decreasing finish time, and each DFS on the reversed graph from an unvisited node collects exactly one component.

Why it works comes down to one fact. The node that finishes last lies in a source component of the condensation. Reversing the edges turns that source into a sink, so a DFS from it on the reversed graph cannot escape. It finds exactly its own component.

On our graph, start the first DFS at A. It goes A, B, C; C's edge back to A leads nowhere new, so C finishes. Back in B, go to D, then E; E's edge back to D leads nowhere new, so E finishes, then D, then B, then A. A finishes last, and A is in the triangle, the source. Reverse the edges and search from A: you collect A, C and B, and the reversed B-to-D edge now points into B, not out of it, so the search stops. Then D, the latest unvisited finisher, collects D and E.

Before I say it: what goes wrong if you take the second pass in increasing finish order instead?

[pause]

Sooner or later a search starts in a component that is a source of the reversed graph, and it swallows its successors. On the lesson's six-node version, the first search, from C, happens to find the triangle. The second starts at the sink node F, walks into D and E on the reversed graph, and reports all three as one component, although F cannot reach D. The order is the whole proof.

The cost: two DFS passes and a reversed copy of the graph, order V plus E. And a bonus: Kosaraju's component numbers come out in topological order of the condensation, sources first.

## Tarjan: one pass with low-links

Tarjan does the same job in one DFS. Each node gets a discovery time, and a low-link: the earliest discovery time it can reach by going down the DFS tree and then taking at most one edge to a node still on the stack. Nodes go on a stack when discovered and stay there until their component is complete. When a node finishes with its low-link equal to its own discovery time, nothing below it can reach anything earlier that is still open. So it is the root of a component: pop the stack down to it, and that is the component.

On our five nodes. Discover A at 0, B at 1, C at 2. C has an edge to A, which is on the stack, so C's low-link drops to 0. C finishes with low 0, not equal to its time of 2, so it is not a root, and B inherits low 0. Then B goes to D, discovered at 3, and E at 4. E's edge back to D drops E's low-link to 3. E is not a root. D finishes with low 3 equal to its time 3: it is a root, so pop E and D. Back in B, low 0, not a root. Back in A, low 0 equals time 0: pop C, B and A.

Notice the output order: the pair first, then the triangle. Sinks first. Tarjan emits components in reverse topological order, because a root only pops after everything reachable from it has already popped. That lets you run a DAG dynamic program in one pass over the emitted list, with no separate sort.

## The line people get wrong

The low-link update for an edge to an already-visited node happens only if that node is still on the stack. Why? An already-visited node might belong to a component that is already finished and popped. Following that edge would glue the current subtree to a closed component.

The lesson's four-node example. Node 0 points to 1 and to 3. Nodes 1 and 2 point at each other. And 3 points to 2. The DFS goes 0, 1, 2, and pops 1 and 2 as a component. Then it visits 3, whose edge to 2 leads into that closed component. Without the stack check, 3's low-link drops to 2's discovery time, 3 is not recognised as a root, and 3 and 0 get reported together, though 3 can never reach 0. Wrong answer, not slow, and small tests rarely catch it. And when the update does happen, use the other node's discovery time, not its low-link. Low-link would still be right for components, but it breaks the articulation-point version of this code in the next lesson.

Both algorithms are linear, and Tarjan, with one pass and no reversed graph, is the usual production choice. The catch is recursion. The DFS is as deep as the longest path. Python's default limit is 1,000 frames, JavaScript's around 10 thousand, so a chain-shaped dependency graph of a few thousand nodes crashes it. Production code uses an explicit stack of frames, each holding a node and the index of its next edge. Advance that index before descending, or a resumed frame rescans its edges and the pass turns quadratic on a star.

## The condensation, and 2-SAT

Once every node has a component, build the condensation in one pass over the edges, keeping only edges between different components. Everything that was impossible on the cyclic graph now works. Longest or heaviest path through a cyclic graph: a dynamic program over the DAG, where each component weighs the sum of its members. Cyclic imports: Go and Cargo reject cycles, and reporting the whole knot, every module involved, rather than one chain through it, is the component computation.

And the minimum number of edges to make the whole graph strongly connected. With s source components and t sink components, and more than one component, the answer is the larger of s and t. Each added edge can fix at most one source and one sink. Three sources and five sinks: five edges.

Then 2-SAT, which is the surprise. A formula is an AND of clauses with two literals each, like "a or b". General satisfiability is NP-complete; 2-SAT is linear time, and the algorithm is Tarjan's. Each clause "a or b" is two implications: if not a, then b; and if not b, then a. Build a graph with one node per literal and those two edges per clause. If a variable and its negation land in the same component, assuming either value forces its own opposite, so the formula is unsatisfiable. Otherwise it is satisfiable, and you read the assignment off the topological order.

Recognising it is the senior move. Each job in one of two slots, with pairwise conflicts. Each map label above or below its point, without overlaps. Two choices per item and pairwise constraints means 2-SAT. Three choices per item is not, and is hard in general.

## In the interview

A follow-up from the lesson. Which nodes can reach every other node?

[pause]

Build the condensation. If it has exactly one source component, its members are the answer and nobody else is. With two or more sources, nobody. Order V plus E in total. The wrong answer is a BFS from every node, V times V plus E.

And: can I use Tarjan to find cycles in an undirected graph? No. In an undirected graph every edge is a two-node cycle in the directed sense, so every connected piece would be one component. Undirected cycle detection is union-find, or a DFS that skips the parent edge.

## Recap

Four things to remember. A strongly connected component is a maximal set of mutually reachable nodes, and collapsing them gives a DAG, the condensation. Kosaraju works because the last node to finish sits in a source component, so take the second pass in decreasing finish order. Tarjan does it in one pass with low-links, updates only from nodes still on the stack, emits sinks first, and needs an iterative DFS in production. And once you have the DAG, cycles stop being special: dynamic programming, reachability, the larger of sources and sinks, and 2-SAT all fall out.

At your desk: both Kosaraju passes and the full Tarjan trace on the six-node graph, the recursive and iterative code, the 2-SAT trace, the cost table, and the two exercises.
