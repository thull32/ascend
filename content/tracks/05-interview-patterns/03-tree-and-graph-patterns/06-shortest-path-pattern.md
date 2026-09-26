---
slug: shortest-path-pattern
title: "Shortest path: Dijkstra, k-round Bellman-Ford and the minimax variant"
description: Recognise weighted-distance problems and pick the right relaxation algorithm, with Network Delay Time, Cheapest Flights Within K Stops and Swim in Rising Water traced heap pop by heap pop.
minutes: 36
difficulty: hard
tags: [graph, dijkstra, bellman-ford, shortest-path, heap, minimax, pattern:shortest-path]
problems: [network-delay-time, cheapest-flights-k-stops, min-cost-connect-points, swim-in-rising-water, reconstruct-itinerary]
---
Edges now have weights: a network hop takes 3 ms, a flight costs 400, crossing a cell takes as long as its height. BFS counts edges, and counting edges is wrong the moment one edge is worth more than another. The question "what is the cheapest way from here to there" needs an algorithm that tracks the *best known cost* to every node and improves it as cheaper routes appear. That improvement step, `if dist[u] + w < dist[v]: dist[v] = dist[u] + w`, is called relaxation, and every shortest-path algorithm is a policy for which edge to relax next.

Dijkstra relaxes from the cheapest unsettled node, which is correct when weights are non-negative and is the version you write in an interview. Bellman-Ford relaxes every edge in rounds, which handles negative weights and, more usefully for interviews, gives you a way to bound the number of edges in a path. And a family of "minimax" problems that look like nothing else in the catalogue are Dijkstra with `+` replaced by `max`. The signal for all three is the same: a weighted cost and a superlative.

## The signal

Reach for a shortest-path algorithm when the statement contains any of these:

- **"Minimum time / cost / distance" over weighted edges**, and weights are non-negative: Dijkstra. [Network Delay Time](/practice/network-delay-time) is the canonical form: single source, all destinations.
- **"At most `k` stops / edges / transfers"** on top of a cost ([Cheapest Flights Within K Stops](/practice/cheapest-flights-k-stops)): the path-length bound breaks Dijkstra's invariant and points to `k + 1` rounds of Bellman-Ford, or Dijkstra with `(cost, node, stops)` states.
- **"Minimise the maximum edge / cell along the path"**, "the largest weight you must cross", "the earliest time at which a route exists" ([Swim in Rising Water](/practice/swim-in-rising-water)): minimax Dijkstra, or binary search on the answer plus BFS.
- **"Connect all points with minimum total cost"** ([Min Cost to Connect Points](/practice/min-cost-connect-points)): not a shortest path but the same heap-and-relax machinery run as Prim's algorithm. The signal is *all nodes* rather than *one destination*.
- **Negative weights**, or "detect an arbitrage / negative cycle": Bellman-Ford, and say why Dijkstra fails.

What rules it out:

- **All edges cost the same.** BFS is `O(V + E)` and Dijkstra is `O((V + E) log V)` for the same answer; using a heap where a queue would do is a mark against you. See [Graph traversal](/learn/interview-patterns/tree-and-graph-patterns/graph-traversal).
- **Edges cost 0 or 1.** 0-1 BFS with a deque, no heap.
- **The graph is a DAG.** One pass in topological order relaxes everything in `O(V + E)` and handles negative weights. See [Topological sort](/learn/interview-patterns/tree-and-graph-patterns/topological-sort-pattern).
- **All-pairs on a small dense graph** (`V ≤ 400`): Floyd-Warshall, three nested loops, `O(V³)`.
- **The question is about visiting every edge once** ([Reconstruct Itinerary](/practice/reconstruct-itinerary)): that is an Eulerian path, solved by Hierholzer's algorithm, which lives in this lesson's variations because it shares the "graph from tickets" setup but is not a shortest path at all.

The confusable pattern is BFS with weights added as an afterthought: a candidate runs BFS and updates `dist[v] = dist[u] + w`, producing wrong answers because BFS order is by edge count, not by cost. The heap is what fixes the order.

## The template

