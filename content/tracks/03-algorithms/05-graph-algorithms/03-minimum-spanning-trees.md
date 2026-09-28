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

### The proof on the example graph

Run the exchange on the graph drawn below, at the moment Prim's tree is `S = {A, C, E}`. The crossing edges are A–B (4), C–B (5), C–D (8), E–D (6) and E–F (9); the lightest is A–B. Suppose some MST `T` leaves A–B out. `T` connects A to B, so it contains a path from A to B, and since A is inside `S` and B outside, the path uses at least one of the five crossing edges, call it `f`; every candidate weighs at least 4. Delete `f`, add A–B: the result still spans (A and B stay connected through the new edge, and everything that used `f` can detour around the cycle) and weighs `w(T) − w(f) + 4 ≤ w(T)`. So A–B is in some MST, and Prim is right to take it. The same argument justifies every one of Prim's five choices and every one of Kruskal's, with a different `S` each time.

The mirror image, the **cycle property**, is equally useful in interviews: the heaviest edge on any cycle is in no MST when weights are distinct. On the cycle A–B–C, the edge B–C (5) is heavier than A–B (4) and A–C (2), so no MST contains it, which is exactly why Kruskal rejects it below. The cycle property also answers "which edge can we remove to save the most".

## Prim: one tree, one cut at a time

Prim's algorithm keeps a single growing tree. The cut is always "nodes in the tree" versus "nodes not yet in the tree", and the algorithm adds the lightest edge crossing it. Start anywhere; the cut property does not care.

```viz
{"type": "graph", "algorithm": "prim", "directed": false, "start": "A",
 "title": "Prim from A",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":30,"y":15},{"id":"C","x":30,"y":85},{"id":"D","x":65,"y":15},{"id":"E","x":65,"y":85},{"id":"F","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"B","to":"C","w":5},{"from":"B","to":"D","w":10},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":3},{"from":"D","to":"E","w":6},{"from":"D","to":"F","w":7},{"from":"E","to":"F","w":9}]}
```

Trace it with the lazy-deletion heap from the code below. Each entry is `(weight, node, via)`; the heap column lists the entries remaining after the pop, in pop order.

| Pop | Entry | Action | Pushed | Heap after | Tree weight |
|---|---|---|---|---|---|
| 1 | (0, A) | settle A | (2, C, A) (4, B, A) | (2,C) (4,B) | 0 |
| 2 | (2, C, A) | settle C | (5, B, C) (8, D, C) (3, E, C) | (3,E) (4,B) (5,B) (8,D) | 2 |
| 3 | (3, E, C) | settle E | (6, D, E) (9, F, E) | (4,B) (5,B) (6,D) (8,D) (9,F) | 5 |
| 4 | (4, B, A) | settle B | (10, D, B) | (5,B) (6,D) (8,D) (9,F) (10,D) | 9 |
| 5 | (5, B, C) | **stale**: B already in tree | | (6,D) (8,D) (9,F) (10,D) | 9 |
| 6 | (6, D, E) | settle D | (7, F, D) | (7,F) (8,D) (9,F) (10,D) | 15 |
| 7 | (7, F, D) | settle F | | (8,D) (9,F) (10,D) | 22 |
| 8–10 | (8, D) (9, F) (10, D) | **stale**, three in a row | | empty | 22 |

Ten pushes (one per non-tree endpoint of an edge out of a settled node, plus the start), ten pops, six settles, four stale skips; the heap peaked at five entries. The MST is A–C, C–E, A–B, E–D, D–F with weight `2 + 3 + 4 + 6 + 7 = 22`. Pop 5 is the moment to notice: B was reachable at cost 4 via A and at cost 5 via C, both entries sat in the heap at once, and the cheaper one won because it popped first. If the code refused to push B a second time because "B is already in the heap", it would still be right here, because the first push happened to be the cheaper one; the failure modes section shows a graph where it is not.

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

### Dense graphs: the array version

