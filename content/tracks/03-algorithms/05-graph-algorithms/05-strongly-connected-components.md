---
slug: strongly-connected-components
title: "Strongly connected components: Tarjan, Kosaraju and the condensation DAG"
description: How low-link values find every cycle-tangled cluster in one DFS, why Kosaraju's second pass on the reversed graph works, what you can do once the graph collapses to a DAG, and how 2-SAT falls out of the same machinery.
minutes: 50
difficulty: hard
tags: [graphs, strongly-connected-components, tarjan, kosaraju, low-link, condensation, 2-sat]
problems: [course-schedule-ii, alien-dictionary]
---
A directed graph with a cycle in it cannot be topologically sorted, cannot be processed with a DAG dynamic program, and cannot be "resolved" in the way build systems, package managers and dependency injectors need. But most real dependency graphs are not one giant cycle; they are mostly a DAG with a few knotted clusters. A microservice call graph where A calls B calls C calls A is a knot; everything else flows. Compilers see the same shape in control-flow graphs (loops are the knots), and so do schedulers, garbage collectors looking for cycles of references, and social-network analysts looking for tightly knit groups.

A **strongly connected component** (SCC) is a maximal set of nodes where every node can reach every other. Collapsing each SCC to a single node produces the **condensation**, which is always a DAG. Finding the SCCs is therefore the operation that turns an arbitrary directed graph into something you can reason about, and two linear-time algorithms do it. Kosaraju's is easier to see; Tarjan's is the one you should be able to write, because its central idea, the low-link value, is reused for bridges and articulation points in the [next lesson](/learn/algorithms/graph-algorithms/bridges-articulation-and-flow).

## Kosaraju: two DFS passes

1. Run DFS on the graph and record nodes in order of *finishing* (post-order).
2. Reverse every edge.
3. Process nodes in **decreasing** finish time; each DFS on the reversed graph that starts at an unvisited node collects exactly one SCC.

Why it works comes down to one fact: in the condensation DAG, the SCC containing the node with the *latest* finish time is a source (no edges into it from other SCCs). Reversing the edges turns that source into a sink, so a DFS from it on the reversed graph cannot escape into another component; it finds precisely its own SCC. Mark those nodes visited, and the next unvisited node with the latest finish time is a source of what remains. Induction does the rest.

```python
def kosaraju(n, adj):
    order, seen = [], [False] * n
    def dfs1(u):
        seen[u] = True
        for v in adj[u]:
            if not seen[v]:
                dfs1(v)
        order.append(u)                       # post-order
    for u in range(n):
        if not seen[u]:
            dfs1(u)

    radj = [[] for _ in range(n)]
    for u in range(n):
        for v in adj[u]:
            radj[v].append(u)

    comp = [-1] * n
    def dfs2(u, c):
        comp[u] = c
        for v in radj[u]:
            if comp[v] == -1:
                dfs2(v, c)
    c = 0
    for u in reversed(order):
        if comp[u] == -1:
            dfs2(u, c)
            c += 1
    return comp                               # comp ids are in topological order of the condensation
```

Two DFS passes, one reversed copy of the graph: `O(V + E)` time and space. A useful side effect: the component ids come out in topological order of the condensation DAG (component 0 is a source), so you can run a DAG DP straight away without a separate topological sort.

### Both passes on the example

The graph used throughout this lesson (drawn in the Tarjan section) has edges `A→B, B→C, C→A, B→D, D→E, E→D, E→F`. Pass 1, starting at A and taking neighbours in that order, records finish events:

| DFS step | what happens | finish order so far |
|---|---|---|
| A → B → C | C's only edge goes to A, already on the path | C |
| back in B, B → D → E | E → D is already visited; E → F | C |
| F has no edges | F finishes | C, F |
| back in E, then D | both finish | C, F, E, D |
| back in B, then A | both finish | C, F, E, D, B, A |

Reverse every edge: `B→A, C→B, A→C, D→B, E→D, D→E, F→E`. Pass 2 takes unvisited nodes in *decreasing* finish time:

| start (latest unvisited finisher) | reversed-graph DFS reaches | component |
|---|---|---|
| A | A → C → B; B's reversed edge goes to A, visited | 0: {A, B, C} |
| B visited, so D | D → B (visited), D → E; E → D (visited) | 1: {D, E} |
| E visited, so F | F → E (visited) | 2: {F} |

