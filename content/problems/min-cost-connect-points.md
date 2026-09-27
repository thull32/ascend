---
slug: min-cost-connect-points
title: Min Cost to Connect All Points
difficulty: medium
patterns: [shortest-path]
lists: [ascend-150]
companies: [amazon, google, microsoft, uber]
order: 3
lesson: interview-patterns/tree-and-graph-patterns/shortest-path-pattern
hints:
  - "The cheapest way to connect everything never contains a cycle (drop the most expensive edge of a cycle and everything stays connected). So you want a minimum spanning tree."
  - "Every pair of points is a candidate edge: that is n(n-1)/2 edges. Kruskal sorts them all; Prim grows one tree outward. Which one suits a complete graph?"
  - "Prim with a plain array: keep, for every point not yet in the tree, the cheapest edge connecting it to the tree. Each step picks the minimum in O(n) and updates the others in O(n). No heap needed."
signatures:
  python:
    name: min_cost_connect_points
    starter: |
      def min_cost_connect_points(points: list[list[int]]) -> int:
          pass
  javascript:
    name: min_cost_connect_points
    starter: |
      function min_cost_connect_points(points) {
      }
tests:
  - args: [[[0, 0], [1, 1], [1, 0], [4, 4]]]
    expected: 8
  - args: [[[5, 5]]]
    expected: 0
    label: one point needs no wire
  - args: [[[0, 0], [3, 4]]]
    expected: 7
    label: Manhattan, not straight-line, distance
  - args: [[[0, 0], [0, 5], [0, 2], [0, 9]]]
    expected: 9
    label: points on a line, given out of order
  - args: [[[-2, -2], [2, 2], [-2, 2], [2, -2]]]
    expected: 12
    label: square with negative coordinates
  - args: [[[1, 3], [4, 0], [-3, 2], [6, 6], [0, -5], [2, 2]]]
    expected: 28
    hidden: true
  - args: [[[0, 0], [10, 0], [0, 10], [10, 10], [5, 5]]]
    expected: 40
    hidden: true
    label: many equal-cost choices
  - args: [[[0, 0], [1, 0], [2, 0], [100, 100]]]
    expected: 200
    hidden: true
    label: one outlier
time_limit_ms: 4000
---
You are given `points`, a list of distinct integer coordinates `[x, y]` on a plane. Connecting two points `[x1, y1]` and `[x2, y2]` with a wire costs their **Manhattan distance** `|x1 − x2| + |y1 − y2|`.