Lazy-deletion Dijkstra: push `(distance, node)` pairs; pop the smallest; skip any pop whose distance is stale (worse than what the table already holds); relax the neighbours. The skip is how you avoid a decrease-key operation that Python's `heapq` and JavaScript's lack.

```python
import heapq

def dijkstra(n, adj, src):
    """adj[u] = list of (v, w). Returns dist list, INF where unreachable."""
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0
    heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue                      # stale entry: a shorter path was found later
        for v, w in adj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
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
```

```javascript
// Minimal binary heap of [key, value] pairs; JS has no built-in priority queue.
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
    if (d > dist[u]) continue;
    for (const [v, w] of adj[u]) {
      const nd = d + w;
      if (nd < dist[v]) { dist[v] = nd; heap.push([nd, v]); }
    }
  }
  return dist;
}
```

Dijkstra's invariant: *when a node is popped with a non-stale distance, that distance is final*. It holds because every other unsettled node has a tentative distance at least as large, and with non-negative weights no path through them can come back shorter. A negative edge breaks exactly this step. The heap can hold up to `E` entries with lazy deletion, so time is `O((V + E) log E)`, which for simple graphs is `O((V + E) log V)`.

Bellman-Ford's invariant: *after round `i`, `dist[v]` is the cheapest path to `v` using at most `i` edges*. That is why the `k`-stops problem is `k + 1` rounds, and why copying `dist` at the start of each round matters: relaxing in place lets an update made earlier in the same round be used again, which lets paths of more than `i` edges leak through. Time `O(k · E)`.

Watch Dijkstra settle nodes in distance order:

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": true, "start": "A", "goal": "E", "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}, {"id": "E"}], "edges": [{"from": "A", "to": "B", "w": 4}, {"from": "A", "to": "C", "w": 1}, {"from": "C", "to": "B", "w": 2}, {"from": "B", "to": "D", "w": 1}, {"from": "C", "to": "D", "w": 5}, {"from": "D", "to": "E", "w": 3}], "title": "Dijkstra with a min-heap", "caption": "The cheapest unsettled node is popped; its distance is final and its neighbours are relaxed."}
```

And Bellman-Ford's rounds, which relax every edge whether or not it helps:

```viz
{"type": "graph", "algorithm": "bellman-ford", "directed": true, "start": "A", "nodes": [{"id": "A"}, {"id": "B"}, {"id": "C"}, {"id": "D"}], "edges": [{"from": "A", "to": "B", "w": 4}, {"from": "A", "to": "C", "w": 2}, {"from": "C", "to": "B", "w": -3}, {"from": "B", "to": "D", "w": 2}, {"from": "C", "to": "D", "w": 6}], "title": "Bellman-Ford rounds", "caption": "After round i every node has its best distance over paths of at most i edges."}
```

## Worked problems

### Network Delay Time

[Network Delay Time](/practice/network-delay-time): `n` nodes labelled 1..n, directed edges `(u, v, w)` meaning a signal from `u` reaches `v` after `w` units. A signal is sent from node `k`. How long until every node has received it, or −1 if some node never does?

Single-source Dijkstra; the answer is the largest finite distance. The −1 case is any distance still infinite.

```python
def network_delay_time(times, n, k):
    adj = [[] for _ in range(n + 1)]
    for u, v, w in times:
        adj[u].append((v, w))
    dist = dijkstra(n + 1, adj, k)
    worst = max(dist[1:])
    return -1 if worst == float("inf") else worst
