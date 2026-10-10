---
lesson: topological-sort-pattern
source: 7fdff1f2d16c24ad
fit: partial
desk:
  - "Kahn's algorithm and the three-colour DFS in Python and JavaScript, including the iterative node-and-next-index form"
  - "The Course Schedule Two, Alien Dictionary and Minimum Height Trees traces with the in-degree table at every step"
  - "The queue against min-heap trace, and the shortest path in a weighted DAG"
  - "The comparison, near-misses and variations tables"
  - "Exercises: minimum number of semesters, and whether the course order is unique"
---
## Introduction

Some tasks must happen before others. Course B needs course A. Package X imports package Y. The link step needs the compile step. You are asked for an order that respects every constraint, or whether one exists at all, or how many rounds it takes if independent tasks run in parallel. Trying orderings is n factorial. A traversal that ignores edge direction finds components, not orders.

Topological sort is the linear-time answer, and it comes with a cycle detector built in. If the constraints contradict each other, A before B and B before A, no order exists, and Kahn's algorithm discovers that by running out of tasks to start before it has placed them all. Interviewers like it because the graph is never handed to you. You build it from pairs, from adjacent words, from an implicit "this depends on that", and the building is where the mistakes hide.

Coming up: the signal, the two algorithms and why they are correct, the edge-direction trap, and the follow-ups that turn it into something else.

## The signal

Reach for it when the statement says "prerequisites", "dependencies", "must be taken before", "must finish before". The pairs are directed edges and the output is an order. "Is it possible to finish all" is cycle detection on a directed graph. "Derive the order of letters from a sorted list of words" is pairwise constraints, and the answer is any topological order. "Minimum number of rounds if independent tasks run in parallel" is the number of levels in Kahn's algorithm. And "find the centre of a tree" is Kahn's shape on an undirected tree, peeling leaves layer by layer.

What rules it out. Undirected edges and a connectivity question belong to traversal or union-find. Weights and a cheapest route belong to shortest paths, with one exception: a weighted graph with no cycles, where one pass in topological order handles every edge, negative weights included. And a cap on tasks per round, "at most k courses per semester", changes the problem class entirely. More on that at the end.

## Kahn's algorithm

Count each node's in-degree, the number of edges coming into it. Put every node with in-degree zero in a queue. Repeatedly take one out, emit it, and decrement the in-degree of everything it points to. A node whose in-degree hits zero becomes ready and joins the queue. If fewer than n nodes come out, the rest are on a cycle or downstream of one.

Take the diamond: four courses. 0 points to 1 and to 2, and both 1 and 2 point to 3. In-degrees: 0 for node 0, 1 each for nodes 1 and 2, and 2 for node 3. The queue starts with 0. Emit 0; nodes 1 and 2 drop to zero, so both join. Emit 1; node 3 drops to 1. Emit 2; node 3 drops to zero and joins. Emit 3. The order is 0, 1, 2, 3.

Notice the moment the queue held two nodes, 1 and 2. That is exactly when the order stops being unique: 0, 2, 1, 3 is equally valid. Say so in the interview; the grader accepts any valid order.

Why it is correct, in two halves. It never emits a node too early: a node's in-degree drops only when a predecessor is emitted, so it reaches zero only after all its predecessors are out. And it emits everything if and only if there is no cycle. On a cycle, each node keeps an in-degree of at least one from its predecessor on the cycle, which is itself waiting, so none of them is ever emitted. Without a cycle, every non-empty acyclic graph has a node with no incoming edge, so the queue cannot run dry while nodes remain.

Each node is enqueued and dequeued once, and each dequeue walks that node's outgoing edges, so the cost is linear in nodes plus edges.

## Three-colour depth-first search

The alternative colours nodes white for unseen, grey for on the current path, and black for finished. A node is appended when it finishes, after everything it points to, and the reversed finishing order is a valid topological order.

The cycle test is an edge to a grey node: that node is an ancestor on the current path, so you have just closed a loop. Now, in the diamond, the search finishes 3 by way of 1, then goes into 2 and finds an edge to 3, which is already black. Is that a cycle?

[pause]

No. Black means 3 and everything below it already finished, so it sits later in the reversed order, which is what the edge requires. Only grey closes a cycle. A candidate who treats any visited neighbour as a cycle rejects the diamond, which has no cycle at all.

When do you pick which? Kahn's gives levels for free, which answers "minimum rounds", and has no recursion. The depth-first version can name the cycle: the grey stack, from the node the back edge points to upward, is the cycle itself. In JavaScript write it iteratively, because in the lesson's test Node's default stack overflowed between 5,000 and 5,500 frames. The iterative version must keep each node on its stack together with the index of the next neighbour to examine, so the node stays grey until all its neighbours finish. Popping it when it is first expanded turns it black too early and the order comes out wrong.

