---
slug: shortest-paths-dijkstra
title: "Dijkstra: shortest paths by settling the nearest node first"
description: The invariant that makes Dijkstra correct, the heap implementation with lazy deletion that everyone gets subtly wrong, why negative edges break it, and the 0-1 BFS shortcut for small weights.
minutes: 55
difficulty: medium
tags: [graphs, shortest-path, dijkstra, priority-queue, 0-1-bfs, relaxation]
problems: [network-delay-time, swim-in-rising-water, cheapest-flights-k-stops]
---
BFS finds the path with the fewest edges. The moment edges have different costs (milliseconds of latency between routers, metres between intersections, dollars between airports) the fewest-edge path is usually not the cheapest one, and BFS's central trick, that the queue hands you nodes in non-decreasing distance, stops being true. A two-hop path of cost 3 must be discovered before a one-hop path of cost 10, and a FIFO queue cannot do that.

Dijkstra's algorithm repairs BFS by replacing the FIFO queue with a priority queue keyed on tentative distance. That single substitution is the whole algorithm. Everything else, the proof, the complexity, the failure with negative weights and the classic implementation bug, follows from asking *why* pulling the smallest tentative distance is safe.

## The invariant

Keep two things: a tentative distance `dist[v]` for every node (infinity until you find any path) and a set of **settled** nodes whose distance is final. Initially `dist[src] = 0` and nothing is settled.

Repeat until the queue is empty: take the unsettled node `u` with the smallest `dist[u]`, mark it settled, and **relax** each outgoing edge `(u, v, w)`: if `dist[u] + w < dist[v]`, set `dist[v] = dist[u] + w`.

The invariant that makes this correct: **when a node is settled, its tentative distance equals its true shortest distance.** Here is the argument, and you should be able to reproduce it in an interview because it is also the explanation for why negative edges break the algorithm.

Suppose `u` is the unsettled node with the smallest tentative distance, but there is a shorter true path to `u`. That path starts inside the settled set (it begins at `src`) and must at some point cross an edge `(x, y)` from a settled node `x` to an unsettled node `y`. Because `x` is settled, `dist[x]` is exact, and because we relaxed `(x, y)` when we settled `x`, `dist[y] ≤ dist[x] + w(x, y)`, which is the length of the path prefix up to `y`. With non-negative weights, the rest of the path from `y` to `u` can only add cost, so `dist[y] ≤ true(u) < dist[u]`. But `u` was chosen as the unsettled node with the *smallest* tentative distance, so `dist[u] ≤ dist[y]`. Contradiction.

Read the argument once more and find the exact place non-negativity was used: "the rest of the path can only add cost". A single negative edge later on the path breaks that step, and with it the whole algorithm.

### The proof on the example graph

Abstract proofs are easy to nod along to and hard to reproduce, so run it on the graph below at the moment the algorithm is about to pop B with `dist[B] = 3`. The settled set is `{A, C}` with exact distances 0 and 2. Every unsettled node's tentative value came from relaxing edges out of A and C: `B = 3` (via C), `D = 10` (via C), `E = 12` (via C), `F = ∞`.

Claim a cheaper path to B exists, say of cost 2.5. It starts at A, so it starts inside `{A, C}`, and B is outside, so somewhere it takes an edge from `{A, C}` to `{B, D, E, F}`. The only such edges are A→B (4), C→B (1), C→D (8), C→E (10). Whichever it crosses first, at node `y`, the prefix cost is at least `dist[y]` (because that edge was relaxed when its tail settled): at least 3 for B, 10 for D, 12 for E. Non-negative weights mean the remainder of the path cannot bring the total below that prefix. So the hypothetical path costs at least 3, not 2.5. The same argument at every pop is the whole proof, and the only fact about the graph it used was that no edge subtracts cost.

## Watch it run

Six nodes, directed, weighted. Follow the frontier: the queue always pops the smallest tentative distance, and a node popped for the first time is settled for good.

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": true, "start": "A", "goal": "F",
 "title": "Dijkstra from A",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":35,"y":20},{"id":"C","x":30,"y":80},{"id":"D","x":60,"y":40},{"id":"E","x":75,"y":85},{"id":"F","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"C","to":"B","w":1},{"from":"B","to":"D","w":5},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":10},{"from":"D","to":"E","w":2},{"from":"D","to":"F","w":6},{"from":"E","to":"F","w":3}]}
