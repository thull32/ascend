---
slug: connectivity-and-cycles
title: "Connectivity and cycles: components, three colours and two colours"
description: Counting and labelling connected components, detecting cycles correctly in undirected and directed graphs (they are different problems), and checking bipartiteness by two-colouring, with the traversal each one is built on.
minutes: 50
difficulty: medium
tags: [graphs, connected-components, cycle-detection, bipartite, dfs, bfs]
problems: [count-components, graph-valid-tree, number-of-provinces, redundant-connection, course-schedule]
---
Three questions come up whenever a graph appears in a design review: *which things are connected to which* (clusters of users, islands of infrastructure, groups of duplicate accounts), *is there a cycle* (circular dependencies, deadlock, an infinite redirect chain) and *can this be split into two sides* (conflicting pairs in different slots, matching problems). Each is one traversal plus a few lines, and each has a well-known wrong answer that passes the easy tests: the undirected check that reports the edge you arrived by, the directed check that reports every diamond, the bipartite check that forgets the second component. This lesson traces each algorithm on paper, shows the step where the wrong version goes wrong, and looks at where the same code runs inside a database's deadlock detector.

## Connected components

In an undirected graph, a component is a maximal set of vertices with paths between all of them. To find them, loop over vertices; whenever you hit an unvisited one, traverse from it (BFS or DFS, either works) and everything reached is one component.

```python
def components(n, adj):
    comp = [-1] * n                  # -1: not yet labelled; doubles as the visited set
    count = 0
    for s in range(n):
        if comp[s] != -1:
            continue                 # already painted by an earlier traversal
        stack = [s]
        comp[s] = count
        while stack:
            u = stack.pop()
            for v in adj[u]:
                if comp[v] == -1:
                    comp[v] = count  # label on push, so a vertex is pushed once
                    stack.append(v)
        count += 1
    return count, comp
```

O(V + E): the outer loop touches every vertex once, and the traversals collectively scan every adjacency list once. Labelling on push means each vertex enters the stack once, so the stack never exceeds V entries. The `comp` array doubles as the visited set and gives a label per vertex, which is what "same group?" queries want: `comp[u] == comp[v]`, O(1) after the O(V + E) preprocessing.

### Hand trace: nine vertices, three components

Edges `0-1, 0-2, 1-3, 2-3, 3-4, 5-6, 6-7`, vertex 8 isolated, adjacency lists sorted:

```text
0: [1, 2]   1: [0, 3]   2: [0, 3]   3: [1, 2, 4]   4: [3]
5: [6]      6: [5, 7]   7: [6]      8: []
```

A dot stands for −1 in the `comp` column.

| Step | Action | Stack after | comp[0..8] after |
|---|---|---|---|
| 1 | outer loop: 0 unlabelled, new label 0 | `[0]` | `0 · · · · · · · ·` |
| 2 | pop 0: label and push 1, 2 | `[1, 2]` | `0 0 0 · · · · · ·` |
| 3 | pop 2: 0 labelled; push 3 | `[1, 3]` | `0 0 0 0 · · · · ·` |
| 4 | pop 3: 1, 2 labelled; push 4 | `[1, 4]` | `0 0 0 0 0 · · · ·` |
| 5 | pop 4: 3 labelled | `[1]` | unchanged |
| 6 | pop 1: 0, 3 labelled; empty, `count = 1` | `[]` | unchanged |
| 7 | outer loop: 1–4 skip; 5 gets label 1 | `[5]` | `0 0 0 0 0 1 · · ·` |
| 8 | pop 5: push 6 | `[6]` | `0 0 0 0 0 1 1 · ·` |
| 9 | pop 6: 5 labelled; push 7 | `[7]` | `0 0 0 0 0 1 1 1 ·` |
| 10 | pop 7: 6 labelled; empty, `count = 2` | `[]` | unchanged |
| 11 | outer loop: 8 gets label 2; pop 8, no neighbours; `count = 3` | `[]` | `0 0 0 0 0 1 1 1 2` |

Nine pops, fourteen adjacency entries scanned (twice the seven edges), three labels. Vertex 3 is reached from 2 rather than from 1 because the stack is LIFO; BFS would reach it from 1, and the labels are identical either way.

