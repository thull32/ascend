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

Trace it by hand. `A` gets disc 0, `B` 1, `C` 2. From `C`, the edge to `A` finds `A` on the stack, so `low[C] = 0`. `C` finishes with `low 0 ≠ disc 2`, so it is not a root; `B` inherits `low 0`. `B` continues to `D` (disc 3) and `E` (disc 4). `E → D` is a back edge to an on-stack node: `low[E] = 3`. `E → F`: `F` gets disc 5, has no edges, `low[F] = disc[F] = 5`, so `{F}` is popped as a component. `E` finishes with `low 3`, not a root. `D` finishes with `low[D] = 3 = disc[D]`: pop `E, D` as `{D, E}`. Back in `B`, `low[B] = 0`; `A` finishes with `low 0 = disc 0`: pop `C, B, A`. Components: `{F}`, `{D, E}`, `{A, B, C}`, in reverse topological order of the condensation `{A,B,C} → {D,E} → {F}`.

Tarjan's is `O(V + E)` in one pass with no reversed graph, which makes it the usual production choice. The cost is a recursive DFS: on a graph with a million nodes in a chain, Python and JavaScript both overflow the call stack, and you need the iterative version with an explicit stack of `(node, edge index)` frames. That conversion is mechanical but fiddly; if the interviewer's graph is small, write the recursive one and say what you would change.

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

## Check yourself

```quiz
- q: >-
    In Kosaraju's algorithm, why are nodes processed in decreasing finish time on the reversed graph, rather than increasing?
  options: ["The latest finisher is in a source SCC, a sink once reversed", "It keeps the recursion shallow on the reversed graph", "The latest finisher is in a sink SCC, so its DFS stays inside", "Either order works, since each DFS still finds one SCC"]
  answer: 0
  explanation: >-
    The first DFS orders components so that sources of the condensation finish last. Reversing edges turns sources into sinks; starting the second DFS from a sink collects exactly that component and cannot leak into others. The latest finisher is in a source of the original graph, not a sink. Increasing order would start from a source of the reversed graph and swallow several components.
- q: >-
    During Tarjan's DFS, node u has an edge to an already-visited node v that has been popped off the stack. What should happen to low[u]?
  options: ["Set low[u] = min(low[u], disc[v]), as for any back edge", "Set low[u] = min(low[u], low[v]), as after a tree edge", "Re-push v so its component can be reopened with u", "Nothing, because v's component is already closed"]
  answer: 3
  explanation: >-
    A popped node belongs to a finished SCC, which cannot be part of u's. Updating low[u] from it would incorrectly merge u into a closed component. Only edges to on-stack nodes (open components) update low, and they use disc[v].
- q: >-
    Tarjan's algorithm outputs components in the order {F}, {D,E}, {A,B,C} for a graph whose condensation is {A,B,C} → {D,E} → {F}. What does this ordering give you for free?
  options: ["Nothing useful, since emission order depends on the start", "A topological order of the condensation DAG, sources first", "The components sorted by size, smallest first", "A reverse topological order of the condensation DAG"]
  answer: 3
  explanation: >-
    A component is emitted only when everything reachable from it has been emitted, so the sequence is a reverse topological order of the condensation: the sink {F} comes first, not the source. Processing components in emission order lets a DAG DP compute values that depend on successors without a separate sort.
- q: >-
    Which of these problems is 2-SAT and therefore solvable in linear time?
  options: ["Each job picks slot A or B; given pairs must or must not share", "Pick the fewest jobs so every conflict pair has one picked", "Jobs pick one of three slots; given pairs must not share", "Order the jobs so that every precedence pair is respected"]
  answer: 0
  explanation: >-
    Two choices per item with pairwise constraints is 2-SAT: 'must not share' is (a ∨ b) ∧ (¬a ∨ ¬b), 'must share' is (a ∨ ¬b) ∧ (¬a ∨ b). Three slots is 3-colouring-like and NP-hard in general; minimum vertex cover is NP-hard; ordering is topological sort.
- q: >-
    A condensation DAG has 3 source components and 5 sink components. What is the minimum number of edges to add to make the whole graph strongly connected?
  options: ["15", "3", "8", "5"]
  answer: 3
  explanation: >-
    Every source needs an incoming edge and every sink an outgoing one; one added edge from a sink to a source fixes one of each, so max(sources, sinks) = 5 edges are necessary, and a matching argument shows they suffice.
```
