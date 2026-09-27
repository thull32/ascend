---
slug: shortest-paths-dijkstra
title: "Dijkstra: shortest paths by settling the nearest node first"
description: The invariant that makes Dijkstra correct, the heap implementation with lazy deletion that everyone gets subtly wrong, why negative edges break it, and the 0-1 BFS shortcut for small weights.
minutes: 50
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

## Watch it run

Six nodes, directed, weighted. Follow the frontier: the queue always pops the smallest tentative distance, and a node popped for the first time is settled for good.

```viz
{"type": "graph", "algorithm": "dijkstra", "directed": true, "start": "A", "goal": "F",
 "title": "Dijkstra from A",
 "nodes": [{"id":"A","x":5,"y":50},{"id":"B","x":35,"y":20},{"id":"C","x":30,"y":80},{"id":"D","x":60,"y":40},{"id":"E","x":75,"y":85},{"id":"F","x":95,"y":50}],
 "edges": [{"from":"A","to":"B","w":4},{"from":"A","to":"C","w":2},{"from":"C","to":"B","w":1},{"from":"B","to":"D","w":5},{"from":"C","to":"D","w":8},{"from":"C","to":"E","w":10},{"from":"D","to":"E","w":2},{"from":"D","to":"F","w":6},{"from":"E","to":"F","w":3}]}
```

By hand, the same run:

| Pop | dist after relaxing | Note |
|---|---|---|
| A (0) | B=4, C=2 | Two candidates for B are coming |
| C (2) | B=3, D=10, E=12 | C improved B: 2+1 < 4 |
| B (3) | D=8 | B's old entry with priority 4 is still in the heap, stale |
| D (8) | E=10, F=14 | |
| E (10) | F=13 | |
| F (13) | | Done; the stale (4, B) entry is popped and ignored somewhere in here |

The shortest path to F is A → C → B → D → E → F with cost 13, five edges long, while the two-edge path A → C → F does not exist and the three-edge path A → B → D → F costs 15. Fewest edges and cheapest are different questions.

## The heap implementation, and the bug

Textbooks describe Dijkstra with a `decrease-key` operation: when you improve `dist[v]`, you lower `v`'s priority inside the heap. Python's `heapq` and JavaScript have no decrease-key, and neither does most production code, because there is a simpler technique that is just as fast in practice: **lazy deletion**. Push a new `(dist, node)` entry every time a distance improves and, on pop, skip any entry whose distance is worse than the current `dist[node]`.

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

**Constrained paths.** "Cheapest flight with at most k stops" ([Cheapest Flights Within K Stops](/practice/cheapest-flights-k-stops)) is not a Dijkstra problem, even though every weight is positive. The stop limit means the cheapest way to reach an intermediate node may be *disqualified* because it used too many edges, so the invariant "settled means final" no longer holds for a node; it only holds for a (node, stops-used) pair. You either run Dijkstra on the expanded state space of `V × (k+1)` nodes or, more simply, run `k+1` rounds of Bellman-Ford relaxation.

**Path with maximum bottleneck.** [Swim in Rising Water](/practice/swim-in-rising-water) asks for the path whose *maximum* cell value is smallest. Dijkstra still works, but the relaxation is `nd = max(d, cell)` rather than `d + w`. The proof only needed the "cost never decreases along a path" step, and `max` satisfies that too. Recognising that Dijkstra works for any monotone path cost, not just sums, is a senior-level generalisation.

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

Note the stale check disappeared: a node can be pushed more than once, but the `dist` comparison at relaxation time keeps the work bounded. The same trick generalises to weights in `{0, 1, …, C}` as **Dial's algorithm**: `C + 1` buckets scanned in rotation, `O(V·C + E)` total. Routers with small integer link costs used exactly this before heaps were fashionable.

## Reconstructing the path and stopping early

Interviewers almost always follow "return the distance" with "now return the path". Keep a `prev[v] = u` whenever you relax `(u, v)` successfully, then walk back from the target. Because `prev` is only updated on strict improvement, it always points along a shortest path, and the walk terminates at `src` because `prev[src]` is never set.

If you only care about one target, `return` as soon as the target is *popped* (not pushed). Popped means settled; pushed means nothing. On a road network this typically expands a fraction of the graph, and [A*](/learn/algorithms/graph-algorithms/a-star-and-heuristic-search) is the technique for shrinking that fraction further with a heuristic.

Multi-source shortest path (nearest hospital from every house) needs no new algorithm: push every source with distance 0 before the loop starts. The invariant does not care how many nodes begin at distance zero.

## Where it runs

