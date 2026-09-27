---
slug: grid-and-two-dimensional-dp
title: "Grid and two-dimensional DP: paths, sums and obstacles"
description: Define a state per cell, derive the transition from the two cells that can reach it, watch the grid fill row by row, and cut memory from O(mn) to O(n) with a rolling row.
minutes: 40
difficulty: medium
tags: [dynamic-programming, grid-dp, 2d-dp, unique-paths, min-path-sum, space-optimisation]
problems: [unique-paths, longest-increasing-path]
---
A robot sits in the top-left corner of a 3 × 7 grid and can move only right or down. How many distinct routes reach the bottom-right corner? You could enumerate them with DFS: every route is a sequence of 6 rights and 2 downs in some order, and there are `C(8, 2) = 28` of them. For a 20 × 20 grid there are about 3.5 × 10¹⁰, which DFS will not finish today. Yet the answer for any cell depends only on the answers for two neighbours, and there are only `m × n` cells. That is a two-dimensional DP, and it is the most visual DP family there is: you can literally watch the table fill.

Grid DP is also where memory optimisation first matters. An `m × n` table is fine for `1000 × 1000` integers (4–8 MB) and not fine for `10⁵ × 10⁵`. The rolling-row trick, derived here, brings that to `O(n)` and applies to every 2-D DP whose transition reads only the previous row.

## Unique paths: state, transition, order, answer

**State.** `dp[r][c]` = the number of distinct paths from `(0, 0)` to cell `(r, c)` moving only right or down.

