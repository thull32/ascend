---
slug: number-of-provinces
title: Number of Provinces
difficulty: medium
patterns: [union-find]
lists: [ascend-150]
companies: [amazon, google, bloomberg, goldman-sachs]
order: 3
lesson: interview-patterns/tree-and-graph-patterns/union-find-pattern
hints:
  - "The matrix is an adjacency matrix: cities are nodes, a 1 at [i][j] is an edge. A province is a connected component."
  - "Start with n provinces, one per city. Every time you union two cities that were in different provinces, the count drops by one."
  - "The matrix is symmetric and the diagonal is all 1s, so only look at pairs with j > i. That halves the work and skips the self-edges."
signatures:
  python:
    name: count_provinces
    starter: |
      def count_provinces(is_connected: list[list[int]]) -> int:
          pass
  javascript:
    name: count_provinces
    starter: |
      function count_provinces(is_connected) {
      }
tests:
  - args: [[[1, 0, 0, 1], [0, 1, 1, 0], [0, 1, 1, 0], [1, 0, 0, 1]]]
    expected: 2
    label: two interleaved pairs
  - args: [[[1, 0, 0], [0, 1, 0], [0, 0, 1]]]
    expected: 3
    label: no roads
  - args: [[[1]]]
    expected: 1
    label: one city
  - args: [[[1, 1, 1], [1, 1, 1], [1, 1, 1]]]
    expected: 1
    label: every city connected directly
  - args: [[[1, 1, 0, 0], [1, 1, 1, 0], [0, 1, 1, 1], [0, 0, 1, 1]]]
    expected: 1
    label: a chain connects everything indirectly
  - args: [[[1, 0, 1, 0, 0], [0, 1, 0, 0, 0], [1, 0, 1, 0, 1], [0, 0, 0, 1, 0], [0, 0, 1, 0, 1]]]
    expected: 3
    hidden: true
  - args: [[[1, 0], [0, 1]]]
    expected: 2
    hidden: true
  - args: [[[1, 0, 0, 0, 0, 1], [0, 1, 0, 0, 1, 0], [0, 0, 1, 1, 0, 0], [0, 0, 1, 1, 0, 0], [0, 1, 0, 0, 1, 0], [1, 0, 0, 0, 0, 1]]]
    expected: 3
    hidden: true
    label: three nested pairs
time_limit_ms: 4000
---
There are `n` cities, numbered `0` to `n - 1`. You are given an `n × n` matrix `is_connected` where `is_connected[i][j] = 1` if there is a direct road between city `i` and city `j`, and `0` otherwise. Roads work in both directions, so the matrix is symmetric, and every city counts as connected to itself (`is_connected[i][i] = 1`).

A **province** is a group of cities where every city can reach every other city in the group through roads, directly or via other cities, and no city outside the group can be reached. Return the number of provinces.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1,0,0,1],[0,1,1,0],[0,1,1,0],[1,0,0,1]]` | `2` | Cities `{0, 3}` and `{1, 2}` |
| `[[1,1,0,0],[1,1,1,0],[0,1,1,1],[0,0,1,1]]` | `1` | `0-1-2-3` is a chain, so all four are one province |
| `[[1,0,0],[0,1,0],[0,0,1]]` | `3` | No roads; every city is alone |

### Constraints

- `1 ≤ n ≤ 200`
- `is_connected[i][j]` is `0` or `1`, `is_connected[i][i] = 1`, and `is_connected[i][j] = is_connected[j][i]`

### Follow-up

The interviewer asks: "Roads are now built one at a time over several years, and after each one the planning office wants the current number of provinces. How does your solution change, and what does each update cost?"

## Solution

### The naive approach

For each pair of cities, test reachability with a fresh traversal, then group cities with identical reachability sets. That is `O(n²)` traversals of `O(n²)` each on a matrix, `O(n⁴)`. For `n = 200` that is over a billion steps, all of them re-answering the same question.

### The insight

This is [Count Connected Components](/practice/count-components) with the graph handed to you as an **adjacency matrix** instead of an edge list. Provinces are connected components. Two classic ways to count them:

- **Traversal:** count how many DFS/BFS traversals you must start to visit every city.
- **Union-find:** begin with `n` provinces; for each road between two cities in different provinces, merge them and subtract one.

Both are fine for a static matrix. Union-find is the reference here because it answers the follow-up without any change: it processes roads one at a time and always knows the current count.

One more observation shapes the loop. The matrix is symmetric and its diagonal is all ones, so each road appears twice and each city has a meaningless self-road. Scan only the upper triangle, `j > i`.

### The optimal approach

1. `parent[i] = i`, `size[i] = 1`, `count = n`.
2. For each `i`, for each `j > i` with `is_connected[i][j] == 1`: find both roots; if they differ, link the smaller under the larger and decrement `count`.
3. Return `count`.

Trace the first example. Upper-triangle ones: `(0,3)` and `(1,2)`. Start with 4. Union 0 and 3: 3. Union 1 and 2: 2. Answer 2.

```python
def count_provinces(is_connected: list[list[int]]) -> int:
    n = len(is_connected)
    parent = list(range(n))
    size = [1] * n

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]   # path halving
            x = parent[x]
        return x

    count = n
    for i in range(n):
        for j in range(i + 1, n):
            if is_connected[i][j]:
                ri, rj = find(i), find(j)
                if ri != rj:
                    if size[ri] < size[rj]:
                        ri, rj = rj, ri
                    parent[rj] = ri
                    size[ri] += size[rj]
                    count -= 1
    return count
```

Time `O(n²·α(n))`: reading the matrix is `O(n²)` and dominates, since you cannot know where the roads are without looking at every entry. Space `O(n)`.

### Common mistakes

- **Decrementing on every road.** Only a union of two different roots reduces the count. The all-ones 3 × 3 test has three roads in its upper triangle but only two merges; decrementing per road returns 0.
- **Treating rows as provinces.** A row lists a city's *direct* neighbours. The chain example shows provinces are transitive; row 0 alone does not mention city 3.
- **Recursive DFS on the matrix.** Correct, but each node scans a full row, and a path-shaped province of 200 cities recurses 200 deep; fine here, but say that an explicit stack is safer at scale.
- **Confusing the input format.** Treating `is_connected[i]` as an edge `[a, b]` list, as in edge-list problems, reads the matrix as nonsense.

### How to discuss it

Name the reduction immediately: "adjacency matrix, provinces are connected components." Then say the cost is `Θ(n²)` no matter which algorithm you pick, because the input is `n²` bits; the choice between DFS and union-find is about what comes next, not about speed here. That is a senior observation: the representation, not the algorithm, sets the bound.

For the follow-up, union-find handles each new road in `O(α(n))` amortised and keeps the count current, while the traversal approach would recount from scratch in `O(n²)` per road. Also mention the adjacency matrix itself: for a sparse road network of 10⁶ cities, an `n × n` matrix is 10¹² entries, so the realistic input is an edge list anyway, which is exactly the shape union-find consumes. The same structure also answers "are cities `a` and `b` in the same province?" in `O(α(n))`.
