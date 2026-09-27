---
slug: depth-first-search
title: "Depth-first search: recursion, explicit stacks and edge types"
description: DFS as recursion and as an explicit stack that visits in the same order, discovery and finish times, the four edge types and what each one tells you, path finding, and the recursion-depth failure you will hit in production.
minutes: 40
difficulty: medium
tags: [graphs, dfs, recursion, stack, edge-classification, backtracking]
problems: [number-of-islands, clone-graph, pacific-atlantic, surrounded-regions, max-area-island]
---
BFS spreads out in rings and needs memory for the widest ring. DFS commits: it follows one edge as deep as it can, backs up only when stuck, and needs memory only for the current path. That single difference makes DFS the right tool for a different family of questions: "is there *any* path", "what does this component contain", "does this graph have a cycle", "in what order can these tasks run". Those are questions about *structure*, and the structure DFS reveals, through the order in which it enters and leaves vertices, is richer than what BFS's distances give you.

## Recursive DFS

```python
def dfs(adj, u, visited, order):
    visited.add(u)
    order.append(u)                 # "discover" u: preorder position
    for v in adj[u]:
        if v not in visited:
            dfs(adj, v, visited, order)
    # "finish" u: everything reachable from u through unvisited vertices is done
```

Each vertex is visited once and each adjacency list scanned once: O(V + E). The recursion depth is the length of the current path, up to V on a path-shaped graph.

Trace on `adj = [[1, 2], [0, 3], [0, 3], [1, 2]]` from 0: discover 0, go to 1, discover 1, its neighbour 0 is visited, go to 3, discover 3, neighbours 1 and 2: 1 visited, go to 2, discover 2, both neighbours visited, finish 2, finish 3, finish 1, back at 0 its second neighbour 2 is now visited, finish 0. Preorder (discovery order): 0, 1, 3, 2. Postorder (finish order): 2, 3, 1, 0.

```viz
{"type": "graph", "algorithm": "dfs", "directed": false, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}, {"from": "B", "to": "F"}],
 "title": "DFS from A", "caption": "The search dives A, B, D, then E before it ever considers C. The stack (or recursion) holds only the current path."}
```

## The explicit stack, done right

Recursion depth is bounded by the interpreter (1,000 frames in CPython by default, about 10,000 in Node), and a graph that is a long chain, a linked list of tasks or a 1,000 × 1,000 grid explored as a snake will blow it. Production DFS uses an explicit stack. There are two ways to write it, and one of them changes the visit order.

**Push all neighbours, mark on pop.** Push the start; loop: pop `u`, skip if visited, mark and process it, push its neighbours in *reverse* order. This produces exactly the recursive preorder (reverse pushing makes the first neighbour pop first), at the cost of a stack that may hold O(E) entries because a vertex can be pushed several times before it is popped.

```python
def dfs_iter(adj, start):
    visited, order = set(), []
    stack = [start]
    while stack:
        u = stack.pop()
        if u in visited:
            continue
        visited.add(u)
        order.append(u)
        for v in reversed(adj[u]):
            if v not in visited:
                stack.append(v)
    return order
```

**Stack of iterators.** Push `(u, iterator over adj[u])`; loop: look at the top, advance its iterator; if it yields an unvisited `v`, mark `v` and push `(v, iter(adj[v]))`; if exhausted, pop and record `u` as finished. This is a faithful simulation of the recursion: O(V) stack, same preorder *and* the same postorder, and it gives you finish times, which the push-all version cannot. It is the version to use when you need topological order or edge classification without recursion.

```python
def dfs_iter_full(adj, start):
    visited = {start}
    pre, post = [start], []
    stack = [(start, iter(adj[start]))]
    while stack:
        u, it = stack[-1]
        for v in it:                     # resumes where it left off
            if v not in visited:
                visited.add(v)
                pre.append(v)
                stack.append((v, iter(adj[v])))
                break
        else:                            # iterator exhausted: u is finished
            post.append(u)
            stack.pop()
    return pre, post
```

The interview answer to "what if the graph is deeper than the recursion limit?" is either of these, and knowing that the naive push-all version loses finish order is the senior detail.

## Discovery and finish times

Give each vertex a timestamp when discovered and another when finished (all of its DFS subtree is done). These two numbers, with the DFS tree, are what make DFS more than a traversal:

- **Parenthesis property.** For any two vertices, their `[discover, finish]` intervals are either nested (one is a descendant of the other in the DFS tree) or disjoint. They never partially overlap.
- **Reverse finish order is a topological order** of a DAG: a vertex finishes only after everything reachable from it has finished, so listing vertices by decreasing finish time puts every vertex before its descendants. That is the DFS version of [topological sort](/learn/data-structures/graphs/topological-sort-and-dags).
- **Finish order drives Kosaraju's** strongly-connected-components algorithm and the ordering arguments in several other classic algorithms.

## The four edge types

When DFS examines edge `u → v`, the state of `v` classifies the edge:

| `v`'s state when `u → v` is examined | Edge type | Meaning |
|---|---|---|
| Undiscovered | **Tree edge** | DFS follows it; part of the DFS forest |
| Discovered, not finished (on the current path, "grey") | **Back edge** | `v` is an ancestor of `u`: a **cycle** exists |
| Finished, and `v` is a descendant of `u` (discovered after `u`) | **Forward edge** | A shortcut down the tree |
| Finished, and `v` is not a descendant (discovered before `u`) | **Cross edge** | Between subtrees or components |

The one that matters most: a **back edge exists if and only if the graph has a cycle**. For directed graphs that is the cycle-detection algorithm, and the "grey" state is essential: an edge to a *finished* (black) vertex is not a cycle, it is a forward or cross edge, and treating it as one is the classic false positive. The [next lesson](/learn/data-structures/graphs/connectivity-and-cycles) turns this into code with three colours.

In an undirected graph there are no forward or cross edges: every non-tree edge is a back edge, and the edge back to your immediate parent is not a cycle, just the same edge seen from the other side. The undirected cycle check therefore needs to remember the parent and ignore that one edge.

## Path finding and backtracking

DFS finds *a* path, not the shortest one. Keep the current path on a stack (or in the recursion), and when you reach the target, the path is the stack. When you back out of a vertex, pop it. That push-recurse-pop discipline is **backtracking**, and every backtracking algorithm (permutations, N-queens, sudoku, word search on a grid) is a DFS over an implicit graph of partial solutions where "neighbours" are the ways to extend the current partial solution.

```python
def find_path(adj, s, t):
    path, visited = [], set()
    def go(u):
        visited.add(u)
        path.append(u)
        if u == t:
            return True
        for v in adj[u]:
            if v not in visited and go(v):
                return True
        path.pop()                       # undo: u is not on the path to t
        return False
    return path if go(s) else []
```

The `visited` set stays global here (a vertex that failed to reach `t` will not reach it from a different entry either, since reachability does not depend on the path taken), which keeps it O(V + E). In problems where the path must satisfy a constraint that depends on the route (a grid path that cannot reuse cells, a Hamiltonian path), visited must be *undone* on backtrack too, and the search becomes exponential; recognise which case you are in.

## Grid DFS: flood fill

Counting islands, flooding a region, computing the area of a connected blob: DFS from each unvisited land cell, marking as you go, and each DFS call from the outer loop is one component. Recursive flood fill on a 1,000 × 1,000 all-land grid recurses a million deep and crashes in every mainstream language; use the explicit stack, or BFS, which is equally correct here since you do not need order. Marking cells in place (`grid[r][c] = 0`) is standard when mutation is allowed; say you are doing it.

`pacific-atlantic` and `surrounded-regions` add the trick of starting DFS from the *boundary* rather than from every cell: flood from the edges to find what escapes, and everything unmarked is what is trapped. Recognising "search from the boundary inward" saves an O(cells²) solution.

## Iterative deepening

When the search space is a huge implicit graph, BFS finds the shallowest solution but its frontier does not fit in memory, and DFS fits in memory but may dive down an infinite or useless branch and never come back. **Iterative deepening** runs DFS with a depth limit of 1, then 2, then 3, and so on, until a solution is found. Each pass is a bounded DFS with O(depth) memory, and the shallowest solution is found first, as with BFS.

The apparent waste, re-exploring shallow levels on every pass, is small: on a tree with branching factor `b`, the level at depth `d` has `b^d` vertices and all shallower levels together have about `b^d / (b − 1)`, so the repeated work is a constant factor (roughly `b / (b − 1)`, about 1.03 for chess-like branching). Iterative deepening is the standard search in game engines (with alpha-beta pruning) and in planners, and the interview version is "find the shortest solution to a puzzle whose state space does not fit in memory". It only applies to implicit graphs where re-generating vertices is cheap; on an explicit graph that fits in memory, plain BFS wins.