## The edge-direction trap and other build bugs

Course Schedule gives pairs a, b meaning "take b before a". So the edge goes from b to a: from the prerequisite to the course that needs it. Read the construction line back as a sentence before moving on.

Here is why it matters so much. If you build it backwards, every valid order comes out reversed. On a chain 0 then 1 then 2, you return 2, 1, 0. But a reversed cycle is still a cycle and a reversed chain is still acyclic, so every cycle test still passes. The bug only shows on the tests that check the order.

Now the cyclic case. Five nodes: 0 points to 1, 1 to 2, 2 to 3, 3 back to 1, and 3 also to 4. Kahn's emits 0 and stops. Four nodes are stuck, but only 1, 2 and 3 are on the cycle. Node 4 is merely downstream. That distinction matters when the interviewer asks you to report the cycle.

Valid inputs that wrongly report a cycle usually mean the count came up short for another reason. Nodes that appear in no edge were never created. Labels were one-indexed. Or duplicate edges inflated an in-degree. Create every node up front, and count an edge in the in-degree only when you actually add it.

## Alien Dictionary and Minimum Height Trees

Alien Dictionary gives words sorted in an unknown alphabet and asks you to recover it. Each adjacent pair of words gives at most one edge: at the first position where they differ, the earlier word's letter comes before the later word's. Everything after that position tells you nothing. Use adjacent pairs only; non-adjacent pairs are implied by transitivity.

Two edge cases decide the round. A word followed by its own proper prefix, abc before ab, is invalid under any alphabet. No position differs, so you get no edge, and the check has to be explicit. And every letter that appears anywhere must be a node, even with no edges. Then the duplicate-edge trap: in the words ca, cb, da, db, both pairs say a before b. Store the adjacency as a set but increment b's in-degree twice, and b needs two decrements but only ever receives one. The function returns empty for a valid input.

Minimum Height Trees asks which roots of an undirected tree minimise its height. The answer is the tree's centre, the middle of a longest path. Strip every leaf, which shortens every longest path by one at each end, and repeat until at most two nodes remain. It is Kahn's with "in-degree zero" replaced by "degree one". Why never three answers? A longest path has either one middle node or one middle edge, and a middle edge has two ends. Linear time, each node stripped once.

## Variations and costs

The queue discipline decides which valid order you get. Swap the queue for a min-heap and you get the lexicographically smallest order, at a log factor. Sorting Kahn's output instead breaks the constraints. Is the order unique? Only if the queue never holds two nodes at once. Checking just the starting sources misses a fork in the middle, as in the diamond.

Shortest or longest path in a weighted acyclic graph: process nodes in topological order and relax each node's outgoing edges on its turn. Every edge into a node has been relaxed before its turn, so its value is final, even with negative weights. That is the property Dijkstra lacks, and the reason "acyclic" in a statement beats "weighted" when you choose.

Real systems do this. Build systems and workflow schedulers run a step once its upstream steps finish, which is Kahn's with a record of outstanding dependencies. Rejecting a cyclic definition is the depth-first half: Airflow's cycle check is a three-state search that raises on an edge to an in-progress task.

The constant-factor trap is the queue. Measured in CPython on 200 thousand nodes all ready at once: 12 milliseconds with a deque, 950 milliseconds with a list popped from the front. About 80 times slower, and quadratic from there.

## In the interview

At most k courses per semester. Can you still answer with level-by-level Kahn's, capped at k per level?

[pause]

No. Which ready courses you take now starts to matter. With k equal to 2, a chain A, B, C, D plus two independent courses E and F: taking E and F first needs 5 semesters, taking A and E first needs 4. For up to about 15 courses, use dynamic programming over bitmasks of completed courses. In general, with k part of the input, the problem is NP-hard, and real schedulers use critical-path heuristics.

And: there is a cycle, return it. Switch to three-colour depth-first search and keep the stack; the back edge to a grey node closes the cycle you can read off the stack. "The nodes Kahn's did not emit" is wrong, because that also includes everything downstream.

## Recap

Four things to remember. "Must come before" is a directed acyclic graph; build the edge from prerequisite to dependent and read the line back as a sentence, because cycle tests cannot catch a reversed edge. Kahn's emits a node only when its in-degree hits zero, and fewer than n emitted means a cycle; the queue holding two nodes means the order is not unique. In three-colour search only a grey neighbour is a cycle, and the grey stack names it. And know the follow-ups: a min-heap for the smallest order, levels for rounds, and a per-round cap that changes the problem class.

At your desk: both algorithms in both languages, the course, dictionary and tree traces, the heap and weighted-path traces, the three tables, and the two exercises.
