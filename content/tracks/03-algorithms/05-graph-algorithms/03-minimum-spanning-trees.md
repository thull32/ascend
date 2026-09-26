---
slug: minimum-spanning-trees
title: "Minimum spanning trees: Prim, Kruskal and the cut property"
description: Why a greedy choice across any cut is always safe, how Prim grows one tree with a heap and Kruskal merges a forest with union-find, which one to use on which graph, and the MST variants interviewers reach for.
minutes: 45
difficulty: medium
tags: [graphs, minimum-spanning-tree, prim, kruskal, cut-property, union-find, greedy]
problems: [min-cost-connect-points, graph-valid-tree]
---
You have `n` data centres and a price list for laying fibre between any pair. You need every centre reachable from every other and you want to pay as little as possible. The answer is never a cycle, because removing any edge from a cycle keeps everything connected and saves money, so the answer is a tree that touches every node: a **spanning tree**, and specifically the one with the smallest total weight. The same shape hides in clustering (stop the tree-building early and you get clusters), in approximating the travelling salesman problem, in image segmentation and in the "connect all the points" family of interview questions.

What makes the minimum spanning tree (MST) special among optimisation problems is that a greedy algorithm solves it exactly, and there is a one-paragraph proof of why. Once you own that proof, Prim's and Kruskal's algorithms are two schedules for the same safe choice, and every variant question is a corollary.

## The cut property

A **cut** is a partition of the nodes into two non-empty sets `S` and `V − S`. An edge **crosses** the cut if one endpoint is in each side. The cut property says:

> For any cut, the lightest edge crossing it belongs to some minimum spanning tree.

Proof by exchange. Let `e = (u, v)` be the lightest edge crossing the cut and let `T` be an MST that does not contain `e`. Because `T` spans the graph, it contains a path from `u` to `v`, and because `u` and `v` are on opposite sides, that path crosses the cut at least once at some edge `f`. Remove `f` from `T` and add `e`: the result is still a spanning tree (you swapped one crossing edge for another on the same cycle) and its weight is `w(T) − w(f) + w(e) ≤ w(T)` because `e` was the lightest crossing edge. So the swapped tree is also minimum, and it contains `e`.

That is the entire theory. An algorithm that repeatedly picks a cut, takes the lightest edge across it, and never picks an edge that would close a cycle, builds an MST. Prim and Kruskal differ only in which cuts they look at.

The mirror image, the **cycle property**, is just as useful in interviews: the heaviest edge on any cycle is in no MST (if all weights are distinct). It is why Kruskal can discard an edge the moment it would close a cycle, and it answers "which edge can we remove to save the most".

## Prim: one tree, one cut at a time

Prim's algorithm keeps a single growing tree. The cut is always "nodes in the tree" versus "nodes not yet in the tree", and the algorithm adds the lightest edge crossing it. Start anywhere; the cut property does not care.

```viz
{"type": "graph", "algorithm": "prim", "directed": false, "start": "A",
 "title": "Prim from A",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":30,"y":15},{"id":"C","x":30,"y":85},{"id":"D","x":65,"y":15},{"id":"E","x":65,"y":85},{"id":"F","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"B","to":"C","w":5},{"from":"B","to":"D","w":10},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":3},{"from":"D","to":"E","w":6},{"from":"D","to":"F","w":7},{"from":"E","to":"F","w":9}]}
```

Trace it: the tree is `{A}` and the crossing edges are A–B (4) and A–C (2), so add C. Now `{A, C}` with crossing edges A–B 4, C–B 5, C–D 8, C–E 3: add E. Then `{A, C, E}`: A–B 4, C–B 5, C–D 8, E–D 6, E–F 9: add B. Then B–D 10, C–D 8, E–D 6, E–F 9: add D via E–D. Finally D–F 7 beats E–F 9. Total: 2 + 3 + 4 + 6 + 7 = 22.

The implementation looks exactly like Dijkstra with one change to the key. Dijkstra keys the heap on `dist[u] + w` (distance from the source); Prim keys it on `w` alone (distance from the *tree*). Everything else, including lazy deletion and settling on pop, carries over.

```python
import heapq

def prim(n, edges):
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((w, v))
        adj[v].append((w, u))
    in_tree = [False] * n
    total, count = 0, 0
    heap = [(0, 0)]                         # (edge weight, node); node 0 joins for free
    while heap and count < n:
        w, u = heapq.heappop(heap)
        if in_tree[u]:
            continue                        # stale: u joined via a lighter edge
        in_tree[u] = True
        total += w
        count += 1
        for wv, v in adj[u]:
            if not in_tree[v]:
                heapq.heappush(heap, (wv, v))
    return total if count == n else -1      # -1: the graph is disconnected
```

