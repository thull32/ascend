---
slug: bridges-articulation-and-flow
title: "Bridges, articulation points and the shape of max-flow"
description: Low-link values on undirected graphs find every single point of failure in one DFS; then the residual-graph idea behind max-flow, the min-cut theorem, and bipartite matching as the flow problem you will actually be asked.
minutes: 50
difficulty: hard
tags: [graphs, bridges, articulation-points, low-link, max-flow, min-cut, bipartite-matching, augmenting-path]
problems: [graph-valid-tree, count-components]
---
Your network has forty routers and sixty links. Which single link, if it fails, splits the network in two? Which single router? Answering by brute force means removing each link, running BFS, and checking connectivity: `O(E · (V + E))`, which is fine for sixty links and hopeless for a data-centre fabric or a road network with a million edges. The DFS low-link idea from the [SCC lesson](/learn/algorithms/graph-algorithms/strongly-connected-components) answers both questions for every edge and node at once, in a single `O(V + E)` pass.

The second half of this lesson is a different question with a related feel: not "what breaks the network" but "how much can we push through it". Max-flow is the technique behind assignment problems, scheduling, image segmentation and a surprising number of interview problems that say "maximum number of pairs". You are unlikely to be asked to implement Dinic's algorithm in forty-five minutes; you are quite likely to be asked to *recognise* that a problem is bipartite matching and to say how flow solves it.

## Bridges and articulation points

A **bridge** is an edge whose removal increases the number of connected components. An **articulation point** (cut vertex) is a node whose removal does the same. A graph with no bridges is 2-edge-connected; with no articulation points it is biconnected. Redundant networks are designed to have neither, and the check is the algorithm below.

Run a DFS on the undirected graph. Each node gets a discovery time `disc[u]` and a low-link value `low[u]`: the smallest discovery time reachable from `u`'s subtree using tree edges downward and at most one **back edge** upward. Undirected DFS has a property directed DFS lacks: there are no cross edges. Every non-tree edge connects an ancestor and a descendant. So `low[v]` for a child `v` of `u` says exactly how far up the tree `v`'s subtree can climb without using the edge `(u, v)`.

- If `low[v] > disc[u]`, the subtree under `v` cannot reach `u` or anything above it except through `(u, v)`. That edge is a **bridge**.
- If `low[v] ≥ disc[u]`, the subtree under `v` cannot reach anything *strictly above* `u`. Removing `u` strands it, so `u` is an **articulation point**, unless `u` is the DFS root.
- The root is an articulation point if and only if it has two or more DFS children (its subtrees are connected only through it).

The difference between `>` and `≥` is the entire difference between the two problems, and interviewers ask about it. A back edge from `v`'s subtree to `u` itself is enough to save the edge `(u, v)` from being a bridge (the subtree can still reach `u`), but not enough to save `u` from being a cut vertex (removing `u` removes that back edge's endpoint too).

```viz
{"type": "graph", "algorithm": "bridges", "directed": false,
 "title": "Bridges via low-link (labels show disc/low)",
 "nodes": [{"id":"A","x":10,"y":30},{"id":"B","x":35,"y":50},{"id":"C","x":10,"y":75},{"id":"D","x":65,"y":50},{"id":"E","x":90,"y":50}],
 "edges": [{"from":"A","to":"B"},{"from":"B","to":"C"},{"from":"C","to":"A"},{"from":"B","to":"D"},{"from":"D","to":"E"}]}
```

Trace: `A` disc 0, `B` disc 1, `C` disc 2. `C`'s edge back to `A` sets `low[C] = 0`; `C` returns and `low[B] = min(1, 0) = 0`. `B–C` is not a bridge since `low[C] = 0 ≤ disc[B] = 1`. `B` proceeds to `D` (disc 3), `D` to `E` (disc 4). `E` has only the edge back to its parent, which is skipped, so `low[E] = 4 > disc[D] = 3`: `D–E` is a bridge. `D` returns with `low[D] = 3 > disc[B] = 1`: `B–D` is a bridge. `B` is an articulation point (`low[D] ≥ disc[B]`), and so is `D`. `A`, the root, has one DFS child, so it is not.

