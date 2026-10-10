---
slug: depth-first-search
title: "Depth-first search: recursion, explicit stacks and edge types"
description: DFS as recursion and as an explicit stack that visits in the same order, discovery and finish times traced by hand, the four edge types with the interval rule for each, the parenthesis and white-path theorems, path finding and backtracking, and the recursion-depth failure you will hit in production in Python, Java and Node.
minutes: 50
difficulty: medium
tags: [graphs, dfs, recursion, stack, edge-classification, backtracking]
problems: [number-of-islands, clone-graph, pacific-atlantic, surrounded-regions, max-area-island]
---
BFS spreads out in rings and needs memory for the widest ring. DFS commits: it follows one edge as deep as it can, backs up only when stuck, and needs memory only for the current path. That single difference makes DFS the right tool for a different family of questions: "is there *any* path", "what does this component contain", "does this graph have a cycle", "in what order can these tasks run". Those are questions about *structure*, and the structure DFS reveals, through the order in which it enters and leaves vertices, is richer than what BFS's distances give you. It is also the traversal that crashes: a 10^5-vertex chain overflows the default stack in CPython, in the JVM and in Node, and the fix is a specific iterative form, not the obvious one.

## Recursive DFS with timestamps

Give each vertex a colour: **white** (undiscovered), **grey** (discovered, still being explored: it is on the current path) and **black** (finished). Stamp the time when a vertex turns grey (`d[v]`, discovery) and when it turns black (`f[v]`, finish); one global clock, incremented at each event.

```python
def dfs_all(adj):
    n = len(adj)
    WHITE, GREY, BLACK = 0, 1, 2
    colour = [WHITE] * n
    d, f, parent = [0] * n, [0] * n, [None] * n
    kind = {}                                   # (u, v) -> "tree" | "back" | "forward" | "cross"
    t = 0

    def visit(u):
        nonlocal t
        t += 1; d[u] = t; colour[u] = GREY      # discover
        for v in adj[u]:
            if colour[v] == WHITE:
                kind[(u, v)] = "tree"; parent[v] = u
                visit(v)
            elif colour[v] == GREY:
                kind[(u, v)] = "back"           # v is on the current path: a cycle
            else:
                kind[(u, v)] = "forward" if d[u] < d[v] else "cross"
        t += 1; f[u] = t; colour[u] = BLACK     # finish: everything reachable via white vertices is done

    for s in range(n):                          # restart from every white vertex: a DFS forest
        if colour[s] == WHITE:
            visit(s)
    return d, f, parent, kind
```

Each vertex is visited once and each adjacency list scanned once: O(V + E). The recursion depth is the length of the current grey path, up to V on a path-shaped graph.

## Hand trace with discovery and finish times

The graph: 8 vertices, 12 directed edges, neighbours in the order the code sees them. It is built to contain every edge type.

```text
0: [1, 3, 2]     4: []
1: [3]           5: [6, 4]
2: [1, 5]        6: [7]
3: [0, 4]        7: [5]
```

The event log, starting at vertex 0:

```text
t=1  discover 0        0->1 white: tree
t=2  discover 1        1->3 white: tree
t=3  discover 3        3->0 grey: back        3->4 white: tree
t=4  discover 4        (no neighbours)
t=5  finish 4
t=6  finish 3
t=7  finish 1          back in 0: 0->3 black, d[0]=1 < d[3]=3: forward
                       0->2 white: tree
t=8  discover 2        2->1 black, d[2]=8 > d[1]=2: cross
                       2->5 white: tree
t=9  discover 5        5->6 white: tree
t=10 discover 6        6->7 white: tree
t=11 discover 7        7->5 grey: back
t=12 finish 7
t=13 finish 6          back in 5: 5->4 black, d[5]=9 > d[4]=4: cross
t=14 finish 5
t=15 finish 2
t=16 finish 0
```