```

Trace with `n = 4`, `k = 1`, `times = [[1, 2, 1], [2, 3, 2], [1, 3, 4], [3, 4, 1], [2, 4, 5]]`:

| pop `(d, u)` | stale? | relaxations | `dist[1..4]` after | heap after |
|---|---|---|---|---|
| (0, 1) | no | 2: 0+1=1 < ∞; 3: 0+4=4 < ∞ | `[0, 1, 4, ∞]` | (1,2), (4,3) |
| (1, 2) | no | 3: 1+2=3 < 4; 4: 1+5=6 < ∞ | `[0, 1, 3, 6]` | (3,3), (4,3), (6,4) |
| (3, 3) | no | 4: 3+1=4 < 6 | `[0, 1, 3, 4]` | (4,3), (4,4), (6,4) |
| (4, 3) | **yes**, 4 > 3 | skipped | | (4,4), (6,4) |
| (4, 4) | no | no outgoing edges | | (6,4) |
| (6, 4) | **yes**, 6 > 4 | skipped | | |

Final `dist = [0, 1, 3, 4]`, answer 4. Two stale pops were skipped; those are the entries that a decrease-key operation would have updated in place. Note that node 3 was pushed twice (via 1 at cost 4, via 2 at cost 3) and only the cheaper push was processed.

Time `O((V + E) log V)`, space `O(V + E)`. A candidate who runs BFS here gets `dist[3] = 4` (direct edge, one hop) and answers 5 instead of 4.

### Cheapest Flights Within K Stops

[Cheapest Flights Within K Stops](/practice/cheapest-flights-k-stops): `n` cities, flights `(from, to, price)`, find the cheapest route from `src` to `dst` with at most `k` intermediate stops, or −1.

`k` stops means `k + 1` edges. Dijkstra's "first pop is final" invariant fails, because a cheaper route to an intermediate city may use too many edges and block a pricier-but-shorter route that is the only one able to reach `dst` within the limit. Bellman-Ford with exactly `k + 1` rounds, relaxing from the previous round's copy, gives "cheapest using at most `k + 1` edges" by its invariant.

```python
def find_cheapest_price(n, flights, src, dst, k):
    ans = bellman_ford_k(n, flights, src, dst, k + 1)
    return -1 if ans == float("inf") else ans