Component 0 is the source of the condensation `{A,B,C} → {D,E} → {F}`, as promised. Run pass 2 in *increasing* finish order instead and it breaks: starting at F on the reversed graph reaches E and D, and reports `{F, E, D}` as one component although F cannot reach D.

## Tarjan: one pass with low-link values

Tarjan's algorithm does the same job in one DFS by noticing that an SCC is exactly a subtree of the DFS tree, cut off at its root, once you know which node is the root. Each node gets:

- `disc[u]`: the time it was discovered.
- `low[u]`: the smallest discovery time reachable from `u` by following tree edges down and then **at most one** back edge or cross edge to a node still on the stack.

Nodes are pushed on a stack when discovered and stay there until their SCC is complete. When `u`'s DFS finishes, if `low[u] == disc[u]`, then nothing in `u`'s subtree can reach anything discovered earlier that is still open, so `u` is the root of an SCC: pop the stack down to `u` and that is the component.

```python
def tarjan(n, adj):
    disc = [-1] * n
    low = [0] * n
    on_stack = [False] * n
    stack, comps, t = [], [], 0

    def dfs(u):
        nonlocal t
        disc[u] = low[u] = t
        t += 1
        stack.append(u)
        on_stack[u] = True
        for v in adj[u]:
            if disc[v] == -1:
                dfs(v)
                low[u] = min(low[u], low[v])          # tree edge: inherit child's reach
            elif on_stack[v]:
                low[u] = min(low[u], disc[v])         # back/cross edge into an open component
        if low[u] == disc[u]:                          # u is the root of an SCC
            comp = []
            while True:
                v = stack.pop()
                on_stack[v] = False
                comp.append(v)
                if v == u:
                    break
            comps.append(comp)

    for u in range(n):
        if disc[u] == -1:
            dfs(u)
    return comps                                       # emitted in REVERSE topological order
```

The `on_stack[v]` check is the line to understand. A DFS can reach an already-visited node in two ways: a **back edge** to an ancestor (still on the stack, definitely in the same SCC) or a **cross edge** to a node in a different subtree. If that node has already been popped, its SCC is finished and closed; following it would wrongly merge components. If it is still on the stack, it is part of an open component that `u` can now reach, and since it was discovered earlier and can reach `u` via the DFS path, they are in the same SCC. Note also that the cross-edge update uses `disc[v]`, not `low[v]`; using `low[v]` would still be correct for SCCs but breaks the bridge-finding variant of the same code, so it is worth building the right habit now.

```viz
{"type": "graph", "algorithm": "tarjan-scc", "directed": true,
 "title": "Tarjan's SCC: labels show disc/low",
 "nodes": [{"id":"A","x":10,"y":30},{"id":"B","x":35,"y":30},{"id":"C","x":22,"y":75},{"id":"D","x":60,"y":30},{"id":"E","x":60,"y":75},{"id":"F","x":90,"y":50}],
 "edges": [{"from":"A","to":"B"},{"from":"B","to":"C"},{"from":"C","to":"A"},{"from":"B","to":"D"},{"from":"D","to":"E"},{"from":"E","to":"D"},{"from":"E","to":"F"}]}
```

Trace it by hand, one event per row. The stack column is the Tarjan stack after the event.

| # | Event | `disc` / `low` | Stack after |
|---|---|---|---|
| 1 | discover A | `disc[A] = low[A] = 0` | A |
| 2 | tree edge A→B, discover B | `disc[B] = low[B] = 1` | A B |
| 3 | tree edge B→C, discover C | `disc[C] = low[C] = 2` | A B C |
| 4 | C→A: A is on the stack | `low[C] = min(2, disc[A] = 0) = 0` | A B C |
| 5 | C finishes: `low 0 ≠ disc 2` | not a root; B inherits: `low[B] = min(1, 0) = 0` | A B C |
| 6 | tree edge B→D, discover D | `disc[D] = low[D] = 3` | A B C D |
| 7 | tree edge D→E, discover E | `disc[E] = low[E] = 4` | A B C D E |
| 8 | E→D: D is on the stack | `low[E] = min(4, disc[D] = 3) = 3` | A B C D E |
| 9 | tree edge E→F, discover F | `disc[F] = low[F] = 5` | A B C D E F |
| 10 | F finishes: `low 5 = disc 5` | **root**: pop `{F}` | A B C D E |
| 11 | back in E: `low[E] = min(3, low[F] = 5) = 3`; E finishes, `3 ≠ 4` | not a root | A B C D E |
| 12 | back in D: `low[D] = min(3, low[E] = 3) = 3`; D finishes, `3 = 3` | **root**: pop `{E, D}` | A B C |
| 13 | back in B: `low[B] = min(0, low[D] = 3) = 0`; B finishes, `0 ≠ 1` | not a root | A B C |
| 14 | back in A: `low[A] = min(0, low[B] = 0) = 0`; A finishes, `0 = 0` | **root**: pop `{C, B, A}` | empty |