```

By hand, the same run with the lazy-deletion heap from the next section. The heap column lists every `(dist, node)` entry still in the heap after the pop, in the order they will come out (the array inside `heapq` is laid out as a binary tree, but the pop order is what matters). The dist row is the full table after relaxation; ∞ means "no path found yet".

| Pop | Entry | Action | Relaxations | Heap after | dist A B C D E F |
|---|---|---|---|---|---|
| 1 | (0, A) | settle A | B=4, C=2 | (2,C) (4,B) | 0 4 2 ∞ ∞ ∞ |
| 2 | (2, C) | settle C | B=3 (2+1<4), D=10, E=12 | (3,B) (4,B) (10,D) (12,E) | 0 3 2 10 12 ∞ |
| 3 | (3, B) | settle B | D=8 (3+5<10) | (4,B) (8,D) (10,D) (12,E) | 0 3 2 8 12 ∞ |
| 4 | (4, B) | **stale**: 4 > dist[B]=3, skip | none | (8,D) (10,D) (12,E) | unchanged |
| 5 | (8, D) | settle D | E=10 (8+2<12), F=14 | (10,D) (10,E) (12,E) (14,F) | 0 3 2 8 10 14 |
| 6 | (10, D) | **stale**: 10 > 8, skip | none | (10,E) (12,E) (14,F) | unchanged |
| 7 | (10, E) | settle E | F=13 (10+3<14) | (12,E) (13,F) (14,F) | 0 3 2 8 10 13 |
| 8 | (12, E) | **stale**: 12 > 10, skip | none | (13,F) (14,F) | unchanged |
| 9 | (13, F) | settle F | none (F has no out-edges) | (14,F) | final |
| 10 | (14, F) | **stale**: 14 > 13, skip | none | empty | final |

Count what happened: 10 pushes (one initial plus one per successful relaxation), 10 pops, 6 settles, 4 stale skips. Every node whose distance improved after its first push left a stale entry behind, and each stale entry costs one pop and one comparison, nothing more. The heap never held more than four entries on this graph; on a graph with `E` edges it can hold up to `E` entries, which is where the `O(E log E)` bound comes from.

Two moments are worth staring at. At pop 2, C improves B from 4 to 3 *while B's old entry is still in the heap*: the algorithm does not update that entry, it pushes a second one, and the heap orders (3, B) ahead of (4, B) because tuples compare on their first element. At pop 4, that old entry surfaces and the guard `d > dist[u]` rejects it. If the stale check were missing, B would be re-expanded with `d = 4`, relaxing B→D to 9, which is not below the current 8, so nothing changes; the answer survives but the work is wasted.

The shortest path to F is A → C → B → D → E → F with cost 13, five edges long, while the three-edge path A → B → D → F costs 15. Fewest edges and cheapest are different questions.

## The heap implementation, and the bug

Textbooks describe Dijkstra with a `decrease-key` operation: when you improve `dist[v]`, you lower `v`'s priority inside the heap. Python's `heapq` and JavaScript have no decrease-key, and neither does most production code, because there is a simpler technique with the same asymptotic bound and a smaller constant on real graphs: **lazy deletion**. Push a new `(dist, node)` entry every time a distance improves and, on pop, skip any entry whose distance is worse than the current `dist[node]`. The price is heap size: up to one entry per relaxation (`E`) instead of one per node (`V`). The [indexed heap lesson](/learn/data-structures/heaps/indexed-heaps-and-decrease-key) shows the decrease-key version for the cases where that memory matters.

```python
import heapq