```

Trace with `n = 4`, `flights = [[0, 1, 100], [1, 2, 100], [2, 0, 100], [1, 3, 600], [2, 3, 200]]`, `src = 0`, `dst = 3`, `k = 1` (two rounds):

| round | relax from previous `dist` | `dist` after (0..3) |
|---|---|---|
| start | | `[0, ∞, ∞, ∞]` |
| 1 | 0→1: 100 | `[0, 100, ∞, ∞]` |
| 2 | 1→2: 200; 1→3: 700 | `[0, 100, 200, 700]` |

Answer 700 (0 → 1 → 3, one stop). The cheaper route 0 → 1 → 2 → 3 costs 400 but uses two stops, and the round-copy discipline is exactly what keeps it out: in round 2, the edge 2→3 reads `dist[2]` from the *previous* round, which is still ∞. With in-place relaxation, `dist[2] = 200` would be set earlier in round 2 and then 2→3 would produce 400, wrongly. With `k = 2` (three rounds) the answer is correctly 400.

Time `O(k · E)`. The alternative is Dijkstra on states `(cost, node, stops_used)`, pruning states that reach a node with more stops *and* higher cost than a previous visit; it works but the pruning condition is subtle and Bellman-Ford is the version you can defend in three sentences.

### Swim in Rising Water

[Swim in Rising Water](/practice/swim-in-rising-water): an `n × n` grid of distinct elevations. At time `t` you can stand on any cell with elevation ≤ `t` and move between adjacent such cells. What is the earliest `t` at which you can get from the top-left to the bottom-right?

The cost of a path is not the sum of its cells but the *maximum* cell on it, and you want the path with the smallest maximum. Replace `d + w` with `max(d, w)` in Dijkstra and everything else is unchanged. The invariant still holds because `max` is monotone: extending a path can never reduce its maximum, which is the same property non-negative weights give to sums.

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

Trace on

```text
0 2
1 3
```

Pop (0, (0,0)). Relax (0,1): max(0, 2) = 2; relax (1,0): max(0, 1) = 1. Heap: (1, (1,0)), (2, (0,1)). Pop (1, (1,0)): relax (1,1): max(1, 3) = 3; (0,0) already 0. Heap: (2, (0,1)), (3, (1,1)). Pop (2, (0,1)): relax (1,1): max(2, 3) = 3, not < 3. Pop (3, (1,1)): goal, return 3. Every route has to pass the cell with elevation 3, so 3 is the answer, and the algorithm found it without exploring anything unnecessary.

Time `O(n² log n)`. The alternative is binary search on `t` over `[0, n² − 1]` with a BFS per probe: `O(n² log n)` as well, and the interviewer may ask for it as the follow-up because it generalises to "is there a path under threshold" questions where the graph is implicit. Both are worth having; say which you are choosing and why (Dijkstra: one pass; binary search: simpler inner loop and no heap).

## Variations

- **Prim's MST** ([Min Cost to Connect Points](/practice/min-cost-connect-points)): same heap loop, but push `(w, v)` rather than `(d + w, v)`, and skip nodes already in the tree. Sum the popped weights. `O(E log V)`; on the complete graph of points that is `O(n² log n)`, and the `O(n²)` array-based Prim is faster in practice. Kruskal with [union-find](/learn/interview-patterns/tree-and-graph-patterns/union-find-pattern) is the alternative.
- **Reconstruct the path**: keep `prev[v] = u` on every successful relaxation and walk back from the destination.
- **Dijkstra with early exit**: return when the destination is popped (non-stale). The remaining heap is discarded, which on a large graph saves most of the work.
- **0-1 BFS**: weights in {0, 1}, deque with `appendleft` for weight 0. `O(V + E)`.
- **Maximise the minimum** (widest path, "path with the most probable success"): `min` instead of `max`, max-heap instead of min-heap (negate). Same minimax structure.
- **Negative cycle detection**: run Bellman-Ford for `V` rounds; if the `V`th round still relaxes something, a negative cycle is reachable.
- **Eulerian path** ([Reconstruct Itinerary](/practice/reconstruct-itinerary)): sort each airport's destinations, DFS greedily consuming tickets, append an airport to the route when it has no tickets left, reverse at the end (Hierholzer). It is `O(E log E)` for the sorts and appears in this problem set because the graph-from-tickets setup looks like a routing question; recognising that it is *not* a shortest path is the skill.
- **A\***: Dijkstra with the heap keyed by `d + h(v)` for an admissible heuristic `h`. Same code, one extra term; useful on grids with a known goal.

## Pitfalls

- **Using BFS on weighted edges.** BFS order is by edge count. The heap is not optional.
- **Forgetting the stale-pop check.** Without `if d > dist[u]: continue`, every stale entry re-relaxes its neighbours; correctness survives but the running time can degrade badly on dense graphs.
- **Marking a node "visited" when pushed** rather than when popped. A node can be pushed several times with decreasing costs; only the pop with the final cost should settle it.
- **Relaxing in place in the k-round Bellman-Ford.** Paths of more than `i` edges leak into round `i`. Copy the array.
- **Off-by-one on stops versus edges.** `k` stops means `k + 1` edges means `k + 1` rounds.
- **Dijkstra with negative edges.** It returns an answer; the answer is wrong. Say "non-negative weights" as a precondition every time you propose Dijkstra.
- **Not knowing your language has no priority queue.** JavaScript needs a hand-written heap; write a minimal one (about 20 lines) or, if the interviewer allows, a sorted-insert array for small `n`. Python has `heapq`; it is a min-heap, so negate for max.
- **Heap entries that are not comparable.** In Python, `(d, node)` works because ints compare; if the payload is an object, add a tiebreaker or wrap it.
- **Infinite as `-1`, or as a large integer that overflows on addition.** Use `float("inf")` / `Infinity` and check `nd < dist[v]`, which is always false when `d` is infinite.

## Exercise

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

## Senior signals

- You state **"non-negative weights"** as the precondition when you say Dijkstra, and you can show a three-node counterexample where a negative edge breaks it.
- You explain **lazy deletion** as the substitute for decrease-key and know its cost (`O(E)` heap entries, `log E` per operation).
- You recognise the **k-edges bound** as the thing that invalidates Dijkstra's settle-on-pop invariant and reach for round-copied Bellman-Ford with a one-sentence justification.
- You see **minimax and maximin** problems as Dijkstra with a different combine operator and can say why monotonicity is the property that makes it valid.
- You offer **binary search on the answer** as the alternative for threshold problems and compare the two honestly.
- You know **BFS, 0-1 BFS, DAG relaxation, Dijkstra, Bellman-Ford and Floyd-Warshall** as a ladder, and pick the cheapest rung the problem allows.
- You can write a **binary heap in JavaScript** from memory, because you know the language does not provide one.

## Check yourself

```quiz
- q: >-
    Dijkstra pops (d, u) from the heap and finds d greater than dist[u]. What should happen and why?
  options: ["Update dist[u] = d", "Skip the entry: a cheaper path to u was found after this entry was pushed, so its distance is stale and relaxing from it would only redo work with worse values", "Terminate; the heap is corrupted", "Push it back with distance dist[u]"]
  answer: 1
  explanation: >-
    Without decrease-key, a node is pushed again each time its distance improves. Older, larger entries remain in the heap and must be ignored when they surface. Correctness does not depend on the skip; performance does.
