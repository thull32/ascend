---
slug: longest-increasing-path
title: Longest Increasing Path in a Matrix
difficulty: hard
patterns: [dynamic-programming]
lists: [ascend-150]
companies: [google, amazon, meta, uber]
order: 23
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Let `best[r][c]` be the length of the longest strictly increasing path that starts at `(r, c)`. It is 1 plus the best of its strictly larger neighbours."
  - "There is no row-by-row fill order, because a cell can depend on neighbours in any direction. But it only ever depends on strictly larger values, so the dependencies cannot form a cycle."
  - "Either memoise a DFS, or process cells in decreasing order of value so every larger neighbour is already final."
signatures:
  python:
    name: longest_increasing_path
    starter: |
      def longest_increasing_path(matrix: list[list[int]]) -> int:
          pass
  javascript:
    name: longest_increasing_path
    starter: |
      function longest_increasing_path(matrix) {
      }
tests:
  - args: [[[1]]]
    expected: 1
    label: single cell
  - args: [[[1, 2], [4, 3]]]
    expected: 4
  - args: [[[7, 7], [7, 7]]]
    expected: 1
    label: equal neighbours do not count
  - args: [[[5, 4, 3], [6, 1, 2], [7, 8, 9]]]
    expected: 9
    label: spiral through every cell
  - args: [[[3, 1, 6], [2, 5, 4]]]
    expected: 2
  - args: [[[1, 2, 3, 4, 5]]]
    expected: 5
    label: single row
  - args: [[[1], [5], [3], [4], [2]]]
    expected: 2
    label: single column
  - args: [[[0, 1, 0], [1, 0, 1]]]
    expected: 2
    hidden: true
  - args: [[[8, 2, 4], [0, 7, 1], [3, 7, 9]]]
    expected: 4
    hidden: true
  - args: [[[4, 8, 2, 6], [9, 3, 5, 1], [7, 0, 6, 2], [1, 5, 8, 3]]]
    expected: 5
    hidden: true
  - args: [[[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [20, 19, 18, 17, 16, 15, 14, 13, 12, 11], [21, 22, 23, 24, 25, 26, 27, 28, 29, 30], [40, 39, 38, 37, 36, 35, 34, 33, 32, 31], [41, 42, 43, 44, 45, 46, 47, 48, 49, 50], [60, 59, 58, 57, 56, 55, 54, 53, 52, 51], [61, 62, 63, 64, 65, 66, 67, 68, 69, 70], [80, 79, 78, 77, 76, 75, 74, 73, 72, 71], [81, 82, 83, 84, 85, 86, 87, 88, 89, 90], [100, 99, 98, 97, 96, 95, 94, 93, 92, 91]]]
    expected: 100
    hidden: true
    label: a snake that visits every cell
time_limit_ms: 4000
---
Given an `m × n` grid of integers, return the number of cells in the longest path that is strictly increasing. From a cell you may move up, down, left or right to a neighbouring cell (no diagonals, no wrapping around the edges), and each step must go to a strictly larger value.

A single cell is a path of length 1.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 2], [4, 3]]` | `4` | `1 → 2 → 3 → 4`, going round the square |
| `[[7, 7], [7, 7]]` | `1` | Equal values do not count as increasing |
| `[[5, 4, 3], [6, 1, 2], [7, 8, 9]]` | `9` | `1 → 2 → 3 → … → 9` spirals through every cell |

### Constraints

- `1 ≤ m, n ≤ 200`
- `0 ≤ matrix[r][c] ≤ 2³¹ − 1`

### Follow-up

The interviewer asks: "Return the path itself." Then: "What if steps may go to an *equal or larger* value? Does your approach still work?"

## Solution

### The naive approach

Run a DFS from every cell, following strictly larger neighbours and recording the deepest path. Without caching, the DFS from a low cell re-explores everything above it, and every low cell does the same. On a grid with many branching increasing routes the work is exponential in the path length; even on the 10 × 10 snake, the DFS from the cell holding 1 walks all 100 cells, the one from 2 walks 99, and so on.

### The insight

The longest increasing path from a cell does not depend on how you arrived there: it only depends on the cell. So there are `m · n` subproblems. Their dependencies point only toward strictly larger values, so they form a directed acyclic graph: you cannot climb strictly upward and come back to where you started. Longest path is hard on general graphs but easy on a DAG, which is what makes this a DP.

What is missing is a *natural fill order*. Unlike Unique Paths, the neighbour you depend on can be above, below, left or right. Two fixes: let recursion discover the order (memoised DFS), or impose one explicitly by processing cells from the largest value to the smallest.

### The DP

- **State.** `best[r][c]` is the number of cells in the longest strictly increasing path that starts at `(r, c)`.
- **Transition.** `best[r][c] = 1 + max(best[nr][nc])` over the four neighbours with `matrix[nr][nc] > matrix[r][c]`; if there are none, `best[r][c] = 1`.
- **Base cases.** Local maxima (no larger neighbour) have `best = 1`. They are not special in code; the transition gives them 1.
- **Iteration order.** Decreasing order of value (ties in any order, since equal neighbours never depend on each other). Or memoised DFS, where the recursion computes each dependency on demand.
- **Answer.** The maximum of `best` over all cells.

### Worked table for `[[5, 4, 3], [6, 1, 2], [7, 8, 9]]`

Process values 9, 8, 7, … 1. Each cell looks at its larger neighbours, all of which are already final.

| value | cell | larger neighbours (their `best`) | `best` |
|---|---|---|---|
| 9 | (2, 2) | none | 1 |
| 8 | (2, 1) | 9 (1) | 2 |
| 7 | (2, 0) | 8 (2) | 3 |
| 6 | (1, 0) | 7 (3) | 4 |
| 5 | (0, 0) | 6 (4) | 5 |
| 4 | (0, 1) | 5 (5) | 6 |
| 3 | (0, 2) | 4 (6) | 7 |
| 2 | (1, 2) | 3 (7), 9 (1) | 8 |
| 1 | (1, 1) | 4 (6), 6 (4), 2 (8), 8 (2) | **9** |

The finished `best` grid is `[[5, 6, 7], [4, 9, 8], [3, 2, 1]]`: the spiral read backwards. Note that the cell holding 2 had two larger neighbours and took the better one (via 3, not the direct step to 9).

### Memoised DFS version

```python
from functools import lru_cache

