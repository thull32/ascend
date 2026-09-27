---
slug: connectivity-and-cycles
title: "Connectivity and cycles: components, three colours and two colours"
description: Counting and labelling connected components, detecting cycles correctly in undirected and directed graphs (they are different problems), and checking bipartiteness by two-colouring, with the traversal each one is built on.
minutes: 40
difficulty: medium
tags: [graphs, connected-components, cycle-detection, bipartite, dfs, bfs]
problems: [count-components, graph-valid-tree, number-of-provinces, redundant-connection, course-schedule]
---
Three questions come up whenever a graph appears in a design review: *which things are connected to which* (clusters of users, islands of infrastructure, groups of duplicate accounts), *is there a cycle* (circular dependencies, deadlock, an infinite redirect chain) and *can this be split into two sides* (a schedule where conflicting pairs must be in different slots, matching problems). Each is one traversal plus a few lines, and each has a well-known wrong answer that passes the easy tests.

## Connected components

In an undirected graph, a component is a maximal set of vertices with paths between all of them. To find them, loop over vertices; whenever you hit an unvisited one, traverse from it (BFS or DFS, either works) and everything reached is one component.

```python
def components(n, adj):
    comp = [-1] * n
    count = 0
    for s in range(n):
        if comp[s] != -1:
            continue
        stack = [s]
        comp[s] = count
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if comp[v] == -1:
                    comp[v] = count
                    stack.append(v)
        count += 1
    return count, comp
```

O(V + E): the outer loop touches every vertex once, and the traversals collectively touch every edge once. The `comp` array doubles as the visited set and gives you a label per vertex, which is what "are u and v in the same group" queries want: `comp[u] == comp[v]`, O(1) after the O(V + E) preprocessing.

```viz
{"type": "graph", "algorithm": "connected-components", "directed": false,
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}, {"id": "G"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "D", "to": "E"}, {"from": "F", "to": "G"}, {"from": "E", "to": "F"}],
 "title": "Labelling components", "caption": "Each outer-loop start that finds an unvisited vertex begins a new label; the traversal paints everything reachable with it."}
```

Two facts worth having in your pocket. An undirected graph with `n` vertices and `n − 1` edges is a tree if and only if it is connected (equivalently, if and only if it is acyclic); that is the whole of `graph-valid-tree`. And a forest with `n` vertices and `e` edges has exactly `n − e` components, which lets you count components without traversing when you know there are no cycles.

If edges arrive over time and you need "same component?" answers between arrivals, the traversal-per-query approach is O(V + E) each. That is the problem **union-find** solves in near-constant time per operation; it gets its own lesson in the [graph algorithms module](/learn/algorithms/graph-algorithms/union-find), and it is the right answer whenever the interviewer says "the edges are added one by one".

Directed graphs have two notions: *weakly* connected (ignore direction; the algorithm above) and *strongly* connected (mutually reachable), which needs Tarjan's or Kosaraju's algorithm, covered [later](/learn/algorithms/graph-algorithms/strongly-connected-components). Know which one the question means.

## Cycles in undirected graphs

DFS, and a non-tree edge is a cycle. The subtlety is that in an undirected graph every edge is seen twice, once from each side, and the edge back to the vertex you just came from is *not* a cycle. So carry the parent and ignore that one edge:

```python
def has_cycle_undirected(n, adj):
    visited = [False] * n
    def dfs(u, parent):
        visited[u] = True
        for v in adj[u]:
            if not visited[v]:
                if dfs(v, u):
                    return True
            elif v != parent:          # visited and not where we came from: cycle
                return True
        return False
    return any(not visited[s] and dfs(s, -1) for s in range(n))
```

Two edge cases the parent check gets wrong on purpose: a **multi-edge** (two edges between the same pair) *is* a cycle of length 2 but is skipped by `v != parent`; if multi-edges are possible, track the parent *edge id* instead of the parent vertex. A **self-loop** `u → u` is a cycle and is caught (`u` is visited and is not its own parent).

The union-find version is often simpler when the input is an edge list: process edges in order, and an edge whose endpoints are already in the same set closes a cycle. That is `redundant-connection` in three lines.

## Cycles in directed graphs

The parent trick does not work: in a directed graph `u → v → u` is a genuine cycle, and `u → v`, `w → v` is not, even though `v` is "visited" the second time. You need to distinguish a vertex that is *on the current path* from one that has been *fully explored*. Three colours:

- **White**: not yet discovered.
- **Grey**: discovered, DFS still inside it (it is on the current recursion stack).
- **Black**: finished; everything reachable from it has been explored.