Final values: `disc = A0 B1 C2 D3 E4 F5` and `low = A0 B0 C0 D3 E3 F5`. Components come out as `{F}`, `{D, E}`, `{A, B, C}`, the reverse topological order of the condensation `{A,B,C} → {D,E} → {F}`. Row 5 is the one to remember: C's back edge lowers `low[C]` to 0, and that value propagates up through B to A, which is what keeps B and C on the stack until A closes the component.

Tarjan's is `O(V + E)` in one pass with no reversed graph, which makes it the usual production choice. The cost is a recursive DFS: on a graph with a hundred thousand nodes in a chain, Python (default limit 1,000 frames) and JavaScript (around 10⁴ frames, engine-dependent) both overflow the call stack.

### The iterative version

Each frame remembers which edge of its node to scan next, so that "returning from a child" resumes where the loop left off. The three places the recursive code touches `low` map to three places here: on a back edge, on popping a finished frame (the "return" step), and at the root check.

```python
def tarjan_iterative(n, adj):
    disc = [-1] * n
    low = [0] * n
    on_stack = [False] * n
    stack, comps, t = [], [], 0
    for root in range(n):
        if disc[root] != -1:
            continue
        disc[root] = low[root] = t; t += 1
        stack.append(root); on_stack[root] = True
        frames = [(root, 0)]                      # (node, index of the next edge to scan)
        while frames:
            u, i = frames[-1]
            if i < len(adj[u]):
                frames[-1] = (u, i + 1)           # advance before descending, so we never rescan
                v = adj[u][i]
                if disc[v] == -1:
                    disc[v] = low[v] = t; t += 1
                    stack.append(v); on_stack[v] = True
                    frames.append((v, 0))         # the recursive call
                elif on_stack[v]:
                    low[u] = min(low[u], disc[v])
            else:
                frames.pop()                      # u is finished
                if frames:
                    p = frames[-1][0]
                    low[p] = min(low[p], low[u])  # the return step: parent inherits
                if low[u] == disc[u]:
                    comp = []
                    while True:
                        v = stack.pop(); on_stack[v] = False; comp.append(v)
                        if v == u:
                            break
                    comps.append(comp)
    return comps
```

It emits components in the same order as the recursive version on every graph (a randomised test against the recursive code is the way to gain confidence in your own port) and handles a chain of 200,000 nodes without touching the recursion limit. The line `frames[-1] = (u, i + 1)` before the descent is the one people get wrong: advance the edge index *after* returning and the child's subtree gets scanned again, turning the pass quadratic on star-shaped graphs.

## The condensation DAG

Once you have `comp[u]` for every node, the condensation is built in one pass over the edges: for each `(u, v)` with `comp[u] ≠ comp[v]`, add the DAG edge `comp[u] → comp[v]` (deduplicate with a set). Everything that was impossible on the cyclic graph is now available on the DAG:

- **Reachability and "can every node reach X"**: reduce to the DAG, then `X`'s component must be the unique sink reachable from every source.
- **Longest or most expensive path through a cyclic graph**: DP over the condensation, where each component's weight is the sum of its members (you can visit all of them once you enter).
- **Minimum edges to make the graph strongly connected**: with `s` source components and `t` sink components in the condensation (and more than one component), the answer is `max(s, t)`; each added edge can fix at most one source and one sink.
- **Which cycles matter**: in a control-flow graph, the non-trivial SCCs are the loops. Compilers run SCC detection before loop-invariant code motion for exactly this reason.
- **Cyclic imports and build graphs**: `cargo`, `go build` and every module bundler run some form of SCC detection to report cycles as a unit rather than as a confusing chain of errors. [Alien Dictionary](/practice/alien-dictionary) and [Course Schedule II](/practice/course-schedule-ii) are the interview-sized version: a cycle means "no valid order", and reporting *which* nodes form it is what SCCs add over plain cycle detection.

## 2-SAT: satisfiability as an SCC question

A 2-SAT formula is an AND of clauses with two literals each, `(a ∨ b) ∧ (¬a ∨ c) ∧ …`. General SAT is NP-complete; 2-SAT is linear time, and the algorithm is Tarjan's.