```python
def bridges_and_cuts(n, edges):
    adj = [[] for _ in range(n)]
    for i, (u, v) in enumerate(edges):
        adj[u].append((v, i))
        adj[v].append((u, i))
    disc = [-1] * n
    low = [0] * n
    bridges, cuts, t = [], set(), 0

    def dfs(u, parent_edge):
        nonlocal t
        disc[u] = low[u] = t
        t += 1
        children = 0
        for v, i in adj[u]:
            if i == parent_edge:
                continue                    # skip the edge we arrived by, BY INDEX
            if disc[v] == -1:
                children += 1
                dfs(v, i)
                low[u] = min(low[u], low[v])
                if low[v] > disc[u]:
                    bridges.append((min(u, v), max(u, v)))
                if low[v] >= disc[u] and parent_edge != -1:
                    cuts.add(u)
            else:
                low[u] = min(low[u], disc[v])
        if parent_edge == -1 and children >= 2:
            cuts.add(u)

    for u in range(n):
        if disc[u] == -1:
            dfs(u, -1)
    return sorted(bridges), sorted(cuts)
```

**Skip the parent edge by index, not by node.** The tempting version, `if v == parent: continue`, is wrong when parallel edges exist: two edges between `u` and `v` mean neither is a bridge, but skipping "the parent node" skips both and reports one as a bridge. Skipping by edge index handles multigraphs correctly and costs nothing.

Everything else is the SCC code with the directed-graph parts removed: no stack, no `on_stack` check, because in an undirected DFS every already-visited neighbour is an ancestor and therefore still open. The `disc[v]` (not `low[v]`) in the back-edge update matters here: with `low[v]` a back edge to an ancestor could transitively pass a value from *another* branch through the ancestor and make a real bridge look safe. Using `disc[v]` is the habit the previous lesson asked you to build.

## What you do with them

Removing all bridges leaves the **2-edge-connected components**, which you can label with a BFS or union-find that ignores bridge edges. The bridges plus those components form a tree (the bridge tree), and questions like "minimum edges to add so the graph has no bridges" reduce to counting leaves of that tree: `⌈leaves / 2⌉`. Biconnected components (the node version) are trickier because a cut vertex belongs to several of them; the standard trick is to keep a stack of *edges* during the DFS and pop a component every time an articulation condition fires.

In production the question is usually asked about a specific graph: the service dependency graph ("which service, if it goes down, partitions the call graph"), a network topology, or a road network ("which bridge is literally a bridge"). The algorithm is fast enough to run on every deploy.

## Max-flow: the residual graph is the idea

A **flow network** is a directed graph with a source `s`, a sink `t`, and a capacity `c(u, v)` on each edge. A flow assigns each edge a value between 0 and its capacity, with the total in equal to the total out at every node except `s` and `t`. The max-flow problem asks for the largest total leaving `s`.

The greedy attempt, "find a path from `s` to `t` with spare capacity, push as much as fits, repeat", fails on its own. Consider `s → a` (cap 1), `s → b` (1), `a → b` (1), `a → t` (1), `b → t` (1). Push 1 unit along `s → a → b → t`. Now `s → b → t` is blocked at `b → t` and `s → a → t` is blocked at `s → a`, so the greedy stops at 1 while the true max is 2 (`s → a → t` and `s → b → t`).

The fix is the **residual graph**: for every edge `(u, v)` carrying flow `f`, keep the forward edge with residual capacity `c − f` *and add a reverse edge `(v, u)` with capacity `f`*. Pushing flow along a reverse edge cancels flow on the original, which is how a later path can "undo" an earlier bad choice. In the example, after the first push there is a reverse edge `b → a` with capacity 1, so the path `s → b → a → t` is available: it uses `s → b`, cancels the flow on `a → b`, and uses `a → t`. Net effect: two disjoint paths, flow 2. This is the Ford–Fulkerson method, and each such path is an **augmenting path**.

```python
from collections import deque

def max_flow(n, cap, s, t):                 # cap: n x n matrix of capacities
    flow = 0
    while True:
        parent = [-1] * n                   # BFS for the shortest augmenting path (Edmonds-Karp)
        parent[s] = s
        q = deque([s])
        while q and parent[t] == -1:
            u = q.popleft()
            for v in range(n):
                if parent[v] == -1 and cap[u][v] > 0:
                    parent[v] = u
                    q.append(v)
        if parent[t] == -1:
            return flow
        bottleneck, v = float("inf"), t
        while v != s:
            u = parent[v]
            bottleneck = min(bottleneck, cap[u][v])
            v = u
        v = t
        while v != s:
            u = parent[v]
            cap[u][v] -= bottleneck          # forward residual shrinks
            cap[v][u] += bottleneck          # reverse residual grows
            v = u
        flow += bottleneck
```