Each edge is pushed at most twice (once from each endpoint), so the heap does `O(E)` pushes and pops at `O(log E)` each: `O(E log V)`. On a *dense* graph, or a complete graph like "connect all the points" where `E = n(n−1)/2`, the array version is better: keep `best[v]`, the lightest edge from the tree to `v`, and scan it linearly for the minimum each round. That is `O(V²)` with a tiny constant and no heap, and on a complete graph `O(V²) = O(E)`, which is optimal. [Min Cost to Connect All Points](/practice/min-cost-connect-points) is exactly this case, and reaching for the heap there is the classic sign of pattern-matching over thinking.

The array version on the same graph, showing `best[]` for the nodes still outside the tree after each settle:

| Settle | Tree weight | `best` for non-tree nodes |
|---|---|---|
| A | 0 | B=4 C=2 D=∞ E=∞ F=∞ |
| C (2) | 2 | B=4 D=8 E=3 F=∞ |
| E (3) | 5 | B=4 D=6 F=9 |
| B (4) | 9 | D=6 F=9 |
| D (6) | 15 | F=7 |
| F (7) | 22 | |

Same choices, same tree, and no stale entries to skip: `best[D]` is overwritten in place from 8 to 6 when E settles, which is the decrease-key the heap version avoids by pushing twice.

## Kruskal: many trees, lightest edge first

Kruskal's algorithm sorts every edge by weight and walks the list, adding an edge if and only if its endpoints are currently in different trees. The cut justifying each addition is "the tree containing `u`" versus "everything else": the edge being considered is the lightest edge crossing it that has not already been rejected, because everything lighter was processed already.

```viz
{"type": "graph", "algorithm": "kruskal", "directed": false,
 "title": "Kruskal: sort edges, union components",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":30,"y":15},{"id":"C","x":30,"y":85},{"id":"D","x":65,"y":15},{"id":"E","x":65,"y":85},{"id":"F","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"B","to":"C","w":5},{"from":"B","to":"D","w":10},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":3},{"from":"D","to":"E","w":6},{"from":"D","to":"F","w":7},{"from":"E","to":"F","w":9}]}
```

Sorted: A–C 2, C–E 3, A–B 4, B–C 5, D–E 6, D–F 7, C–D 8, E–F 9, B–D 10. The table shows the union-find forest (union by size, path compression) after each edge; `X→Y` means `parent[X] = Y`, and a node that points to itself is a root.

| Edge | `find(u)`, `find(v)` | Decision | Components after | `parent` after |
|---|---|---|---|---|
| A–C 2 | A, C | take | {A,C} {B} {D} {E} {F} | C→A |
| C–E 3 | A, E | take | {A,C,E} {B} {D} {F} | C→A E→A |
| A–B 4 | A, B | take | {A,B,C,E} {D} {F} | B→A C→A E→A |
| B–C 5 | A, A | **reject**: same root | unchanged | unchanged |
| D–E 6 | D, A | take | {A,B,C,D,E} {F} | B→A C→A D→A E→A |
| D–F 7 | A, F | take | {A,B,C,D,E,F} | B→A C→A D→A E→A F→A |
| C–D 8 | A, A | reject | five edges taken: done | |
| E–F 9, B–D 10 | | never examined if you stop at `n − 1` edges | | |

Same 22, same tree; with distinct weights the MST is unique, so every correct algorithm finds the same one. Because union by size always hangs the smaller tree under the larger, and on this graph every merge attaches a singleton to the growing tree, the forest never gets deeper than one pointer; the [union-find lesson](/learn/algorithms/graph-algorithms/union-find) shows what happens when two large trees merge and why path compression then matters.

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

| | Prim (heap) | Prim (array) | Kruskal | Borůvka |
|---|---|---|---|---|
| Time | `O(E log V)` | `O(V²)` | `O(E log E)`, the sort | `O(E log V)`: `log V` rounds of `O(E)` |
| Wins when | sparse, adjacency list available | dense or complete graphs | edges already sorted or arriving as a list; you want a forest | parallel or distributed; edges partitioned across machines |
| Data structure | priority queue, up to `2E` entries | `best[]` array, `V` entries | union-find, `V` entries | union-find plus a per-component minimum |
| Needs the whole graph in memory? | adjacency lists | `V × V` matrix or weights computed on the fly | only the edge list, can stream it once sorted | edge list, partitionable |
| Disconnected input | needs an outer loop | needs an outer loop | forest for free | forest for free |
| Parallelises? | poorly: settling is sequential | poorly | the sort does, the union pass does not | yes: every component chooses independently each round |