Each clause `(a ∨ b)` is equivalent to two implications: `¬a → b` and `¬b → a`. Build the **implication graph** with `2n` nodes (one per literal) and those two edges per clause. If a variable `x` and its negation `¬x` end up in the same SCC, then `x → … → ¬x → … → x`, so assuming either value forces its own negation, and the formula is unsatisfiable. Otherwise it is satisfiable, and an assignment is read off the topological order of the condensation: set `x = true` if `x`'s component comes *after* `¬x`'s in topological order (in Tarjan's output, which is reverse topological, that means `x`'s component index is *smaller*). The intuition: if `¬x` comes first, some chain might force `¬x → x`, so choosing `x` is safe, while the reverse could be contradictory.

Trace `(x₁ ∨ x₂) ∧ (¬x₁ ∨ x₂) ∧ (x₁ ∨ ¬x₂)`. The six implication edges are `¬x₁→x₂, ¬x₂→x₁` (first clause), `x₁→x₂, ¬x₂→¬x₁` (second), `¬x₁→¬x₂, x₂→x₁` (third). Tarjan on the four literal nodes emits `{x₂, x₁}` first and `{¬x₂, ¬x₁}` second: no variable shares a component with its negation, so the formula is satisfiable, and since `x₁`'s component was emitted before `¬x₁`'s, `x₁ = true`; likewise `x₂ = true`. Check: every clause contains a positive literal, so all three hold. Add a fourth clause `(¬x₁ ∨ ¬x₂)`, which contributes `x₁→¬x₂` and `x₂→¬x₁`: now `x₁→x₂→¬x₁→¬x₂→x₁` is a cycle, all four literals collapse into one component, and the formula is unsatisfiable, as it should be, since the four clauses exclude all four assignments.

```python
def two_sat(n, clauses):                       # literal k>0 means x_k, k<0 means ¬x_k
    idx = lambda lit: 2 * (abs(lit) - 1) + (1 if lit < 0 else 0)
    adj = [[] for _ in range(2 * n)]
    for a, b in clauses:
        adj[idx(-a)].append(idx(b))            # ¬a → b
        adj[idx(-b)].append(idx(a))            # ¬b → a
    comps = tarjan(2 * n, adj)
    comp = [0] * (2 * n)
    for c, members in enumerate(comps):
        for v in members:
            comp[v] = c
    return all(comp[2 * i] != comp[2 * i + 1] for i in range(n))
```

2-SAT appears in scheduling ("each job in one of two slots, with pairwise conflicts"), in placing labels on maps (each label above or below its point without overlaps), and in the parity extension of union-find from the previous lesson, where "these two must differ" constraints are a special case. Recognising a problem as 2-SAT is the senior move; the algorithm afterwards is fifteen lines you already have.

## Under the hood

**networkx.** `strongly_connected_components(G)` is a generator implementing Tarjan's algorithm with Nuutila's modifications in a *non-recursive* form (its docstring says so), with an explicit stack of node iterators much like the frames above, so it survives million-node chains. `kosaraju_strongly_connected_components` is there too, and `condensation(G)` builds the DAG and stores the node-to-component map in `C.graph["mapping"]`, which is the input every "DP on the condensation" starts from. Everything is pure Python: on the order of a microsecond per edge, so a few seconds per million edges.

**scipy.** `scipy.sparse.csgraph.connected_components(G, directed=True, connection="strong")` labels components over CSR arrays in Cython using Pearce's variant of Tarjan, which drops the separate `low` array by storing a single index per node and reusing the label array as the stack: three `int32` arrays of length `V`, about 12 bytes per node, and tens of milliseconds per million edges. The labels come back as one array, which is the shape you want before a NumPy-based DP.

**Compilers.** LLVM's `scc_iterator` walks the call graph in post-order of its SCCs, and the inliner and interprocedural analyses are written as *call-graph SCC passes*: a group of mutually recursive functions is optimised as one unit, bottom-up, so that callee information is available before callers are processed. In control-flow graphs, natural loops are found with dominators, but Tarjan's interval analysis and irreducible-loop detection are SCC computations on the CFG. The Rust compiler keeps an SCC implementation in `rustc_data_structures::graph::scc` for region constraints in borrow checking, where a set of lifetimes that must all outlive each other collapses to one.