Each edge is pushed at most twice (once from each endpoint), so the heap does `O(E)` pushes and pops at `O(log E)` each: `O(E log V)`. On a *dense* graph, or a complete graph like "connect all the points" where `E = n(n−1)/2`, the array version is better: keep `best[v]`, the lightest edge from the tree to `v`, and scan it linearly for the minimum each round. That is `O(V²)` with a tiny constant and no heap, and on a complete graph `O(V²) = O(E)`, which is optimal. [Min Cost to Connect All Points](/practice/min-cost-connect-points) is exactly this case, and reaching for the heap there is the classic sign of pattern-matching over thinking.

## Kruskal: many trees, lightest edge first

Kruskal's algorithm sorts every edge by weight and walks the list, adding an edge if and only if its endpoints are currently in different trees. The cut justifying each addition is "the tree containing `u`" versus "everything else": the edge being considered is the lightest edge crossing it that has not already been rejected, because everything lighter was processed already.

```viz
{"type": "graph", "algorithm": "kruskal", "directed": false,
 "title": "Kruskal: sort edges, union components",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":30,"y":15},{"id":"C","x":30,"y":85},{"id":"D","x":65,"y":15},{"id":"E","x":65,"y":85},{"id":"F","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"B","to":"C","w":5},{"from":"B","to":"D","w":10},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":3},{"from":"D","to":"E","w":6},{"from":"D","to":"F","w":7},{"from":"E","to":"F","w":9}]}
```

Sorted: A–C 2, C–E 3, A–B 4, B–C 5, D–E 6, D–F 7, C–D 8, E–F 9, B–D 10. Take A–C, C–E, A–B. Reject B–C (B and C already connected through A). Take D–E, D–F. Reject C–D, E–F, B–D: the tree already has five edges, and any further edge closes a cycle. Same 22, same tree; with distinct weights the MST is unique, so every correct algorithm finds the same one.

"Are `u` and `v` in the same tree?" followed by "merge the trees" is precisely what a **union-find** structure does in near-constant time, and it is the reason the [next lesson](/learn/algorithms/graph-algorithms/union-find) exists. With union-find, Kruskal is dominated by the sort: `O(E log E) = O(E log V)`.

```python
def kruskal(n, edges):
    parent = list(range(n))
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]   # path halving
            x = parent[x]
        return x
    total, taken = 0, 0
    for w, u, v in sorted((w, u, v) for u, v, w in edges):
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
            total += w
            taken += 1
            if taken == n - 1:
                break
    return total if taken == n - 1 else -1
```

Kruskal has a property Prim lacks: on a disconnected graph it produces a minimum spanning **forest** without any change, one tree per component. Prim needs an outer loop over unvisited nodes to do the same.

## Choosing between them

| | Prim (heap) | Prim (array) | Kruskal |
|---|---|---|---|
| Time | `O(E log V)` | `O(V²)` | `O(E log E)` |
| Wins when | Sparse, adjacency list available | Dense or complete graphs | Edges already sorted, or arrive as a list, or you need a forest |
| Data structure | Priority queue | Nothing | Union-find |
| Needs the whole graph in memory? | Adjacency lists | `V × V` matrix or on-the-fly weights | Only the edge list |

If the edges come pre-sorted (weights are small integers and you counting-sort them, or the input is already ordered) Kruskal drops to nearly `O(E α(V))`, which is as good as it gets. If you want to parallelise, neither is great; Borůvka's algorithm, which has every component pick its lightest outgoing edge simultaneously, is the one used in parallel and distributed MST implementations and is worth knowing by name.

## What the MST is not

The MST is not a shortest-path tree. In the example, the MST path from A to D is A–C–E–D with cost 2 + 3 + 6 = 11, while the shortest path is A–C–D at 10. Minimising the total weight of the tree and minimising each root-to-node distance are different objectives, and a graph can have an MST in which some root-to-node path is arbitrarily worse than the shortest one. If the question mentions a source and "shortest", it is Dijkstra; if it mentions "connect everything" and "total cost", it is MST. Interviewers set traps on exactly this boundary.

The MST also does not minimise the maximum edge weight *between two given nodes*; it minimises it between *all* pairs at once. That second property is real and useful: the MST is a **minimum bottleneck spanning tree**, so the path between any two nodes in the MST minimises the heaviest edge on the way. That is why "the minimum effort path" and "the smallest maximum cable capacity needed" problems can be solved by building an MST and walking it, although a Dijkstra with `max` relaxation is usually simpler for a single pair.

## Variants worth having ready

**Maximum spanning tree.** Negate the weights, or sort descending. The cut property holds for "heaviest" too.

**Clustering.** Run Kruskal but stop when there are `k` components left. The components are the single-linkage clustering with `k` clusters, and the next edge you would have added is the minimum inter-cluster distance, which single-linkage maximises. Equivalently: build the full MST and delete the `k − 1` heaviest edges.