If the edges come pre-sorted (weights are small integers and you counting-sort them, or the input is already ordered) Kruskal drops to nearly `O(E α(V))`, which is as good as it gets. Borůvka's rounds halve the component count at least, because every component merges with at least one other, so `⌈log₂ V⌉` rounds suffice; that structure is why GPU and distributed MST implementations use it.

## What the MST is not

The MST is not a shortest-path tree. In the example, the MST path from A to D is A–C–E–D with cost 2 + 3 + 6 = 11, while the shortest path is A–C–D at 10. Minimising the total weight of the tree and minimising each root-to-node distance are different objectives, and a graph can have an MST in which some root-to-node path is arbitrarily worse than the shortest one. If the question mentions a source and "shortest", it is Dijkstra; if it mentions "connect everything" and "total cost", it is MST. Interviewers set traps on exactly this boundary.

The MST also does not minimise the maximum edge weight *between two given nodes*; it minimises it between *all* pairs at once. That second property is real and useful: the MST is a **minimum bottleneck spanning tree**, so the path between any two nodes in the MST minimises the heaviest edge on the way. That is why "the minimum effort path" and "the smallest maximum cable capacity needed" problems can be solved by building an MST and walking it, although a Dijkstra with `max` relaxation is usually simpler for a single pair.

## Variants worth having ready

**Maximum spanning tree.** Negate the weights, or sort descending. The cut property holds for "heaviest" too.

**Clustering.** Run Kruskal but stop when there are `k` components left. The components are the single-linkage clustering with `k` clusters, and the next edge you would have added is the minimum inter-cluster distance, which single-linkage maximises. Equivalently: build the full MST and delete the `k − 1` heaviest edges.

**Second-best MST.** For each edge not in the MST, adding it closes a cycle; swapping it for the heaviest MST edge on that cycle gives a candidate tree. The best candidate is the second-best MST. With a naive cycle walk it is `O(VE)`; with binary lifting for "heaviest edge on the tree path" it is `O(E log V)`.

**Must this edge be in every MST?** Edge `e` with weight `w` is in every MST if and only if removing it and considering only edges strictly lighter than `w` leaves its endpoints disconnected. Also answerable by running Kruskal and watching what happens at the moment weight `w` is processed.

**Is this tree a valid spanning tree?** [Graph Valid Tree](/practice/graph-valid-tree) asks whether `n − 1` given edges form a tree: they do if and only if union-find never sees a cycle, which is Kruskal with the sort removed.

## Under the hood

**networkx.** `minimum_spanning_tree(G)` defaults to `algorithm="kruskal"` (`"prim"` and `"boruvka"` are options). Kruskal sorts the edge list by the weight attribute with Python's `sorted` and drives a pure-Python `UnionFind` (union by weight with path compression) from `networkx.utils`. Every edge is a Python tuple and every find is interpreted bytecode, so expect on the order of a microsecond per union-find step and a few seconds per million edges; for graphs that fit that budget the code is a fine reference implementation. It also raises on `NaN` weights and treats missing weights as 1, both of which are worth knowing before feeding it a distance matrix.

**scipy.** `scipy.sparse.csgraph.minimum_spanning_tree(csgraph)` runs Kruskal in Cython over a CSR matrix: `argsort` the weights, then a union-find pass over `int32` index arrays, returning the tree as another CSR matrix. It is an order of magnitude faster and uses about 12 bytes per edge instead of a hundred. Two gotchas come from the representation. Converting a dense array to a sparse graph drops zeros, so an edge of weight 0 becomes no edge; shift weights by a positive constant if zero is a legitimate cost. And the input is read as undirected using whichever of `(i, j)` and `(j, i)` is non-zero (the smaller when both are), so a matrix with asymmetric values gives you the minimum of the two, silently.

**Clustering.** Single-linkage clustering *is* Kruskal stopped early: `scipy.cluster.hierarchy.linkage(method="single")` uses an MST-based routine, and scikit-learn's `AgglomerativeClustering(linkage="single")` sits on top of it. The dendrogram is the order in which Kruskal merged components, with merge heights equal to edge weights. Image segmentation by Felzenszwalb and Huttenlocher (`skimage.segmentation.felzenszwalb`) is Kruskal over pixel-adjacency edges with a per-component threshold deciding whether to accept each merge.