```viz
{"type": "graph", "algorithm": "connected-components", "directed": false,
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}, {"id": "G"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "D", "to": "E"}, {"from": "F", "to": "G"}, {"from": "E", "to": "F"}],
 "title": "Labelling components", "caption": "Each outer-loop start that finds an unvisited vertex begins a new label; the traversal paints everything reachable with it."}
```

### The edge-count shortcut

A connected undirected graph with `n` vertices is acyclic if and only if it has exactly `n − 1` edges. Both directions rest on one fact: a tree on `n` vertices has `n − 1` edges (add vertices one at a time; each new vertex brings exactly one edge). A connected graph with more than `n − 1` edges contains an edge whose removal keeps it connected, and that edge lies on a cycle; a connected graph with fewer cannot exist, because its spanning tree already needs `n − 1`. So `graph-valid-tree` is two checks, connected and `e == n − 1`, and either alone is not enough: a 4-cycle plus a 6-vertex path has 10 vertices and 9 edges and is not a tree.

The forest version: an acyclic graph with `n` vertices and `c` components has `n − c` edges, one fewer than its vertex count per tree. Turned around, `e − (n − c)` counts *independent cycles*, the edges you must remove to make the graph a forest. In the traced graph, `7 − (9 − 3) = 1`, and the one cycle is `0-1-3-2-0`.

Directed graphs have two notions: *weakly* connected (ignore direction; the algorithm above) and *strongly* connected (mutually reachable), which needs Tarjan's or Kosaraju's algorithm, covered [later](/learn/algorithms/graph-algorithms/strongly-connected-components).

## Union-find: connectivity while edges arrive

If edges arrive over time and you need "same component?" answers between arrivals, re-traversing costs O(V + E) per query. **Union-find** answers each in near-constant amortised time and has its own lesson in the [graph algorithms module](/learn/algorithms/graph-algorithms/union-find); the shape and a trace belong here because it is also the shortest correct cycle detector for an undirected edge list.

Each vertex points at a parent; a root points at itself; `find(x)` follows parents to the root and then rewrites every vertex on the path to point straight at it (**path compression**); `union(a, b)` finds both roots and hangs the smaller tree under the larger (**union by size**).

```python
def make(n):
    return list(range(n)), [1] * n          # parent, size

def find(parent, x):
    root = x
    while parent[root] != root:
        root = parent[root]
    while parent[x] != root:                # second pass: compress the path
        parent[x], x = root, parent[x]
    return root

def union(parent, size, a, b):
    ra, rb = find(parent, a), find(parent, b)
    if ra == rb:
        return False                        # already connected: this edge closes a cycle
    if size[ra] < size[rb]:
        ra, rb = rb, ra
    parent[rb] = ra
    size[ra] += size[rb]
    return True
```

### Hand trace: six elements

`parent` is shown after each operation:

| Operation | Roots found | Result | parent[0..5] | size of root |
|---|---|---|---|---|
| start | | | `0 1 2 3 4 5` | all 1 |
| union(0, 1) | 0, 1 | tie, hang 1 under 0 | `0 0 2 3 4 5` | size[0] = 2 |
| union(2, 3) | 2, 3 | tie, hang 3 under 2 | `0 0 2 2 4 5` | size[2] = 2 |
| union(1, 3) | 0, 2 | tie, hang 2 under 0 | `0 0 0 2 4 5` | size[0] = 4 |
| union(4, 5) | 4, 5 | tie, hang 5 under 4 | `0 0 0 2 4 4` | size[4] = 2 |
| union(5, 3) | 4; find(3) walks 3 → 2 → 0 and compresses `parent[3] = 0` | size 2 < 4, hang 4 under 0 | `0 0 0 0 0 4` | size[0] = 6 |
| find(5) | walks 5 → 4 → 0, compresses `parent[5] = 0` | 0 | `0 0 0 0 0 0` | |
| union(1, 5) | 0, 0 | **same set**: the edge 1-5 closes a cycle | unchanged | |