def dijkstra(n, edges, src):
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:          # stale entry: a shorter path was found after this push
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist
```

The `if d > dist[u]: continue` line is the part people get wrong, in one of two directions.

**Omitting it** does not make the answer wrong, because relaxing from a stale entry cannot lower any distance below what the fresh entry already achieved. It does make the algorithm slower: every stale pop re-scans `u`'s adjacency list, and on a graph where distances improve often that is a real cost.

**Replacing it with a `visited` set checked at push time** does make the answer wrong. If you refuse to push `v` because it is already "visited" (meaning "already in the heap"), you throw away the improvement from C to B in the trace above; B keeps the tentative distance 4 that A gave it. The correct discipline is: a node is settled when it is *popped* for the first time, never when it is pushed. Mark visited on pop, or compare `d` against `dist[u]`, and either one is right; marking on push is the bug.

The heap holds at most one entry per relaxation, so at most `E` entries, and each push or pop is `O(log E) = O(log V)` since `E ≤ V²`. Total: `O((V + E) log V)`. On a dense graph with `E ≈ V²`, the log factor is pure overhead and the array-scan version (`O(V)` to find the minimum, `V` times, `O(V²)` total) is faster and simpler. Interviewers like this trade-off question because it shows you know the heap is a tool, not a ritual.

## What the algorithm cannot do

**Negative edges.** Take three nodes: `A → B` with weight 2, `A → C` with weight 5, and `C → B` with weight −4. Dijkstra settles B at distance 2, then C at 5, then relaxes `C → B` and finds 5 − 4 = 1 < 2, but B is already settled and (in the visited-on-pop version) will not be re-expanded, so anything downstream of B keeps the wrong distance. Some implementations will even re-push B and produce correct distances on this graph by accident, which is worse: the algorithm is now exponential in the worst case, and it still fails on graphs with negative cycles because there is no shortest path to find. If edges can be negative, go to [Bellman-Ford](/learn/algorithms/graph-algorithms/bellman-ford-and-floyd-warshall).

**Constrained paths.** "Cheapest flight with at most k stops" ([Cheapest Flights Within K Stops](/practice/cheapest-flights-k-stops)) is not a Dijkstra problem, even though every weight is positive. The stop limit means the cheapest way to reach an intermediate node may be *disqualified* because it used too many edges, so the invariant "settled means final" no longer holds for a node; it only holds for a (node, stops-used) pair. You either run Dijkstra on the expanded state space of `V × (k+1)` nodes or, with less code, run `k+1` rounds of Bellman-Ford relaxation against a copied array.

**Path with maximum bottleneck.** [Swim in Rising Water](/practice/swim-in-rising-water) asks for the path whose *maximum* cell value is smallest. Dijkstra still works, but the relaxation is `nd = max(d, cell)` rather than `d + w`. The proof only needed the "cost never decreases along a path" step, and `max` satisfies that too. Recognising that Dijkstra works for any monotone path cost, sums or maxima, is a senior-level generalisation.

## 0-1 BFS and small integer weights

When every edge weight is 0 or 1 (walls you may knock down at cost 1, free moves at cost 0, "flip this switch at a cost"), the priority queue is overkill. Use a **deque**: relaxing a 0-weight edge pushes the neighbour to the *front*, a 1-weight edge pushes to the *back*. The deque then always holds nodes at only two distinct distances, `d` and `d + 1`, in order, which is exactly the property the heap was giving you, at `O(1)` per operation. The whole algorithm is `O(V + E)`.

```python
from collections import deque

def min_walls(grid):
    rows, cols = len(grid), len(grid[0])
    INF = float("inf")
    dist = [[INF] * cols for _ in range(rows)]
    dist[0][0] = 0
    dq = deque([(0, 0)])
    while dq:
        r, c = dq.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                w = grid[nr][nc]                 # entering a wall costs 1
                if dist[r][c] + w < dist[nr][nc]:
                    dist[nr][nc] = dist[r][c] + w
                    (dq.appendleft if w == 0 else dq.append)((nr, nc))
    return dist[rows - 1][cols - 1]