def longest_increasing_path_memo(matrix: list[list[int]]) -> int:
    rows, cols = len(matrix), len(matrix[0])

    @lru_cache(maxsize=None)
    def best(r: int, c: int) -> int:
        length = 1
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and matrix[nr][nc] > matrix[r][c]:
                length = max(length, 1 + best(nr, nc))
        return length

    return max(best(r, c) for r in range(rows) for c in range(cols))
```

Time `O(m · n)`: each cell is computed once and looks at four neighbours. Space `O(m · n)` for the cache. The catch is recursion depth: a path can be `m · n = 40,000` cells long, far past Python's default recursion limit, and deep enough to overflow the native stack in some languages. The snake test is only 100 deep; a 200 × 200 snake would crash this version unless you raise the limit.

### Iterative version (sort by value)

```python
def longest_increasing_path(matrix: list[list[int]]) -> int:
    rows, cols = len(matrix), len(matrix[0])
    best = [[1] * cols for _ in range(rows)]
    cells = sorted(
        ((matrix[r][c], r, c) for r in range(rows) for c in range(cols)),
        reverse=True,                          # largest values first
    )
    answer = 1
    for value, r, c in cells:
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and matrix[nr][nc] > value:
                if best[nr][nc] + 1 > best[r][c]:
                    best[r][c] = best[nr][nc] + 1
        answer = max(answer, best[r][c])
    return answer
```

Time `O(m · n · log(m · n))` for the sort plus `O(m · n)` for the sweep; space `O(m · n)`. No recursion, so no depth limit. A third option with the same safety and `O(m · n)` time is Kahn-style topological peeling: repeatedly remove all cells that have no larger neighbour left, and count the layers; the number of layers is the answer.

### Space

There is no rolling reduction: the dependencies do not follow rows or columns, so any cell's value may be needed until the end. `O(m · n)` is required.

### Common mistakes

- Using `>=` instead of `>`: equal neighbours would create cycles, and the memoised DFS would recurse forever (or return nonsense from a partially filled cache).
- A `visited` set as in ordinary DFS. It is unnecessary (strict increase already prevents revisiting a cell on the current path) and, if shared across starts, wrong: it stops a later start from walking through cells that an earlier start visited.
- Filling `best` row by row. A cell's larger neighbour may be below or to the right and not yet computed.
- Forgetting the recursion depth problem in the memoised version.

### How to discuss it

Say "the state is the start cell; dependencies point to strictly larger neighbours, so it is a DAG, and longest path on a DAG is a DP". Then address the order explicitly: "no row-major order works, so I either memoise a DFS or sort by value". Offer the memoised version (quick to write) and mention the depth issue and the sort-based or topological fix. That discussion of order is what separates this from the grid DPs that fill themselves.

For the path, store the chosen neighbour for each cell (a `next` pointer) and follow it from the best start. For "equal or larger", cycles appear among equal-valued plateaus, and longest simple path in a graph with cycles is NP-hard in general. The DP no longer applies directly. If revisiting is allowed within a plateau (counting each cell once), you can collapse each strongly connected component into one node weighted by its size and run the same DAG DP on the condensation; if the path must be simple and plateaus can be walked in complicated ways, say that the problem has changed class and ask what the constraints really are.