**Build and dependency tools.** Go's compiler refuses `import cycle not allowed` and Cargo rejects cyclic package dependencies; both are DFS cycle detections that report *a* cycle. Reporting *the whole knot* (every module involved, not one chain through it) is the SCC computation, which is what bundlers do when they list all members of a circular import group at once. Netflix-scale service graphs, thousands of services with call edges from tracing, get the same treatment: the non-trivial SCCs are the mutual-dependency clusters that make independent deployment and failure isolation hard, and the condensation is what a dependency dashboard draws.

**Recursion limits.** CPython's default limit is 1,000 frames and each Python frame costs on the order of 100 bytes of C stack plus a heap-allocated frame object; raising the limit to 10⁶ without also raising the thread stack size (`threading.stack_size`) segfaults instead of raising `RecursionError`. V8's limit is around 10⁴ frames and not configurable from JavaScript. The iterative version is the only portable answer for graphs deeper than a few thousand.

## Quantified costs

- **Time.** Both algorithms are `Θ(V + E)`: a graph with `10⁶` edges takes on the order of a second in Python and about 10 ms in C or Cython (order-of-magnitude figures; they depend on adjacency layout and cache behaviour). Kosaraju touches every edge twice plus builds the reversed graph, so expect it to be two to three times slower than Tarjan on the same machine.
- **Memory.** Tarjan keeps `disc`, `low`, `on_stack` and the stack: four arrays of `V` entries. As Python lists of ints that is roughly `4 × 36 = 144` bytes per node (10⁶ nodes: 144 MB) plus the adjacency lists at about 90–100 bytes per edge; as `int32` arrays it is 16 bytes per node. Kosaraju needs the reversed adjacency too, doubling the edge memory.
- **Recursion depth.** Equal to the longest DFS path, up to `V`. Python's limit is 1,000, so any graph with a path longer than that needs the iterative version; a 200,000-node chain runs through it without complaint.
- **2-SAT size.** `n` variables and `m` clauses give `2n` nodes and `2m` edges. A map-labelling instance with 10⁵ labels and 10⁶ pairwise conflicts is `2 × 10⁵` nodes and `2 × 10⁶` edges: a few seconds in Python, well under a second compiled.
- **Condensation.** One pass over `E` edges with a set of component pairs; the DAG has at most `E` edges and usually far fewer, which is why a DP over it is cheap once the components are known.

## Trade-offs

| | Tarjan (recursive) | Tarjan (iterative) | Kosaraju | Pearce (scipy) | Plain DFS cycle check |
|---|---|---|---|---|---|
| Passes over edges | 1 | 1 | 2 plus reversal | 1 | 1 |
| Extra memory per node | `disc`, `low`, `on_stack`, stack | same plus frames | `seen`, `order`, `comp`, reversed graph | one index array plus stack | colour |
| Output order | reverse topological | reverse topological | topological | reverse topological | none |
| Deep graphs | recursion limit | fine | recursion limit (twice) | fine | depends |
| Reports | every component | every component | every component | every component | one cycle, or none |
| Best for | interviews, small graphs | production Python and JavaScript | teaching the proof; when the reversed graph exists anyway | NumPy pipelines | "is there a cycle at all" |

## Failure modes

**Symptom: `RecursionError` (Python) or `RangeError: Maximum call stack size exceeded` (Node) on a large input that a smaller test never triggered.** Diagnosis: the DFS depth equals the longest path, and a chain-shaped dependency graph of a few thousand nodes exceeds the default limits. Fix: the iterative version with `(node, edge index)` frames; raising the recursion limit is a stopgap that trades an exception for a segfault.

**Symptom: two nodes that cannot reach each other are reported in the same component.** Diagnosis: the `on_stack` check is missing, so an edge into an already-popped component lowers `low` and glues the current subtree to a closed one. On `0→1, 1→2, 2→1, 0→3, 3→2`, `{1, 2}` is popped first, then `3→2` sets `low[3] = 2`, `3` is not recognised as a root, and `{3, 0}` is emitted as one component although `3` never reaches `0`. Fix: update `low` only from nodes still on the stack, and add exactly this graph to the tests.

**Symptom: Kosaraju returns too few, too large components.** Diagnosis: the second pass ran in increasing finish order. On the lesson graph, starting at F on the reversed graph reaches E and D and reports `{F, E, D}`. Fix: iterate `reversed(order)`; the proof depends on starting from the latest finisher, which sits in a source component of the original graph.

**Symptom: the SCC pass is linear on most graphs and quadratic on a star.** Diagnosis: an iterative port that re-reads the adjacency list from index 0 every time a frame resumes, rescanning already-processed edges. Fix: store and advance the edge index in the frame *before* descending, as in the code above.

