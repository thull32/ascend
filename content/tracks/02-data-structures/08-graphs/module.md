---
slug: graphs
title: Graphs
description: Representations, the two traversals and everything built on them (shortest unweighted paths, components, cycle detection, topological order), plus the skill that matters most - seeing the graph hidden inside a problem.
prerequisites: [data-structures/stacks-queues, data-structures/hashing]
---
Trees are graphs with one path between any two nodes. Remove that restriction and you get the structure behind road maps, social networks, package managers, build systems, compilers, schedulers, network topologies, state machines and every "which of these depend on which" question you have ever answered by hand. Roughly a fifth of interview problems are graph problems, and half of those do not say the word "graph" anywhere in the statement.

The core of the module is small: two representations you must be able to build in your sleep, two traversals (BFS with a queue, DFS with a stack or recursion) and the handful of things each traversal gives you for free. Shortest paths in unweighted graphs, connected components, bipartite checks, cycle detection and topological ordering are all one of the two traversals with a few extra lines. The [graph algorithms module](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) in the algorithms track adds weights, heaps and the harder structural algorithms; this module makes sure the foundation is solid enough to hold them.

The last lesson is about modelling: recognising that a grid, a word list, a set of prerequisites or a state space is a graph, choosing the vertices and edges deliberately, and knowing when the graph is too large to build and must be explored implicitly. That is the skill senior interviewers are actually probing when they ask a graph question.