Choosing the augmenting path by BFS (shortest in edges) is **Edmonds–Karp**, `O(V E²)`, and it terminates even with irrational capacities, which plain DFS-based Ford–Fulkerson does not. **Dinic's algorithm** finds all shortest augmenting paths at once using a level graph and runs in `O(V² E)`, or `O(E √V)` on unit-capacity networks such as matching; it is what you use in practice and what competitive programmers have memorised. For an interview, knowing that these exist and what the residual graph is for is the bar; implementing Dinic from memory is not.

**Max-flow min-cut.** The value of the maximum flow equals the capacity of the minimum `s`–`t` cut: the cheapest set of edges whose removal disconnects `t` from `s`. When Edmonds–Karp terminates, the nodes reachable from `s` in the residual graph form one side of a minimum cut, and the saturated edges leaving it are the cut. That duality is why "minimum number of edges to remove so A cannot reach B" and "minimum cost to separate two sets" are flow problems in disguise, and why image segmentation (pixels on the foreground side of the cut versus the background side) was one of the first big industrial applications of max-flow.

## Bipartite matching

Given `L` workers and `R` tasks and a list of "worker `i` can do task `j`" edges, assign as many workers as possible to distinct tasks. Add a source with a capacity-1 edge to every worker and a sink with a capacity-1 edge from every task, give each worker–task edge capacity 1, and the max-flow *is* the maximum matching: the unit capacities enforce "each worker once, each task once".

Because every capacity is 1, the augmenting-path machinery simplifies to **Kuhn's algorithm**: for each worker, DFS for an augmenting path that alternates unmatched edge, matched edge, unmatched edge, … and ends at a free task; flip the path. It is `O(V · E)` in the worst case and much faster in practice, and it is short enough to write in an interview.

```python
def max_matching(n_left, n_right, edges):
    adj = [[] for _ in range(n_left)]
    for u, v in edges:
        adj[u].append(v)
    match_right = [-1] * n_right               # task -> worker

    def try_assign(u, seen):
        for v in adj[u]:
            if v in seen:
                continue
            seen.add(v)
            if match_right[v] == -1 or try_assign(match_right[v], seen):
                match_right[v] = u             # take v, possibly after re-homing its old worker
                return True
        return False

    return sum(1 for u in range(n_left) if try_assign(u, set()))
```

The recursive call `try_assign(match_right[v], seen)` is the augmenting path: task `v` is taken, so ask its current worker to find a different task. If that worker succeeds, `v` is free for `u`. The `seen` set is per top-level worker and stops the search from revisiting tasks in the same attempt. Hopcroft–Karp does the same with BFS layering in `O(E √V)`, and is what you would use on a graph with millions of edges.

Two theorems make matching answer questions that do not mention matching. **König's theorem**: in a bipartite graph, the minimum vertex cover equals the maximum matching. **Minimum path cover of a DAG**: split each node into an "out" copy and an "in" copy, match, and the answer is `V − |matching|`. "Minimum number of machines to run these jobs given precedence" and "minimum rows and columns to cover all the marked cells" are both this.

## Recognising flow in an interview

The signals: "maximum number of pairs / assignments", "each X used at most once", "minimum things to remove to disconnect", "capacities" or "rates" on edges. When you see them, say the modelling out loud (source, sink, capacities, what the min-cut means), give the complexity of the algorithm you would use, and write Kuhn's algorithm if a matching is all that is needed. That is the senior answer; a mid-level engineer either does not see the reduction or tries to greedy their way through and fails on the two-path example above.

## Exercises