**Symptom: `two_sat` says satisfiable and the assignment it returns violates a clause.** Diagnosis: the comparison between the components of `x` and `¬x` was written for topological order but the algorithm emits reverse topological order (or the reverse), flipping every variable. Fix: with Tarjan's emission order, `x = true` when `comp[x] < comp[¬x]`; verify every returned assignment against the clauses in tests, which costs `O(m)` and catches the sign error immediately.

**Symptom: the dependency checker reports "no cycles" for a module that imports itself.** Diagnosis: the check treats singleton components as acyclic, but a singleton with a self-loop is a cycle. Fix: after computing components, flag any singleton whose node has an edge to itself; the exercise's self-loop test exists for this reason.

## Interviewer follow-ups

**"Your recursive Tarjan will overflow on a million-node graph. Fix it."** Model answer: replace recursion with an explicit stack of `(node, next edge index)` frames; a back edge updates `low` in place, popping a frame performs the parent's `min(low[p], low[u])`, and the root check happens at pop time. Emission order is unchanged, so 2-SAT and condensation code need no edits. Common wrong answer: `sys.setrecursionlimit(10**6)`, which moves the failure from an exception to a crash.

**"Why does Tarjan emit components in reverse topological order, and what is that good for?"** Model answer: a root pops its component only after every node reachable from it has finished, and everything reachable in other components was popped earlier; so sinks come first. That order lets a DAG DP ("largest total weight reachable from each node") run in one pass over the emitted list without a separate topological sort. Common wrong answer: "the order is arbitrary."

**"Given the condensation with `s` source components and `t` sink components, how many edges make the graph strongly connected?"** Model answer: `max(s, t)` when there is more than one component: each added edge can fix at most one source and one sink, and a construction pairing sinks with sources achieves the bound; a single component needs zero. Common wrong answer: `s + t`, or "one edge per cycle."

**"Which nodes can reach every other node?"** Model answer: build the condensation; if it has exactly one source component, its members are the answer and nobody else is (any other node would be in a component with a predecessor it cannot reach); with two or more sources, nobody. `O(V + E)` in total. Common wrong answer: BFS from every node, `O(V(V + E))`.

**"Can I use Tarjan to find cycles in an undirected graph?"** Model answer: no. In an undirected graph every edge is a two-node cycle in the directed sense, so all connected nodes would form one SCC; undirected cycle detection is union-find or a DFS that skips the parent edge, and the [bridges lesson](/learn/algorithms/graph-algorithms/bridges-articulation-and-flow) uses the same low-link values for a different question. Common wrong answer: running Tarjan on both directions of each edge.

## What mid-level engineers get wrong

- **Recursive DFS in production.** Passes every test, then dies on the first long chain. Write the iterative version or use a library that does.
- **Omitting `on_stack`.** Merges nodes across a closed component; the answer is wrong, not slow, and small tests rarely catch it.
- **Using `low[v]` on a back edge.** Correct for SCCs, wrong for bridges; the habit bites in the next lesson.
- **Running Kosaraju's second pass in the wrong order.** One source component swallows its successors.
- **Rescanning adjacency on resume.** An iterative port that resets the edge index becomes quadratic on high-degree nodes.
- **Reading the 2-SAT assignment with the wrong inequality.** Every variable flips; only a verification pass catches it.
- **Treating "no cycle" as "no self-loop".** A singleton component with a self-loop is a cycle for build and import purposes.
- **Handling cycles ad hoc.** Special-casing "if we see a cycle, skip it" instead of collapsing to the condensation and running a DAG algorithm.

## Exercises