**Where the name misleads.** Ethernet's Spanning Tree Protocol (STP, RSTP) elects a root bridge (lowest bridge ID) and has every switch keep the port with the lowest path cost to the root: it builds a *shortest-path tree from the root*, the Dijkstra shape, not a minimum-weight spanning tree. The word "spanning" there means loop-free, and the [routing lesson](/learn/networking/network-algorithms/routing-algorithms) has the protocol side. The true MST shows up in network *design* (which fibre runs to build, with Steiner points making the exact problem NP-hard and the MST a 2-approximation), in approximating the travelling salesman problem (walk the MST twice for a 2-approximation; Christofides adds a matching on odd-degree nodes for 1.5), and in reducing a dense similarity graph to a tree before clustering or visualisation.

## Quantified costs

- **Kruskal's sort.** `E = 10⁷` edges need about `E log₂ E ≈ 2.3 × 10⁸` comparisons. As Python 3-tuples that is `10⁷ × (64 bytes per tuple + 8 bytes per list slot + 28 bytes per non-small int)` ≈ 1–1.5 GB before sorting, and `sorted` takes tens of seconds; as a NumPy `argsort` over an `int64` weight array it is 80 MB and on the order of a second (depends on the machine; treat as orders of magnitude).
- **The union-find pass.** `2E` finds plus at most `V − 1` unions, each amortised `O(α(V))` with `α ≤ 4`, so about `10⁸` pointer steps for `10⁷` edges: seconds in Python, tens of milliseconds in C. The sort dominates, which is the whole reason "already sorted edges" changes the answer.
- **Prim's heap.** Up to `2E` pushes and pops at `log₂(2E) ≈ 24` for `E = 10⁷`: roughly `10⁹` sift comparisons, the same order as Dijkstra on the same graph. Each heap entry is a 3-tuple of about 72 bytes in CPython, so the heap can reach 1.4 GB in the worst case; CSR-based C code keeps it under 200 MB.
- **Complete graph, 5,000 points.** `E = 12.5 × 10⁶`. Prim's array version does `V² = 2.5 × 10⁷` scans of `best[]` with no allocation. Kruskal must materialise and sort every edge: `12.5 × 10⁶ × 23 ≈ 3 × 10⁸` comparisons and, in Python, about 2 GB of tuples; the heap version pushes each edge up to twice.
- **Adjacency memory.** As in the [Dijkstra lesson](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra), a Python adjacency list costs 90–100 bytes per directed edge versus 8–12 bytes in CSR (`int32` neighbour plus `float32` or `int64` weight).

## Failure modes

**Symptom: Prim reports a tree weight that is too small, or a downstream step finds a node with no incident tree edge.** Diagnosis: the graph is disconnected and Prim stopped when its heap emptied, having spanned only the start's component. Fix: count settled nodes and return "not connected" when the count is below `V`, or loop over unvisited nodes to produce a spanning forest, which Kruskal gives you without any change.

**Symptom: the tree is heavier than the MST on some inputs, after an "optimisation" that avoids duplicate heap entries.** Diagnosis: the code refuses to push a node that is already in the heap. On A–B (10), A–C (1), C–B (2): B is pushed at 10 from A, C settles at 1 and finds B at 2, the push is refused, and B joins at 10 for a tree of weight 11 instead of 3. Fix: mark a node as in-tree when it is *popped*, never when it is pushed; the stale check on pop is the only guard you need, exactly as in Dijkstra.

**Symptom: the MST total is right, but a service using the tree to route between two nodes reports paths that are much longer than expected.** Diagnosis: the MST was used as a shortest-path tree. In the example, the MST path A–C–E–D costs 11 while A–C–D costs 10, and in general the ratio is unbounded. Fix: run Dijkstra for distances; keep the MST for total-cost and bottleneck questions only.

