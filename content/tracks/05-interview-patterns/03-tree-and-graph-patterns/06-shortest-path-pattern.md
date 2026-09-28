---
slug: shortest-path-pattern
title: "Shortest path: Dijkstra, k-round Bellman-Ford, 0-1 BFS and the minimax variant"
description: Recognise weighted-distance problems and pick the cheapest correct relaxation algorithm, with Network Delay Time, Cheapest Flights Within K Stops and Swim in Rising Water traced heap pop by heap pop, a 0-1 BFS deque trace, and the stale-entry costs measured.
minutes: 45
difficulty: hard
tags: [graph, dijkstra, bellman-ford, shortest-path, heap, minimax, 0-1-bfs, pattern:shortest-path]
problems: [network-delay-time, cheapest-flights-k-stops, min-cost-connect-points, swim-in-rising-water, reconstruct-itinerary]
---
Edges now have weights: a network hop takes 3 ms, a flight costs 400, crossing a cell takes as long as its height. BFS counts edges, and counting edges is wrong the moment one edge is worth more than another. "What is the cheapest way from here to there" needs an algorithm that tracks the *best known cost* to every node and improves it as cheaper routes appear. That improvement, `if dist[u] + w < dist[v]: dist[v] = dist[u] + w`, is called relaxation, and every shortest-path algorithm is a policy for which edge to relax next.

Dijkstra relaxes from the cheapest unsettled node, which is correct when weights are non-negative. Bellman-Ford relaxes every edge in rounds, which handles negative weights and, more usefully in interviews, bounds the number of edges in a path. 0-1 BFS replaces the heap with a deque when weights are 0 or 1. And the "minimax" problems are Dijkstra with `+` replaced by `max`. The algorithms and their proofs live in [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) and [Bellman-Ford and Floyd-Warshall](/learn/algorithms/graph-algorithms/bellman-ford-and-floyd-warshall); this lesson is about choosing the cheapest correct rung of the ladder and executing it without the four bugs that cost the round.

## The signal

Reach for a shortest-path algorithm when the statement contains any of these:

- **"Minimum time / cost / distance" over weighted edges**, weights non-negative: Dijkstra. [Network Delay Time](/practice/network-delay-time) is the canonical single-source form.
- **"At most `k` stops / edges / transfers"** on top of a cost ([Cheapest Flights Within K Stops](/practice/cheapest-flights-k-stops)): the bound breaks Dijkstra's settle-on-pop invariant; use `k + 1` rounds of Bellman-Ford, or Dijkstra over `(cost, node, edges used)` states.
- **"Minimise the maximum edge or cell along the path"**, "the earliest time a route exists" ([Swim in Rising Water](/practice/swim-in-rising-water)): minimax Dijkstra, or binary search on the answer plus BFS.
- **Weights that are only 0 or 1** ("walking is free, breaking a wall costs 1"): 0-1 BFS with a deque.
- **"Connect all points with minimum total cost"** ([Min Cost to Connect Points](/practice/min-cost-connect-points)): a spanning tree, not a path, run with the same heap-or-array machinery as Prim's algorithm.
- **Negative weights**, or "detect an arbitrage": Bellman-Ford, and say why Dijkstra fails.

What rules it out:

- **Every edge costs the same**: BFS, `O(V + E)`, no heap. See [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal).
- **The graph is a DAG**: one pass in topological order relaxes everything, negative weights included. See [Topological sort](/learn/interview-patterns/tree-and-graph-patterns/topological-sort-pattern).
- **Use every edge exactly once** ([Reconstruct Itinerary](/practice/reconstruct-itinerary)): an Eulerian path, Hierholzer's algorithm, nothing minimised.

| Rung | Weights allowed | Structure | Time | Choose when |
|---|---|---|---|---|
| BFS | all equal | queue | `O(V + E)` | unweighted, fewest steps |
| 0-1 BFS | 0 or 1 | deque | `O(V + E)` | free moves plus unit-cost moves |
| DAG relaxation | any, even negative | topological order | `O(V + E)` | no cycles |
| Dijkstra | non-negative | binary heap | `O((V + E) log V)` | the general weighted case |
| Bellman-Ford | any; detects negative cycles | edge list, rounds | `O(V · E)`, or `O(k · E)` for `k` rounds | negative edges, or an edge-count bound |
| Floyd-Warshall | any, no negative cycles | `V × V` matrix | `O(V³)` | all pairs, `V` up to about 400 |

### Near misses