```exercise
id: tarjan-scc-list
title: Strongly connected components
prompt: |
  Implement `strongly_connected_components(n, edges)` for a directed graph on
  nodes `0..n-1` (`edges` are `[u, v]` pairs; self-loops may occur). Return
  the list of SCCs where each component is a list sorted ascending and the
  components are sorted by their smallest element.

  Use Tarjan's algorithm (or Kosaraju's if you prefer); the inputs are small
  enough for recursion.
languages: [python, javascript]
entry: strongly_connected_components
starter:
  python: |
    def strongly_connected_components(n, edges):
        adj = [[] for _ in range(n)]
        for u, v in edges:
            adj[u].append(v)
        # disc, low, stack, on_stack, then sort the result
        return []
  javascript: |
    function strongly_connected_components(n, edges) {
      const adj = Array.from({ length: n }, () => []);
      for (const [u, v] of edges) adj[u].push(v);
      // disc, low, stack, onStack, then sort the result
      return [];
    }
tests:
  - args: [6, [[0,1],[1,2],[2,0],[1,3],[3,4],[4,3],[4,5]]]
    expected: [[0,1,2],[3,4],[5]]
    label: the graph from the visualisation
  - args: [3, []]
    expected: [[0],[1],[2]]
    label: no edges
  - args: [4, [[0,1],[1,2],[2,3],[3,0]]]
    expected: [[0,1,2,3]]
    label: one big cycle
  - args: [1, []]
    expected: [[0]]
  - args: [3, [[0,1],[1,2],[0,2]]]
    expected: [[0],[1],[2]]
    label: a DAG has only singletons
  - args: [8, [[0,1],[1,2],[1,4],[1,5],[2,3],[2,6],[3,2],[3,7],[4,0],[4,5],[5,6],[6,5],[6,7],[7,7]]]
    expected: [[0,1,4],[2,3],[5,6],[7]]
    hidden: true
  - args: [2, [[0,0],[0,1]]]
    expected: [[0],[1]]
    hidden: true
    label: self-loop does not merge anything
hints:
  - "On a tree edge take `low[u] = min(low[u], low[v])`; on an edge to an on-stack node take `min(low[u], disc[v])`."
  - "When `low[u] == disc[u]`, pop the stack until you pop `u`; that is one component."
  - "Sort each component, then sort the list of components by their first element."
```

```exercise
id: two-sat-satisfiable
title: 2-SAT via implication graph
prompt: |
  Implement `two_sat(n, clauses)`. Variables are `1..n`; a literal `k > 0`
  means `x_k` and `k < 0` means `not x_k`. Each clause `[a, b]` means
  `(a or b)`. Return `true` if some assignment satisfies every clause.

  Build the implication graph (`not a -> b`, `not b -> a`), find its SCCs,
  and return `false` exactly when some `x_k` shares a component with `not x_k`.
languages: [python, javascript]
entry: two_sat
starter:
  python: |
    def two_sat(n, clauses):
        # node index for a literal: 2*(|k|-1) + (1 if k < 0 else 0)
        return True
  javascript: |
    function two_sat(n, clauses) {
      // node index for a literal: 2*(|k|-1) + (k < 0 ? 1 : 0)
      return true;
    }
tests:
  - args: [2, [[1,2],[-1,2],[1,-2]]]
    expected: true
    label: x1 = x2 = true works
  - args: [1, [[1,1],[-1,-1]]]
    expected: false
    label: x1 and not x1
  - args: [2, [[1,2],[-1,2],[1,-2],[-1,-2]]]
    expected: false
    label: all four combinations excluded
  - args: [3, []]
    expected: true
    label: no clauses
  - args: [3, [[1,-2],[2,-3],[3,-1]]]
    expected: true
    hidden: true
  - args: [2, [[1,1],[-1,2],[-2,-2]]]
    expected: false
    hidden: true
    label: forced chain leads to contradiction
  - args: [3, [[-1,-2],[-2,-3],[-1,-3],[1,2],[2,3],[1,3]]]
    expected: false
    hidden: true
    label: exactly-one over three variables
hints:
  - "A clause `[a, b]` adds edges `idx(-a) -> idx(b)` and `idx(-b) -> idx(a)`."
  - "Reuse your Tarjan from the previous exercise on `2n` nodes; then compare `comp[2i]` with `comp[2i+1]` for every variable."
  - "A clause like `[1, 1]` is fine: it adds the edge `not x1 -> x1` twice."
```

## Senior signals

- You can explain in one sentence why the latest-finishing node's SCC is a source of the condensation, which is the whole justification for Kosaraju's second pass.
- You know why Tarjan's cross-edge update checks `on_stack` and uses `disc[v]` rather than `low[v]`, and you can trace a six-node example without notes.
- You know both algorithms are `O(V + E)`, that Tarjan's avoids the reversed graph and emits components in reverse topological order, and that either needs an iterative DFS on graphs deeper than the language's stack.
- You go straight from "cyclic graph" to "condensation DAG, then DP or reachability" instead of trying to handle cycles ad hoc.
- You recognise 2-SAT in disguise (two choices per item, pairwise constraints) and know it is linear time while 3-SAT is not.
- You know where SCC detection runs in real tooling: cyclic-import diagnostics, compiler loop analysis, and dependency resolution.
- You can write the iterative Tarjan with `(node, edge index)` frames, and you know the one line (advance the index before descending) that keeps it linear.
- You can show, on a five-node graph, what goes wrong without the `on_stack` check (two non-mutually-reachable nodes merged) and with Kosaraju's second pass in the wrong order (a source component swallowing its successors).
- You know what the libraries do: networkx's non-recursive Tarjan with Nuutila's modifications, scipy's Pearce variant over CSR, and LLVM's bottom-up call-graph SCC passes.

