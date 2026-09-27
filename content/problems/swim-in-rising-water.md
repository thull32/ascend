---
slug: swim-in-rising-water
title: Swim in Rising Water
difficulty: hard
patterns: [shortest-path]
lists: [ascend-150]
companies: [google, amazon, meta, uber]
order: 4
lesson: interview-patterns/tree-and-graph-patterns/shortest-path-pattern
hints:
  - "Time spent swimming is free; only waiting costs. You can reach the corner at time t exactly when some path exists whose highest cell is at most t. So the answer is the minimum, over all paths, of the path's maximum elevation."
  - "That is a shortest-path problem where a path's 'length' is the max of its cells instead of the sum. Dijkstra still works: max, like +, never makes a path cheaper as it grows."
  - "Pop cells from a min-heap keyed by 'highest elevation needed to get here'. The first time you pop the bottom-right cell, that key is the answer."
signatures:
  python:
    name: swim_in_water
    starter: |
      def swim_in_water(grid: list[list[int]]) -> int:
          pass
  javascript:
    name: swim_in_water
    starter: |
      function swim_in_water(grid) {
      }
tests:
  - args: [[[0, 3], [2, 1]]]
    expected: 2
    label: the answer is not the corner's own height
  - args: [[[0]]]
    expected: 0
    label: already at the corner
  - args: [[[0, 1, 2], [7, 8, 3], [6, 5, 4]]]
    expected: 4
    label: go around the rim
  - args: [[[0, 5, 6], [1, 8, 7], [2, 3, 4]]]
    expected: 4
  - args: [[[3, 2], [0, 1]]]
    expected: 3
    label: the starting cell itself is the bottleneck
  - args: [[[0, 14, 13, 12], [1, 15, 11, 10], [2, 3, 9, 8], [5, 4, 6, 7]]]
    expected: 7
    hidden: true
  - args: [[[0, 1, 2, 3, 4], [24, 23, 22, 21, 5], [12, 13, 14, 15, 16], [11, 17, 18, 19, 20], [10, 9, 8, 7, 6]]]
    expected: 16
    hidden: true
    label: the best route winds back across the grid
  - args: [[[0, 8, 3], [4, 7, 1], [6, 2, 5]]]
    expected: 6
    hidden: true
time_limit_ms: 4000
---
You are given an `n × n` grid where `grid[r][c]` is the elevation of cell `(r, c)`. The elevations are the distinct integers `0` to `n² − 1` in some arrangement.

Rain starts, and at time `t` the water everywhere is at depth `t`. You start at the top-left cell `(0, 0)`. At time `t` you can swim from a cell to a horizontally or vertically adjacent cell if **both** cells have elevation at most `t`. Swimming takes no time; you can cover any distance instantly as long as the water is deep enough.