**Symptom: the clustering (or the list of tree edges) changes between runs on the same data.** Diagnosis: tied weights, usually floating-point distances that are equal or differ only by rounding, and a sort or heap that breaks ties by memory order or dictionary iteration order. Different MSTs with the same total weight produce different clusters at a cut. Fix: sort on `(weight, u, v)` with integer or scaled-integer weights so ties break deterministically, and report that the MST is not unique when it is not.

**Symptom: using `scipy.sparse.csgraph.minimum_spanning_tree`, the tree comes back disconnected or heavier than a Python reference, on graphs where some edges have weight 0.** Diagnosis: a CSR matrix cannot store an explicit zero as an edge, so zero-weight edges vanish. Fix: add a constant to every weight before the call and subtract `(V − 1) × constant` from the total afterwards.

**Symptom: Kruskal takes minutes and the machine swaps, on a "connect all the points" instance of 20,000 points.** Diagnosis: `E = 2 × 10⁸` edges materialised as tuples for the sort, several gigabytes. Fix: on a complete graph use Prim's `O(V²)` array version, which never builds an edge list, or for geometric points build the MST on the Delaunay triangulation (`O(V)` edges, contains the Euclidean MST).

## Interviewer follow-ups

**"Some weights are equal. Is the MST still unique, and does your algorithm still work?"** Model answer: the algorithm works unchanged (the cut property still holds; the lightest crossing edge is only no longer unique), but the MST may not be unique, and which one you get depends on tie order. Counting MSTs is possible with the matrix-tree theorem but is not something to derive on the spot. Common wrong answer: "the MST is always unique."

**"An edge is added to the graph after you built the MST. Update it faster than rebuilding."** Model answer: add the edge to the tree, which creates exactly one cycle (the tree path between its endpoints plus itself), and drop the heaviest edge on that cycle; finding the path is `O(V)` with a DFS on the tree. Common wrong answer: rerunning Kruskal, or comparing the new edge against the heaviest tree edge anywhere rather than on the cycle.

**"An MST edge is deleted from the graph."** Model answer: the tree splits into two components; the new MST is the old one plus the lightest surviving edge that crosses between them, found in one `O(E)` scan after labelling the two sides with a BFS on the tree. Common wrong answer: taking the next-heaviest edge in the sorted order, which may not cross the cut.

**"Is this specific edge in every MST?"** Model answer: with weight `w`, it is in every MST if and only if its endpoints are disconnected using only edges strictly lighter than `w`; run union-find over those edges and test. Equivalently, watch Kruskal when it reaches weight `w`: if the edge's endpoints are still in different components after all lighter edges, it is forced. Common wrong answer: "if it is the lightest edge at one of its endpoints", which is sufficient but not necessary.

**"We can add junction points anywhere, not only at the given nodes. Is the MST still optimal?"** Model answer: no; that is the Steiner tree problem, NP-hard, and the MST over the given nodes is a 2-approximation (for Euclidean points about 1.15). Common wrong answer: "yes, extra points cannot help", refuted by three points at the corners of an equilateral triangle, where a centre point saves about 13%.

## What mid-level engineers get wrong