**Transition.** The last move into `(r, c)` came from above, `(r-1, c)`, or from the left, `(r, c-1)`. Those two sets of paths are disjoint (a path's last move is one or the other, never both), so:

$$dp[r][c] = dp[r-1][c] + dp[r][c-1]$$

**Order and base cases.** Every cell in the first row and first column has exactly one path (all-right or all-down), so `dp[0][c] = dp[r][0] = 1`. Then fill row by row, left to right: when you reach `(r, c)`, the cell above was filled in the previous row and the cell to the left was filled a moment ago.

**Answer.** `dp[m-1][n-1]`.

Trace a 3 × 4 grid:

| | c=0 | c=1 | c=2 | c=3 |
|---|---|---|---|---|
| r=0 | 1 | 1 | 1 | 1 |
| r=1 | 1 | 2 | 3 | 4 |
| r=2 | 1 | 3 | 6 | **10** |

Check `dp[2][2] = dp[1][2] + dp[2][1] = 3 + 3 = 6`. The table is Pascal's triangle tilted: `dp[r][c] = C(r + c, r)`, which is the closed form you would use if the interviewer asked for `O(1)` space and you were happy to handle big integers. For the 3 × 4 grid the end cell is `(2, 3)`, and `C(5, 2) = 10`. The DP is still the better answer when obstacles or weights appear, which they do in the next section.

```viz
{"type": "dp", "algorithm": "unique-paths", "rows": 3, "cols": 4, "grid": [[0,0,0,0],[0,0,0,0],[0,0,0,0]], "title": "Unique paths: dp[r][c] = dp[r-1][c] + dp[r][c-1]", "caption": "Row by row, left to right. Each cell sums the cell above and the cell to its left."}
```

```python
def unique_paths(m: int, n: int) -> int:
    dp = [[1] * n for _ in range(m)]
    for r in range(1, m):
        for c in range(1, n):
            dp[r][c] = dp[r - 1][c] + dp[r][c - 1]
    return dp[m - 1][n - 1]
```

Time `O(mn)`: `mn` states, `O(1)` transition. Space `O(mn)` for now.

## Obstacles: the state does not change, the base cases do

Now some cells are blocked (`grid[r][c] = 1`). The state definition is unchanged. The transition acquires one condition: a blocked cell has zero paths through it, so `dp[r][c] = 0` if blocked, otherwise the same sum. The subtle part is the first row and column: once you hit an obstacle, every cell *after* it in that row (or column) is unreachable, so the base-case 1s stop.

The cleanest way to avoid special-casing the borders is to pad: allocate `(m + 1) × (n + 1)` with a zero row on top and a zero column on the left, seed `dp[1][1] = 1` (if the start is not blocked), and let the transition do the rest. Padding with an identity row (0 for sums, `∞` for mins) is a general technique that removes an entire class of off-by-one bugs.

Trace with a 4 × 4 grid and obstacles at `(1, 1)` and `(2, 3)`:

| | c=0 | c=1 | c=2 | c=3 |
|---|---|---|---|---|
| r=0 | 1 | 1 | 1 | 1 |
| r=1 | 1 | **0** | 1 | 2 |
| r=2 | 1 | 1 | 2 | **0** |
| r=3 | 1 | 2 | 4 | **4** |

`dp[1][2] = dp[0][2] + dp[1][1] = 1 + 0 = 1`: the obstacle kills the from-the-left contribution. `dp[3][3] = dp[2][3] + dp[3][2] = 0 + 4 = 4`. Four paths, all of which must pass through `(3, 2)` because `(2, 3)` is blocked.

```python
def unique_paths_with_obstacles(grid: list[list[int]]) -> int:
    m, n = len(grid), len(grid[0])
    dp = [[0] * (n + 1) for _ in range(m + 1)]      # padded with a zero border
    dp[1][1] = 1 if grid[0][0] == 0 else 0
    for r in range(1, m + 1):
        for c in range(1, n + 1):
            if (r, c) == (1, 1) or grid[r - 1][c - 1] == 1:
                continue                                 # blocked stays 0; start stays seeded
            dp[r][c] = dp[r - 1][c] + dp[r][c - 1]
    return dp[m][n]
```

## Minimum path sum: the same shape with min instead of plus

Each cell now has a cost and you want the cheapest right/down route from top-left to bottom-right.

**State.** `dp[r][c]` = the minimum cost of a path from `(0, 0)` to `(r, c)` inclusive of both endpoints' costs.

**Transition.** The last step came from above or the left; take the cheaper predecessor and add this cell:

$$dp[r][c] = grid[r][c] + \min(dp[r-1][c],\; dp[r][c-1])$$

**Base cases.** `dp[0][0] = grid[0][0]`; the first row is a running sum leftwards; the first column is a running sum downwards. Or pad with `∞` and seed `dp[0][0]`.

Trace `grid = [[1, 3, 1], [1, 5, 1], [4, 2, 1]]`:

| | c=0 | c=1 | c=2 |
|---|---|---|---|
| r=0 | 1 | 4 | 5 |
| r=1 | 2 | 7 | 6 |
| r=2 | 6 | 8 | **7** |

`dp[1][2] = 1 + min(dp[0][2], dp[1][1]) = 1 + min(5, 7) = 6`. `dp[2][2] = 1 + min(6, 8) = 7`. The optimal route is `1 → 3 → 1 → 1 → 1` along the top and then down the right edge.

```viz
{"type": "dp", "algorithm": "min-path-sum", "grid": [[1,3,1],[1,5,1],[4,2,1]], "title": "Minimum path sum: dp[r][c] = grid[r][c] + min(up, left)", "caption": "Same fill order as unique paths; the combine operation changes from + to min."}
```

Counting problems combine with `+`, optimisation problems with `min` or `max`, and the rest of the machinery is identical. If you have derived one grid DP you have derived them all; the only things that change are the combine operator, the base cases, and which neighbours can reach a cell.

## Space optimisation: the rolling row

Look at what the transition reads: `dp[r-1][c]` (previous row, same column) and `dp[r][c-1]` (current row, previous column). Nothing from row `r-2` or earlier. So you never need more than two rows in memory, and with care, only one.

Keep a single array `row` of length `n` representing the *previous* row. Sweep `c` from left to right; at column `c`, `row[c]` still holds the previous row's value (up), and `row[c-1]` has already been overwritten with the current row's value (left). Exactly the two things the transition needs:

```python
def unique_paths(m: int, n: int) -> int:
    row = [1] * n
    for _ in range(1, m):
        for c in range(1, n):
            row[c] += row[c - 1]        # row[c] was 'up', row[c-1] is already 'left'
    return row[-1]
```

```javascript
function minPathSum(grid) {
  const m = grid.length, n = grid[0].length;
  const row = new Array(n).fill(Infinity);
  row[0] = 0;                                   // so that row[0] + grid[0][0] seeds correctly
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      const up = row[c];
      const left = c > 0 ? row[c - 1] : Infinity;
      row[c] = grid[r][c] + Math.min(up, left);
    }
  }
  return row[n - 1];
}
```

Trace the JS version on `[[1, 3, 1], [1, 5, 1], [4, 2, 1]]`. Start `row = [0, ∞, ∞]`. After row 0: `[1, 4, 5]` (the `up` for `(0, 0)` was the seeded 0, so `dp = 1 + min(0, ∞) = 1`). After row 1: `c=0`: `1 + min(1, ∞) = 2`; `c=1`: `5 + min(4, 2) = 7`; `c=2`: `1 + min(5, 7) = 6`; `row = [2, 7, 6]`. After row 2: `[6, 8, 7]`. Answer 7, matching the table.

The direction of the inner sweep is not arbitrary. Left-to-right works because the transition reads `c-1`, which must already be updated, and `c`, which must not be. If a transition also read the previous row's `c-1` (the up-left diagonal, as in edit distance or longest common subsequence), a left-to-right sweep would already have overwritten it; you would keep that one value in a saved `diag` variable before overwriting it. A transition that reads only the previous row, such as `c` and `c-1` in the 0/1 knapsack, sweeps right-to-left instead, so the cells it reads are still untouched. The [knapsack lesson](/learn/algorithms/dynamic-programming/knapsack-family) makes this sweep-direction rule the centrepiece of the 0/1 versus unbounded distinction.

Two cautions:

- Rolling rows destroy the table, so you can no longer reconstruct the path by walking back through it. If the interviewer asks for the route, keep the full table or store parent pointers ([DP craft](/learn/algorithms/dynamic-programming/dp-craft)).
- If the grid is the input and you are allowed to mutate it, you can compute min path sum *in place* with zero extra memory. Say out loud that you are mutating the input; in production that is usually a bug, in an interview it is a valid trade-off if stated.

## When the order is not row by row

Row-major order works because every dependency of `(r, c)` has a smaller row or a smaller column. Some grid problems break that: in [Longest Increasing Path](/practice/longest-increasing-path), you may move in all four directions to a strictly larger value, so the dependency of a cell can be below or to the right of it. The state (`longest path starting at (r, c)`) and transition (`1 + max over larger neighbours`) are easy; the fill order is the problem.

Two fixes. Either use top-down memoisation and let the recursion discover the order (the dependency graph is acyclic because values strictly increase, so the recursion terminates), or sort the cells by value and fill in increasing order, which is a topological order of that DAG. Both are `O(mn)` states with `O(1)` transition, and the memoised version is what most people write in an interview. The general principle: **a DP fill order is a topological order of the state dependency graph**. Row-major is just the topological order that happens to work when dependencies point up and left.

## Exercises

```exercise
id: unique-paths-obstacles
title: Unique paths with obstacles
prompt: |
  `grid` is an m × n matrix of 0s (open) and 1s (blocked). Starting at the
  top-left and moving only right or down, return the number of distinct
  paths to the bottom-right that avoid blocked cells. If the start or the
  end is blocked, return 0. The grid has at least one cell.

  Define `dp[r][c]` as the number of paths reaching cell `(r, c)`. A rolling
  row is welcome but not required.
languages: [python, javascript]
entry: unique_paths_with_obstacles
starter:
  python: |
    def unique_paths_with_obstacles(grid):
        # dp[r][c] = paths to (r, c); blocked cells hold 0
        return 0
  javascript: |
    function unique_paths_with_obstacles(grid) {
      // dp[r][c] = paths to (r, c); blocked cells hold 0
      return 0;
    }
tests:
  - args: [[[0, 0, 0], [0, 1, 0], [0, 0, 0]]]
    expected: 2
  - args: [[[0, 1], [0, 0]]]
    expected: 1
  - args: [[[1]]]
    expected: 0
    label: start blocked
  - args: [[[0]]]
    expected: 1
    label: single open cell
  - args: [[[0, 0], [1, 1], [0, 0]]]
    expected: 0
    label: wall across the grid
  - args: [[[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 0, 0]]]
    expected: 4
    hidden: true
  - args: [[[0, 0, 1], [0, 0, 0]]]
    expected: 2
    hidden: true
hints:
  - "Pad with a zero border (or handle the first row/column explicitly): once a first-row cell is blocked, every cell to its right in that row is unreachable."
  - "A blocked cell contributes 0 to its neighbours; set it to 0 and skip the transition."
```

```exercise
id: min-path-sum
title: Minimum path sum
prompt: |
  `grid` is an m × n matrix of non-negative integers. Moving only right or
  down from the top-left to the bottom-right, return the minimum sum of
  the cells on the path (including both endpoints).

  Use O(n) extra space with a rolling row (do not mutate `grid`).
languages: [python, javascript]
entry: min_path_sum
starter:
  python: |
    def min_path_sum(grid):
        # one rolling row; row[c] is 'up', row[c-1] is already 'left'
        return 0
  javascript: |
    function min_path_sum(grid) {
      // one rolling row; row[c] is 'up', row[c-1] is already 'left'
      return 0;
    }
tests:
  - args: [[[1, 3, 1], [1, 5, 1], [4, 2, 1]]]
    expected: 7
  - args: [[[1, 2, 3], [4, 5, 6]]]
    expected: 12
  - args: [[[5]]]
    expected: 5
    label: single cell
  - args: [[[1, 2], [1, 1]]]
    expected: 3
  - args: [[[9, 1, 4, 8]]]
    expected: 22
    label: single row
  - args: [[[3], [1], [2]]]
    expected: 6
    hidden: true
    label: single column
  - args: [[[1, 99, 1], [1, 99, 1], [1, 1, 1]]]
    expected: 5
    hidden: true
hints:
  - "Seed the rolling row with infinity except row[0] = 0, then dp = grid[r][c] + min(row[c], row[c-1]) with row[c-1] treated as infinity when c = 0."
  - "Sweep each row left to right so the left neighbour is already this row's value."
```

## Senior signals

- You state the grid state as **"paths/cost to reach `(r, c)`"** and derive the transition from **which neighbours can enter the cell**, so obstacles and diagonal moves are one-line changes.
- You **pad the table** with an identity border (0 for sums, `∞` for mins) instead of special-casing the first row and column.
- You justify the rolling row by naming **exactly which cells the transition reads**, and you know which sweep direction that dictates.
- You say that rolling rows **forfeit reconstruction** and keep the full table when the path itself is required.
- You recognise that fill order is a **topological order of the dependency graph**, and reach for memoisation or sort-by-value when row-major does not respect it.
- You know the closed form `C(m+n-2, m-1)` for the unweighted case and why the DP is still preferred once obstacles or weights appear.

## Check yourself

```quiz
- q: >-
    In unique paths, why are the paths counted by dp[r-1][c] and dp[r][c-1] guaranteed not to overlap?
  options: ["Because the grid has no obstacles, so no path is shared", "Because each path's final move is either down or right", "Because two distinct paths never pass through the same cell", "They do overlap, and the double count is divided out at the end"]
  answer: 1
  explanation: >-
    Partitioning by the last move gives disjoint sets: a path's final move is down or right, never both, so each path is counted in exactly one term. Paths certainly share cells along the way; what matters is only the last move. This is the same 'what was the last decision' argument as in 1-D DP, and it is why the combine operator is a plain sum.
- q: >-
    A grid DP's transition reads dp[r-1][c-1], dp[r-1][c] and dp[r][c-1]. You want a single rolling row. Which inner sweep direction works?
  options: ["Left to right, so row[c-1] already holds the current row", "Either; every cell is read before it is overwritten", "Right to left, so row[c-1] still holds the previous row", "Neither; one row cannot hold both versions of column c-1"]
  answer: 3
  explanation: >-
    Column c-1 is needed twice: dp[r][c-1] from the current row (which needs left-to-right) and dp[r-1][c-1] from the previous row (which needs right-to-left). Left to right satisfies the first and has already destroyed the second; right to left keeps the second but has not computed the first. The conflicting requirements force a second row, or one saved 'diagonal' variable holding row[c-1] before it is overwritten.
- q: >-
    You compute min path sum in place by overwriting grid[r][c] with the running minimum. The interviewer then asks for the actual path. What is the situation?
  options: ["Only parent pointers help, since dp values cannot show the route", "It is lost, since in-place updating is a rolling row in disguise", "Backtrack by comparing dp values, which the grid still holds in full", "Recompute from scratch, since backtracking needs the original costs"]
  answer: 2
  explanation: >-
    Reconstruction only needs the dp table, not the original costs: from the end cell, step to whichever of dp[r-1][c] and dp[r][c-1] is smaller. In-place overwriting keeps the full dp table, so the path is recoverable without a separate parent grid; it is the rolling-row optimisation, which keeps only one row, that destroys it.
- q: >-
    Longest increasing path in a matrix allows moves in four directions. Why can it still be solved as a DP without infinite loops?
  options: ["It cannot; four-way moves force a BFS rather than a DP", "Because the grid is finite, so every recursion bottoms out", "Because values strictly increase, so dependencies form a DAG", "Because a row-by-row fill visits every neighbour before the cell"]
  answer: 2
  explanation: >-
    Strict increase means no cell can depend on itself transitively, so memoised recursion terminates. Row-major order does not respect these dependencies (a larger neighbour can be below or to the right), but memoisation or sorting cells by value does. Finiteness alone would not prevent cycles if equal values were allowed.
- q: >-
    An m × n grid DP with O(1) transition, m = n = 10⁴, must fit in 100 MB. What is the right call?
  options: ["Keep the full table, since 10⁸ cells is small for a grid DP", "Use memoisation, so that unreachable cells are never stored", "Too big at 8 bytes a cell (800 MB); roll to one row of 10⁴", "Switch to 32-bit integers, halving the table to fit the budget"]
  answer: 2
  explanation: >-
    10⁸ cells × 8 bytes is 800 MB. Halving to 32-bit integers still leaves 400 MB, over the budget. Memoisation still stores every reachable state, which is all of them here. A rolling row of 10⁴ cells uses about 80 KB.
```
