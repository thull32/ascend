---
lesson: topological-sort-and-dags
source: 23d2032fa1b2f380
fit: partial
desk:
  - "The eight-target build DAG with its in-degrees, and Kahn's queue traced after every step"
  - "The same run with a min-heap, and the run with a cycle added, showing the stuck set"
  - "The DFS finish-order code and its trace on the build"
  - "The critical-path table with durations, and the critical-path code"
  - "Under the hood: graphlib's TopologicalSorter as a parallel ready-set API"
  - "The trade-off table across FIFO Kahn's, DFS finish order, heap Kahn's and graphlib"
  - "Exercises: topological order with a smallest-first tiebreak, and longest path in a DAG"
---
## Introduction

A build has 4 thousand targets, and each one lists what it needs first. A migration tool has 300 migrations, each with a depends-on field. A spreadsheet has cells that reference other cells. In every case you need an order where nothing is processed before the things it depends on, and you need to detect when no such order exists because the dependencies loop.

That is topological sorting, and it only makes sense on a directed acyclic graph, a DAG. The two algorithms are short. What separates a senior answer is knowing that they produce different valid orders, that one names the cycle and the other names its victims, that the queue in Kahn's algorithm is a parallel scheduler's ready set, and that a package manager's version resolver is not a topological sort at all.

## What a topological order is

A topological order lists every vertex so that for every edge from u to v, u comes first. Picture the vertices on a line with every arrow pointing right. An order exists if and only if there is no directed cycle: a loop from a to b and back needs a before b and b before a.

Here is a small build to hold in your head. Five targets. Util has no dependencies. Db needs util. Api needs db. Cli also needs db. And pkg needs both api and cli. Draw the arrows from each dependency to what needs it: util to db, db to api, db to cli, api to pkg, cli to pkg.

Orders are rarely unique. Util and db must come first, in that order, and pkg must come last. But api and cli do not depend on each other, so either can go first. That build has exactly two valid orders.

## Kahn's algorithm

Count, for each vertex, how many arrows point into it: its in-degree. Put every vertex with in-degree zero in a queue. Then repeat: take one out, emit it, and decrement the in-degree of everything it points to. Anything that reaches zero joins the queue.

On the small build: only util starts at zero. Emit util, and db drops to zero. Emit db, and both api and cli drop to zero; the queue now holds two. Emit api, and pkg drops from two to one. Emit cli, and pkg reaches zero. Emit pkg. Order: util, db, api, cli, pkg. Each vertex enters the queue once and each edge is decremented once, so it is order V plus E.

Notice the moment the queue held two vertices. That is the test for uniqueness: if the queue ever holds two or more, the order is not unique. A unique order exists only when consecutive vertices are all joined by edges, a single path through everything.

Now the cycle check, which is the last line of the algorithm and the one people drop. If the output is shorter than the vertex count, there is a cycle. Before I give the next part: suppose someone adds an edge from api back to db. Which targets are stuck?

[pause]

All four after util. Db now waits on api, and api waits on db, so neither ever reaches zero. That is the cycle. But cli and pkg are stuck too, and they are on no cycle at all. They just depend on something that is. So Kahn's leftover set means "everything that cannot be built", which is useful output, but it is not the cycle. To name the loop, use the three-colour DFS from the last lesson, which walks parents from the grey vertex. A deploy tool that applies 47 of 50 migrations and reports success has dropped the count check.

Group Kahn's output by when each vertex became ready. Level zero is everything with no dependencies; level one is everything whose dependencies are all in level zero; and so on. On the small build that gives util, then db, then api and cli together, then pkg. Four rounds.

That is the schedule for unlimited workers, and the number of levels is the longest chain plus one: the minimum number of sequential rounds, however many workers you have. A build tool's dash j flag is this loop with a bounded pool. Python's graphlib exposes exactly this as an API: get ready hands you the whole current level, and done tells it a node has finished, so you can keep several in flight.

