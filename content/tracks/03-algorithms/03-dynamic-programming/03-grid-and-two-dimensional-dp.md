---
slug: grid-and-two-dimensional-dp
title: "Grid and two-dimensional DP: paths, sums and obstacles"
description: Define a state per cell, derive the transition from the two cells that can reach it, watch the grid fill row by row, and cut memory from O(mn) to O(n) with a rolling row.
minutes: 55
difficulty: medium
tags: [dynamic-programming, grid-dp, 2d-dp, unique-paths, min-path-sum, space-optimisation]
problems: [unique-paths, longest-increasing-path]
---
A robot sits in the top-left corner of a 3 × 7 grid and can move only right or down. How many distinct routes reach the bottom-right corner? You could enumerate them with DFS: every route is a sequence of 6 rights and 2 downs in some order, and there are `C(8, 2) = 28` of them. For a 20 × 20 grid there are `C(38, 19) = 35,345,263,800`, about 3.5 × 10¹⁰, which a DFS that visits every route will not finish today. Yet the answer for any cell depends only on the answers for two neighbours, and there are only `m × n` cells. That is a two-dimensional DP, and it is the most visual DP family there is: you can watch the table fill.

Grid DP is also where memory optimisation first matters. An `m × n` table is fine for `1000 × 1000` integers (8 MB as a NumPy array, about 40 MB as a Python list of lists; both numbers are derived below) and not fine for `10⁵ × 10⁵`. The rolling-row trick brings that to `O(n)`, and it introduces the first way a DP silently goes wrong: sweeping the row in the wrong direction.

## Unique paths: state, transition, order, answer

**State.** `dp[r][c]` = the number of distinct paths from `(0, 0)` to cell `(r, c)` moving only right or down.