```

Note the stale check disappeared: a node can be pushed more than once, but the `dist` comparison at relaxation time keeps the work bounded. The same trick generalises to weights in `{0, 1, …, C}` as **Dial's algorithm**: `C + 1` buckets scanned in rotation, `O(V·C + E)` total (Robert Dial published it in 1969).

## Reconstructing the path and stopping early

Interviewers almost always follow "return the distance" with "now return the path". Keep a `prev[v] = u` whenever you relax `(u, v)` successfully, then walk back from the target. Because `prev` is only updated on strict improvement, it always points along a shortest path, and the walk terminates at `src` because `prev[src]` is never set.

If you only care about one target, `return` as soon as the target is *popped* (not pushed). Popped means settled; pushed means nothing. On a road network this typically expands a fraction of the graph, and [A*](/learn/algorithms/graph-algorithms/a-star-and-heuristic-search) is the technique for shrinking that fraction further with a heuristic.

Multi-source shortest path (nearest hospital from every house) needs no new algorithm: push every source with distance 0 before the loop starts. The invariant does not care how many nodes begin at distance zero.

## Where it runs

Link-state routing protocols such as OSPF and IS-IS flood the topology to every router and each router runs Dijkstra from itself to build its forwarding table, which is why the [routing lesson](/learn/networking/fundamentals/ip-addressing-and-routing) calls them "shortest path first" protocols. Netflix's Open Connect appliances sit inside ISP networks whose interior routing is typically one of these, so a link failure there triggers an SPF recomputation on every router in the area. Map services run Dijkstra-derived algorithms (A*, contraction hierarchies, ALT) on graphs with hundreds of millions of edges; the plain algorithm at `O(E log V)` takes seconds on a continent-scale graph, which is why the preprocessing-heavy variants exist. The plain heap version is what you write in an interview, and what you write in a service until a profiler tells you otherwise.

## Under the hood

**What `heapq` does with your tuples.** `heappush` and `heappop` are C functions (`_heapq`) that sift a Python object up or down a list, calling `<` on entries. `(3, 'B') < (4, 'B')` compares the first elements and stops; only on a tie does it compare the second. Two consequences. First, ties are broken by node id, so on equal distances a node with a smaller id pops first, which is why the trace above pops (10, D) before (10, E). Second, if the payload is an object without `__lt__` (a dataclass, a dict), a tie raises `TypeError: '<' not supported`, and it raises only when a tie happens, which is the kind of bug that appears in production on the one graph with two equal-cost routes. The standard defence is a counter: `heappush(heap, (dist, next(counter), node))`. That is what `networkx.single_source_dijkstra` does inside `_dijkstra_multisource` (`itertools.count()` as the second field), and it also raises `ValueError("Contradictory paths found: negative weights?")` if a settled node's distance would improve, a one-line negative-edge tripwire worth copying.

**Decrease-key and the Fibonacci heap.** With decrease-key the heap holds at most `V` entries and, using a Fibonacci heap whose decrease-key is amortised `O(1)`, the bound becomes `O(E + V log V)`. It is the bound in every textbook and the implementation in almost none, because a Fibonacci-heap node carries four pointers plus a degree and a mark bit, every operation chases pointers across the heap, and the amortised constant is large. On road graphs (E ≈ 2.5V) the `E log V` and `E + V log V` terms are within a small factor of each other and the binary heap's cache behaviour wins. SciPy's `scipy.sparse.csgraph.dijkstra` shows the trade in one release: up to SciPy 1.15 it used a Cython Fibonacci heap, and [SciPy 1.16](https://docs.scipy.org/doc/scipy/release/1.16.0-notes.html) (2025) replaced it with C++'s `std::priority_queue`, a binary heap with exactly the lazy stale-entry check above, as a speed-up. It runs over a CSR matrix (three flat arrays: `indptr`, `indices`, `data`), which is why it is the right call from Python when the graph has millions of edges: the Python-level loop disappears and the memory drops by an order of magnitude (see the numbers below). It warns rather than refusing on negative weights, so the check is still yours.

**Routers.** An OSPF or IS-IS router reruns Dijkstra from itself whenever a link-state advertisement changes its area's graph, and two engineering details matter more than the algorithm. SPF is *throttled*: a flapping link would otherwise trigger a recomputation per flap, so routers delay the first run and back off under sustained churn; the standardised back-off in [RFC 8405](https://www.rfc-editor.org/rfc/rfc8405.html) suggests 50 ms, then 200 ms, then 5 s (vendor defaults differ and all are configurable). And *incremental SPF* recomputes only the part of the shortest-path tree below the changed link. Areas are kept small enough that a full SPF is cheap, so convergence time is dominated by these deliberate delays and by flooding the advertisement, not by running the algorithm. The [routing algorithms lesson](/learn/networking/network-algorithms/routing-algorithms) covers the protocol side.

## Costs with real numbers

Take a continental road network: on the order of `V = 10⁷` intersections and `E = 2.5 × 10⁷` directed road segments (the [DIMACS benchmark](https://www.diag.uniroma1.it/challenge9/download.shtml) graph of the full USA has 23.9 million nodes and 58.3 million arcs, so this is the right order of magnitude, on the small side).

- **Heap work.** Lazy deletion does at most `E` pushes and `E` pops, each `O(log E)` with `log₂(2.5 × 10⁷) ≈ 25`, so roughly `2 × 2.5 × 10⁷ × 25 ≈ 1.2 × 10⁹` sift comparisons for a full single-source run. A tuned C implementation over CSR arrays does that in a few seconds; a pure-Python loop pays about a microsecond per heap operation plus per-edge interpreter overhead and lands in the minutes. Neither is acceptable for an interactive query, which is why route planners precompute (OSRM ships contraction hierarchies and multi-level Dijkstra, so a query settles a tiny fraction of the graph) or use A* with landmarks.
- **Adjacency memory in Python.** A list of lists of `(v, w)` tuples costs, per edge, a 56-byte tuple (64 bytes from CPython 3.14, which caches the hash), an 8-byte list slot, and a 28-byte `int` for any weight or id above 256: roughly 90–100 bytes. For `2.5 × 10⁷` edges that is about 2.4 GB before the heap is allocated. CSR with `int32` neighbour ids and `float32` weights is 8 bytes per edge, 200 MB, plus `4(V + 1)` bytes of offsets.
- **Distance table.** A Python list of floats is 8 bytes of pointer plus a 24-byte float object per node, 32 bytes; a NumPy `float64` array is 8. For `10⁷` nodes: 320 MB versus 80 MB.
- **Early exit saves a fraction, not an order.** Stopping when the target pops settles only the nodes closer than the target. For a query across a city inside a continent-sized graph that is a small fraction; for a query across the continent it is most of the graph, and the search still expands a disc of radius `dist(target)` around the source. Bidirectional search cuts that disc to two half-size discs (about half the nodes in a road-like graph), and A* shapes it into an ellipse pointing at the goal.

## Choosing the variant

| Variant | Time | Extra memory | Requires | Wins when | Loses when |
|---|---|---|---|---|---|
| Binary heap, lazy deletion | `O((V + E) log V)` | up to `E` heap entries | non-negative weights | sparse graphs, the default | dense graphs (log factor is overhead) |
| Array scan (no heap) | `O(V²)` | `O(V)` | non-negative weights | dense graphs, `E ≈ V²`, adjacency matrix | sparse graphs with large `V` |
| Indexed heap, decrease-key | `O((V + E) log V)` | `V` heap entries + position map | non-negative weights | memory-bound graphs with many improving relaxations | code size; slower constants than lazy deletion |
| 0-1 BFS (deque) | `O(V + E)` | `O(V)` | weights in `{0, 1}` | grids, "knock down k walls", state graphs with free moves | any other weight |
| Dial's buckets | `O(V·C + E)` | `C + 1` buckets | integer weights ≤ `C` | small integer costs (hop counts, link metrics) | large or real-valued weights |
| A* | `≤` Dijkstra's expansions | `O(V)` | admissible heuristic | one target with a good lower bound (geometry, landmarks) | no usable heuristic, all-targets queries |

## Failure modes

**Symptom: distances are wrong, but only on some inputs.** Diagnosis: check for negative weights; a single one can put a settled node's true distance below its recorded one, and downstream nodes inherit the error. Reproduce with A→B (2), A→C (5), C→B (−4): B settles at 2, then C's relaxation finds 1 but B is already settled (with settle-on-pop, the (1, B) entry is popped and skipped). Fix: assert `w >= 0` when building the adjacency list, or add networkx's tripwire (raise when a settled node would improve), and use [Bellman-Ford](/learn/algorithms/graph-algorithms/bellman-ford-and-floyd-warshall) or Johnson's reweighting if negatives are legitimate.

**Symptom: every node reports a huge negative distance, or the program panics on the first relaxation.** Diagnosis: `INF + w` overflowed. In Python `float('inf') + 5` is still infinity, but in Rust, Go, Java or C with `i32::MAX` or `i64::MAX` as infinity the addition wraps (C calls signed overflow undefined behaviour; Rust debug builds panic), and the wrapped negative value is smaller than everything so it wins every comparison. Fix: skip the relaxation when `dist[u]` is infinite, use `saturating_add`, or pick `INF = MAX / 2` and bound the weights so that `INF + w` cannot wrap. The [numbers lesson](/learn/foundations/how-code-runs/numbers-strings-unicode) has the arithmetic rules.

**Symptom: wrong distances after "optimising" with a visited set.** Diagnosis: the set is checked at push time. On A→B (4), A→C (2), C→B (1), B is marked when A pushes it, so C's improvement to 3 is refused and B keeps 4. Fix: mark on pop, or compare `d` with `dist[u]`, and keep pushing improvements regardless of what is already in the heap.

**Symptom: memory grows far beyond `V` entries and the run slows down late in the search.** Diagnosis: count pushes; on graphs where most nodes are relaxed many times before settling (dense graphs, or edge lists ordered so that expensive edges are seen first) the lazy heap accumulates one stale entry per improvement and can approach `E` entries. Fix: on dense graphs switch to the array scan; on sparse graphs with heavy churn use an indexed heap with decrease-key, which caps the heap at `V`.

**Symptom: two runs of the same query return different paths, and equality tests on `dist` fail.** Diagnosis: floating-point weights. Summing `0.1`-style metres along a 300-edge path accumulates rounding error around `10⁻¹³`, so two routes of "equal" cost compare unequal, and the winner depends on edge order. Fix: store integer weights (centimetres, microseconds), or compare with a tolerance and break ties deterministically (by node id) so the output is reproducible.

## Interviewer follow-ups

**"Return the path, not only the distance."** Model answer: store `prev[v] = u` on every successful relaxation and walk back from the target; `prev` always points along a shortest path because it is only rewritten on a strict improvement. Common wrong answer: keep the whole path inside each heap entry, which makes every push `O(V)` and turns the algorithm into `O(EV)`.

**"How would you stop a bidirectional Dijkstra?"** Model answer: run one search from the source and one from the target on the reversed graph, and stop when the sum of the two heap tops is at least the best `dist_f[x] + dist_b[x]` seen at any node `x` touched by both. The common wrong answer is "stop when the frontiers touch", which is wrong because the first meeting node is not necessarily on the cheapest path; the correct answer can be found through a node that neither side has settled yet.

**"The weights are all 1. What changes?"** Model answer: the heap is unnecessary; BFS gives the same order at `O(V + E)`, because a FIFO queue already pops nodes in non-decreasing distance when every edge costs the same. Common wrong answer: "Dijkstra still works, so nothing changes", which is true and also the answer that gets you asked why you did not notice.

**"Why do you not use a Fibonacci heap for the better bound?"** Model answer: `O(E + V log V)` beats `O(E log V)` only when `E` is much larger than `V`, and the constant is dominated by pointer chasing across a structure with four pointers per node; on sparse real graphs the binary heap with lazy deletion wins in wall-clock time, and the real speedups come from preprocessing (contraction hierarchies, landmarks), not from the heap. Common wrong answer: quoting the bound as if it were the reason to choose the structure.

**"The graph is too big for one machine."** Model answer: single-source shortest path parallelises badly because settling is inherently sequential; the practical answers are delta-stepping (Meyer and Sanders' bucketed relaxation with limited parallelism, the GAP benchmark suite's reference SSSP), or precomputation that makes each query touch a tiny part of the graph. Common wrong answer: "shard the graph and run Dijkstra per shard", which produces wrong distances for any path that crosses a shard boundary.

## What mid-level engineers get wrong

- **Marking visited on push.** Silent wrong answers on any graph where a node's first-discovered path is not its cheapest. The trace above fails at pop 2.
- **Treating the stale check as the correctness fix.** It is a performance guard; the correctness comes from settling on pop. Confusing the two leads to the visited-on-push bug in the next refactor.
- **Using Dijkstra with an edge-count or resource constraint.** "At most k stops" or "fuel tank of size F" invalidates "settled means final" for a node; the state must include the constraint (see [Cheapest Flights](/practice/cheapest-flights-k-stops)).
- **Reaching for the heap on a complete graph.** "Connect all the points" or an all-pairs distance matrix with `E ≈ V²` is `O(V²)` with an array scan and `O(V² log V)` with a heap, and the heap version allocates `V²` tuples.
- **Assuming the heap holds `V` entries.** With lazy deletion it holds up to `E`, which matters when `E` is `10⁸` and each entry is a 56- or 64-byte tuple.
- **Not noticing that the cost function is `max`, not `+`.** Bottleneck-path questions are Dijkstra with a different relaxation, and the proof carries over because `max` is monotone; rewriting the problem as binary search plus BFS works but is `O((V + E) log W)` for no benefit.

## Exercises

```exercise
id: dijkstra-distances
title: Dijkstra with lazy deletion
prompt: |
  Implement `dijkstra(n, edges, src)`. Nodes are `0..n-1`; `edges` is a list of
  directed `[u, v, w]` triples with `w >= 0` (parallel edges are allowed).
  Return a list `dist` where `dist[v]` is the cost of the cheapest path from
  `src` to `v`, or `-1` if `v` is unreachable.

  Use a binary heap with lazy deletion (skip stale entries on pop). Aim for
  O((V + E) log V).