One more practical point: if the ready set is a hash set, ties break differently per process, and independent targets run in different orders on different runs. That is how a hidden shared-file dependency shows up as a flaky build that passes on retry. Use a sorted structure or a min-heap. A heap gives the smallest order alphabetically, for a log factor, and the same output every time.

## The DFS algorithm

The other way. A vertex in a depth-first search finishes only after everything reachable from it has finished. So reverse finish order is a topological order: run DFS from every unvisited vertex, append each vertex when it finishes, and reverse the list at the end.

On the small build, start at util. Go to db, then api, then pkg. Pkg finishes first, then api. Back in db, go to cli; its arrow to pkg leads to a finished vertex, so cli finishes, then db, then util. Finish order: pkg, api, cli, db, util. Reversed: util, db, cli, api, pkg. Valid, and different from Kahn's, which put api before cli. Two algorithms, two valid answers. On the lesson's eight-target build there are 14 valid orders in all.

The DFS version detects cycles immediately, with the grey vertex, and can tell you where the cycle is. Its cost is recursion depth on long chains. In an interview, write Kahn's by default: it is iterative, it gives the order and the cycle check in one loop, and a smallest-first tiebreak is one line.

## Why DAGs make hard problems easy

Every DAG has a source and a sink. Walk backwards along incoming arrows from anywhere; in a finite graph you either stop at a vertex with nothing pointing in, or you repeat a vertex, and a repeat would be a cycle.

And longest path, which is NP-hard on general graphs, takes one pass on a DAG. Process vertices in topological order, and each vertex's longest path is the best of its predecessors plus its own weight, because every predecessor's value is already final. With durations attached, that is the critical path of a build or a project. On the lesson's eight-target build, the critical path finishes at minute 13 with unlimited workers, while all the durations add up to 18, so parallelism can save at most 5 minutes. And speeding up any target off the critical path changes nothing.

The general principle: any recurrence whose dependencies form a DAG can be evaluated bottom-up in topological order. That is what bottom-up dynamic programming means.

## Where it runs

Make walks its rules depth-first from the goal. A circular rule is not fatal: GNU make prints "circular dependency dropped" and carries on, a topological sort that silently deletes a constraint. Bazel uses the reverse graph: when a file changes, rerun everything reachable from it along reversed arrows, and nothing else. And the graph walk is not where build time goes. Kahn's over a hundred thousand targets and a million edges took 0.26 seconds in Python; hashing a hundred thousand small inputs took 0.17, and real inputs are bigger and come from disk.

Package managers do two different things. Version resolution picks one version of each package that satisfies every range, which is constraint satisfaction, NP-hard in general; since 2020, pip's resolver is a backtracking search that can take minutes on conflicting constraints. Only after that does a concrete DAG exist, and install order is a topological sort of it. Terraform applies resources in topological order and destroys them in reverse, so nothing is deleted while something still uses it.

## In the interview

A follow-up from the lesson. Course schedule, but print the cycle when there is one. What do you use?

[pause]

Three-colour DFS with a parent array. On the first edge into a grey vertex, walk parents back to it and report the path. The wrong answer runs Kahn's and prints every vertex with a non-zero in-degree, which includes courses that merely depend on the cycle.

And: what is the minimum number of semesters when every course takes one and prerequisites come first? The number of Kahn levels, which is the longest path in edges plus one. The wrong answer divides the course count by the courses allowed per semester, ignoring the chains entirely.

## Recap

Four things to remember. A topological order exists exactly when the graph is a DAG, and it is rarely unique; a queue holding two vertices at once proves that. Kahn's needs the count check, and its leftovers are the cycle plus its victims; three-colour DFS names the loop itself. Kahn's levels are the parallel schedule, and longest path in topological order is the critical path. And version resolution is a search, not a sort; the sort comes after.

At your desk: the eight-target build and its traces, the heap and cycle runs, the DFS finish-order trace, the critical-path table, the graphlib section, the trade-off table, and the two exercises.