## DFS versus BFS

| | DFS | BFS |
|---|---|---|
| Memory | O(longest path) recursion or stack | O(widest level) queue |
| Finds | Any path; components; cycles; ordering; finish times | Shortest paths (unweighted); levels; nearest |
| Natural implementation | Recursion (careful with depth) | Queue |
| Grid flood fill | Fine, watch depth | Fine |
| Infinite or huge implicit graphs | Can run away down one branch; needs a depth limit | Explores nearest first; safe |
| Backtracking search | Native | Not applicable |

Both are O(V + E) on an explicit graph. On a tree-shaped search space with branching factor `b` and solution depth `d`, DFS uses O(b · d) memory and BFS O(b^d); that is why chess engines, SAT solvers and every backtracking search are depth-first, and why iterative deepening (DFS with a growing depth limit) exists to get BFS's optimality with DFS's memory.

## Exercises

```exercise
id: dfs-preorder
title: DFS discovery order without recursion
prompt: |
  `dfs_order(n, adj, start)`: `adj` is an adjacency list over vertices
  `0..n-1` (possibly directed). Return the vertices in the order a
  recursive DFS from `start` would **discover** them, exploring each
  vertex's neighbours in the order they appear in `adj[u]`. Unreachable
  vertices do not appear.

  Implement it with an explicit stack. Pushing a vertex's neighbours in
  reverse order and marking visited on pop reproduces the recursive order.
languages: [python, javascript]
entry: dfs_order
starter:
  python: |
    def dfs_order(n, adj, start):
        order = []
        return order
  javascript: |
    function dfs_order(n, adj, start) {
      const order = [];
      return order;
    }
tests:
  - args: [4, [[1, 2], [0, 3], [0, 3], [1, 2]], 0]
    expected: [0, 1, 3, 2]
  - args: [3, [[2, 1], [], []], 0]
    expected: [0, 2, 1]
    label: neighbours in list order, not sorted
  - args: [3, [[], [2], [1]], 0]
    expected: [0]
    label: unreachable vertices omitted
  - args: [3, [[1], [2], [0]], 1]
    expected: [1, 2, 0]
    label: directed cycle
  - args: [5, [[1, 3], [0, 2], [1], [0, 4], [3]], 0]
    expected: [0, 1, 2, 3, 4]
    hidden: true
  - args: [4, [[1, 2, 3], [], [], []], 0]
    expected: [0, 1, 2, 3]
    hidden: true
    label: star graph
hints:
  - "stack = [start]; pop u; if visited skip; mark, record; push neighbours of u in reverse order."
  - "Check visited at pop time, because a vertex can be pushed more than once before it is popped."
```

```exercise
id: dfs-find-path
title: Find a path with DFS and backtracking
prompt: |
  `find_path(n, adj, s, t)`: return a list of vertices forming a path from
  `s` to `t` (inclusive) in the graph given by adjacency list `adj`, or
  `[]` if none exists. If `s == t` return `[s]`.

  Explore neighbours in the order they appear in `adj[u]` and return the
  first path found, so the answer is deterministic. Push each vertex onto
  the path when you enter it and pop it when it fails to reach `t`.
languages: [python, javascript]
entry: find_path
starter:
  python: |
    def find_path(n, adj, s, t):
        return []
  javascript: |
    function find_path(n, adj, s, t) {
      return [];
    }
tests:
  - args: [4, [[1, 2], [3], [3], []], 0, 3]
    expected: [0, 1, 3]
  - args: [4, [[1, 2], [3], [3], []], 3, 0]
    expected: []
    label: no path in that direction
  - args: [4, [[1, 2], [3], [3], []], 2, 2]
    expected: [2]
    label: start equals target
  - args: [4, [[1, 2], [0], [0, 3], [2]], 1, 3]
    expected: [1, 0, 2, 3]
  - args: [4, [[1], [2], [3], []], 0, 3]
    expected: [0, 1, 2, 3]
    hidden: true
  - args: [5, [[1, 2], [3], [4], [], [3]], 0, 3]
    expected: [0, 1, 3]
    hidden: true
    label: first path in neighbour order wins
hints:
  - "Recursive helper go(u): mark visited, append u; if u == t return True; for each unvisited neighbour, if go(v) return True; pop u and return False."
  - "The visited set is never undone: a vertex that could not reach t will not reach it later either."
```