**Second-best MST.** For each edge not in the MST, adding it closes a cycle; swapping it for the heaviest MST edge on that cycle gives a candidate tree. The best candidate is the second-best MST. With a naive cycle walk it is `O(VE)`; with binary lifting for "heaviest edge on the tree path" it is `O(E log V)`.

**Must this edge be in every MST?** Edge `e` with weight `w` is in every MST if and only if removing it and considering only edges strictly lighter than `w` leaves its endpoints disconnected. Also answerable by running Kruskal and watching what happens at the moment weight `w` is processed.

**Is this tree a valid spanning tree?** [Graph Valid Tree](/practice/graph-valid-tree) asks whether `n − 1` given edges form a tree: they do if and only if union-find never sees a cycle, which is Kruskal with the sort removed.

## Exercises

```exercise
id: prim-total-weight
title: Prim with a heap
prompt: |
  Implement `prim_mst(n, edges)` for an undirected graph with nodes `0..n-1`
  and `edges` as `[u, v, w]` triples (weights may be negative, parallel edges
  are allowed). Return the total weight of a minimum spanning tree, or `-1`
  if the graph is not connected. `n = 1` with no edges is connected.

  Use a heap keyed on edge weight with lazy deletion; settle a node when it
  is popped for the first time.
languages: [python, javascript]
entry: prim_mst
starter:
  python: |
    import heapq

    def prim_mst(n, edges):
        # adjacency list, then a heap of (weight, node)
        return -1
  javascript: |
    class MinHeap {
      constructor() { this.a = []; }
      push(x) { const a = this.a; a.push(x); let i = a.length - 1;
        while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
      pop() { const a = this.a; const top = a[0]; const last = a.pop();
        if (a.length) { a[0] = last; let i = 0;
          for (;;) { let l = 2 * i + 1, r = l + 1, m = i;
            if (l < a.length && a[l][0] < a[m][0]) m = l;
            if (r < a.length && a[r][0] < a[m][0]) m = r;
            if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
        return top; }
      get size() { return this.a.length; }
    }

    function prim_mst(n, edges) {
      // adjacency list, then a heap of [weight, node]
      return -1;
    }
tests:
  - args: [6, [[0,1,4],[0,2,2],[1,2,5],[1,3,10],[2,3,8],[2,4,3],[3,4,6],[3,5,7],[4,5,9]]]
    expected: 22
    label: the graph from the lesson
  - args: [1, []]
    expected: 0
    label: single node
  - args: [3, [[0,1,1]]]
    expected: -1
    label: disconnected
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[3,0,1],[0,2,5]]]
    expected: 3
    label: cycle with a heavy chord
  - args: [2, [[0,1,5],[0,1,2]]]
    expected: 2
    label: parallel edges
  - args: [5, [[0,1,2],[0,3,6],[1,2,3],[1,3,8],[1,4,5],[2,4,7],[3,4,9]]]
    expected: 16
    hidden: true
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,1],[0,2,1],[1,3,1]]]
    expected: 3
    hidden: true
    label: all weights equal
  - args: [3, [[0,1,-2],[1,2,-3],[0,2,4]]]
    expected: -5
    hidden: true
    label: negative weights
hints:
  - "Push `(0, 0)` to start; node 0 joins the tree at cost 0."
  - "On pop, skip nodes already in the tree; otherwise add the popped weight and push the node's edges to non-tree neighbours."
  - "Count settled nodes; if fewer than `n` when the heap empties, return -1."
```

```exercise
id: kruskal-chosen-edges
title: Kruskal with union-find
prompt: |
  Implement `kruskal_edges(n, edges)`. `edges[i] = [u, v, w]` is an undirected
  edge. Sort the edges by weight, breaking ties by their index in the input,
  and add an edge whenever it joins two different components. Return the list
  of chosen edge indices in the order they were added (a minimum spanning
  forest if the graph is disconnected).

  Write a small union-find inline: `find` with path compression and `union`
  that returns whether a merge happened.
languages: [python, javascript]
entry: kruskal_edges
starter:
  python: |
    def kruskal_edges(n, edges):
        parent = list(range(n))

        def find(x):
            # path compression
            return x

        order = sorted(range(len(edges)), key=lambda i: (edges[i][2], i))
        chosen = []
        # for i in order: if find(u) != find(v): union and record i
        return chosen
  javascript: |
    function kruskal_edges(n, edges) {
      const parent = Array.from({ length: n }, (_, i) => i);
      function find(x) {
        // path compression
        return x;
      }
      const order = edges.map((_, i) => i).sort((a, b) => edges[a][2] - edges[b][2] || a - b);
      const chosen = [];
      // for (const i of order) { if roots differ: union and record i }
      return chosen;
    }
tests:
  - args: [6, [[0,1,4],[0,2,2],[1,2,5],[1,3,10],[2,3,8],[2,4,3],[3,4,6],[3,5,7],[4,5,9]]]
    expected: [1, 5, 0, 6, 7]
    label: the graph from the lesson
  - args: [1, []]
    expected: []
  - args: [3, [[0,1,1]]]
    expected: [0]
    label: spanning forest of a disconnected graph
  - args: [4, [[0,1,1],[1,2,1],[2,3,1],[0,3,1],[0,2,1],[1,3,1]]]
    expected: [0, 1, 2]
    label: ties broken by index
  - args: [2, [[0,1,5],[0,1,2]]]
    expected: [1]
    hidden: true
    label: parallel edges
  - args: [5, [[0,1,2],[0,3,6],[1,2,3],[1,3,8],[1,4,5],[2,4,7],[3,4,9]]]
    expected: [0, 2, 4, 1]
    hidden: true
  - args: [3, [[1,2,1],[0,1,1],[0,2,1]]]
    expected: [0, 1]
    hidden: true
hints:
  - "`find` walks parent pointers to the root; set `parent[x] = find(parent[x])` on the way back to compress."
  - "An edge is chosen iff `find(u) != find(v)`; then set `parent[find(u)] = find(v)`."
  - "Stop early once `n - 1` edges are chosen; it is an optimisation, not a correctness requirement."
```