An edge to a **grey** vertex is a back edge: the target is an ancestor on the current path, so a cycle exists. An edge to a **black** vertex is a forward or cross edge and is harmless.

```python
WHITE, GREY, BLACK = 0, 1, 2

def has_cycle_directed(n, adj):
    colour = [WHITE] * n
    def dfs(u):
        colour[u] = GREY
        for v in adj[u]:
            if colour[v] == GREY:
                return True             # back edge
            if colour[v] == WHITE and dfs(v):
                return True
        colour[u] = BLACK
        return False
    return any(colour[s] == WHITE and dfs(s) for s in range(n))
```

Trace on edges `0 → 1, 1 → 2, 0 → 2`: DFS(0) greys 0, goes to 1, greys 1, goes to 2, greys 2, no edges, blacks 2, blacks 1; back at 0, edge to 2: black, fine; blacks 0. No cycle, correct: this is a diamond-shaped DAG, and a "visited means cycle" check would have wrongly flagged the edge 0 → 2.

Trace on `0 → 1, 1 → 2, 2 → 0`: DFS(0) greys 0, 1, 2; at 2, edge to 0: grey, cycle.

```viz
{"type": "graph", "algorithm": "cycle-detect", "directed": true, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "A", "to": "C"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}, {"from": "E", "to": "C"}],
 "title": "Three-colour cycle detection", "caption": "A → C reaches a black vertex and is not a cycle. E → C reaches a grey vertex, still on the path, and is."}
```

### Reporting the cycle

Detecting is rarely enough; a build tool must print `a → b → c → a`. Keep the current path on an explicit stack (or reconstruct it from a parent array) and, when `u → v` hits a grey `v`, the cycle is the segment of the path from `v` to `u` plus the closing edge:

```python
def find_cycle_directed(n, adj):
    colour, parent = [0] * n, [-1] * n
    def dfs(u):
        colour[u] = 1
        for v in adj[u]:
            if colour[v] == 1:                    # back edge u -> v
                cycle, x = [], u
                while x != v:
                    cycle.append(x); x = parent[x]
                cycle.append(v)                   # u ... v, walking parents
                return cycle[::-1] + [v]          # v ... u v
            if colour[v] == 0:
                parent[v] = u
                found = dfs(v)
                if found: return found
        colour[u] = 2
        return None
    for s in range(n):
        if colour[s] == 0:
            found = dfs(s)
            if found: return found
    return None
```

Walking the parent chain from `u` back to `v` costs O(cycle length) and happens once. The parent array is only valid along the current path, which is exactly where you need it, because `v` is grey and therefore on that path.