## Senior signals

- You can write DFS three ways (recursive, push-all stack, stack of iterators) and you know that only the last two survive deep graphs and only the iterator version keeps finish order.
- You use discovery and finish times as a tool: reverse finish order is a topological order, nested intervals mean ancestry.
- You classify edges by the state of the endpoint and know that **a back edge to a grey vertex** is the cycle test, not any edge to a visited vertex.
- You describe backtracking as DFS on an implicit graph and know when visited must be undone (path-dependent constraints) and when it must not (plain reachability).
- You flood-fill from the boundary when the question is about what is trapped, and you never recurse on a million-cell grid.
- You give the memory contrast with BFS in terms of depth versus width and can say why every game-tree search is depth-first.

## Check yourself

```quiz
- q: >-
    During DFS on a directed graph, the edge u → v is examined and v has already been visited and finished. What can you conclude?
  options: ["v is an ancestor of u, so the edge is a back edge to the current path", "The DFS is incorrect, since a finished vertex is never examined again", "It is a forward or cross edge, which alone does not signal a cycle", "The graph has a cycle, because v is being reached a second time"]
  answer: 2
  explanation: >-
    A cycle is signalled by an edge to a vertex that is discovered but not finished (grey, on the current path). A finished vertex cannot be an ancestor of u, because an ancestor is still open while u is being explored, so the edge points forward or across. Treating any visited vertex as a cycle is the classic false positive.
- q: >-
    You convert a recursive DFS to an explicit stack by pushing all neighbours and marking visited on pop. Compared with the recursive version, what changes?
  options: ["Nothing changes, since the stack is exactly what recursion used anyway", "Some reachable vertices are missed, since a vertex pushed twice is skipped", "Running time grows to O(V²), since each pop rescans the whole visited set", "Stack size can reach O(E) from repeated pushes, and finish order is lost"]
  answer: 3
  explanation: >-
    With reverse pushing the discovery order matches recursion, and every reachable vertex is still visited (a duplicate is skipped only because it was already marked), but duplicates can sit on the stack and the moment a vertex 'finishes' is not observable. A stack of iterators fixes both, with an O(V) stack and the same pre- and postorder as recursion.
- q: >-
    A recursive flood fill on a 2,000 × 2,000 grid of all-land cells crashes. The cause is:
  options: ["Recursive DFS revisits cells without a queue, so it loops forever", "Recursion depth reaches millions of frames, beyond the stack limit", "The visited set grows to O(cells²) entries and exhausts the heap", "The grid does not fit in memory, since 4 × 10^6 cells need gigabytes"]
  answer: 1
  explanation: >-
    DFS on a fully connected grid can snake through every cell before backing up, so depth equals cell count, far beyond CPython's 1,000 frames or a thread's native stack. The grid itself is only a few megabytes and the visited set holds one entry per cell. Use an explicit stack or BFS.
- q: >-
    Why is a chess engine's search depth-first (with a depth limit) rather than breadth-first?
  options: ["BFS cannot alternate two players, since its levels mix both sides", "DFS explores the strongest line first, so it finds better moves sooner", "DFS holds one path of length d, while BFS must store a level of size b^d", "DFS spends less time per node, since a stack push beats a queue push"]
  answer: 2
  explanation: >-
    The game tree's width explodes exponentially: with b around 35, a level of size b^d is infeasible to store, while DFS keeps memory linear in depth (O(b · d)). Move quality comes from evaluation and pruning, not traversal order. Iterative deepening provides the level-by-level behaviour when it is needed.
- q: >-
    In a DFS-based path search where a vertex failed to reach the target, keeping it marked visited when exploring other branches is:
  options: ["Needed to stop infinite loops, but it can make the search miss paths", "Correct only in undirected graphs, because directed edges are one-way", "Correct, because reachability from v does not depend on how v was reached", "A bug, because v might still reach t along a route through different vertices"]
  answer: 2
  explanation: >-
    Reachability is a property of v alone: if no route from v reached t the first time, no other entry into v will find one. Unmarking would re-explore the same dead subtree from each entry point and could become exponential. Only path-dependent constraints (no reused cells, resource limits) require undoing visited.
```