Return the smallest time `t` at which you can reach the bottom-right cell `(n − 1, n − 1)`.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[0,3],[2,1]]` | `2` | Route `0 → 2 → 1` never needs water above 2; via 3 would need 3 |
| `[[0,1,2],[7,8,3],[6,5,4]]` | `4` | Around the top and right edges, `0 → 1 → 2 → 3 → 4` |
| `[[3,2],[0,1]]` | `3` | You cannot even leave the start until the water covers its elevation, 3 |

### Constraints

- `1 ≤ n ≤ 50`
- The values of `grid` are a permutation of `0 … n² − 1`

### Follow-up

The interviewer asks: "Give me three different correct algorithms for this, and tell me which you would ship." And then: "The water level now differs by region and changes over time. What still works?"

## Solution

### The naive approach

Try every time `t = 0, 1, 2, …` and, for each, run a BFS from `(0, 0)` through cells with elevation `≤ t`. Stop at the first `t` where the corner is reachable. There are up to `n²` values of `t` and each BFS is `O(n²)`, so `O(n⁴)`: 6.25 million steps for `n = 50`. It works, and it contains the key observation, but it repeats almost the same BFS over and over.

### The insight

Reframe the goal. You reach the corner at time `t` exactly when there is a path from start to corner whose **highest** cell is at most `t`. So the answer is

$$\min_{\text{paths } P} \; \max_{(r,c) \in P} \text{grid}[r][c]$$

This is a **bottleneck** (minimax) path problem. It is a shortest-path problem with a different way of combining costs: extending a path by a cell of height `h` changes its cost from `c` to `max(c, h)` instead of `c + h`. Dijkstra only needs two properties from the combining rule: extending a path never makes it cheaper, and a cheaper prefix never leads to a more expensive extension. `max(c, h) ≥ c` and `c₁ ≤ c₂ ⇒ max(c₁, h) ≤ max(c₂, h)` both hold, so Dijkstra's greedy argument goes through unchanged. The first time the corner is popped from the heap, its key is the minimum possible bottleneck.

Two other correct approaches exist, and the follow-up asks for them:

- **Binary search on `t`** plus BFS: reachability is monotone in `t` (if you can make it at `t`, you can at `t + 1`), so binary search over `0 … n² − 1`, `O(n² log n)`.
- **Union-find in elevation order**: add cells from lowest to highest, unioning each with already-added neighbours; the answer is the elevation of the cell whose addition first connects `(0, 0)` and `(n − 1, n − 1)`. This is Kruskal's algorithm stopped early, `O(n² log n)` for the sort (or `O(n²)` here, since the values are a permutation and you can bucket them).

### The optimal approach

1. Push `(grid[0][0], 0, 0)` on a min-heap and mark `(0, 0)` seen.
2. Pop `(level, r, c)`. If it is the corner, return `level`.
3. For each unseen neighbour, mark it and push `(max(level, grid[nr][nc]), nr, nc)`.

Marking cells on push, rather than on pop, is safe here for a reason explained after the code. (If the argument feels shaky in an interview, mark on pop instead; it costs a slightly larger heap and is always correct.)

Trace `[[0,3],[2,1]]`. Heap `[(0,(0,0))]`. Pop 0 at `(0,0)`: push `(3,(0,1))` and `(2,(1,0))`. Pop 2 at `(1,0)`: push `(max(2,1)=2,(1,1))`. Pop 2 at `(1,1)`: that is the corner. Answer 2.

```python
import heapq

def swim_in_water(grid: list[list[int]]) -> int:
    n = len(grid)
    heap = [(grid[0][0], 0, 0)]
    seen = {(0, 0)}
    while heap:
        level, r, c = heapq.heappop(heap)
        if r == n - 1 and c == n - 1:
            return level
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen:
                seen.add((nr, nc))
                heapq.heappush(heap, (max(level, grid[nr][nc]), nr, nc))
    return -1  # unreachable: the grid is connected
```

Time `O(n² log n)`: each of the `n²` cells is pushed and popped once, and heap operations cost `O(log n²) = O(log n)`. Space `O(n²)`.

Why is marking on push safe? Keys come off the heap in non-decreasing order. When cell `x` is first pushed, from a popped cell with key `L`, it gets key `max(L, h_x)`. Any other route into `x` arrives from a neighbour that is popped no earlier, so its bottleneck is at least `L`, and entering `x` costs `h_x` whichever neighbour you come from. So no route beats the first push. The argument rests on the cost of entering a cell being the same from every direction (it is the cell's own elevation). In an edge-weighted graph such as [Network Delay Time](/practice/network-delay-time), different neighbours charge different amounts to reach `x`, and marking on push would be a bug.

### Common mistakes

- **Summing elevations.** The cost of a path is its maximum, not its total. Summing solves a different problem.
- **Forgetting the start cell.** You cannot move until the water covers `grid[0][0]`. Seed the heap with that value, not 0; the `[[3,2],[0,1]]` test catches this.
- **Greedy walking.** Always stepping to the lowest neighbour can walk into a dead end (the spiral test), and backtracking from it is exactly what the heap does for you.
- **Plain BFS.** Unweighted BFS finds the fewest steps, not the lowest bottleneck.

### How to discuss it

Lead with the reformulation: "reach time equals the minimum over paths of the maximum cell, a bottleneck path." Then say why Dijkstra applies: the path cost is monotone under extension. That sentence shows you understand Dijkstra's precondition rather than its usual `+`. Then offer the other two solutions in a line each; the interviewer's "which would you ship?" is really "do you know the trade-offs?". Dijkstra is the most general (it handles any monotone cost); binary search plus BFS is the simplest to get right and parallelises; union-find in elevation order is the fastest when values can be bucketed and answers every start-end pair's bottleneck at once, since bottleneck paths live on the minimum spanning tree.

When water levels vary by region and time, the clean monotone structure is gone: the cost of entering a cell now depends on when you arrive. If waiting is allowed and each cell's openness only ever increases over time, a time-dependent Dijkstra (the key is arrival time) still works, because waiting never hurts; if cells can close again, the problem becomes a search over `(cell, time)` states.