**Transition.** The last move into `(r, c)` came from above, `(r-1, c)`, or from the left, `(r, c-1)`. Those two sets of paths are disjoint (a path's last move is one or the other, never both), and together they are all the paths, so:

$$dp[r][c] = dp[r-1][c] + dp[r][c-1]$$

**Order and base cases.** Every cell in the first row and first column has exactly one path (all-right or all-down), so `dp[0][c] = dp[r][0] = 1`. Then fill row by row, left to right: when you reach `(r, c)`, the cell above was filled in the previous row and the cell to the left was filled a moment ago.

**Answer.** `dp[m-1][n-1]`.

Fill a 3 × 4 grid cell by cell. Row 0 and column 0 are the base case, all 1s. Then:

| cell | reads | value |
|---|---|---|
| `dp[1][1]` | `dp[0][1] + dp[1][0]` | `1 + 1 = 2` |
| `dp[1][2]` | `dp[0][2] + dp[1][1]` | `1 + 2 = 3` |
| `dp[1][3]` | `dp[0][3] + dp[1][2]` | `1 + 3 = 4` |
| `dp[2][1]` | `dp[1][1] + dp[2][0]` | `2 + 1 = 3` |
| `dp[2][2]` | `dp[1][2] + dp[2][1]` | `3 + 3 = 6` |
| `dp[2][3]` | `dp[1][3] + dp[2][2]` | `4 + 6 = 10` |

| | c=0 | c=1 | c=2 | c=3 |
|---|---|---|---|---|
| r=0 | 1 | 1 | 1 | 1 |
| r=1 | 1 | 2 | 3 | 4 |
| r=2 | 1 | 3 | 6 | **10** |

The table is Pascal's triangle tilted: `dp[r][c] = C(r + c, r)`, which is the closed form you would use if the interviewer asked for `O(1)` space and you were happy to handle big integers ([counting and combinatorics](/learn/foundations/math-for-engineers/counting-and-combinatorics) derives it: a path is a choice of which `r` of the `r + c` moves are downs). For the 3 × 4 grid the end cell is `(2, 3)`, and `C(5, 2) = 10`. The DP is still the better answer when obstacles or weights appear, which they do in the next sections.

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

## Why the recurrence is correct

Two properties make a grid DP valid, and an interviewer who asks "why can you add those two numbers?" wants them stated precisely.

**The state is sufficient.** Everything a path does after reaching `(r, c)` depends only on `(r, c)`: the moves available and the cells ahead are the same whichever route arrived there. So the set of paths to `(r, c)` can be summarised by a single number (their count) or, for costs, by a single best value, and nothing about the route's history has to be carried forward. When this fails, the state is too small; the [sequence DP](/learn/algorithms/dynamic-programming/sequence-dp) lesson shows how to enlarge it.

**Optimal substructure, for minimisation.** Take any cheapest path to `(r, c)` and cut off its last step. The remaining prefix ends at `(r-1, c)` or `(r, c-1)` and must itself be a cheapest path to that cell: if a cheaper prefix existed, pasting the same last step onto it would produce a cheaper path to `(r, c)`, contradicting the assumption. This cut-and-paste argument is the whole proof that `min(up, left) + grid[r][c]` is right, and it is the same argument that justifies every DP transition of the form "best answer here = best predecessor + local cost".

**Disjointness, for counting.** The paths counted by `dp[r-1][c]` end with a down move and those counted by `dp[r][c-1]` end with a right move, so no path is counted twice and every path is counted once. Counting DPs need this partition argument in place of the cut-and-paste one; a transition that double-counts is the most common counting bug, and the check is always "does every object land in exactly one branch?"

**The fill order respects the dependencies.** Row-major order visits `(r-1, c)` and `(r, c-1)` before `(r, c)`. In graph terms the cells are nodes, the transitions are edges pointing up and left, and row-major order is a topological order of that DAG ([topological sort](/learn/data-structures/graphs/topological-sort-and-dags)). Every DP fill order is a topological order of its dependency graph; row-major is the one that happens to work here.

## Obstacles: the state does not change, the base cases do

Now some cells are blocked (`grid[r][c] = 1`). The state definition is unchanged. The transition acquires one condition: a blocked cell has zero paths through it, so `dp[r][c] = 0` if blocked, otherwise the same sum. The subtle part is the first row and column: once you hit an obstacle, every cell *after* it in that row (or column) is unreachable, so the base-case 1s stop. A first row of `[0, 1, 0, 0]` has `dp` values `[1, 0, 0, 0]`, not `[1, 0, 1, 1]`.

The cleanest way to avoid special-casing the borders is to pad: allocate `(m + 1) × (n + 1)` with a zero row on top and a zero column on the left, seed `dp[1][1] = 1` (if the start is not blocked), and let the transition do the rest. The padded first row then computes itself correctly: `dp[1][2] = dp[0][2] + dp[1][1] = 0 + 1`, and after a blocked cell the sum of a zero above and a zero to the left stays zero. Padding with an identity row (0 for sums, `∞` for mins) is a general technique that removes an entire class of off-by-one bugs.

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

`dp[1][1] = 5 + min(dp[0][1], dp[1][0]) = 5 + min(4, 2) = 7`. `dp[1][2] = 1 + min(dp[0][2], dp[1][1]) = 1 + min(5, 7) = 6`. `dp[2][2] = 1 + min(6, 8) = 7`.

```viz
{"type": "dp", "algorithm": "min-path-sum", "grid": [[1,3,1],[1,5,1],[4,2,1]], "title": "Minimum path sum: dp[r][c] = grid[r][c] + min(up, left)", "caption": "Same fill order as unique paths; the combine operation changes from + to min."}
```

**Reconstructing the route.** The table holds costs, not moves, but the moves are recoverable: from the end cell, step to whichever predecessor produced the value. Walk back from `(2, 2)`:

| at | up | left | move | reason |
|---|---|---|---|---|
| `(2, 2) = 7` | `dp[1][2] = 6` | `dp[2][1] = 8` | to `(1, 2)` | `7 = 1 + 6`, the up neighbour explains the value |
| `(1, 2) = 6` | `dp[0][2] = 5` | `dp[1][1] = 7` | to `(0, 2)` | `6 = 1 + 5` |
| `(0, 2) = 5` | none | `dp[0][1] = 4` | to `(0, 1)` | first row: only left is possible |
| `(0, 1) = 4` | none | `dp[0][0] = 1` | to `(0, 0)` | |

Reversed, the route is `(0,0) → (0,1) → (0,2) → (1,2) → (2,2)`, costs `1 + 3 + 1 + 1 + 1 = 7`. When up and left tie, either is a valid optimal route. The alternative is a parallel `parent` table recording the winning direction as each cell is filled: two bits per cell, and no comparisons on the way back. [DP craft](/learn/algorithms/dynamic-programming/dp-craft) covers reconstruction in general, including after the table has been rolled away.

Counting problems combine with `+`, optimisation problems with `min` or `max`; the only other things that change between grid DPs are the base cases and which neighbours can reach a cell.

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

**What the wrong direction does.** Sweep the unique-paths row right to left instead, on the 3 × 4 grid. Start `row = [1, 1, 1, 1]`. `c = 3`: `row[3] += row[2]` gives 2, but `row[2]` is still the *previous* row's value, so this cell has added `up + up` instead of `up + left`. `c = 2`: `1 + 1 = 2`. `c = 1`: `1 + 1 = 2`. The row is now `[1, 2, 2, 2]` where it should be `[1, 2, 3, 4]`; after the second pass it is `[1, 3, 4, 4]` and the function returns 4 instead of 10. No exception, no warning, a plausible-looking number. The direction is not a style choice: left-to-right is forced because the transition reads `c-1` from the *current* row.

The rule for one-row DPs, which [knapsack](/learn/algorithms/dynamic-programming/knapsack-family) makes its centrepiece: a value needed from the **current** row must already be overwritten when read (sweep towards it); a value needed from the **previous** row must not be (sweep away from it). When a transition reads both the previous row's `c-1` (the diagonal, as in edit distance or LCS) and the current row's `c-1`, no direction satisfies both, so the conflicting value is kept in a variable:

```python
def lcs_rolling(a: str, b: str) -> int:
    row = [0] * (len(b) + 1)
    for ch in a:
        diag = 0                          # dp[i-1][0] is always 0
        for j in range(1, len(b) + 1):
            up = row[j]                   # still the previous row here
            row[j] = diag + 1 if ch == b[j - 1] else max(up, row[j - 1])
            diag = up                     # the overwritten value is the next column's diagonal
    return row[-1]
```

Two cautions. Rolling rows destroy the table, so the walk-back is gone; if the route is wanted, keep the full table, parent bits, or the checkpointing trick in [DP craft](/learn/algorithms/dynamic-programming/dp-craft). And if you may mutate the input grid, min path sum runs *in place* with zero extra memory; say out loud that you are mutating the input, because in production code that is usually a bug.

## Under the hood: what the table costs

A 2-D DP in Python is a list of row lists, and its memory is dominated by things you do not see in the code. Every row is a list of 8-byte pointers (a 1,000-element list is 8,056 bytes), and every cell value is a separate `int` object: 28 bytes for values below 2³⁰, 32 bytes up to 2⁶⁰, and 4 more bytes per further 30 bits. Only the integers from −5 to 256 are shared singletons. So a 1000 × 1000 min-path-sum table whose costs run into the thousands measured 40 MB on CPython 3.14 (8 MB of pointers plus roughly 10⁶ × 28 bytes of int objects, plus list headers). The same-sized unique-paths table measured 150 MB, because its corner cell has 600 digits and occupies 292 bytes, and most cells are similarly large. A NumPy `int64` array of the same shape is exactly 8,000,000 bytes, contiguous, with no per-cell object; a rolling row is 8 KB either way. When an interviewer asks "how much memory does your table use?", the honest Python answer is 40–150 bytes per cell depending on the values, not 8.

Time per cell is likewise not the arithmetic. The 10⁶-cell min-path-sum loop above took about 90 ms on CPython 3.14 on this machine, roughly 90 ns per cell, almost all of it interpreter overhead for indexing and `min`. A compiled language does the same cell in a few nanoseconds until the table stops fitting in cache; after that memory bandwidth is the limit. Those figures depend on the interpreter version and the CPU, but the ratio, one to two orders of magnitude, is what you should carry around.

The sweep order also decides cache behaviour, in any language. Row-major fill touches consecutive addresses, so each 64-byte line serves 8 `int64` cells and the prefetcher stays ahead. Column-by-column fill strides by a full row (8 KB for a 1,000-wide `int64` table), so every access lands on a fresh line and often a fresh page, several times slower for identical arithmetic. [Two-dimensional arrays](/learn/data-structures/arrays-strings/two-dimensional-arrays) and [CPU caches and memory layout](/learn/systems/performance-engineering/cpu-caches-and-memory-layout) cover why; the rule is to run the inner loop along the contiguous dimension, and in Python to bind `row = dp[r]` and `prev = dp[r-1]` outside it to skip one lookup per cell.

## Counting overflow: when the cell does not fit

Path counts grow as `C(r + c, r)`, which is exponential in the grid's perimeter. Python's arbitrary-precision integers hide this; fixed-width languages do not, and the failure is silent.

| Cell type | First square grid where the corner no longer fits | What you observe |
|---|---|---|
| 32-bit signed (`int` in Java and C, `int32` in Go) | 18 × 18: `C(34, 17) = 2,333,606,220` | wraps to `−1,961,361,076` |
| IEEE double (JavaScript `number`) | 32 × 32: corner is `465,428,353,255,261,088`, the double sum gives `…056` | off by 32, no error, no `NaN` |
| 64-bit signed (`long`, `i64`, Go's `int` on 64-bit platforms) | 35 × 35: `C(68, 34) ≈ 2.8 × 10¹⁹` | wraps negative |

The double case is the nastiest: additions of exactly representable integers stay exact until the running values pass 2⁵³ ≈ 9 × 10¹⁵, and then each addition may round by a few units; `unique_paths(30, 30)` happens to come out exact, `unique_paths(32, 32)` does not. That is why problem statements say "return the answer modulo 10⁹ + 7": addition and multiplication commute with taking the remainder, so you reduce every cell as you fill it and the table stays inside 32 bits. In JavaScript use `BigInt` or the modulus; in Rust use `checked_add` or `u128` and let overflow be an error rather than a wrong answer. In Python the cost of not overflowing is the 150 MB table above.

## When the order is not row by row

Row-major order works because every dependency of `(r, c)` has a smaller row or a smaller column. Some grid problems break that: in [Longest Increasing Path](/practice/longest-increasing-path), you may move in all four directions to a strictly larger value, so the dependency of a cell can be below or to the right of it. The state (`longest path starting at (r, c)`) and transition (`1 + max over strictly larger neighbours`) are easy; the fill order is the problem.

The dependency graph has `mn` nodes and at most `4mn` edges, and it is acyclic because every edge goes to a strictly larger value, so a topological order exists. Two ways to get one. **Memoised recursion** lets the call stack discover the order: `longest(r, c)` recurses into larger neighbours and caches the result, and the recursion terminates because values strictly increase. Its cost is `O(mn)` states with `O(1)` work each, but the recursion depth equals the longest increasing path, up to `mn` on a grid that snakes upward, which exceeds CPython's default limit of 1,000 frames on a 40 × 40 grid. **Sorting the cells by value** gives an explicit topological order with no recursion: process cells from smallest to largest and each cell reads only neighbours already final. That costs `O(mn log(mn))` for the sort and is what you write when the grid is large. The general principle: **a DP fill order is a topological order of the state dependency graph**. Row-major is the topological order that happens to work when dependencies point up and left.

## Top-down or bottom-up, and when a table is the wrong tool

Bottom-up fills every cell. Top-down memoisation fills only the cells the answer depends on, at a cost per cell of a function call and a dictionary lookup, which in CPython is several times a loop iteration (the ratio depends on the version; measure it). So top-down wins when the reachable states are a small fraction of the table: a maze in which 95% of cells are walls, a grid where the start and end are close together, or the longest-increasing-path DAG above, where the order is awkward to compute. Bottom-up wins when most cells are needed, which for right/down grid problems is always: every cell is reachable, so the loop's lower constant factor and the option of a rolling row make it the right default.

Sometimes neither is right. Three signals that a grid table is the wrong tool:

- **The grid is enormous and almost empty.** A `10⁶ × 10⁶` grid with 2,000 obstacles has 10¹² cells; no table fits, rolled or not. Sort the obstacles by `(r, c)` and count paths with inclusion–exclusion: `f[i]` = paths from the start to obstacle `i` that avoid all earlier obstacles = `C(rᵢ + cᵢ, rᵢ) − Σⱼ f[j] · C(rᵢ − rⱼ + cᵢ − cⱼ, rᵢ − rⱼ)` over obstacles `j` that can reach `i`. The target is treated as the final "obstacle". That is `O(k²)` with binomials modulo a prime via precomputed factorials and modular inverses; on the 4 × 4 example above it also yields 4.
- **Moves go in all four directions with weights.** Min path sum with four-way movement is a shortest-path problem on a grid graph with non-negative weights, and cycles make the DP recurrence circular. That is [Dijkstra](/learn/algorithms/graph-algorithms/shortest-paths-dijkstra) in `O(mn log(mn))`, not a table fill.
- **The objective is a max over the path rather than a sum.** "Minimise the highest cell you must step on" ([swim-in-rising-water](/practice/swim-in-rising-water)) is [binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer) with a BFS predicate, or Dijkstra with `max` in place of `+`, or union-find over cells sorted by height. A right/down table gives the wrong answer because the optimal route may go up.

## Failure modes

**Every row of the table changes at once.** Symptom: `dp` fills with nonsense; printing it shows identical rows. Diagnosis: `dp = [[0] * n] * m` in Python creates one inner list and `m` references to it, so `dp[1][2] = 5` sets column 2 in every row. Fix: `[[0] * n for _ in range(m)]`, one fresh list per row. JavaScript's `Array(m).fill(Array(n).fill(0))` has exactly the same aliasing.

**The count is too large, and only for grids whose first row is open.** Symptom: unpadded code, `dp[r-1][c]` at `r = 0`. Diagnosis: Python's `dp[-1]` is the *last* row, not an error, so the first row reads the final row's values (zeros on the first pass, garbage on subsequent runs of a reused table). Fix: pad with an identity border, or guard `r > 0` explicitly. The same code in Java throws `ArrayIndexOutOfBoundsException`, which is the better outcome.

**The rolled version returns a smaller number than the table version.** Symptom: unique paths gives 4 where the 2-D code gives 10. Diagnosis: the inner sweep runs right to left, so `row[c-1]` is still the previous row when read (the trace above). Fix: derive the direction from what the transition reads; write the 2-D version first and diff the two outputs on a 3 × 4 grid before trusting the optimisation.

**The answer is negative, or off by a few units, on grids past 30 × 30.** Symptom: a Java or JavaScript solution passes small tests and fails large ones with a number of the right magnitude. Diagnosis: overflow (`int`, `long`) or double rounding past 2⁵³ (see the table above). Fix: reduce modulo the requested prime at every cell, or use a big-integer type.

**The service returns wrong costs for the second request with the same grid.** Symptom: in-place min path sum works once, then every later call on the cached grid object returns a smaller number. Diagnosis: the function overwrote the caller's grid with running sums, and the caller reused it. Fix: copy the input or use a rolling row; never mutate shared input in a request path.

**A DFS that "counts paths" never returns on a 20 × 20 grid.** Symptom: 100% CPU for minutes. Diagnosis: the recursion has no memo, so it enumerates all 3.5 × 10¹⁰ routes. Fix: the state `(r, c)` is sufficient, so memoise on it or fill the table; the run drops to 400 cells.

## Trade-offs

| Approach | Memory | Reconstruction | Handles obstacles/weights | Notes |
|---|---|---|---|---|
| Full `m × n` table | `O(mn)`: 8 B/cell in NumPy, 40–150 B/cell as Python ints | yes, walk back | yes | default when `mn ≤ ~10⁷` |
| Rolling row | `O(n)` | no (needs parents or checkpoints) | yes | forced sweep direction |
| In-place on the input | `O(1)` extra | yes (table survives in the grid) | yes | mutates the caller's data |
| Top-down memo | `O(reachable states)` + stack | yes, via the memo | yes; also awkward orders | several times the per-cell cost in CPython |
| Closed form `C(m+n−2, m−1)` | `O(1)` | not applicable | no | big integers or modular binomials |
| Inclusion–exclusion over obstacles | `O(k)` | no | obstacles only | `O(k²)`; for huge sparse grids |

## Interviewer follow-ups

**"How many paths through a 100 × 100 grid, and does your Java solution return the right number?"** Model answer: `C(198, 99)` has 59 digits, so no primitive type holds it; the problem will ask for the count modulo 10⁹ + 7, and because addition commutes with the modulus you reduce each cell as you go and the table stays in 32 bits. In Python the exact answer is fine but costs about 52 bytes per cell near the corner (292 at 1000 × 1000). Common wrong answer: "use `double`", which is off by rounding past 2⁵³ and reports nothing.

**"Now the robot may move in any of the four directions. Same DP?"** Model answer: no. The dependency graph now has cycles, so there is no fill order; min path sum becomes Dijkstra on the grid graph, and unique paths is ill-defined unless paths are simple, which makes it a hard counting problem. Common wrong answer: DFS with a visited set, which is exponential for counting and wrong for costs.

**"The grid is 10⁶ × 10⁶ with 2,000 blocked cells."** Model answer: 10¹² cells rules out any table; inclusion–exclusion over the sorted obstacles, as above, is `O(k²)` binomials modulo a prime, about 4 × 10⁶ for 2,000 obstacles. Common wrong answer: "a rolling row", which still has to sweep 10¹² cells.

**"Give me the actual route with O(n) memory."** Model answer: two bits per cell of parent direction is `mn / 4` bytes (250 KB for 10⁶ cells), usually acceptable; if not, checkpoint every `k`-th row and recompute the rows between checkpoints while walking back. Common wrong answer: "it is impossible once the rows are rolled".

**"The cost of a path is its largest cell rather than its sum. Same recurrence with `max`?"** Model answer: no; the optimal route may go up or left to avoid a tall cell. It is minimise-the-maximum: binary search on the threshold with a BFS predicate in `O(mn log(max))`, or Dijkstra with `max` as the combine. Common wrong answer: the right/down table with `max`, which fails the first grid where the path must go up.

## What mid-level engineers get wrong

- **Building the table with `[[0] * n] * m`.** Consequence: every row aliases the same list and the table is garbage from the first write.
- **Special-casing the first row and column by hand** and getting the obstacle break wrong. Consequence: a first row of `[0, 1, 0, 0]` counts paths through the wall.
- **Rolling the row without deriving the sweep direction.** Consequence: a smaller, plausible number; the bug hides until a test compares against the 2-D version.
- **Assuming path counts fit in 64 bits.** Consequence: a Java or Go solution that fails on a 35 × 35 grid with a negative answer.
- **Applying the right/down recurrence to a four-direction problem.** Consequence: the DP has no valid fill order; the answer is wrong whenever the best route turns back, which the small tests rarely exercise.

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
- You can give the **correctness argument** in two sentences: cut-and-paste for minimisation, partition-by-last-move for counting, and "the future depends only on the cell" for state sufficiency.
- You **pad the table** with an identity border (0 for sums, `∞` for mins) instead of special-casing the first row and column.
- You justify the rolling row by naming **exactly which cells the transition reads**, you know which sweep direction that dictates, and you can show what the wrong direction computes.
- You put **numbers on the table**: 8 bytes per cell in a typed array, 40–150 in Python, about 90 ns per cell in CPython, and the grid sizes at which `int`, doubles and `long` overflow.
- You say that rolling rows **forfeit reconstruction** and keep the full table, parent bits or checkpoints when the path itself is required.
- You recognise that fill order is a **topological order of the dependency graph**, and reach for memoisation or sort-by-value when row-major does not respect it, and for Dijkstra or binary search when the move set has cycles or the objective is a maximum.
- You know the closed form `C(m+n-2, m-1)`, the inclusion–exclusion trick for huge sparse grids, and why the DP is still preferred once obstacles or weights appear on a grid that fits.

## Check yourself

```quiz
- q: >-
    In unique paths, why are the paths counted by dp[r-1][c] and dp[r][c-1] guaranteed not to overlap?
  options: ["Because each path's final move is either down or right", "Because the grid has no obstacles, so no path is shared", "Because two distinct paths never pass through the same cell", "They do overlap, and the double count is divided out at the end"]
  answer: 0
  explanation: >-
    Partitioning by the last move gives disjoint sets: a path's final move is down or right, never both, so each path is counted in exactly one term. Paths certainly share cells along the way; what matters is only the last move. This is the same 'what was the last decision' argument as in 1-D DP, and it is why the combine operator is a plain sum.
- q: >-
    A grid DP's transition reads dp[r-1][c-1], dp[r-1][c] and dp[r][c-1]. You want a single rolling row. Which inner sweep direction works?
  options: ["Either; every cell is read before it is overwritten", "Right to left, so row[c-1] still holds the previous row", "Neither; one row cannot hold both versions of column c-1", "Left to right, so row[c-1] already holds the current row"]
  answer: 2
  explanation: >-
    Column c-1 is needed twice: dp[r][c-1] from the current row (which needs left-to-right) and dp[r-1][c-1] from the previous row (which needs right-to-left). Left to right satisfies the first and has already destroyed the second; right to left keeps the second but has not computed the first. The conflicting requirements force a second row, or one saved 'diagonal' variable holding row[c-1] before it is overwritten.
- q: >-
    You compute min path sum in place by overwriting grid[r][c] with the running minimum. The interviewer then asks for the actual path. What is the situation?
  options: ["Recompute from scratch, since backtracking needs the original costs", "Only parent pointers help, since dp values cannot show the route", "It is lost, since in-place updating is a rolling row in disguise", "Backtrack by comparing dp values, which the grid still holds in full"]
  answer: 3
  explanation: >-
    Reconstruction only needs the dp table, not the original costs: from the end cell, step to whichever of dp[r-1][c] and dp[r][c-1] is smaller. In-place overwriting keeps the full dp table, so the path is recoverable without a separate parent grid; it is the rolling-row optimisation, which keeps only one row, that destroys it.
- q: >-
    Longest increasing path in a matrix allows moves in four directions. Why can it still be solved as a DP without infinite loops?
  options: ["It cannot; four-way moves force a BFS rather than a DP", "Because a row-by-row fill visits every neighbour before the cell", "Because the grid is finite, so every recursion bottoms out", "Because values strictly increase, so dependencies form a DAG"]
  answer: 3
  explanation: >-
    Strict increase means no cell can depend on itself transitively, so memoised recursion terminates. Row-major order does not respect these dependencies (a larger neighbour can be below or to the right), but memoisation or sorting cells by value does. Finiteness alone would not prevent cycles if equal values were allowed.
- q: >-
    An m × n grid DP with O(1) transition, m = n = 10⁴, must fit in 100 MB. What is the right call?
  options: ["Switch to 32-bit integers, halving the table to fit the budget", "Too big at 8 bytes a cell (800 MB); roll to one row of 10⁴", "Keep the full table, since 10⁸ cells is small for a grid DP", "Use memoisation, so that unreachable cells are never stored"]
  answer: 1
  explanation: >-
    10⁸ cells × 8 bytes is 800 MB even as a typed array, and several times more as Python int objects. Halving to 32-bit integers still leaves 400 MB, over the budget. Memoisation still stores every reachable state, which is all of them here. A rolling row of 10⁴ cells uses about 80 KB.
- q: >-
    A colleague writes dp = [[0] * n] * m in Python to build the table. What happens when the fill runs?
  options: ["It works, because the multiplication copies the inner list m times", "It works, but the table uses m times more memory than needed", "Every row aliases one list, so each write appears in all rows", "An IndexError, since the outer list has n rows rather than m"]
  answer: 2
  explanation: >-
    List multiplication repeats the same reference m times, so there is one inner list shared by every row and dp[1][2] = 5 shows up in dp[0][2] and dp[2][2] too. The shape is right, so there is no IndexError, and the memory is smaller rather than larger. Build rows with a comprehension so each is a fresh list; JavaScript's Array(m).fill(Array(n).fill(0)) has the same aliasing.
```