## Check yourself

```quiz
- q: >-
    In Kosaraju's algorithm, why are nodes processed in decreasing finish time on the reversed graph, rather than increasing?
  options: ["It keeps the recursion shallow on the reversed graph", "The latest finisher is in a source SCC, a sink once reversed", "The latest finisher is in a sink SCC, so its DFS stays inside", "Either order works, since each DFS still finds one SCC"]
  answer: 1
  explanation: >-
    The first DFS orders components so that sources of the condensation finish last. Reversing edges turns sources into sinks; starting the second DFS from a sink collects exactly that component and cannot leak into others. The latest finisher is in a source of the original graph, not a sink. Increasing order would start from a source of the reversed graph and swallow several components.
- q: >-
    During Tarjan's DFS, node u has an edge to an already-visited node v that has been popped off the stack. What should happen to low[u]?
  options: ["Nothing, because v's component is already closed", "Re-push v so its component can be reopened with u", "Set low[u] = min(low[u], low[v]), as after a tree edge", "Set low[u] = min(low[u], disc[v]), as for any back edge"]
  answer: 0
  explanation: >-
    A popped node belongs to a finished SCC, which cannot be part of u's. Updating low[u] from it would incorrectly merge u into a closed component. Only edges to on-stack nodes (open components) update low, and they use disc[v].
- q: >-
    Tarjan's algorithm outputs components in the order {F}, {D,E}, {A,B,C} for a graph whose condensation is {A,B,C} → {D,E} → {F}. What does this ordering give you for free?
  options: ["A reverse topological order of the condensation DAG", "Nothing useful, since emission order depends on the start", "The components sorted by size, smallest first", "A topological order of the condensation DAG, sources first"]
  answer: 0
  explanation: >-
    A component is emitted only when everything reachable from it has been emitted, so the sequence is a reverse topological order of the condensation: the sink {F} comes first, not the source. Processing components in emission order lets a DAG DP compute values that depend on successors without a separate sort.
- q: >-
    Which of these problems is 2-SAT and therefore solvable in linear time?
  options: ["Each job picks slot A or B; given pairs must or must not share", "Order the jobs so that every precedence pair is respected", "Jobs pick one of three slots; given pairs must not share", "Pick the fewest jobs so every conflict pair has one picked"]
  answer: 0
  explanation: >-
    Two choices per item with pairwise constraints is 2-SAT: 'must not share' is (a ∨ b) ∧ (¬a ∨ ¬b), 'must share' is (a ∨ ¬b) ∧ (¬a ∨ b). Three slots is 3-colouring-like and NP-hard in general; minimum vertex cover is NP-hard; ordering is topological sort.
- q: >-
    A condensation DAG has 3 source components and 5 sink components. What is the minimum number of edges to add to make the whole graph strongly connected?
  options: ["8", "15", "5", "3"]
  answer: 2
  explanation: >-
    Every source needs an incoming edge and every sink an outgoing one; one added edge from a sink to a source fixes one of each, so max(sources, sinks) = 5 edges are necessary, and a matching argument shows they suffice.
- q: >-
    A Tarjan implementation drops the on_stack check and updates low[u] from disc[v] for every already-visited v. On the graph 0→1, 1→2, 2→1, 0→3, 3→2, what does it report?
  options: ["Components {1,2}, {3} and {0}, because disc values of popped nodes are harmless", "One component {0,1,2,3}, because every node can now reach the cycle", "An infinite loop, because node 2 is pushed on the stack a second time", "Components {1,2} and {0,3}, wrongly merging 0 and 3 through the closed component"]
  answer: 3
  explanation: >-
    After {1,2} is popped, the edge 3→2 lowers low[3] to disc[2] = 2, so 3 finishes with low 2 below disc 3 and stays on the stack; 0 then inherits low 0 = disc 0 and pops {3, 0} as one component, although 3 cannot reach 0. The check exists precisely so that edges into finished components are ignored. Nothing is re-pushed, because the visited test still holds, and the cycle {1,2} is closed before 3 is discovered, so it cannot absorb everything.
```