- q: >-
    Cheapest Flights Within K Stops with k = 1 on flights 0->1 (100), 1->2 (100), 1->3 (600), 2->3 (200), src 0, dst 3. Bellman-Ford relaxing in place (no per-round copy) returns:
  options: ["700, correct", "400, wrong: within round 2 the freshly updated dist[2] = 200 is used to relax 2->3, admitting a path with 2 stops", "-1", "300"]
  answer: 1
  explanation: >-
    The round invariant (at most i edges after round i) requires relaxing from the previous round's values. In-place updates let a path grow by more than one edge per round. Copying the array at the start of each round restores the bound and gives 700.
- q: >-
    Swim in Rising Water replaces d + w with max(d, w) in Dijkstra. Why does the settle-on-pop invariant still hold?
  options: ["It does not; the algorithm is a heuristic", "Because max is monotone: extending a path never lowers its maximum, so the smallest tentative value in the heap cannot be beaten by any path through a larger one, exactly as with non-negative sums", "Because the grid values are distinct", "Because the goal is always the largest cell"]
  answer: 1
  explanation: >-
    Dijkstra needs only that path cost never decreases as the path extends. Sums with non-negative weights have that property; so does the running maximum. Minimum with a max-heap gives the maximin variant for the same reason.
- q: >-
    The graph has 500 nodes, every edge weight is 1, and you need the shortest path from one node to another. A candidate writes Dijkstra. What is the senior objection?
  options: ["Dijkstra does not work with unit weights", "BFS gives the same answer in O(V + E) without a heap; Dijkstra's O((V + E) log V) and extra code buy nothing here", "Floyd-Warshall would be faster", "Dijkstra needs the graph to be undirected"]
  answer: 1
  explanation: >-
    Uniform weights mean edge count equals cost, which BFS optimises directly. Choosing the cheapest sufficient algorithm is part of what is being assessed.
- q: >-
    Reconstruct Itinerary gives you flight tickets and asks for a route using every ticket once. Which is it?
  options: ["Dijkstra with unit weights", "An Eulerian path, solved with Hierholzer's DFS that appends an airport when its tickets are exhausted and reverses at the end; it is not a shortest-path problem", "Bellman-Ford with negative cycle detection", "Minimum spanning tree"]
  answer: 1
  explanation: >-
    Using every edge exactly once is the Eulerian path condition. Nothing is minimised except the lexical order of choices. Recognising a non-shortest-path graph problem inside a routing-shaped statement is the point of the question.
- q: >-
    Min Cost to Connect Points on 2000 points with Manhattan distances. Which approach and why?
  options: ["Dijkstra from point 0; the sum of distances is the answer", "Prim's algorithm on the implicit complete graph, O(n^2) with an array or O(n^2 log n) with a heap; Kruskal would need to sort about 2 million edges", "BFS", "Floyd-Warshall"]
  answer: 1
  explanation: >-
    All points must be connected, which is a spanning tree, not a shortest path. On a complete graph, Prim's O(n^2) array version avoids materialising every edge. Kruskal works but sorts n(n-1)/2 edges first.
```