Link-state routing protocols such as OSPF and IS-IS flood the topology to every router and each router runs Dijkstra from itself to build its forwarding table, which is why the [routing lesson](/learn/networking/fundamentals/ip-addressing-and-routing) calls them "shortest path first" protocols. Map services run Dijkstra-derived algorithms (A*, contraction hierarchies, ALT) on graphs with hundreds of millions of edges; the plain algorithm at `O(E log V)` takes seconds on a continent-scale graph, which is why the preprocessing-heavy variants exist. Inside a compiler, register allocation and instruction scheduling use shortest and longest paths on dependency graphs. The plain heap version is what you write in an interview, and what you write in a service until a profiler tells you otherwise.

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

- You state the invariant ("a popped node's distance is final") and can point to the exact line of the proof that fails with negative weights.
- You settle nodes on **pop**, never on push, and you can explain why a visited-on-push check silently returns wrong distances.
- You know lazy deletion is what real code uses instead of decrease-key, that the stale check is a performance guard rather than a correctness guard, and that the `O(V²)` array version wins on dense graphs.
- You recognise Dijkstra as an algorithm for any monotone path cost (`max` for bottleneck paths, not just `+`), and you recognise when a constraint such as "at most k stops" breaks the invariant.
- You reach for 0-1 BFS or bucket queues when weights are small integers, and you can say what that buys: `O(V + E)` instead of `O(E log V)`.
- You can name where Dijkstra actually runs (OSPF, map routing with A* and contraction hierarchies) and why the plain version is too slow at continental scale.

## Check yourself

```quiz
- q: >-
    In the heap implementation, a node's tentative distance is improved twice before it is popped. What is in the heap afterwards, and what happens to the extra entries?
  options: ["Two entries; the stale one is skipped when it is popped", "Two entries; both are expanded and the second fixes the first", "One entry; the heap updates the existing entry in place", "Two entries; this is a bug that only decrease-key avoids"]
  answer: 0
  explanation: >-
    Lazy deletion pushes a fresh entry on every improvement and leaves the old one in place; Python's heapq has no in-place update. When the stale entry is popped, its stored distance is larger than dist[node], so it is skipped. Processing it would not be wrong, just wasted work, which is why the check is a performance guard rather than a correctness fix.
- q: >-
    You mark a node as visited when you push it to the heap and refuse to push it again. On the graph A→B (4), A→C (2), C→B (1), what does the algorithm report for B?
  options: ["3, because the heap re-sorts B when C improves it", "1, because only the last edge C→B is kept for B", "4, because the improvement via C is discarded", "No value; the refused duplicate push raises an error"]
  answer: 2
  explanation: >-
    A pushes B with 4 and marks it visited. When C is popped and finds a path to B of cost 3, B is already visited so the push is refused, and nothing re-sorts B's old entry. Settling must happen on pop; a push-time visited check throws away improvements.
- q: >-
    Which of these problems is NOT solved correctly by plain Dijkstra with non-negative weights?
  options: ["Shortest path with early exit when the target is popped", "Shortest path from several sources at once", "Cheapest path that uses at most k edges from the source", "Path minimising the maximum edge weight (bottleneck path)"]
  answer: 2
  explanation: >-
    An edge-count limit means the cheapest way into a node may be disqualified, so 'settled = final' no longer holds per node. You need state (node, edges used) or k+1 rounds of Bellman-Ford. Bottleneck paths work because max is monotone; multi-source works by seeding several zeros; early exit on pop is safe because popped means settled.
- q: >-
    A graph has 10,000 nodes and roughly 50 million edges. Which Dijkstra variant is the better choice, and why?
  options: ["Array scan, because with E ≈ V² the log factor is overhead", "0-1 BFS, because O(V+E) beats both of the Dijkstra variants", "Bellman-Ford, because dense graphs favour edge-list scans", "Heap version, because O((V+E) log V) always beats O(V²)"]
  answer: 0
  explanation: >-
    With E ≈ V²/2 the graph is dense; the heap does O(E log V) ≈ 50M × 13 operations, while the array version does O(V²) = 100M simple scans with no heap overhead. The heap bound only wins when E is well below V². 0-1 BFS requires weights in {0,1}, which was not given, and Bellman-Ford's O(VE) is far worse.
- q: >-
    Why does a deque give the same processing order as a heap when all edge weights are 0 or 1?
  options: ["Because it only ever holds distances d and d+1, in order", "Because the deque is re-sorted after every insertion", "It doesn't; 0-1 BFS only approximates the heap order", "Because 0-weight edges never change any distance"]
  answer: 0
  explanation: >-
    Pushing cost-0 neighbours to the front and cost-1 neighbours to the back keeps the deque monotone with at most two distinct distances, d at the front and d+1 at the back. The front is always a smallest tentative distance, which is exactly what the heap guaranteed, at O(1) per operation and with no sorting.
```