| Statement | Looks like | Actually | The tell |
|---|---|---|---|
| "Fewest moves in a maze" | Dijkstra | BFS | Every move costs 1 |
| "Cheapest route with at most `k` stops" | Dijkstra with `dist[node]` | Bellman-Ford with `k + 1` rounds, or Dijkstra keyed on `(node, edges used)` | A pricier route with fewer edges must survive |
| "Path whose largest step is smallest" | Dijkstra summing weights | Dijkstra with `max(d, w)`, or union-find adding edges by weight until connected | The cost of a path is its worst edge |
| "Minimum total cable to connect every building" | Dijkstra from one building | Minimum spanning tree (Prim or Kruskal) | Every node must be connected; no single destination |
| "Cheapest path, some edges have negative cost, no cycles" | Bellman-Ford | Topological order plus relaxation, `O(V + E)` | The dependency structure is acyclic |
| "Shortest path visiting every one of 12 key cells" | Dijkstra | BFS or Dijkstra over `(cell, set of keys visited)` bitmask states | The node must remember which targets it has seen |

## The templates

Lazy-deletion Dijkstra: push `(distance, node)`; pop the smallest; skip a pop whose distance is stale; relax the neighbours. The skip substitutes for the decrease-key operation that neither `heapq` nor JavaScript provides.

```python
import heapq
from collections import deque

def dijkstra(n, adj, src):
    """adj[u] = list of (v, w), w >= 0. Returns dist, inf where unreachable."""
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue                      # stale: u improved after this push
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(heap, (nd, v))   # one push per improvement
    return dist


def bellman_ford_k(n, edges, src, dst, k_edges):
    """Cheapest path using at most k_edges edges. edges = (u, v, w)."""
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    for _ in range(k_edges):
        nxt = dist[:]                     # relax from the PREVIOUS round only
        for u, v, w in edges:
            if dist[u] + w < nxt[v]:
                nxt[v] = dist[u] + w
        dist = nxt
    return dist[dst]


def zero_one_bfs(n, adj, src):
    """adj[u] = list of (v, w) with w in {0, 1}."""
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    dq = deque([src])
    while dq:
        u = dq.popleft()
        for v, w in adj[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                if w == 0:
                    dq.appendleft(v)      # same distance: goes before everything
                else:
                    dq.append(v)          # distance + 1: goes to the back
    return dist
```

```javascript
// JS has no priority queue: a minimal binary heap of [key, value] pairs.
class MinHeap {
  constructor() { this.a = []; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top; }
  get size() { return this.a.length; }
}

function dijkstra(n, adj, src) {
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  const heap = new MinHeap();
  heap.push([0, src]);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]) continue;                 // stale entry
    for (const [v, w] of adj[u]) {
      const nd = d + w;
      if (nd < dist[v]) { dist[v] = nd; heap.push([nd, v]); }
    }
  }
  return dist;
}

function zeroOneBfs(n, adj, src) {
  const dist = new Array(n).fill(Infinity);
  dist[src] = 0;
  const cap = 2 * n + 1;                       // each node enters at most twice
  const buf = new Int32Array(cap);
  let head = 0, size = 0;
  const pushFront = (x) => { head = (head - 1 + cap) % cap; buf[head] = x; size++; };
  const pushBack = (x) => { buf[(head + size) % cap] = x; size++; };
  pushBack(src);
  while (size) {
    const u = buf[head]; head = (head + 1) % cap; size--;
    for (const [v, w] of adj[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        if (w === 0) pushFront(v); else pushBack(v);
      }
    }
  }
  return dist;
}
```