languages: [python, javascript]
entry: dijkstra
starter:
  python: |
    import heapq

    def dijkstra(n, edges, src):
        # build an adjacency list, then relax from a heap of (dist, node)
        return []
  javascript: |
    // No built-in heap in JS: a small binary heap keyed on [dist, node] is enough.
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

    function dijkstra(n, edges, src) {
      // your code here
      return [];
    }
tests:
  - args: [6, [[0,1,4],[0,2,2],[2,1,1],[1,3,5],[2,3,8],[2,4,10],[3,4,2],[3,5,6],[4,5,3]], 0]
    expected: [0, 3, 2, 8, 10, 13]
    label: the graph from the lesson
  - args: [3, [[0,1,1]], 0]
    expected: [0, 1, -1]
    label: unreachable node
  - args: [1, [], 0]
    expected: [0]
    label: single node
  - args: [4, [[0,1,5],[0,2,1],[2,1,1],[1,3,1],[2,3,10]], 0]
    expected: [0, 2, 1, 3]
    label: the direct edge is not the cheapest
  - args: [2, [[0,1,7],[0,1,3]], 0]
    expected: [0, 3]
    label: parallel edges
  - args: [5, [[0,1,10],[0,3,5],[1,2,1],[1,3,2],[3,1,3],[3,2,9],[3,4,2],[4,0,7],[4,2,6],[2,4,4]], 0]
    expected: [0, 8, 9, 5, 7]
    hidden: true
  - args: [3, [[1,0,2],[0,2,2]], 1]
    expected: [2, 0, 4]
    hidden: true
    label: source is not node 0