| v | d[v] | f[v] | parent | interval |
|---|---|---|---|---|
| 0 | 1 | 16 | – | [1, 16] |
| 1 | 2 | 7 | 0 | [2, 7] |
| 2 | 8 | 15 | 0 | [8, 15] |
| 3 | 3 | 6 | 1 | [3, 6] |
| 4 | 4 | 5 | 3 | [4, 5] |
| 5 | 9 | 14 | 2 | [9, 14] |
| 6 | 10 | 13 | 5 | [10, 13] |
| 7 | 11 | 12 | 6 | [11, 12] |

Sixteen events for eight vertices: the `f` values give the postorder, the `d` values the preorder. Reverse finish order is `0, 2, 5, 6, 7, 1, 3, 4`, which is the order [DFS topological sort](/learn/data-structures/graphs/topological-sort-and-dags) would emit if this graph had no cycles (it has two, both found as back edges below).

```viz
{"type": "graph", "algorithm": "dfs", "directed": true, "start": "0",
 "nodes": [{"id": "0"}, {"id": "1"}, {"id": "2"}, {"id": "3"}, {"id": "4"}, {"id": "5"}, {"id": "6"}, {"id": "7"}],
 "edges": [{"from": "0", "to": "1"}, {"from": "0", "to": "3"}, {"from": "0", "to": "2"}, {"from": "1", "to": "3"}, {"from": "2", "to": "1"}, {"from": "2", "to": "5"}, {"from": "3", "to": "0"}, {"from": "3", "to": "4"}, {"from": "5", "to": "6"}, {"from": "5", "to": "4"}, {"from": "6", "to": "7"}, {"from": "7", "to": "5"}],
 "title": "The traced directed graph", "caption": "Follow the event log: 0, 1, 3, 4 go deep first; 0's edge to 3 is examined only after 1's whole subtree has finished."}
```

## The four edge types

When DFS examines `u → v`, the colour of `v` classifies the edge, and the `[d, f]` intervals give an equivalent rule you can check after the fact.

| Colour of v | Edge type | Interval rule | Meaning |
|---|---|---|---|
| White | **Tree** | `d[u] < d[v] < f[v] < f[u]` and `parent[v] = u` | DFS follows it; part of the DFS forest |
| Grey | **Back** | `d[v] < d[u] < f[u] < f[v]` | `v` is an ancestor of `u` on the current path: a **cycle** |
| Black, discovered after u | **Forward** | `d[u] < d[v] < f[v] < f[u]`, not a tree edge | A shortcut to a descendant |
| Black, discovered before u | **Cross** | `d[v] < f[v] < d[u]` | Between subtrees or components |

Every edge of the traced graph, classified:

| Edge | Colour of target when examined | Intervals | Type |
|---|---|---|---|
| 0→1, 0→2, 1→3, 3→4, 2→5, 5→6, 6→7 | white | nested, parent matches | tree |
| 3→0 | grey | [1,16] contains [3,6] | back |
| 7→5 | grey | [9,14] contains [11,12] | back |
| 0→3 | black, d[0]=1 < d[3]=3 | [1,16] contains [3,6], parent[3] is 1 | forward |
| 2→1 | black, d[2]=8 > d[1]=2 | [2,7] before [8,15] | cross |
| 5→4 | black, d[5]=9 > d[4]=4 | [4,5] before [9,14] | cross |

The one that matters most: a **back edge exists if and only if the graph has a cycle**. The grey state is essential: an edge to a *finished* (black) vertex is a forward or cross edge, never a cycle, and treating "already visited" as "cycle" is the classic false positive; `2→1` above would report one. The [connectivity lesson](/learn/data-structures/graphs/connectivity-and-cycles) turns this into the three-colour cycle detector.

### The parenthesis theorem