Return the minimum total cost to connect all the points so that every point can reach every other point through the wires. Wires only join points; they never branch in the middle.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[0,0],[1,1],[1,0],[4,4]]` | `8` | Wire `(0,0)-(1,0)` for 1, `(1,0)-(1,1)` for 1, `(1,1)-(4,4)` for 6 |
| `[[0,0],[0,5],[0,2],[0,9]]` | `9` | Connect neighbours along the line: 2 + 3 + 4 |
| `[[5,5]]` | `0` | Nothing to connect |

### Constraints

- `1 ≤ len(points) ≤ 1000`
- `-10⁶ ≤ x, y ≤ 10⁶`; all points are distinct

### Follow-up

The interviewer asks: "Now there are a million points. `O(n²)` is 10¹² operations. How would you get below that?"

## Solution

### The naive approach

Build every edge explicitly, `n(n − 1)/2` of them, sort them by cost, and run Kruskal's algorithm: scan edges from cheapest to most expensive and keep an edge whenever it joins two different components (tracked with union-find). For `n = 1000` that is about 500,000 edges; sorting costs `O(n² log n)` time and storing them costs `O(n²)` memory, several tens of megabytes of Python tuples. It is correct, and it is the version most candidates reach for first.

### The insight

First, recognise the problem. The cheapest connected set of wires is a **minimum spanning tree** (MST): any cheapest solution is acyclic, because removing the most expensive wire on a cycle keeps everything connected and saves money. With `n` points, the tree has `n − 1` wires.

Second, notice the graph is **complete**: every pair of points is an edge, so `E ≈ n²/2`. That changes which MST algorithm is best:

| Algorithm | Cost on a complete graph |
|---|---|
| Kruskal (sort all edges) | `O(n² log n)` time, `O(n²)` memory |
| Prim with a binary heap | `O(E log n) = O(n² log n)` time |
| Prim with a plain array | `O(n²)` time, `O(n)` memory |

Prim grows a single tree from any start point. It keeps, for every point outside the tree, `best[v]`: the cheapest wire from `v` to any point already in the tree. Each step adds the outside point with the smallest `best` (the **cut property** guarantees that the cheapest edge leaving the tree belongs to some MST), then lowers `best` for the remaining points using distances to the point just added. On a dense graph, scanning an array for the minimum costs `O(n)` per step, the same as updating it, so a heap buys nothing and costs a log factor. Edges are computed on the fly, never stored.

### The optimal approach

1. `best = [∞] * n`, `best[0] = 0`, `in_tree = [False] * n`, `total = 0`.
2. Repeat `n` times: pick the outside point `u` with the smallest `best[u]`; add it to the tree and add `best[u]` to `total`. For every outside `v`, set `best[v] = min(best[v], dist(u, v))`.
3. Return `total`.

Trace `[[0,0],[1,1],[1,0],[4,4]]`. Start: `best = [0, ∞, ∞, ∞]`. Add point 0 (cost 0); `best` becomes `[-, 2, 1, 8]`. Add point 2 (cost 1); distances from `(1,0)` lower point 1 to 1 and point 3 to 7: `[-, 1, -, 7]`. Add point 1 (cost 1); distance from `(1,1)` to `(4,4)` is 6: `[-, -, -, 6]`. Add point 3 (cost 6). Total 0 + 1 + 1 + 6 = 8.

```python
def min_cost_connect_points(points: list[list[int]]) -> int:
    n = len(points)
    INF = float("inf")
    best = [INF] * n
    best[0] = 0
    in_tree = [False] * n
    total = 0
    for _ in range(n):
        u = -1
        for v in range(n):                        # O(n) min scan, no heap
            if not in_tree[v] and (u == -1 or best[v] < best[u]):
                u = v
        in_tree[u] = True
        total += best[u]
        ux, uy = points[u]
        for v in range(n):                        # O(n) relaxation
            if not in_tree[v]:
                d = abs(ux - points[v][0]) + abs(uy - points[v][1])
                if d < best[v]:
                    best[v] = d
    return int(total)
```

Time `O(n²)`: `n` rounds of two linear scans. For `n = 1000` that is about 2 million distance computations. Space `O(n)`.

### Common mistakes

- **Using straight-line distance.** The cost is `|dx| + |dy|`. `[[0,0],[3,4]]` costs 7, not 5.
- **Confusing MST with shortest paths.** Dijkstra from one point minimises each point's distance *to the source*; the MST minimises the *total* wire. With a distance that obeys the triangle inequality, the shortest-path tree from `(0,0)` on the line example is simply a star, costing 5 + 2 + 9 = 16 instead of 9. In code, the bug is updating `best[v]` with `dist_from_start[u] + dist(u, v)` instead of `dist(u, v)`.
- **Materialising all edges.** It works, but it is the memory-heavy path, and at `n = 1000` in Python it is noticeably slower.
- **Forgetting the single-point case.** One point, zero wires, cost 0.

### How to discuss it

Say "cheapest connected network is a minimum spanning tree", then immediately "the graph is complete, so `E ≈ n²/2`, and that decides the algorithm: array-based Prim in `O(n²)` beats Kruskal's `O(n² log n)` and never stores an edge." Choosing by density is the senior signal; knowing both algorithms is the baseline. Also say why greedy is safe (the cut property), because "Prim is greedy" invites "why does greedy work here when it fails elsewhere?".

For a million points, the trick is that you do not need all `n²` edges. For Manhattan distance, it is a known result that some MST uses only edges from each point to its nearest neighbour in each of eight 45° octants around it, so there are at most `4n` candidate edges after deduplication; they can be found with a sort and a sweep in `O(n log n)`, and Kruskal on those finishes the job. For Euclidean distance, the Delaunay triangulation plays the same role. You do not need to code that in an interview, but knowing that geometric MSTs have sparse candidate sets is what "one level deeper" looks like here.