## Senior signals

- You can state and prove the cut property with an exchange argument in under a minute, and you see Prim and Kruskal as two schedules of the same safe choice.
- You reach for the `O(V²)` array version of Prim on complete graphs ("connect all the points") and the heap version on sparse ones, and you can say why the heap is overhead when `E ≈ V²`.
- You know Kruskal is "sort plus union-find", that it produces a spanning forest for free, and that Graph Valid Tree is Kruskal without the sort.
- You can give a three-node example where the MST path is longer than the shortest path, and you never confuse "minimum total cable" with "minimum latency from the hub".
- You know the MST is a minimum bottleneck spanning tree and what that buys ("minimum effort path" problems), and that stopping Kruskal at `k` components is single-linkage clustering.
- You can name Borůvka as the parallel MST algorithm and second-best-MST as the exchange-argument follow-up.

## Check yourself

```quiz
- q: >-
    All edge weights in a connected graph are distinct. How many minimum spanning trees does it have?
  options: ["Exactly one", "At least one per node", "It depends on the graph's cycles", "One per connected cut"]
  answer: 0
  explanation: >-
    With distinct weights the lightest crossing edge of every cut is unique, and the exchange argument shows any MST must contain it. Two different MSTs would disagree on some cut's lightest edge, which is impossible. Ties are the only source of multiple MSTs.
- q: >-
    You need to connect 5,000 points in the plane with minimum total wire length; any two points may be joined directly. Which implementation is best?
  options: ["Kruskal on all 12.5 million edges", "Prim with a binary heap", "Prim with a linear scan of a best[] array, O(V²)", "Bellman-Ford"]
  answer: 2
  explanation: >-
    The graph is complete, so E = V²/2 and O(V²) is already linear in the number of edges. Kruskal has to sort 12.5M edges and Prim-with-heap pays log factors on the same 12.5M pushes. The array version does 25M cheap operations with no allocation.
- q: >-
    The MST of a graph contains the path A–C–E–D. Is A–C–E–D necessarily the shortest path from A to D?
  options: ["Yes, MST edges are always shortest-path edges", "No; the MST minimises total tree weight, and the MST path between two nodes can be longer than the shortest path", "Only if all weights are distinct", "Only in undirected graphs"]
  answer: 1
  explanation: >-
    In the lesson's graph the MST path A–C–E–D costs 11 while A–C–D costs 10. The objectives differ: MST is a global sum, shortest path is per-pair. The MST does minimise the heaviest edge on the path (bottleneck), which is a different guarantee.
- q: >-
    Running Kruskal, you stop as soon as there are exactly k components left. What have you computed?
  options: ["A k-approximation of the MST", "The k heaviest edges of the MST", "Single-linkage clustering into k clusters, maximising the minimum inter-cluster distance", "Nothing meaningful; Kruskal must run to completion"]
  answer: 2
  explanation: >-
    Each Kruskal merge joins the two closest components, exactly single-linkage agglomerative clustering. Stopping at k components leaves the k − 1 heaviest MST edges unused, and the lightest of those is the distance between the two closest clusters.
- q: >-
    Which operation is the reason union-find is the natural partner for Kruskal?
  options: ["Finding the lightest edge quickly", "Answering 'are u and v already connected' and merging their sets in near-constant time", "Sorting the edges", "Detecting negative weights"]
  answer: 1
  explanation: >-
    Kruskal's only per-edge question is whether the endpoints are in the same tree; union-find answers it and merges in amortised near-constant time. Sorting is done separately and dominates the total cost.
```