For any two vertices, the intervals `[d, f]` are either nested (one vertex is a descendant of the other in the DFS forest) or disjoint. They never partially overlap. Check it on the table: `[2, 7]` and `[3, 6]` nest (1 is 3's parent); `[2, 7]` and `[8, 15]` are disjoint (1 and 2 are siblings under 0); no pair looks like `[2, 9]` against `[5, 12]`. It holds because a vertex finishes only after every vertex it discovered has finished, exactly like matched parentheses: write `(` at each discovery and `)` at each finish and the log reads `( 0 ( 1 ( 3 ( 4 ) ) ) ( 2 ( 5 ( 6 ( 7 ) ) ) ) )`. Ancestry is therefore an interval test: `u` is an ancestor of `v` iff `d[u] < d[v]` and `f[v] < f[u]`, which is how the back-edge and forward-edge rules above are derived.

### The white-path theorem

`v` is a descendant of `u` in the DFS forest iff, at the instant `u` is discovered, there is a path from `u` to `v` consisting entirely of white vertices. At `t = 1` every vertex is white and reachable from 0, so all seven others are descendants of 0 and its interval contains everything. At `t = 8`, when 2 is discovered, the edge `2 → 1` exists but 1 is black, so 1 is not a descendant of 2, and indeed `[2, 7]` and `[8, 15]` are disjoint. At `t = 9`, 5 has an edge to 4, but 4 is black; `[4, 5]` sits outside `[9, 14]`. The theorem is what makes "reverse finish order is a topological order" and Kosaraju's [SCC algorithm](/learn/algorithms/graph-algorithms/strongly-connected-components) correct.

### Undirected graphs: only tree and back edges

Suppose DFS in an undirected graph examines `{u, v}` from `u` and finds `v` black. If `v` finished before `u` was discovered (the cross case), then while `v` was grey it examined `{v, u}` with `u` white, which would have made `u` a descendant of `v` and forced `u` to finish before `v`, a contradiction. If `v` is a black descendant of `u` (the forward case), `v` already examined the same edge as `v → u` while `u` was grey and classified it as back. So each undirected edge is a tree edge from one end or a back edge from its lower end; the edge to your immediate parent is the same tree edge seen from the other side and is not a cycle, which is why the undirected cycle check remembers the parent and skips exactly that one edge.

## The explicit stack, done right

There are three iterative forms, and only one of them is DFS in the full sense.

**Push all neighbours, mark on pop.** Push the start; pop `u`; skip if visited; mark and record it; push its neighbours in *reverse* order so that the first neighbour pops first. On the traced graph this produces the recursive preorder exactly, `0, 1, 3, 4, 2, 5, 6, 7`, but vertex 3 is pushed twice (by 0 and by 1), the stack can grow to O(E), and there is no moment at which a vertex "finishes": it cannot produce `f`, and so it cannot produce a topological order or classify edges.

**Push all neighbours, mark on push.** The tempting "fix" for the duplicate pushes marks a vertex when it is pushed, as BFS does on enqueue. The result on the same graph is `0, 2, 5, 4, 6, 7, 3, 1`: every reachable vertex once, so it is fine for flood fill, components and reachability, but it is not a DFS order. Vertex 3 is claimed by 0 at push time, so its parent becomes 0 although the DFS tree has `1 → 3`, and 4 is popped before 6 although DFS from 5 explores 6 first. Anything that relies on DFS structure (the grey set for cycle detection, finish order, [articulation points](/learn/algorithms/graph-algorithms/bridges-articulation-and-flow)) gives wrong answers on this order. The rule: BFS marks on enqueue; DFS marks at the moment a vertex is *expanded*, which in this form is the pop.

**Stack of (vertex, position in its adjacency list).** Push `(start, 0)`; loop: look at the top `(u, i)`; if `i < len(adj[u])`, advance `i` and examine `adj[u][i]`: if white, discover it and push `(v, 0)`; if exhausted, pop and finish `u`. This is the recursion with the call frames made explicit. It marks on push, and that is correct here because a vertex is pushed at the instant it is expanded.

```python
def dfs_iter_full(adj, start, colour, d, f, parent, clock):
    WHITE, GREY, BLACK = 0, 1, 2
    t = clock
    t += 1; d[start] = t; colour[start] = GREY
    stack = [[start, 0]]                     # [vertex, index of the next neighbour to examine]
    while stack:
        u, i = stack[-1]
        if i < len(adj[u]):
            stack[-1][1] += 1                # resume here after returning from v
            v = adj[u][i]
            if colour[v] == WHITE:
                t += 1; d[v] = t; colour[v] = GREY; parent[v] = u
                stack.append([v, 0])
        else:
            t += 1; f[u] = t; colour[u] = BLACK
            stack.pop()
    return t
```

Traced on the same graph, the stack after each event (each entry is `vertex:next index`):

| t | Event | Stack |
|---|---|---|
| 1 | push 0 | 0:0 |
| 2 | 0→1 white, discover 1 | 0:1, 1:0 |
| 3 | 1→3 white, discover 3 | 0:1, 1:1, 3:0 |
| – | 3→0 grey, skip | 0:1, 1:1, 3:1 |
| 4 | 3→4 white, discover 4 | 0:1, 1:1, 3:2, 4:0 |
| 5 | 4 exhausted, finish 4 | 0:1, 1:1, 3:2 |
| 6 | 3 exhausted, finish 3 | 0:1, 1:1 |
| 7 | 1 exhausted, finish 1 | 0:1 |
| – | 0→3 black, skip | 0:2 |
| 8 | 0→2 white, discover 2 | 0:3, 2:0 |
| – | 2→1 black, skip | 0:3, 2:1 |
| 9 | 2→5 white, discover 5 | 0:3, 2:2, 5:0 |
| 10 | 5→6 white, discover 6 | 0:3, 2:2, 5:1, 6:0 |
| 11 | 6→7 white, discover 7 | 0:3, 2:2, 5:1, 6:1, 7:0 |
| – | 7→5 grey, skip | 0:3, 2:2, 5:1, 6:1, 7:1 |
| 12–13 | finish 7, finish 6 | 0:3, 2:2, 5:1 |
| – | 5→4 black, skip | 0:3, 2:2, 5:2 |
| 14–16 | finish 5, 2, 0 | (empty) |

Identical `d`, `f` and `parent` to the recursive run (checked programmatically while writing this lesson), the stack never exceeds the depth of the current path (five entries at most), and edge classification drops in unchanged by testing `colour[v]` before the push. The [stack applications lesson](/learn/data-structures/stacks-queues/stack-applications) has more on simulating recursion this way.

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

The `visited` set stays global here: a vertex that failed to reach `t` will not reach it from a different entry either, since reachability does not depend on the path taken, so the search stays O(V + E). In problems where the path must satisfy a constraint that depends on the route (a grid path that cannot reuse cells, a Hamiltonian path), visited must be *undone* on backtrack too, and the search becomes exponential. Enumerating all simple corner-to-corner paths in an n × n grid with exactly that undo gives 2, 12, 184, 8,512 and 1,262,816 paths for n = 2 to 6 (each counted by the backtracking search while verifying this lesson; the 6 × 6 count took 4 s in CPython 3.14). Recognise which case you are in before you write the undo, and say the count out loud when the interviewer asks "how many paths".

## Grid DFS: flood fill

Counting islands, flooding a region, computing the area of a connected blob: DFS from each unvisited land cell, marking as you go, and each DFS call from the outer loop is one component. Mark the cell **on entry** (discovery). Marking it after the neighbour loop instead lets the cell be re-entered from each of its unvisited neighbours before any mark lands, and the fill becomes exponential on an open grid. Recursive flood fill on a 1,000 × 1,000 all-land grid recurses a million deep and crashes in every mainstream language; use the explicit stack, or BFS, which is equally correct here since you do not need order. Marking cells in place (`grid[r][c] = 0`) is standard when mutation is allowed; say you are doing it.

`pacific-atlantic` and `surrounded-regions` add the trick of starting DFS from the *boundary* rather than from every cell: flood from the edges to find what escapes, and everything unmarked is what is trapped. Recognising "search from the boundary inward" saves an O(cells²) solution.

```viz
{"type": "graph", "algorithm": "dfs", "directed": false, "start": "A",
 "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}, {"id": "F"}],
 "edges": [{"from": "A", "to": "B"}, {"from": "A", "to": "C"}, {"from": "B", "to": "D"}, {"from": "C", "to": "D"}, {"from": "D", "to": "E"}, {"from": "B", "to": "F"}],
 "title": "DFS from A", "caption": "The search dives A, B, D, C before it backs up to E and F. C's edge to A, an ancestor that is not its parent, is the only back edge. The stack (or recursion) holds only the current path."}
```

## Iterative deepening

When the search space is a huge implicit graph, BFS finds the shallowest solution but its frontier does not fit in memory, and DFS fits in memory but may dive down an infinite or useless branch and never come back. **Iterative deepening** runs DFS with a depth limit of 1, then 2, then 3, and so on, until a solution is found. Each pass is a bounded DFS with O(depth) memory, and the shallowest solution is found first, as with BFS.

The apparent waste, re-exploring shallow levels on every pass, is a constant factor. On a tree with branching factor `b`, level `d` has `b^d` vertices and all shallower levels together have about `b^d / (b − 1)`, so the total work over all passes is about `b / (b − 1)` times a single full-depth pass: 2.0 for `b = 2`, 1.11 for `b = 10`, 1.03 for chess-like `b = 35`. Iterative deepening is the standard search in game engines (with alpha-beta pruning) and in planners, and the interview version is "find the shortest solution to a puzzle whose state space does not fit in memory". It only applies to implicit graphs where re-generating vertices is cheap; on an explicit graph that fits in memory, plain BFS wins.

## Under the hood: where the stack lives

### CPython

`sys.getrecursionlimit()` is 1,000 by default; a recursive DFS over a path of 901 vertices succeeds and one of 2,001 raises `RecursionError` (measured on CPython 3.14). `sys.setrecursionlimit(10**6)` moves the limit, and what happens next depends on the version. Before 3.11 every Python call also consumed a C stack frame in the interpreter, so a raised limit could exhaust the 8 MiB main-thread C stack (`ulimit -s` on Linux) and segfault. Since 3.11 Python-to-Python calls are executed inside the interpreter loop without a C call, and 3.12 split the C recursion limit off into its own counter, so pure-Python recursion is limited by the Python limit and then by memory: with the limit raised, a 10^5-vertex path DFS ran to completion in the same measurement. Recursion that passes through C code (a `__getitem__` or a comparison invoked from a C function) is still bounded by the C stack. Worker threads need not get the main thread's C stack: with glibc a new thread's default is the `RLIMIT_STACK` soft limit (8 MiB unless changed), but musl, the C library in Alpine images, defaults to 128 KiB, and `threading.stack_size()` overrides both. That is where "works in the script, overflows in the worker" comes from.

### JVM and Node

A JVM thread's stack is fixed at creation, `-Xss`, with a default of 1 MiB on x86-64 and 2 MiB on AArch64 in the JDK 21 documentation; a small frame is on the order of 100 bytes, so roughly 10^4 frames before `StackOverflowError`. Node's default V8 stack is a little under 1 MB, also on the order of 10^4 frames of a simple function before "Maximum call stack size exceeded". A 10^5-vertex chain overflows all three runtimes at their defaults; raising `-Xss` or `--stack-size` moves the cliff and does not remove it. The fix in every language is the stack-of-iterators form above, whose "stack" is heap memory limited only by RAM. The [call stack lesson](/learn/foundations/how-code-runs/stack-heap-and-the-call-stack) shows what a frame holds.

### DFS you already run

Tracing garbage collectors (the JVM's, V8's, Go's) mark reachable objects by walking from the roots with an explicit mark stack or worklist rather than recursion, precisely because an object graph can contain a linked list 10^7 deep. `find` and `du` walk a directory tree depth-first: a directory is fully explored before its sibling is entered, and `du` prints a directory's total when it *finishes* it, a postorder value. A build system computing "what depends on me" runs DFS on the reverse graph.

## DFS versus BFS

| | DFS | BFS |
|---|---|---|
| Memory | O(longest path): recursion or explicit stack | O(widest level): queue |
| Shortest paths (unweighted) | No | Yes |
| Exhaustive search, backtracking | Native: push, recurse, pop | Not applicable |
| Cycle detection | Back edge to a grey vertex | Possible but awkward |
| Topological order | Reverse finish order | Kahn's in-degree queue |
| Components, flood fill | Fine, watch depth | Fine |
| Infinite or huge implicit graphs | Needs a depth limit or iterative deepening | Explores nearest first; safe |
| Deep chains | Overflows at ~10^3 (CPython) to ~10^4 (JVM, Node) frames unless iterative | No recursion |

Both are O(V + E) on an explicit graph. On a tree-shaped search space with branching factor `b` and solution depth `d`, DFS uses O(b · d) memory and BFS O(b^d); that is why chess engines, SAT solvers and every backtracking search are depth-first, and why iterative deepening exists to get BFS's optimality with DFS's memory.

## Failure modes

### Stack overflow on a long chain

Symptom: `RecursionError`, `StackOverflowError` or "Maximum call stack size exceeded" on a large input, after every small test passed; or a worker thread dies where the main thread was fine. Diagnosis: the graph contains a path longer than the frame budget (a linked list of tasks, a snake through a grid). Fix: the stack-of-iterators DFS; raising the limit only moves the cliff.

### Wrong finish order from the naive iterative version

Symptom: a topological sort or SCC built on an iterative DFS is sometimes wrong, and the failures depend on adjacency order. Diagnosis: the push-all form records "finish" when a vertex is popped, which is its discovery, not its finish; a vertex pushed twice may also be recorded twice. Fix: the stack-of-iterators form, which finishes a vertex only when its neighbour list is exhausted.

### Mark on push in a DFS

Symptom: cycle detection misses cycles or reports false ones, or articulation points are wrong, although every vertex is visited exactly once. Diagnosis: marking on push assigns parents at push time, so the traversal tree is not a DFS tree and "grey" no longer means "on the current path". Fix: mark when a vertex is expanded (on pop in the push-all form, on push in the iterator form).

### Exponential flood fill

Symptom: a flood fill on a small open grid takes seconds, or a path search revisits the same cells thousands of times. Diagnosis: the visited mark is set after the neighbour loop instead of on entry, or `visited` is undone on backtrack in a plain reachability search, so each cell is re-entered from every neighbour. Fix: mark on entry; undo only when the constraint is path-dependent.

### Visited not reset between searches

Symptom: the first query is right and later queries return "no path" or the wrong component; or a "count all paths" search finds too few. Diagnosis: a module-level or default-argument `visited` persists across calls, or a component count reuses the previous component's marks. Fix: allocate `visited` per search; in path enumeration, undo on backtrack.

## Interviewer follow-ups

**"Make your recursive topological sort iterative without changing its output."** Model answer: the stack of `(vertex, next index)` pairs, emitting a vertex when its index reaches the end of its list; it reproduces the recursive finish order exactly, in O(V) stack. Common wrong answer: push all neighbours and emit on pop, which emits in discovery order and is not a topological order.

**"Why is a visited set not enough to detect a cycle in a directed graph?"** Model answer: an edge to a visited-and-finished vertex is a forward or cross edge (`2 → 1` in the trace: 1 finished at t = 7, long before 2 was discovered at t = 8), and only an edge to a grey vertex closes a cycle. Common wrong answer: "any edge to a visited vertex is a cycle", which reports a cycle in every DAG with two paths to the same vertex.

**"How many simple paths from s to t?"** Model answer: in a DAG, DFS with memoisation of `count[v]` is O(V + E), because the count from `v` does not depend on how `v` was reached; in a general graph the answer can be exponential (1,262,816 in a 6 × 6 grid) and enumeration with visited undone on backtrack is the only exact method. Common wrong answer: BFS with a counter, which counts shortest paths only.

**"DFS over 10^7 vertices in Python, and it has to finish."** Model answer: iterative form, `bytearray` or list for colours instead of a set, CSR arrays instead of lists of lists, and if that is still slow, `scipy.sparse.csgraph` which runs the same traversal in C. Common wrong answer: `sys.setrecursionlimit(10**8)`, which either overflows the C stack (before 3.11) or spends the memory of 10^7 frames.

## What mid-level engineers get wrong

- Converting recursion to a stack by pushing all neighbours, then using pop order as finish order: topological sorts that are wrong only on some inputs.
- Marking on push in DFS because it works in BFS: a traversal that visits everything once and has the wrong tree.
- Treating "already visited" as "cycle" in a directed graph: a false positive on the first DAG with a diamond.
- Raising the recursion limit as the fix for a deep graph and shipping code that segfaults on the next runtime or in a worker thread.
- Undoing `visited` on backtrack in a plain reachability search, turning O(V + E) into exponential; or not undoing it in a path-dependent search, missing valid paths.
- Marking a grid cell after recursing into its neighbours: exponential re-entry on open grids.
- Recursing on a 10^6-cell grid and being surprised by the crash, since 10^3 (CPython) to 10^4 (JVM, Node) frames is the budget.
- Forgetting the outer loop over all vertices, so a DFS forest with several components reports only the first one.

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

- You can write DFS three ways (recursive, push-all stack, stack of iterators), you know only the last two survive deep graphs and only the iterator version keeps finish order, and you can say why mark-on-push is right for BFS and wrong for DFS.
- You trace discovery and finish times on paper, and you use them as a tool: nested intervals mean ancestry, reverse finish order is a topological order.
- You classify edges by the colour of the endpoint and by the interval rule, and you know that **a back edge to a grey vertex** is the cycle test, not any edge to a visited vertex.
- You can state the parenthesis theorem and the white-path theorem and explain from them why undirected graphs have only tree and back edges.
- You describe backtracking as DFS on an implicit graph, you know when visited must be undone (path-dependent constraints) and when it must not (plain reachability), and you can put a number on the exponential case.
- You know the recursion budgets (about 10^3 frames in CPython, about 10^4 in the JVM and Node), what `sys.setrecursionlimit` does and does not do on CPython 3.12+, and that the explicit stack is the fix rather than a bigger limit.
- You flood-fill from the boundary when the question is about what is trapped, you mark on entry, and you never recurse on a million-cell grid.
- You give the memory contrast with BFS in terms of depth versus width, quantify iterative deepening's overhead as b/(b − 1), and can say why every game-tree search is depth-first.

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
    With reverse pushing the discovery order matches recursion, and every reachable vertex is still visited (a duplicate is skipped only because it was already marked), but duplicates can sit on the stack and the moment a vertex finishes is not observable. A stack of iterators fixes both, with an O(V) stack and the same pre- and postorder as recursion.
- q: >-
    In a DFS, vertex u has d[u] = 3 and f[u] = 6, vertex v has d[v] = 1 and f[v] = 16, and the graph contains the edge u → v. That edge is:
  options: ["A forward edge, because v was discovered before u and finished after it", "A back edge, because v's interval contains u's so v is an ancestor of u", "A tree edge, because v's discovery time is the smallest in the graph", "A cross edge, because the two intervals overlap without being equal"]
  answer: 1
  explanation: >-
    [3, 6] nests inside [1, 16], so by the parenthesis theorem v is an ancestor of u, and an edge from a descendant to an ancestor is a back edge: v was grey when u examined the edge. A forward edge runs the other way, from ancestor to descendant; a cross edge needs disjoint intervals; and a tree edge into v would require d[u] < d[v].
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
    The game tree's width explodes exponentially: with b around 35, a level of size b^d is infeasible to store, while DFS keeps memory linear in depth (O(b · d)). Move quality comes from evaluation and pruning, not traversal order. Iterative deepening provides the level-by-level behaviour when it is needed, at about b/(b − 1) ≈ 1.03 times the work.
- q: >-
    In a DFS-based path search where a vertex failed to reach the target, keeping it marked visited when exploring other branches is:
  options: ["Needed to stop infinite loops, but it can make the search miss paths", "Correct only in undirected graphs, because directed edges are one-way", "Correct, because reachability from v does not depend on how v was reached", "A bug, because v might still reach t along a route through different vertices"]
  answer: 2
  explanation: >-
    Reachability is a property of v alone: if no route from v reached t the first time, no other entry into v will find one. Unmarking would re-explore the same dead subtree from each entry point and could become exponential. Only path-dependent constraints (no reused cells, resource limits) require undoing visited.
```