hints:
  - "Initialise `dist` to infinity, `dist[src] = 0`, and push `(0, src)`."
  - "On pop, `if d > dist[u]: continue` skips entries that a later, better push made stale."
  - "Convert infinity to -1 only when building the return value."
```

```exercise
id: zero-one-bfs-walls
title: 0-1 BFS through walls
prompt: |
  `grid` is a rectangular matrix of `0` (open) and `1` (wall). You start at the
  top-left cell (always `0`) and move up/down/left/right. Entering a wall cell
  costs 1; entering an open cell costs 0. Return the minimum number of walls
  you must pass through to reach the bottom-right cell.

  Use a deque (0-1 BFS): push the neighbour to the front for a cost-0 move and
  to the back for a cost-1 move. Aim for O(rows × cols).
languages: [python, javascript]
entry: min_walls
starter:
  python: |
    from collections import deque

    def min_walls(grid):
        # dist[r][c] = fewest walls to reach (r, c); deque holds (r, c)
        return 0
  javascript: |
    function min_walls(grid) {
      // JS has no deque; a plain array with unshift/push is fine for these sizes,
      // or keep two arrays (current level, next level).
      return 0;
    }
tests:
  - args: [[[0,1,0],[0,1,0],[0,0,0]]]
    expected: 0
    label: walk around the wall
  - args: [[[0,1],[1,0]]]
    expected: 1
  - args: [[[0]]]
    expected: 0
    label: single cell
  - args: [[[0,1,1],[1,1,1],[1,1,0]]]
    expected: 3
    label: every route crosses three walls
  - args: [[[0,1,0],[1,1,0],[0,0,0]]]
    expected: 1
    hidden: true
  - args: [[[0,1,1,0]]]
    expected: 2
    hidden: true
    label: single row
  - args: [[[0,1,1,1,0],[0,0,0,1,0],[1,1,0,1,0],[0,0,0,0,0]]]
    expected: 0
    hidden: true