- **Reaching for the heap on a complete graph.** `E ≈ V²/2` tuples in the heap and a log factor for nothing; the `O(V²)` array is faster and allocation-free.
- **Marking in-tree on push.** Refuses the cheaper edge discovered later; heavier tree, no error message.
- **Using the MST for routing.** The path between two nodes in the MST minimises the bottleneck edge, not the total; distances need Dijkstra.
- **Assuming Prim handles disconnected graphs.** It spans one component and stops; Kruskal produces a forest, Prim needs an outer loop.
- **Ignoring ties.** Float weights and unordered iteration make the tree non-deterministic across runs, which breaks reproducible clustering.
- **Sorting `(w, u, v)` tuples of a million-edge graph in Python without thinking about memory.** Roughly 150 bytes per edge; NumPy `argsort` on the weights is ten times smaller and faster.
- **Rebuilding after every graph change.** A single edge insertion or deletion is `O(V)` or `O(E)` with the cycle and cut properties.
- **Saying "the spanning tree protocol builds an MST".** It builds a shortest-path tree from the root bridge; the name refers to loop-freedom.

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
- You update an MST after an edge insertion in `O(V)` (heaviest edge on the tree cycle) and after a deletion in `O(E)` (lightest edge across the new cut) instead of rebuilding.
- You know what the libraries do (networkx sorts and unions in Python, scipy runs Kruskal over CSR in Cython) and where the MST is not what people think it is (Ethernet's spanning tree is a shortest-path tree from the root bridge).
- You make tie-breaking deterministic, in integers, before an MST feeds a clustering or a downstream system that must be reproducible.

## Check yourself

```quiz
- q: >-
    All edge weights in a connected graph are distinct. How many minimum spanning trees does it have?
  options: ["As many as it has simple cycles", "At least one for every node", "Exactly one, whatever its shape", "One for each cut of the graph"]
  answer: 2
  explanation: >-
    With distinct weights the lightest crossing edge of every cut is unique, and the exchange argument shows any MST must contain it. Two different MSTs would disagree on some cut's lightest edge, which is impossible. Ties are the only source of multiple MSTs.
- q: >-
    You need to connect 5,000 points in the plane with minimum total wire length; any two points may be joined directly. Which implementation is best?
  options: ["Prim with a binary heap, O(E log V)", "Dijkstra from any point, O(E log V)", "Kruskal on all 12.5M edges, O(E log E)", "Prim with a best[] array scan, O(V²)"]
  answer: 3
  explanation: >-
    The graph is complete, so E = V²/2 and O(V²) is already linear in the number of edges. Kruskal has to sort 12.5M edges and Prim-with-heap pays log factors on the same 12.5M pushes. The array version does 25M cheap operations with no allocation. Dijkstra builds a shortest-path tree, which is not an MST.
- q: >-
    The MST of a graph contains the path A–C–E–D. Is A–C–E–D necessarily the shortest path from A to D?
  options: ["Yes, because an MST path minimises its heaviest edge", "Yes, provided all edge weights are distinct so it is unique", "Yes, because every MST edge lies on some shortest path", "No, because the MST minimises total weight, not each path"]
  answer: 3
  explanation: >-
    In the lesson's graph the MST path A–C–E–D costs 11 while A–C–D costs 10. The objectives differ: MST is a global sum, shortest path is per-pair, and uniqueness does not change that. The MST does minimise the heaviest edge on the path (bottleneck), which is a different guarantee from minimising the path's total.
- q: >-
    Running Kruskal, you stop as soon as there are exactly k components left. What have you computed?
  options: ["A k-approximation of the MST's total weight", "Complete-linkage clustering into k clusters", "Single-linkage clustering into k clusters", "Nothing useful; Kruskal must run to completion"]
  answer: 2
  explanation: >-
    Each Kruskal merge joins the two components with the closest pair of points, exactly single-linkage agglomerative clustering; complete-linkage would merge on the farthest pair instead. Stopping at k components leaves the k − 1 heaviest MST edges unused, and the lightest of those is the distance between the two closest clusters, which this clustering maximises.
- q: >-
    Which operation is the reason union-find is the natural partner for Kruskal?
  options: ["Finding the lightest remaining edge in near-constant time", "Detecting negative-weight edges before they are added", "Checking and merging components in near-constant time", "Sorting the edge list faster than a comparison sort"]
  answer: 2
  explanation: >-
    Kruskal's only per-edge question is whether the endpoints are in the same tree; union-find answers it and merges in amortised near-constant time. The lightest edge comes from the sort, which is done separately and dominates the total cost.
- q: >-
    You already hold an MST of a graph with V nodes and E edges, and one new edge (u, v, w) is added. What is the cheapest way to obtain the new MST?
  options: ["Nothing changes unless w is lighter than every edge at u or v, checked in O(deg)", "Add the edge, then remove the heaviest edge on the tree path from u to v, in O(V)", "Add the edge if w is lighter than the heaviest tree edge anywhere, in O(V)", "Rerun Kruskal on the E + 1 edges, in O(E log E), because the sort must be redone"]
  answer: 1
  explanation: >-
    Adding an edge to a tree creates exactly one cycle, the tree path from u to v plus the new edge, and the cycle property says the heaviest edge on that cycle is in no MST. Walking the tree path costs O(V). Comparing against the heaviest tree edge anywhere is wrong because that edge may not lie on the cycle, and the local-degree test misses cases where the new edge displaces an edge several hops away.
```