```exercise
id: find-bridges
title: Find all bridges
prompt: |
  Implement `find_bridges(n, edges)` for an undirected graph on nodes
  `0..n-1`. `edges` are `[u, v]` pairs; the graph may be disconnected and may
  contain parallel edges (two parallel edges between the same nodes are not
  bridges). Return the list of bridges as `[min(u,v), max(u,v)]` pairs, sorted.

  Use one DFS with `disc`/`low` values and skip the edge you arrived by using
  its index, not the parent node.
languages: [python, javascript]
entry: find_bridges
starter:
  python: |
    def find_bridges(n, edges):
        adj = [[] for _ in range(n)]
        for i, (u, v) in enumerate(edges):
            adj[u].append((v, i))
            adj[v].append((u, i))
        # disc, low, dfs(u, parent_edge_index)
        return []
  javascript: |
    function find_bridges(n, edges) {
      const adj = Array.from({ length: n }, () => []);
      edges.forEach(([u, v], i) => { adj[u].push([v, i]); adj[v].push([u, i]); });
      // disc, low, dfs(u, parentEdgeIndex)
      return [];
    }
tests:
  - args: [5, [[0,1],[1,2],[2,0],[1,3],[3,4]]]
    expected: [[1,3],[3,4]]
    label: the graph from the visualisation
  - args: [2, [[0,1]]]
    expected: [[0,1]]
  - args: [3, [[0,1],[1,2],[2,0]]]
    expected: []
    label: a cycle has no bridges
  - args: [4, [[0,1],[1,2],[2,3]]]
    expected: [[0,1],[1,2],[2,3]]
    label: every edge of a path
  - args: [1, []]
    expected: []
  - args: [3, [[0,1],[0,1],[1,2]]]
    expected: [[1,2]]
    hidden: true
    label: parallel edges are not bridges
  - args: [6, [[0,1],[1,2],[2,0],[3,4],[4,5],[5,3],[2,3]]]
    expected: [[2,3]]
    hidden: true
  - args: [4, [[0,1],[2,3]]]
    expected: [[0,1],[2,3]]
    hidden: true
    label: disconnected graph
hints:
  - "On a tree edge to `v`: after the recursive call, `low[u] = min(low[u], low[v])`, and `(u, v)` is a bridge iff `low[v] > disc[u]`."
  - "On an edge to an already-visited `v` that is not the parent edge: `low[u] = min(low[u], disc[v])`."
  - "Loop over all nodes as DFS roots so disconnected graphs are handled."
```

```exercise
id: bipartite-matching-kuhn
title: Maximum bipartite matching
prompt: |
  Implement `max_matching(n_left, n_right, edges)`. Left nodes are
  `0..n_left-1`, right nodes `0..n_right-1`, and each `[u, v]` edge says left
  `u` may be matched to right `v`. Return the size of a maximum matching.

  Use Kuhn's augmenting-path algorithm: for each left node, DFS for a free
  right node, re-homing already-matched left nodes along the way.
languages: [python, javascript]
entry: max_matching
starter:
  python: |
    def max_matching(n_left, n_right, edges):
        adj = [[] for _ in range(n_left)]
        for u, v in edges:
            adj[u].append(v)
        match_right = [-1] * n_right

        def try_assign(u, seen):
            # for each v in adj[u] not yet seen: take it if free, or if its
            # current owner can be re-assigned elsewhere
            return False

        return 0
  javascript: |
    function max_matching(n_left, n_right, edges) {
      const adj = Array.from({ length: n_left }, () => []);
      for (const [u, v] of edges) adj[u].push(v);
      const matchRight = new Array(n_right).fill(-1);
      function tryAssign(u, seen) {
        // for each v in adj[u] not yet seen: take it if free, or if its
        // current owner can be re-assigned elsewhere
        return false;
      }
      return 0;
    }
tests:
  - args: [2, 2, [[0,0],[0,1],[1,0]]]
    expected: 2
    label: needs one re-assignment
  - args: [3, 3, [[0,0],[1,0],[2,0]]]
    expected: 1
    label: everyone wants the same task
  - args: [1, 1, []]
    expected: 0
  - args: [3, 3, [[0,0],[0,1],[1,1],[1,2],[2,2]]]
    expected: 3
  - args: [3, 2, [[0,0],[1,0],[2,1],[1,1]]]
    expected: 2
    hidden: true
  - args: [4, 4, [[0,1],[1,0],[1,1],[2,2],[3,2],[2,3]]]
    expected: 4
    hidden: true
  - args: [2, 3, [[0,0],[0,1],[0,2]]]
    expected: 1
    hidden: true
hints:
  - "`seen` is a fresh set for each top-level left node; it prevents cycling within one augmenting search."
  - "If `match_right[v] == -1` or `try_assign(match_right[v], seen)` succeeds, set `match_right[v] = u` and return true."
  - "The answer is the number of left nodes for which `try_assign` returned true."
```

