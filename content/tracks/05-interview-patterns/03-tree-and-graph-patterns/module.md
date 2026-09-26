---
slug: tree-and-graph-patterns
title: Tree & graph patterns
description: The seven patterns behind tree and graph interview problems, from level-order BFS and recursive DFS to topological sort, union-find, shortest paths and tries.
prerequisites: [algorithms/graph-algorithms]
---
Tree and graph problems are where the pattern-recognition skill pays off most, because the surface variety is enormous ("rotting oranges", "alien dictionary", "accounts merge", "swim in rising water") while the underlying toolkit is tiny. Almost every problem in this family is one of: a BFS that processes a level at a time, a DFS that returns something up the recursion, a traversal over an implicit graph, a topological order, a union-find over equivalence classes, a shortest-path relaxation, or a trie walk. The candidate who names the pattern in the first two minutes has thirty-five minutes to execute and discuss; the one who does not is still deciding whether to use a queue or a stack at minute fifteen.

This module teaches those seven patterns as recognition decisions. Each lesson opens with the signal in the statement that selects the pattern and rules out its neighbours (BFS versus DFS is the one candidates get wrong most), gives the template in Python and JavaScript that you will type from memory, and traces two or three Ascend 150 problems through it with the queue contents, the recursion returns or the parent array written out step by step. Variations show how an interviewer pushes you off the template; pitfalls list the bugs that appear under pressure, from marking visited at the wrong moment to reversing the topological order.

The order builds. Tree BFS and tree DFS establish the two traversal shapes on the simplest graph there is. Graph traversal generalises them to grids, adjacency lists and implicit state spaces, with the visited set doing the work the tree structure used to do for free. Topological sort, union-find and shortest paths are the three specialised tools that handle dependencies, equivalence classes and weighted distances. The trie closes the module as the tree you build yourself when the problem is about prefixes.