hints:
  - "The cost of a move is the value of the cell you enter, so `grid[nr][nc]` is the edge weight."
  - "Relax exactly like Dijkstra (`if dist[r][c] + w < dist[nr][nc]`); only the container changes."
  - "Cost-0 neighbours go to the front of the deque so they are processed before anything at distance d + 1."
```

## Senior signals

- You state the invariant ("a popped node's distance is final") and can point to the exact line of the proof that fails with negative weights, and you can run that proof on a concrete cut of a concrete graph.
- You settle nodes on **pop**, never on push, and you can explain why a visited-on-push check silently returns wrong distances.
- You know lazy deletion is what real code uses instead of decrease-key, that the stale check is a performance guard rather than a correctness guard, that the heap can grow to `E` entries, and that the `O(V²)` array version wins on dense graphs.
- You add a counter to heap tuples so that ties never compare payloads, and you know that networkx does the same and raises on a settled node improving.
- You recognise Dijkstra as an algorithm for any monotone path cost (`max` for bottleneck paths, not only `+`), and you recognise when a constraint such as "at most k stops" breaks the invariant.
- You reach for 0-1 BFS or bucket queues when weights are small integers, and you can say what that buys: `O(V + E)` instead of `O(E log V)`.
- You can put numbers on a continental road graph (about `10⁷` nodes, `2.5 × 10⁷` edges, around `10⁹` heap comparisons, gigabytes in Python versus hundreds of megabytes in CSR) and explain why map services precompute rather than run the plain algorithm.
- You know where Dijkstra actually runs (OSPF and IS-IS with throttled and incremental SPF, `scipy.sparse.csgraph` in compiled code over CSR) and what breaks it in each place: negative weights, integer overflow of `INF + w`, floating-point ties.

## Check yourself

```quiz
- q: >-
    In the heap implementation, a node's tentative distance is improved twice before it is popped. What is in the heap afterwards, and what happens to the extra entries?
  options: ["Two entries; both are expanded and the second fixes the first", "Two entries; the stale one is skipped when it is popped", "One entry; the heap updates the existing entry in place", "Two entries; this is a bug that only decrease-key avoids"]
  answer: 1
  explanation: >-
    Lazy deletion pushes a fresh entry on every improvement and leaves the old one in place; Python's heapq has no in-place update. When the stale entry is popped, its stored distance is larger than dist[node], so it is skipped. Processing it would not be wrong, only wasted work, which is why the check is a performance guard rather than a correctness fix.