Watch Dijkstra settle nodes in distance order, then Bellman-Ford's rounds:

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": true, "start": "A", "goal": "E", "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}], "edges": [{"from": "A", "to": "B", "w": 4}, {"from": "A", "to": "C", "w": 1}, {"from": "C", "to": "B", "w": 2}, {"from": "B", "to": "D", "w": 1}, {"from": "C", "to": "D", "w": 5}, {"from": "D", "to": "E", "w": 3}], "title": "Dijkstra with a min-heap", "caption": "The cheapest unsettled node is popped; its distance is final and its neighbours are relaxed."}
```

```viz
{"type": "graph", "algorithm": "bellman-ford", "directed": true, "start": "A", "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}], "edges": [{"from": "A", "to": "B", "w": 4}, {"from": "A", "to": "C", "w": 2}, {"from": "C", "to": "B", "w": -3}, {"from": "B", "to": "D", "w": 2}, {"from": "C", "to": "D", "w": 6}], "title": "Bellman-Ford rounds", "caption": "After round i every node has its best distance over paths of at most i edges."}
```

## Why each is correct

**Dijkstra: a non-stale pop is final.** Suppose `u` is popped with `d = dist[u]`, and some cheaper path to `u` exists. It starts at the source (settled) and must leave the settled set through some edge into an unsettled node `y`. When `y`'s predecessor was settled, `y` was relaxed, so `y` sits in the heap with a key at most that path's prefix cost. The heap popped `u` first, so `d ≤ key(y)`, and the remaining edges from `y` to `u` are non-negative, so the path costs at least `d`. Contradiction. A negative edge breaks exactly the last step.

**Lazy deletion is bounded.** Every push follows a successful relaxation, and each edge relaxes successfully at most once per pop of its tail, which happens once per node (stale pops relax nothing). So there are at most `E + 1` pushes, the heap never exceeds `E + 1` entries, and time is `O(E log E) = O(E log V)` for simple graphs, plus `O(V)` to initialise.

**Bellman-Ford: after round `i`, `dist[v]` is the cheapest path using at most `i` edges.** Round `i + 1` extends each best `i`-edge path by one edge. Reading from last round's copy is what keeps the claim true; reading values written earlier in the same round lets longer paths leak in.

**0-1 BFS is Dijkstra with a two-bucket queue.** Invariant: the deque holds distances `d` at the front and `d + 1` at the back, in order. A 0-edge produces `d` (front), a 1-edge produces `d + 1` (back), so the front is always a minimum. A node can improve at most once (from `d + 1` to `d`), so it enters the deque at most twice and the total is `O(V + E)`.

**Minimax works because `max` is monotone.** Dijkstra needs only that extending a path never lowers its cost. `max(d, w) ≥ d` holds for any weights, so Swim in Rising Water needs no non-negativity assumption at all.

## Worked problems

### Network Delay Time

[Network Delay Time](/practice/network-delay-time): nodes 1..n, directed `(u, v, w)`, signal sent from `k`. How long until every node has it, or −1?

```python
def network_delay_time(times, n, k):
    adj = [[] for _ in range(n + 1)]          # 1-indexed: slot 0 unused
    for u, v, w in times:
        adj[u].append((v, w))
    dist = dijkstra(n + 1, adj, k)
    worst = max(dist[1:])                     # skip slot 0
    return -1 if worst == float("inf") else worst
```

Trace with `n = 4`, `k = 1`, `times = [[1,2,1], [2,3,2], [1,3,4], [3,4,1], [2,4,5]]`:

| pop `(d, u)` | stale? | relaxations | `dist[1..4]` after | heap after |
|---|---|---|---|---|
| (0, 1) | no | 2 = 1, 3 = 4 | `0 1 4 ∞` | (1,2) (4,3) |
| (1, 2) | no | 3 = 3, 4 = 6 | `0 1 3 6` | (3,3) (4,3) (6,4) |
| (3, 3) | no | 4 = 4 | `0 1 3 4` | (4,3) (4,4) (6,4) |
| (4, 3) | **yes**, 4 > 3 | skipped | | (4,4) (6,4) |
| (4, 4) | no | none | | (6,4) |
| (6, 4) | **yes**, 6 > 4 | skipped | | |

Answer 4. The two stale pops are the entries a decrease-key would have updated in place. BFS on this graph gives `dist[3] = 4` (one direct hop) and answers 5.

### 0-1 BFS on a small graph

Edges S→A (1), S→B (0), B→A (0), A→T (1), B→T (1). The deque holds nodes; the table shows it before each pop.

| deque before | pop (dist) | relaxations | `dist` S, A, B, T after | deque after |
|---|---|---|---|---|
| `[S]` | S (0) | A = 1 → back; B = 0 → front | 0, 1, 0, ∞ | `[B, A]` |
| `[B, A]` | B (0) | A = 0 → front; T = 1 → back | 0, 0, 0, 1 | `[A, A, T]` |
| `[A, A, T]` | A (0) | T: 0 + 1 = 1, not better | 0, 0, 0, 1 | `[A, T]` |
| `[A, T]` | A (0), the older entry | nothing improves | 0, 0, 0, 1 | `[T]` |
| `[T]` | T (1) | none | 0, 0, 0, 1 | `[]` |

A entered twice: first at 1 via the 1-edge, then at 0 via B's 0-edge, which jumped the queue. That is the "at most twice" in the correctness argument, and the older copy relaxes nothing when it surfaces. A FIFO queue here would have popped A at distance 1 before B's free edge could improve it.

### Cheapest Flights Within K Stops

[Cheapest Flights Within K Stops](/practice/cheapest-flights-k-stops): cheapest route from `src` to `dst` with at most `k` intermediate stops, or −1.

`k` stops means `k + 1` edges, so `k + 1` rounds.

```python
def find_cheapest_price(n, flights, src, dst, k):
    ans = bellman_ford_k(n, flights, src, dst, k + 1)
    return -1 if ans == float("inf") else ans
```

Flights `0→1 (100)`, `1→2 (100)`, `2→0 (100)`, `1→3 (600)`, `2→3 (200)`, `src = 0`, `dst = 3`, `k = 1`, relaxed in that edge order:

| round | with a per-round copy (`dist[0..3]`) | relaxing in place (`dist[0..3]`) |
|---|---|---|
| start | `0 ∞ ∞ ∞` | `0 ∞ ∞ ∞` |
| 1 | `0 100 ∞ ∞` | `0 100 200 400` |
| 2 | `0 100 200 700` | `0 100 200 400` |

The copy answers 700 (0 → 1 → 3, one stop). In place, round 1 already reads `dist[1] = 100` written moments earlier, then `dist[2] = 200`, and admits the two-stop route 0 → 1 → 2 → 3 at 400: wrong for `k = 1`, right only for `k = 2`. `O(k · E)` time.

Dijkstra with one `dist` per city fails differently. On flights 0→1 (100), 1→2 (100), 0→2 (500), 2→3 (100) with `k = 1`, it improves city 2 from 500 to 200 via two edges, cannot extend that entry to 3 within the limit, then skips the 500 entry as stale, and returns −1; the one-stop route 0 → 2 → 3 at 600 is lost. Keying states on edges used fixes it (see the follow-ups).

### Swim in Rising Water

[Swim in Rising Water](/practice/swim-in-rising-water): an `n × n` grid of distinct elevations; at time `t` you may stand on cells with elevation ≤ `t`. The earliest `t` to get from top-left to bottom-right?

A path's cost is its *maximum* cell. Replace `d + w` with `max(d, w)`.

```python
def swim_in_water(grid):
    n = len(grid)
    best = [[float("inf")] * n for _ in range(n)]
    best[0][0] = grid[0][0]
    heap = [(grid[0][0], 0, 0)]
    while heap:
        t, r, c = heapq.heappop(heap)
        if (r, c) == (n - 1, n - 1):
            return t                          # first pop of the goal is optimal
        if t > best[r][c]:
            continue
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < n:
                nt = max(t, grid[nr][nc])     # minimax relaxation
                if nt < best[nr][nc]:
                    best[nr][nc] = nt
                    heapq.heappush(heap, (nt, nr, nc))
```

Trace on `[[0, 2], [1, 3]]`:

| pop `(t, cell)` | relaxations | heap after |
|---|---|---|
| (0, (0,0)) | (1,0) = max(0, 1) = 1; (0,1) = max(0, 2) = 2 | (1,(1,0)) (2,(0,1)) |
| (1, (1,0)) | (1,1) = max(1, 3) = 3; (0,0) not better | (2,(0,1)) (3,(1,1)) |
| (2, (0,1)) | (1,1): max(2, 3) = 3, not < 3 | (3,(1,1)) |
| (3, (1,1)) | goal: return 3 | |

Every route passes the 3. `O(n² log n)`. The alternative is binary search on `t` with a BFS per probe, also `O(n² log n)`; it generalises to any "is there a path under threshold `t`" question, and union-find adding cells in height order is a third route.

### Min Cost to Connect Points

[Min Cost to Connect Points](/practice/min-cost-connect-points): connect all points with Manhattan-distance edges at minimum total cost. On a complete graph, array-based Prim is `O(n²)` and beats a heap: keep `best[v]`, the cheapest edge from the tree to `v`, and repeatedly add the cheapest outside point.

Points `[[0,0], [2,2], [3,10], [5,2], [7,0]]`:

| step | add point | `best` for points 0..4 after (– = in tree) | total |
|---|---|---|---|
| 1 | 0 | – 4 13 7 7 | 0 |
| 2 | 1 (cost 4) | – – 9 3 7 | 4 |
| 3 | 3 (cost 3) | – – 9 – 4 | 7 |
| 4 | 4 (cost 4) | – – 9 – – | 11 |
| 5 | 2 (cost 9) | – – – – – | 20 |

Answer 20. The heap version pushes up to `n²` edges, 4 million at `n = 2,000`; Kruskal sorts them first. See [Minimum spanning trees](/learn/algorithms/graph-algorithms/minimum-spanning-trees).

## Variations

| Variant | Change to the template | Why it stays correct |
|---|---|---|
| Path reconstruction | `prev[v] = u` on each successful relaxation | the last write is the final predecessor |
| Early exit at the goal | return when `dst` is popped non-stale | settle-on-pop |
| Widest path / most reliable path | `min` and a max-heap (negate) | `min` is monotone the other way |
| Multi-source | push every source at distance 0 | a virtual super-source |
| `k`-edge bound | Bellman-Ford rounds, or states `(node, edges)` | the round invariant |
| Negative cycle detection | run a `V`-th round; any relaxation means a reachable cycle | a shortest simple path has at most `V − 1` edges |
| A\* | heap key `d + h(v)`, `h` admissible and consistent | a potential-shifted Dijkstra |
| Eulerian path (Reconstruct Itinerary) | Hierholzer: append a node when its tickets run out, reverse | every edge used once |

**Reconstruct Itinerary is not a shortest path.** Tickets `JFK→KUL`, `JFK→NRT`, `NRT→JFK`, smallest lexical order first. A greedy DFS flies JFK → KUL and is stuck with tickets unused. Hierholzer's stack-based walk appends a node to the route only when it has no tickets left:

| step | stack | route (reversed) |
|---|---|---|
| fly JFK → KUL | JFK, KUL | |
| KUL has no tickets | JFK | KUL |
| fly JFK → NRT → JFK | JFK, NRT, JFK | KUL |
| unwind | | KUL, JFK, NRT, JFK |

Reversed: JFK, NRT, JFK, KUL. The dead end was appended first, so it ends up last.

## Under the hood

**`heapq` is a binary heap in a Python list.** `heappush` appends and sifts up, `heappop` moves the last element to the root and sifts down; both `O(log n)` comparisons done in C. Entries compare as tuples, so on equal distances the *node* is compared next: integers are fine, but `(d, node_object)` raises `TypeError` on a tie. Use `(d, id, node)` with a counter or an integer id.

**Stale entries, measured.** On a random directed graph with `V = 10⁵`, `E = 10⁶` and weights 1..100, CPython 3.14 Dijkstra made 195,997 pushes, of which 96,003 surfaced as stale pops, and the heap peaked at 124,199 entries; the run took about 380 ms. Each `(int, int)` tuple in a heap costs about 135 bytes once the tuple, its two ints and the list slot are counted, so that peak is roughly 17 MB. Dropping the `d > dist[u]` check keeps the answers correct but re-scans the edges of every stale node: on the same graph 1.96 million edge scans instead of 1.0 million (600 ms), and on a dense graph (`V = 2,000`, `E = 10⁶`) 4.45 million instead of 1.0 million, 820 ms against 190 ms.

**Decrease-key is not worth it here.** An indexed heap updates an entry in place and keeps the heap at `V` entries ([Indexed heaps and decrease-key](/learn/data-structures/heaps/indexed-heaps-and-decrease-key)), and Fibonacci heaps improve the bound to `O(E + V log V)`. Both carry larger constants; with `heapq` running in C, lazy deletion is the faster choice in CPython at interview sizes.

**The rung you choose, measured.** Same `V = 10⁵`, `E = 10⁶` graph with every weight set to 1: BFS 119 ms against Dijkstra 213 ms. With random 0/1 weights: 0-1 BFS 249 ms against Dijkstra 272 ms, a small gap in CPython because the relaxation loop, not the C-implemented heap, dominates. In Node 24 the same Dijkstra with the hand-written heap ran in about 200 ms. The asymptotic argument for BFS and 0-1 BFS is real; the constant-factor win in Python is 1.1 to 1.8 times.

**Infinity.** `float("inf")` and `Infinity` absorb additions (`inf + 5` is `inf`), so `nd < dist[v]` is false when `d` is unreachable. A sentinel like `10**9` or `Number.MAX_SAFE_INTEGER` can overflow in typed arrays or other languages and produce a "shorter" negative path.

## Failure modes

**Symptom: answers are too large on weighted inputs, correct on unit weights.** Diagnosis: BFS order with weights added (`dist[v] = dist[u] + w` in a FIFO queue); a node is finalised by the path with the fewest edges. Fix: a heap, or a deque only when weights are 0/1.

**Symptom: some distances too large, no crash.** Diagnosis: nodes marked visited when *pushed* (the BFS habit). On the Network Delay graph node 3 is fixed at 4 by the direct edge and never improved to 3, so the answer becomes 6. Fix: settle on pop; guard pushes with `nd < dist[v]` only.

**Symptom: fine on sparse tests, time limit on a dense hidden test.** Diagnosis: no stale check; measured above at 4.4 times the edge scans on a graph with average degree 500. Fix: `if d > dist[u]: continue`.

**Symptom: K Stops returns a fare that is too cheap.** Diagnosis: Bellman-Ford rounds relaxed in place, so a later edge in a round reads a value written earlier in the same round. (The opposite off-by-one, `k` rounds instead of `k + 1`, makes fares too expensive or −1.) Fix: copy per round, and write "k stops = k + 1 edges" in a comment.

**Symptom: Dijkstra with early exit returns 3 where the true cost is 2.** Diagnosis: a negative edge. Edges S→A (2), S→B (4), B→A (−3), A→T (1): Dijkstra pops A at 2, relaxes T to 3, pops T at 3 and returns before B is ever expanded; the real path S → B → A → T costs 2. Fix: Bellman-Ford, or DAG relaxation if acyclic.

## Interviewer follow-ups

**"Return the path, not only the cost."** Model answer: `prev[v] = u` on every successful relaxation, walk back from `dst`, reverse; `O(V)` extra. On the Network Delay trace the writes are `prev[2] = 1`, `prev[3] = 1` then overwritten to 2, `prev[4] = 2` then overwritten to 3, so the path to 4 is 4 → 3 → 2 → 1, reversed 1 → 2 → 3 → 4, cost 4. Common wrong answer: storing the whole path in each heap entry, which copies a list per push.

**"Solve K Stops with Dijkstra."** Model answer: states `(cost, node, edges)`; skip a pop when that node was already popped (more cheaply) with no more edges; push only while `edges ≤ k`. Time `O(k · E log(k · E))` in the worst case.

```python
def cheapest_k_stops_dijkstra(n, flights, src, dst, k):
    adj = [[] for _ in range(n)]
    for u, v, w in flights:
        adj[u].append((v, w))
    fewest = [float("inf")] * n               # fewest edges among earlier, cheaper pops
    heap = [(0, src, 0)]                      # (cost, node, edges used)
    while heap:
        cost, u, e = heapq.heappop(heap)
        if u == dst:
            return cost
        if e >= fewest[u]:
            continue                          # dominated: cheaper and no longer seen already
        fewest[u] = e
        if e <= k:                            # k stops = k + 1 edges
            for v, w in adj[u]:
                heapq.heappush(heap, (cost + w, v, e + 1))
    return -1
```

Common wrong answer: Dijkstra with one `dist` per node plus a stops counter, which prunes the pricier-but-shorter route.

**"Some edges are negative."** Model answer: Dijkstra's proof needs non-negative extensions; use Bellman-Ford (`O(V · E)`), or topological relaxation if the graph is a DAG, and a `V`-th round to detect a negative cycle. Common wrong answer: "add a constant to every weight", which penalises paths with more edges and changes the answer.

**"It's a road network with 10⁷ nodes and you answer millions of queries."** Model answer: plain Dijkstra explores a large part of the graph per query, on the order of seconds each even in compiled code; bidirectional search roughly halves the explored radius, A\* with a distance lower bound focuses it, and production routers precompute shortcuts (contraction hierarchies) so a query settles on the order of hundreds to thousands of nodes. See [A\* and heuristic search](/learn/algorithms/graph-algorithms/a-star-and-heuristic-search). Common wrong answer: "Floyd-Warshall once and look up", which is 10¹⁴ table entries.

**"All pairs, 400 nodes."** Model answer: Floyd-Warshall is `400³ = 6.4 × 10⁷` relaxations, measured at 2.6 s in CPython 3.14 and 40 ms in Node 24 with typed rows; or `V` Dijkstra runs if the graph is sparse. Common wrong answer: `V` Bellman-Ford runs, `O(V² · E)`.

## What mid-level engineers get wrong

- **Proposing Dijkstra without stating "non-negative weights"**, and being unable to produce the three-edge counterexample.
- **Using Dijkstra where BFS or 0-1 BFS suffices**, which reads as not knowing the ladder.
- **Writing `visited.add(v)` at push time** out of BFS habit.
- **Treating `k` stops as `k` edges.**
- **Forgetting that JavaScript has no priority queue**, then losing ten minutes; have the 20-line heap ready, or a sorted-array fallback for tiny inputs.
- **Pushing `(d, node)` where `node` is an object**, which crashes on the first tie.
- **Answering Reconstruct Itinerary with a greedy lexical DFS** that strands tickets in a dead end.

## Exercises

```exercise
id: network-delay-dijkstra
title: Network delay time
prompt: |
  There are `n` nodes labelled 1 to n. `times` is a list of `[u, v, w]`
  entries meaning a signal sent from `u` arrives at `v` after `w` time
  units (directed). A signal is broadcast from node `k`. Return the time
  at which every node has received it, or -1 if some node never does.

  Use Dijkstra with a min-heap and lazy deletion. Weights are non-negative
  and there may be parallel edges.
languages: [python, javascript]
entry: network_delay
starter:
  python: |
    import heapq

    def network_delay(n, times, k):
        # your code here
        return -1
  javascript: |
    function network_delay(n, times, k) {
      // your code here (you will need a small heap or a sorted structure)
      return -1;
    }
tests:
  - args: [4, [[2, 1, 1], [2, 3, 1], [3, 4, 1]], 2]
    expected: 2
  - args: [2, [[1, 2, 1]], 1]
    expected: 1
  - args: [2, [[1, 2, 1]], 2]
    expected: -1
    label: node 1 is unreachable from 2
  - args: [1, [], 1]
    expected: 0
    label: single node, already delivered
  - args: [3, [[1, 2, 5], [1, 3, 1], [3, 2, 1]], 1]
    expected: 2
    label: the indirect route beats the direct edge
  - args: [3, [[1, 2, 10], [1, 2, 3], [2, 3, 1]], 1]
    expected: 4
    hidden: true
    label: parallel edges
  - args: [5, [[1, 2, 2], [1, 3, 4], [2, 3, 1], [3, 4, 3], [2, 4, 7]], 1]
    expected: -1
    hidden: true
    label: node 5 never receives the signal
  - args: [4, [[1, 2, 1], [2, 3, 2], [1, 3, 4], [3, 4, 1], [2, 4, 5]], 1]
    expected: 4
    hidden: true
hints:
  - "Build adjacency lists indexed 1..n, set dist[k] = 0 and push (0, k)."
  - "When you pop (d, u), skip it if d is greater than dist[u]; that entry is stale."
  - "The answer is the maximum of dist over nodes 1..n, or -1 if any is still infinite."
```

```exercise
id: min-obstacle-removal
title: Fewest walls to break (0-1 BFS)
prompt: |
  `grid` is a list of rows of 0 (empty) and 1 (wall). You start at the
  top-left cell and want to reach the bottom-right cell, moving up, down,
  left or right. Entering a wall cell means breaking it, which costs 1;
  entering an empty cell costs 0. Both corners are always empty. Return the
  minimum number of walls you must break.

  Use 0-1 BFS: a deque where a 0-cost move goes to the front and a 1-cost
  move goes to the back.
languages: [python, javascript]
entry: min_obstacles
starter:
  python: |
    from collections import deque

    def min_obstacles(grid):
        # your code here
        return 0
  javascript: |
    function min_obstacles(grid) {
      // your code here
      return 0;
    }
tests:
  - args: [[[0, 1, 1], [1, 1, 0], [1, 1, 0]]]
    expected: 2
  - args: [[[0, 1, 0, 0, 0], [0, 1, 0, 1, 0], [0, 0, 0, 1, 0]]]
    expected: 0
    label: a free path exists around the walls
  - args: [[[0]]]
    expected: 0
    label: start is the goal
  - args: [[[0, 1], [1, 0]]]
    expected: 1
  - args: [[[0, 1, 1, 1, 0]]]
    expected: 3
    label: single row, every wall must go
  - args: [[[0, 1, 0, 0], [0, 1, 0, 1], [0, 1, 1, 0], [1, 1, 1, 0]]]
    expected: 2
    hidden: true
  - args: [[[0, 1, 1, 0], [1, 1, 0, 1], [0, 0, 1, 0]]]
    expected: 2
    hidden: true
hints:
  - "Keep dist[r][c], initialised to infinity, with dist[0][0] = 0, and a deque holding (r, c)."
  - "For each neighbour, the cost is grid[nr][nc]; if dist[r][c] + cost improves dist[nr][nc], record it and push to the front when cost is 0, to the back when cost is 1."
  - "In JavaScript, a circular buffer of size 2 * rows * cols + 1 with a head index and a size works as a deque, because each cell enters at most twice."
```

## Senior signals

- You state **"non-negative weights"** as Dijkstra's precondition and can produce the three-edge counterexample with early exit.
- You **walk down the ladder** out loud (BFS, 0-1 BFS, DAG relaxation, Dijkstra, Bellman-Ford, Floyd-Warshall) and pick the cheapest rung the input allows.
- You explain **lazy deletion** as the substitute for decrease-key, bound its heap at `E + 1` entries, and know the stale check is a performance guard, not a correctness one.
- You recognise the **edge-count bound** as the thing that breaks settle-on-pop, and give the round-copied Bellman-Ford or the state-keyed Dijkstra.
- You see **minimax** as Dijkstra with a monotone combine, and offer binary search on the answer and union-find as alternatives.
- You know **what the heap costs** in your language: about 135 bytes per `(dist, node)` entry in CPython, a hand-written heap in JavaScript, and the `TypeError` on ties with object payloads.
- You spot the **non-shortest-path problems in routing clothing**: spanning trees and Eulerian paths.

## Check yourself

```quiz
- q: >-
    Dijkstra pops (d, u) from the heap and finds d greater than dist[u]. What should happen and why?
  options: ["Stop the search, since the heap has become corrupted", "Push it back with dist[u] so the heap order is repaired", "Update dist[u] to d, since the heap holds the latest value", "Skip it; a cheaper path to u was found after this push"]
  answer: 3
  explanation: >-
    Without decrease-key, a node is pushed again each time its distance improves, and the older, larger entries stay in the heap. Relaxing from them repeats work with worse values: correctness survives, but on a dense graph the edge scans more than quadruple. The skip is a performance guard.
- q: >-
    Cheapest Flights Within K Stops with k = 1 on 0->1 (100), 1->2 (100), 2->0 (100), 1->3 (600), 2->3 (200), src 0, dst 3. Bellman-Ford relaxing in place, in that edge order, returns:
  options: ["-1, since no route to 3 fits within one stop", "600, since only the direct 1->3 fare is counted", "400, since same-round updates chain into routes", "700, which is the correct cheapest one-stop fare"]
  answer: 2
  explanation: >-
    The round invariant, at most i edges after round i, needs every read to come from the previous round. In place, dist[1] and then dist[2] are written and read within the first round, so the two-stop route 0 -> 1 -> 2 -> 3 at 400 leaks in. Copying the array each round gives 700.
- q: >-
    In 0-1 BFS, why does a node reached over a 0-weight edge go to the front of the deque?
  options: ["It marks the node as settled so it is never revisited", "Nodes behind it will then be skipped as stale entries", "Front insertion is faster than appending in a deque", "It has the current minimum distance, so it must come first"]
  answer: 3
  explanation: >-
    The deque holds distance d at the front and d + 1 at the back. A 0-edge from a node at distance d yields d, which belongs with the front; a 1-edge yields d + 1, which belongs at the back. That keeps the front a minimum, which is all Dijkstra needs, without a heap.
- q: >-
    Swim in Rising Water replaces d + w with max(d, w) in Dijkstra. Why does settle-on-pop still hold?
  options: ["It does not hold; the minimax version is a heuristic", "It holds because the goal cell has the largest value", "max is monotone, so extending a path never lowers its cost", "It holds only because every elevation in the grid is distinct"]
  answer: 2
  explanation: >-
    Dijkstra needs only that a path's cost never decreases as it extends, so a smaller key cannot be beaten by going through a larger one. Sums with non-negative weights have that property, and so does a running maximum with any values. Distinct heights are not required.
- q: >-
    Edges S->A (2), S->B (4), B->A (-3), A->T (1). Dijkstra with early exit at T returns what, and what is the true cost?
  options: ["Returns 3, but S->B->A->T actually costs 2", "Returns 2, and 2 is the true cheapest cost", "Returns 5, but S->A->T actually costs 3", "Raises an error when it meets the negative edge"]
  answer: 0
  explanation: >-
    A is popped at 2 and relaxes T to 3; T is popped at 3, before B at 4 is ever expanded, and the search returns. The path through B uses the negative edge and costs 4 - 3 + 1 = 2. Nothing detects the problem, which is why the precondition has to be stated.
- q: >-
    Min Cost to Connect Points on 2,000 points with Manhattan distances. Which approach and why?
  options: ["Dijkstra from point 0, summing the final distances", "BFS from point 0, since every point is reachable", "Floyd-Warshall, then sum the shortest pairwise paths", "Array-based Prim's, O(n²), without listing edges"]
  answer: 3
  explanation: >-
    Connecting every point is a minimum spanning tree, not a shortest path. On a complete graph array-based Prim's is O(n^2) and never materialises the 2 million edges that heap-based Prim's or Kruskal's sort would need. Summing Dijkstra distances builds a shortest-path tree, which can cost more.
```