The alternative is [Kahn's algorithm](/learn/data-structures/graphs/topological-sort-and-dags): repeatedly remove vertices with in-degree zero; if any vertex remains, it is on or downstream of a cycle. Kahn's is iterative, needs no colours, and produces the topological order as a by-product, which is why `course-schedule` is usually solved with it. The three-colour DFS additionally *finds* the cycle: when you see the grey vertex, the cycle is the segment of the current path from it to `u`, which is what you need to report "circular dependency: a → b → c → a".

Directed cycle detection must also be *iterative* in production: a dependency graph is exactly the kind of long chain that exceeds recursion limits. The stack-of-iterators DFS from the [previous lesson](/learn/data-structures/graphs/depth-first-search) supports the grey/black distinction naturally (a vertex is grey while it is on the stack).

## Bipartite graphs and two-colouring

A graph is bipartite if its vertices can be split into two sets with every edge crossing between them. Equivalently, it can be 2-coloured so that no edge joins two vertices of the same colour. Equivalently again, it has no odd-length cycle. Problems in disguise: "can these people be split into two teams so that no two who dislike each other are together" (`is-graph-bipartite`), "can this be scheduled in two slots", and every matching problem (jobs to workers, students to projects) starts by observing that the graph is bipartite.

BFS (or DFS) colouring: colour the start 0; every neighbour of a colour-`c` vertex gets colour `1 − c`; if you ever find an edge whose endpoints already share a colour, it is not bipartite.

```python
def is_bipartite(n, adj):
    colour = [-1] * n
    for s in range(n):
        if colour[s] != -1:
            continue
        colour[s] = 0
        queue = deque([s])
        while queue:
            u = queue.popleft()
            for v in adj[u]:
                if colour[v] == -1:
                    colour[v] = 1 - colour[u]
                    queue.append(v)
                elif colour[v] == colour[u]:
                    return False
    return True
```

O(V + E), one colour per vertex. Do not forget the outer loop over components: a disconnected graph is bipartite only if every component is. And a graph with no edges is trivially bipartite, which the code handles because the inner check never fires.

```viz
{"type": "graph", "algorithm": "bipartite", "directed": false, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "C", "to": "D"}, {"from": "D", "to": "A"}, {"from": "D", "to": "E"}],
 "title": "Two-colouring by BFS", "caption": "Alternate colours along every edge. The 4-cycle A-B-C-D colours consistently; adding an edge A-C would create an odd cycle and a conflict."}
```

Why odd cycles are the obstruction: walking around a cycle alternates colours, so after an odd number of steps you are back at the start with the opposite colour, a contradiction. Every non-bipartite graph contains an odd cycle, and the BFS conflict edge plus the two BFS-tree paths to a common ancestor is one.

## Putting them together

| Question | Graph type | Algorithm | Cost | The classic mistake |
|---|---|---|---|---|
| How many groups? Same group? | Undirected | Outer loop + BFS/DFS with labels | O(V + E) | Rebuilding per query instead of labelling once |
| Same group, edges arriving online | Undirected | Union-find | ~O(α(n)) per op | Re-traversing after each edge |
| Is there a cycle? | Undirected | DFS with parent, or union-find | O(V + E) | Treating the edge back to the parent as a cycle |
| Is there a cycle? | Directed | Three-colour DFS or Kahn's | O(V + E) | Treating any visited vertex as a cycle (false positives on DAGs) |
| Which cycle? | Directed | Three-colour DFS, read the path from the grey vertex | O(V + E) | Kahn's, which only says a cycle exists |
| Two sides? | Undirected | BFS 2-colouring | O(V + E) | Forgetting disconnected components |
| Is it a tree? | Undirected | Connected and e = n − 1 | O(V + E) | Checking only one of the two conditions |

## Exercises

```exercise
id: count-components
title: Count connected components
prompt: |
  `count_components(n, edges)`: vertices are `0..n-1` and `edges` is a list
  of undirected `[u, v]` pairs. Return the number of connected components.
  A vertex with no edges is its own component; `n = 0` gives 0.

  Build an adjacency list, then loop over vertices and traverse from each
  unvisited one with BFS or an explicit-stack DFS.
languages: [python, javascript]
entry: count_components
starter:
  python: |
    def count_components(n, edges):
        return 0
  javascript: |
    function count_components(n, edges) {
      return 0;
    }
tests:
  - args: [5, [[0, 1], [1, 2], [3, 4]]]
    expected: 2
  - args: [3, []]
    expected: 3
    label: no edges
  - args: [0, []]
    expected: 0
    label: empty graph
  - args: [4, [[0, 1], [1, 2], [2, 3], [3, 0]]]
    expected: 1
    label: one cycle
  - args: [6, [[0, 1], [2, 3], [4, 5], [1, 2]]]
    expected: 2
    hidden: true
  - args: [7, [[1, 5], [6, 2]]]
    expected: 5
    hidden: true
hints:
  - "Add each edge in both directions. Keep a visited array; every time the outer loop finds an unvisited vertex, increment the count and traverse."
  - "Use a stack or a queue for the traversal, not recursion, so a long chain does not overflow."
```

```exercise
id: has-cycle-directed
title: Detect a cycle in a directed graph
prompt: |
  `has_cycle_directed(n, edges)`: vertices are `0..n-1` and `edges` is a
  list of directed `[u, v]` pairs (self-loops `[u, u]` are allowed and count
  as cycles). Return `true` if the graph contains a directed cycle.

  Use three colours: white (unvisited), grey (on the current DFS path),
  black (finished). An edge to a grey vertex is a cycle; an edge to a
  black vertex is not. Remember to start a DFS from every white vertex.
languages: [python, javascript]
entry: has_cycle_directed
starter:
  python: |
    def has_cycle_directed(n, edges):
        return False
  javascript: |
    function has_cycle_directed(n, edges) {
      return false;
    }
tests:
  - args: [3, [[0, 1], [1, 2], [2, 0]]]
    expected: true
  - args: [3, [[0, 1], [1, 2], [0, 2]]]
    expected: false
    label: diamond DAG, edge to a finished vertex is not a cycle
  - args: [1, [[0, 0]]]
    expected: true
    label: self-loop
  - args: [4, [[0, 1], [2, 3]]]
    expected: false
  - args: [4, [[0, 1], [1, 2], [2, 1], [2, 3]]]
    expected: true
    hidden: true
    label: two-vertex cycle
  - args: [5, [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4]]]
    expected: false
    hidden: true
    label: would be a cycle if undirected
hints:
  - "colour = [0] * n. dfs(u): colour[u] = 1; for v in adj[u]: if colour[v] == 1 return True; if colour[v] == 0 and dfs(v) return True; colour[u] = 2; return False."
  - "An iterative version keeps (vertex, next-neighbour-index) frames on a stack; a vertex is grey while its frame is on the stack."
```

## Senior signals

- You label components once in O(V + E) and answer "same group?" in O(1), and you switch to union-find when edges arrive online.
- You know undirected and directed cycle detection are **different algorithms** and can say why the parent trick fails on directed graphs and why "visited" alone gives false positives.
- You use three colours and can point at the grey vertex to *report* the cycle, not just detect it.
- You know `n − 1` edges plus connected means tree, and a forest has `n − e` components.
- You two-colour with BFS across all components and can explain the odd-cycle obstruction.
- You choose between three-colour DFS and Kahn's based on whether you need the cycle itself or the order.

## Check yourself

```quiz
- q: >-
    In an undirected graph, a DFS-based cycle check that flags any edge to an already-visited vertex reports a cycle on the graph with the single edge 0-1. Why?
  options: ["The edge sits in both lists, so from 1 it leads back to the visited parent 0", "A single undirected edge is a cycle of length 2, going 0 to 1 and back", "DFS marks both endpoints at once, so the edge finds 1 already visited", "The graph is disconnected, so DFS restarts from 1 and then sees 0 as visited"]
  answer: 0
  explanation: >-
    Every undirected edge is seen from both ends. The edge back to the vertex you arrived from is the same edge, not a cycle. Carry the parent (or parent edge id) and ignore it. Only two distinct edges between the same pair (a multi-edge) form a cycle of length 2; a single edge traversed back is not one.
- q: >-
    A directed graph has edges 0→1, 0→2, 1→2. A cycle check that treats any edge to a visited vertex as a cycle returns:
  options: ["true, correctly, because 0→2 reaches a vertex on the current path", "true, incorrectly, because 2 was visited but is already finished", "true, correctly, because paths 0→1→2 and 0→2 together form a loop", "false, correctly, because both 0→2 and 1→2 lead into a sink"]
  answer: 1
  explanation: >-
    This is a DAG. Whichever edge into 2 is examined second finds 2 visited, so the naive check returns true, but 2 is black (finished), not grey. Only an edge to a vertex still on the current DFS path (grey) indicates a cycle; two paths converging on the same vertex are a diamond, not a loop. Distinguishing grey from black is the whole algorithm.
- q: >-
    An undirected graph has 10 vertices and 9 edges. It is a tree if and only if:
  options: ["Every vertex has degree at least 1", "It is connected, or equivalently acyclic", "No vertex has a degree greater than 2", "It has exactly two degree-one vertices"]
  answer: 1
  explanation: >-
    With n-1 edges, connected implies acyclic and acyclic implies connected; either check suffices. An acyclic graph with 10 vertices and 9 edges has 10 - 9 = 1 component, so it is connected; a connected one with n-1 edges has no room for a cycle. Degree conditions are not enough: a 4-cycle plus a separate 6-vertex path has 10 vertices, 9 edges and no isolated vertex, yet is not a tree.
- q: >-
    A BFS 2-colouring finds an edge whose endpoints have the same colour. What does that prove?
  options: ["It contains an odd-length cycle, so it is not bipartite", "The graph has a self-loop, the only same-colour edge possible", "It contains an even-length cycle, so it is not bipartite", "BFS started at the wrong vertex and should be retried elsewhere"]
  answer: 0
  explanation: >-
    Colours alternate along BFS tree paths; two vertices with the same colour joined by an edge close a cycle of odd length through their common ancestor. Even cycles colour consistently (a 4-cycle is bipartite), and bipartiteness does not depend on the start vertex.
- q: >-
    Edges of an undirected graph are added one at a time and after each addition you must answer whether two given vertices are connected. The efficient structure is:
  options: ["An adjacency matrix with its transitive closure kept updated", "Union-find with path compression and union by rank", "A topological sort maintained incrementally per edge", "BFS recomputing all component labels after each edge"]
  answer: 1
  explanation: >-
    Each union and find is near-constant amortised time, versus O(V + E) to re-traverse after every insertion. Union-find handles only additions; deletions need different techniques. Topological order is defined only for directed acyclic graphs and says nothing about undirected connectivity.
```