- q: >-
    You mark a node as visited when you push it to the heap and refuse to push it again. On the graph A→B (4), A→C (2), C→B (1), what does the algorithm report for B?
  options: ["1, because only the last edge C→B is kept for B", "4, because the improvement via C is discarded", "3, because the heap re-sorts B when C improves it", "No value; the refused duplicate push raises an error"]
  answer: 1
  explanation: >-
    A pushes B with 4 and marks it visited. When C is popped and finds a path to B of cost 3, B is already visited so the push is refused, and nothing re-sorts B's old entry. Settling must happen on pop; a push-time visited check throws away improvements.
- q: >-
    Which of these problems is NOT solved correctly by plain Dijkstra with non-negative weights?
  options: ["Shortest path with early exit when the target is popped", "Path minimising the maximum edge weight (bottleneck path)", "Shortest path from several sources at once", "Cheapest path that uses at most k edges from the source"]
  answer: 3
  explanation: >-
    An edge-count limit means the cheapest way into a node may be disqualified, so 'settled = final' no longer holds per node. You need state (node, edges used) or k+1 rounds of Bellman-Ford. Bottleneck paths work because max is monotone; multi-source works by seeding several zeros; early exit on pop is safe because popped means settled.
- q: >-
    A graph has 10,000 nodes and roughly 50 million edges. Which Dijkstra variant is the better choice, and why?
  options: ["Array scan, because with E ≈ V² the log factor is overhead", "Bellman-Ford, because dense graphs favour edge-list scans", "Heap version, because O((V+E) log V) always beats O(V²)", "0-1 BFS, because O(V+E) beats both of the Dijkstra variants"]
  answer: 0
  explanation: >-
    With E ≈ V²/2 the graph is dense; the heap does O(E log V) ≈ 50M × 13 operations and can hold tens of millions of tuples, while the array version does O(V²) = 100M simple scans with no heap overhead. The heap bound only wins when E is well below V². 0-1 BFS requires weights in {0,1}, which was not given, and Bellman-Ford's O(VE) is far worse.
- q: >-
    Why does a deque give the same processing order as a heap when all edge weights are 0 or 1?
  options: ["Because it only ever holds distances d and d+1, in order", "Because 0-weight edges never change any distance", "It doesn't; 0-1 BFS only approximates the heap order", "Because the deque is re-sorted after every insertion"]
  answer: 0
  explanation: >-
    Pushing cost-0 neighbours to the front and cost-1 neighbours to the back keeps the deque monotone with at most two distinct distances, d at the front and d+1 at the back. The front is always a smallest tentative distance, which is exactly what the heap guaranteed, at O(1) per operation and with no sorting.
- q: >-
    A Rust port of the lesson's code uses `i32::MAX` as infinity and returns wildly negative distances for every node. What happened, and what is the fix?
  options: ["INF + w wrapped around; skip infinite tails or use saturating_add", "Negative edges crept in; switch to Bellman-Ford for this graph", "Stale entries were expanded; add the d > dist[u] guard on pop", "The heap compared node ids on ties; add a counter to each entry"]
  answer: 0
  explanation: >-
    Adding a positive weight to i32::MAX wraps to a large negative number in release builds, and that value is smaller than every real distance so it wins every comparison. Python hides this because float infinity absorbs additions. Guard the relaxation when dist[u] is infinite, use saturating_add, or choose INF = MAX / 2 with bounded weights. The other options describe real bugs with different symptoms: wrong but finite distances, a TypeError on ties, or wasted work.
```