After seven operations every vertex points directly at the root, so every later `find` is one array read. Union by size alone bounds the height by log₂ n (a vertex's depth grows only when its set merges into one at least as large, so its set size doubles each time); with path compression as well, the amortised cost per operation is O(α(n)), where α is the inverse Ackermann function, at most 4 for any `n` that fits in memory. Memory is two integer arrays and nothing per edge, which is why union-find answers "count components in a stream of 10^6 edges".

## Cycles in undirected graphs

DFS, and a non-tree edge is a cycle. The subtlety is that in an undirected graph every edge is seen twice, once from each side, and the edge back to the vertex you came from is *not* a cycle. So carry the parent and ignore that one edge:

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

### Hand trace: the step that finds the cycle

Component 0 of the graph above, edges `0-1, 0-2, 1-3, 2-3, 3-4`:

| Call | Edge examined | Neighbour state | Action |
|---|---|---|---|
| dfs(0, parent −1) | 0-1 | 1 unvisited | recurse into 1 |
| dfs(1, parent 0) | 1-0 | visited, equals parent | skip: the tree edge seen from below |
| dfs(1, parent 0) | 1-3 | 3 unvisited | recurse into 3 |
| dfs(3, parent 1) | 3-1 | visited, equals parent | skip |
| dfs(3, parent 1) | 3-2 | 2 unvisited | recurse into 2 |
| dfs(2, parent 3) | 2-0 | **visited, 0 ≠ parent 3** | cycle: 0 is an ancestor on the current path |

The cycle is the path from 0 down to 2 plus the closing edge: `0-1-3-2-0`. In an undirected graph the "visited and not parent" neighbour is always an ancestor still on the recursion path: the [DFS lesson](/learn/data-structures/graphs/depth-first-search) proves that undirected DFS produces only tree and back edges, never a cross edge to a finished vertex. That guarantee is why a plain `visited` array is enough here and the directed case needs three colours.

### Where the parent check is wrong: parallel edges and self-loops

The check compares *vertices*, which is correct only when at most one edge joins any pair. Take edges `0-1, 1-2, 1-2` (a **parallel edge**, a cycle of length 2), lists `0: [1]`, `1: [0, 2, 2]`, `2: [1, 1]`:

| Call | Edge examined | Action |
|---|---|---|
| dfs(0, −1) | 0-1 | recurse |
| dfs(1, 0) | 1-0 | parent, skip |
| dfs(1, 0) | first 1-2 | recurse |
| dfs(2, 1) | first 2-1 | parent, skip (correct: this is the tree edge) |
| dfs(2, 1) | second 2-1 | parent, skip (**wrong**: this is a different edge and closes the 2-cycle) |
| dfs(1, 0) | second 1-2 | 2 visited, 2 ≠ parent 0: reports a cycle |

`has_cycle` returns true, so the boolean answer survives by luck of examination order: the parent examines its second copy of the edge after the child returns. But the report is wrong in kind. The neighbour 2 is a *finished descendant* of 1, not an ancestor, so the undirected guarantee no longer holds, and cycle-reporting code that walks `parent[]` from 1 looking for 2 walks `1 → 0 → −1` and never arrives. Bridge-finding built on the same skip has the same flaw. If multi-edges are possible, store `(neighbour, edge_id)` in the adjacency list and skip only the edge id you arrived by; then the second `2-1` entry has a different id, is examined, and reports the 2-cycle from the child's side. If the input was built as a dict of sets, the parallel edge was collapsed at construction time and no check can recover it.

A **self-loop** `u-u` appears twice in `adj[u]` with the usual append-to-both-ends code; on examination `u` is visited and `u ≠ parent`, so it is reported as a cycle, correctly.

The union-find version is often simpler when the input is an edge list: an edge whose endpoints are already in the same set closes a cycle, and parallel edges and self-loops need no special case because `find(u) == find(v)` holds for both. That is `redundant-connection` in three lines.

## Cycles in directed graphs

The parent trick does not work: in a directed graph `u → v → u` is a genuine cycle, and `u → v`, `w → v` is not, even though `v` is "visited" the second time. You must distinguish a vertex *on the current path* from one *fully explored*. Three colours:

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

```viz
{"type": "graph", "algorithm": "cycle-detect", "directed": true, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "A", "to": "C"}, {"from": "A", "to": "D"}, {"from": "D", "to": "E"}, {"from": "E", "to": "A"}],
 "title": "Three-colour cycle detection", "caption": "A → C reaches a black vertex and is not a cycle. E → A reaches a grey vertex, still on the path, and is."}
```

### Hand trace: a cross edge that is not a cycle, then a back edge that is

Seven vertices, eight edges: `0→1, 0→3, 1→2, 3→2, 3→4, 4→5, 5→6, 6→4`. Lists `0: [1, 3]`, `1: [2]`, `2: []`, `3: [2, 4]`, `4: [5]`, `5: [6]`, `6: [4]`. The colour column lists vertices 0 to 6 as W, G or B after the step.

| Step | Event | Colours 0..6 |
|---|---|---|
| 1 | enter 0 | `G W W W W W W` |
| 2 | 0→1: white, recurse; enter 1 | `G G W W W W W` |
| 3 | 1→2: white, recurse; enter 2 | `G G G W W W W` |
| 4 | 2 has no edges: finish 2 | `G G B W W W W` |
| 5 | 1 exhausted: finish 1 | `G B B W W W W` |
| 6 | 0→3: white, recurse; enter 3 | `G B B G W W W` |
| 7 | **3→2: 2 is BLACK**, cross edge, not a cycle | unchanged |
| 8 | 3→4: white, recurse; enter 4 | `G B B G G W W` |
| 9 | 4→5: white, recurse; enter 5 | `G B B G G G W` |
| 10 | 5→6: white, recurse; enter 6 | `G B B G G G G` |
| 11 | **6→4: 4 is GREY**, back edge, cycle | return true |

Step 7 is the diamond `0→1→2`, `0→3→2`: a visited-only check would report it, and the colour check dismisses it because 2 finished at step 4. Step 11 is a real cycle: 4 is grey, so it is on the current path `0, 3, 4, 5, 6`, and the segment from 4 to 6 plus the edge `6→4` is `4→5→6→4`.

```viz
{"type": "graph", "algorithm": "cycle-detect", "directed": true, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}, {"id": "G"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "D"}, {"from": "B", "to": "C"}, {"from": "D", "to": "C"}, {"from": "D", "to": "E"}, {"from": "E", "to": "F"}, {"from": "F", "to": "G"}, {"from": "G", "to": "E"}],
 "title": "Three-colour cycle detection on the traced graph", "caption": "D → C reaches a black vertex and is not a cycle. G → E reaches a grey vertex, still on the path, and is."}
```

### Reporting the cycle

A build tool must print `a → b → c → a`, not "cycle". Keep a parent array; when `u → v` hits a grey `v`, the cycle is the segment of the current path from `v` to `u` plus the closing edge:

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

On the traced graph the walk from 6 reads `parent[6] = 5`, `parent[5] = 4 = v`, giving `[4, 5, 6, 4]`. The walk costs O(cycle length) and happens once. The parent array is only valid along the current path, which is where you need it, because `v` is grey and therefore on that path; this is the guarantee the parallel-edge case broke in the undirected section.

The alternative is [Kahn's algorithm](/learn/data-structures/graphs/topological-sort-and-dags): repeatedly remove vertices with in-degree zero, and if fewer than `n` vertices are emitted, a cycle exists. The vertices never emitted are those on a cycle *or downstream of one*, so Kahn's names the targets that cannot be built but not the loop itself; use the three-colour DFS when the error message must name the cycle.

Directed cycle detection must also be *iterative* in production: a dependency graph is exactly the kind of long chain that exceeds recursion limits (CPython's default is 1,000 frames; the JVM and Node manage on the order of 10^4). The stack-of-iterators DFS in the [DFS lesson](/learn/data-structures/graphs/depth-first-search) keeps the grey/black distinction, because a vertex is grey while its frame is on the stack.

## Bipartite graphs and two-colouring

A graph is bipartite if its vertices can be split into two sets with every edge crossing between them; equivalently, it can be 2-coloured so that no edge joins two vertices of the same colour. Problems in disguise: "split these people into two teams so that no two who dislike each other are together", "schedule this in two slots", and every matching problem (jobs to workers, students to projects).

BFS (or DFS) colouring: colour the start 0; every neighbour of a colour-`c` vertex gets colour `1 − c`; if you ever find an edge whose endpoints already share a colour, it is not bipartite.

```python
from collections import deque

def is_bipartite(n, adj):
    colour = [-1] * n
    for s in range(n):
        if colour[s] != -1:
            continue                       # this component is already coloured
        colour[s] = 0
        queue = deque([s])
        while queue:
            u = queue.popleft()
            for v in adj[u]:
                if colour[v] == -1:
                    colour[v] = 1 - colour[u]
                    queue.append(v)
                elif colour[v] == colour[u]:
                    return False           # the conflict edge
    return True
```

O(V + E), one colour per vertex. The outer loop over components matters: a disconnected graph is bipartite only if every component is. A graph with no edges is bipartite, because the inner check never fires.

### Hand trace: the conflict edge

Six vertices, edges `0-1, 1-2, 2-3, 3-0` (a 4-cycle) and `3-4, 4-5, 5-3` (a triangle hanging off vertex 3). Lists `0: [1, 3]`, `1: [0, 2]`, `2: [1, 3]`, `3: [2, 0, 4, 5]`, `4: [3, 5]`, `5: [4, 3]`.

| Pop | Edges examined | colour[0..5] after | Queue after |
|---|---|---|---|
| start | colour 0 ← 0 | `0 · · · · ·` | `[0]` |
| 0 | 0-1: 1 ← 1; 0-3: 3 ← 1 | `0 1 · 1 · ·` | `[1, 3]` |
| 1 | 1-0: 1 vs 0, fine; 1-2: 2 ← 0 | `0 1 0 1 · ·` | `[3, 2]` |
| 3 | 3-2: 1 vs 0; 3-0: 1 vs 0; 3-4: 4 ← 0; 3-5: 5 ← 0 | `0 1 0 1 0 0` | `[2, 4, 5]` |
| 2 | 2-1, 2-3: both differ | unchanged | `[4, 5]` |
| 4 | 4-3: 0 vs 1, fine; **4-5: 0 vs 0, conflict** | unchanged | return false |

The 4-cycle coloured consistently (0, 1, 0, 1 around it). The conflict is on edge `4-5`, and the odd cycle it exposes is the conflict edge plus the two BFS-tree paths back to the common ancestor: `4 → 3` and `5 → 3`, giving the triangle `3-4-5-3`.

```viz
{"type": "graph", "algorithm": "bipartite", "directed": false, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "B", "to": "C"}, {"from": "C", "to": "D"}, {"from": "D", "to": "A"}, {"from": "D", "to": "E"}],
 "title": "Two-colouring by BFS", "caption": "Alternate colours along every edge. The 4-cycle A-B-C-D colours consistently; adding an edge A-C would create an odd cycle and a conflict."}
```

### Bipartite iff no odd cycle

**If bipartite, no odd cycle.** Colours alternate along every edge, so walking around a cycle of length `k` flips the colour `k` times and must return to the starting colour, which forces `k` to be even. **If no odd cycle, bipartite.** Colour every vertex by the parity of its BFS distance from its component's root; an edge between two vertices of the same parity would close a cycle made of the two tree paths to their lowest common ancestor plus that edge, of length `d(u) + d(v) − 2·d(a) + 1`, which is odd, a contradiction. The BFS above is that second argument executed: its conflict edge closes an odd cycle, so it never reports a false negative.

## Under the hood: where cycle detection runs

### Deadlock detectors are cycle detectors

A database keeps a **wait-for graph**: transaction `A → B` when `A` waits for a lock that `B` holds. A deadlock is a directed cycle in that graph, and the detector is the three-colour DFS above with one vertex per transaction. PostgreSQL does not run it on every lock wait: a backend waits for `deadlock_timeout` (default 1 s, a server setting) before checking the graph, on the documented assumption that deadlocks are rare and the check is relatively expensive. When it finds a cycle, the lock manager usually resolves it by aborting the transaction of the backend that ran the check, with `ERROR: deadlock detected`, which is why the victim looks arbitrary from the application. InnoDB checks on every lock wait (while `innodb_deadlock_detect` is on, the default) and rolls back the transaction that has inserted, updated or deleted the fewest rows; with detection turned off for very high write concurrency, the fallback is `innodb_lock_wait_timeout`, 50 s by default.

### Dependency-cycle checks in toolchains

Go rejects an import cycle between packages at compile time (`import cycle not allowed`), while its *module* graph may contain cycles. Cargo refuses a cycle among regular dependencies (`cyclic package dependency`) and allows one through dev-dependencies. npm allows cycles among packages, and Node's CommonJS loader resolves one at run time by handing the second requirer a partially populated `module.exports`, the source of "imported value is undefined" bugs. Cargo's `check_cycles`, for example, is a DFS over the resolved graph (dev-dependency edges left out) that keeps the current path and reports it on reaching a vertex already on that path, the same path `find_cycle_directed` returns.

### Memory of the marks

Measured on CPython 3.14: a `bytearray(10**6)` of colours is 1,000,057 bytes; a `[0] * 10**6` list is 8,000,056 bytes (one pointer per slot, all pointing at the cached small ints 0, 1 and 2); a `set(range(10**6))` holds a 33.5 MB hash table (2^21 slots of 16 bytes) plus a 28-byte `int` object per member above 256, about 61 MB in total. The third colour costs nothing extra in a bytearray; the set is 60× larger and hashes on every test. At 10^8 vertices the bytearray is 100 MB, the list 800 MB, and the set does not fit.

## Trade-offs

| | Three-colour DFS | Kahn's algorithm | Union-find |
|---|---|---|---|
| Undirected cycles | Yes, with the parent edge | No (in-degree is meaningless) | Yes, one `find` per edge |
| Directed cycles | Yes | Yes, `emitted < n` | No (loses direction) |
| Incremental (edges arrive one by one) | No, re-run | No, re-run | Yes, O(α(n)) per edge |
| Memory | 1 byte per vertex plus O(depth) stack | In-degree array plus queue, O(V) | Two integer arrays, O(V), no edges stored |
| Finds the cycle itself | Yes: path from the grey vertex | No: only the stuck vertices | Only the closing edge |
| Parallelisable | Poorly (inherently sequential path) | Yes: the ready set is a level | Partly (concurrent finds; unions serialise) |
| By-product | Edge classification, finish order | Topological order, levels | Component labels |

Two questions sit outside the table: "two sides?" is BFS 2-colouring over every component, and "is it a tree?" is connectivity plus `e = n − 1`, each O(V + E).

## Failure modes

### Every edge is reported as a cycle

Symptom: the undirected cycle check returns true on a two-vertex graph with one edge, and on every tree. Diagnosis: the check flags any visited neighbour and does not skip the edge it arrived by; from 1 the edge `1-0` finds 0 visited. Fix: pass the parent vertex, or the parent edge id when parallel edges are possible, and skip exactly that edge.

### False cycles in a DAG

Symptom: a dependency checker rejects a valid graph, and the rejected graphs all contain two paths to the same vertex (a diamond). Diagnosis: a directed check with a boolean `visited`, which cannot tell a finished vertex (cross or forward edge) from one on the current path (back edge); step 7 of the directed trace is the case. Fix: three colours, and report a cycle only on grey.

### A cycle that the report cannot reconstruct

Symptom: `has_cycle` is true but the cycle-printing code raises an index error or prints a path that does not close. Diagnosis: the graph has parallel edges and the undirected check skips by parent vertex, so the "visited non-parent" neighbour is a finished descendant rather than an ancestor and the parent walk runs off the root; or the adjacency was built as a set and the duplicate edge was dropped. Fix: adjacency entries of `(neighbour, edge_id)` with a parent-edge skip; keep duplicates at build time.

### Only the first component is examined

Symptom: `is_bipartite` returns true for a graph containing a triangle, or the component count is always 1. Diagnosis: one traversal from vertex 0 and no outer loop; the triangle sits in a component that was never reached. Fix: `for s in range(n): if unvisited(s): traverse(s)` around every one of these algorithms.

### Recursion overflow on a long chain

Symptom: `RecursionError` or `StackOverflowError` on a 10^5-vertex dependency chain after every unit test passed. Diagnosis: recursive DFS with a path longer than the frame budget. Fix: the stack-of-iterators DFS, which keeps the grey set as "on the explicit stack"; raising the recursion limit moves the cliff and, on CPython before 3.11, risks a segfault instead of an exception.

## Interviewer follow-ups

**"Do not tell me there is a cycle; give me its vertices."** Model answer: keep `parent[]` in the three-colour DFS; on `u → v` with `v` grey, walk parents from `u` until `v`, reverse, append `v`. O(cycle length) once, and `v` is an ancestor because grey means on the current path. Common wrong answer: return the vertices Kahn's never emitted, which include everything downstream of the cycle.

**"Count the components of an undirected graph whose 10^6 edges arrive as a stream."** Model answer: union-find over the vertex ids; start `count = V` and decrement on each union that merges two different roots. Memory is O(V) integers, the edges are never stored, and each edge costs O(α(n)). Common wrong answer: buffer the edges into an adjacency list and traverse at the end, which needs O(E) memory.

**"Cycle in a linked list versus cycle in a graph: why does Floyd's algorithm not generalise?"** Model answer: tortoise-and-hare works because every node has out-degree at most 1, so there is one walk from the head and the fast pointer must land in the same cycle, in O(1) memory. A general graph branches, so a two-pointer walk explores one path and misses cycles on others; you need O(V) colours. The [linked-list cycle lesson](/learn/data-structures/linked-lists/cycle-detection) proves the meeting point. Common wrong answer: "two DFS pointers at different speeds".

**"Is this undirected graph a tree?"** Model answer: connected and `e == n − 1`; or union-find over the edges, false the moment an edge joins two vertices already in one set, then `e == n − 1` at the end. Common wrong answer: checking only acyclicity (a forest passes) or only the edge count (a cycle plus an isolated path passes).

## What mid-level engineers get wrong

- Skipping the parent *vertex* on a multigraph: the boolean answer survives, the reported cycle and every bridge computation do not.
- A boolean `visited` for directed cycle detection: the first diamond in a dependency graph is reported as circular.
- Labelling a vertex only when it is popped in the component labeller: pushed twice, O(E) stack, and a count that is still right, which hides the bug.
- Rebuilding the component labels for each "same group?" query: O(Q · (V + E)) where O(1) per query was available.
- Calling the graph a tree on `e == n − 1` alone, or two-colouring from vertex 0 only, so a triangle in another component is missed.
- Writing the directed check recursively and shipping it against a dependency graph with a 10^4-long chain.
- Answering "which cycle?" with Kahn's leftover set, which contains vertices that merely depend on the cycle.

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

- You label components once in O(V + E), answer "same group?" in O(1), and switch to union-find when edges arrive online or do not fit in memory.
- You know undirected and directed cycle detection are **different algorithms**, why the parent trick fails on directed graphs, why "visited" alone reports a diamond, and the step in a trace where each goes wrong.
- You know the parent-vertex skip is only correct on simple graphs and switch to a parent-edge id when parallel edges are possible.
- You walk the parent array from the grey vertex to *report* the cycle, and you know Kahn's leftover set is not a cycle.
- You know connected plus `n − 1` edges means tree, a forest has `n − c` edges, and `e − (n − c)` counts independent cycles.
- You two-colour across all components and can give the two-sentence proof of "bipartite iff no odd cycle".
- You can name where the algorithm runs: a database's wait-for graph, a compiler's import graph, a package manager's dependency graph.
- You choose between three-colour DFS, Kahn's and union-find on direction, incrementality, memory and whether the cycle itself must be reported.

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
- q: >-
    A build tool detects a cycle with Kahn's algorithm and prints the vertices that were never emitted as the circular dependency. A user reports that the printed list contains targets that are not in any loop. Why?
  options: ["Kahn's emits vertices in reverse, so the printed set is the acyclic part", "Kahn's cannot detect cycles at all, so the leftover set is random", "Kahn's leaves out every vertex on a cycle and everything downstream of it", "The in-degree count was off by one for vertices with parallel edges"]
  answer: 2
  explanation: >-
    A vertex is emitted only after all its predecessors, so a vertex that depends on a cycle waits forever along with the cycle itself. The leftover set therefore names everything that cannot be built, which is useful, but it is not the cycle. To print the loop itself, run the three-colour DFS and walk the parent array from the grey vertex.
```