## Senior signals

- You can say why undirected DFS has no cross edges and therefore why low-link on undirected graphs needs no stack, and you can state the `>` versus `≥` distinction between bridges and articulation points.
- You skip the parent *edge* by index, and you can explain the parallel-edge bug that skipping the parent node introduces.
- You explain the residual graph as "reverse edges let later paths undo earlier choices" and can produce the five-edge example where greedy path pushing gets stuck at 1 instead of 2.
- You know max-flow equals min-cut, how to read the cut off the final residual graph, and that this is why "minimum removals to disconnect" is a flow problem.
- You reduce "maximum assignments with each item used once" to bipartite matching, write Kuhn's algorithm, and name Hopcroft–Karp and Dinic as the scalable versions.
- You know König's theorem and the DAG path-cover reduction, which turn cover and scheduling questions into matchings.

## Check yourself

```quiz
- q: >-
    In an undirected DFS, node u has child v with low[v] == disc[u]. Which statements are true?
  options: ["Neither, because the back edge lets v's subtree climb above u", "(u, v) is a bridge, but u is never an articulation point", "(u, v) is a bridge, and a non-root u is an articulation point", "(u, v) is not a bridge; a non-root u is an articulation point"]
  answer: 3
  explanation: >-
    low[v] == disc[u] means v's subtree can climb back to u but no higher. Removing the edge leaves the subtree connected through that back edge, so it is not a bridge (that needs low[v] > disc[u]); removing u itself strands the subtree, so u is a cut vertex (root excepted, which needs two children).
- q: >-
    Your bridge finder skips the parent by node (`if v == parent: continue`). On a graph with two parallel edges between nodes 0 and 1 and nothing else, what does it report?
  options: ["Two bridges, one per parallel edge", "It loops forever between nodes 0 and 1", "No bridges, which is correct", "One bridge (0,1), which is wrong"]
  answer: 3
  explanation: >-
    From node 1 both edges lead back to node 0, and both are skipped as 'the parent', so node 1 sees no back edge, low[1] stays at disc[1] > disc[0], and (0,1) is reported as a bridge. The visited check prevents any loop. Skipping by edge index leaves the second edge as a legitimate back edge, giving the correct answer of no bridges.
- q: >-
    Why does the residual graph include a reverse edge with capacity equal to the flow already pushed?
  options: ["To let the network model undirected edges as two arcs", "As a speed-up that finds augmenting paths in fewer rounds", "So BFS terminates even when capacities are irrational", "So a later path can cancel flow chosen by an earlier one"]
  answer: 3
  explanation: >-
    Without reverse edges the method is a greedy path packer and can get stuck below the maximum (flow 1 instead of 2 in the lesson's example), because an early choice can block a better solution. Reverse edges are what make Ford–Fulkerson correct, not merely faster; termination with irrational capacities comes from choosing paths by BFS.
- q: >-
    You need to assign 10,000 volunteers to 8,000 shifts where each volunteer lists the shifts they can take, maximising the number of shifts covered. Which formulation and algorithm?
  options: ["Greedy: give each volunteer their first free listed shift", "Bipartite matching as a unit-capacity flow, via Hopcroft–Karp", "Shortest paths: Dijkstra from a super-source to every shift", "Spanning tree: Kruskal over the volunteer–shift edges"]
  answer: 1
  explanation: >-
    'Each used at most once, maximise pairs' is bipartite matching. Greedy fails whenever re-homing an earlier assignment would free a shift. Hopcroft–Karp is the scalable choice at this size; Kuhn's algorithm also works but is O(VE) worst case.
- q: >-
    After Edmonds–Karp terminates, how do you obtain a minimum s–t cut?
  options: ["Take the minimum-capacity edge on every augmenting path found", "Take the edges of the last augmenting path that was found", "Take every edge whose final flow equals its full capacity", "Split nodes by whether s reaches them in the residual graph"]
  answer: 3
  explanation: >-
    Let S be the nodes reachable from s in the final residual graph; the edges from S to its complement form the cut. Termination means no residual path from s to t, so every original edge from S to V−S is saturated and every edge into S carries zero flow. Their total capacity equals the flow, which by max-flow min-cut is the minimum cut capacity. Saturated edges elsewhere are not necessarily in the cut.
```
