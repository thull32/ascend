---
slug: unique-paths
title: Unique Paths
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [google, amazon, bloomberg]
order: 13
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "The last move into cell `(r, c)` came either from the cell above or from the cell to the left."
  - "`paths[r][c] = paths[r - 1][c] + paths[r][c - 1]`. Every cell in the top row and the left column has exactly one route."
  - "Each row only needs the row above, and updating a single row left to right in place does exactly that. There is also a closed form: choose which of the `m + n - 2` moves are downward."
signatures:
  python:
    name: unique_paths
    starter: |
      def unique_paths(m: int, n: int) -> int:
          pass
  javascript:
    name: unique_paths
    starter: |
      function unique_paths(m, n) {
      }
tests:
  - args: [1, 1]
    expected: 1
    label: start is the finish
  - args: [2, 2]
    expected: 2
  - args: [3, 3]
    expected: 6
  - args: [3, 4]
    expected: 10
  - args: [1, 9]
    expected: 1
    label: single row
  - args: [5, 1]
    expected: 1
    label: single column
  - args: [4, 5]
    expected: 35
  - args: [10, 10]
    expected: 48620
    hidden: true
  - args: [16, 16]
    expected: 155117520
    hidden: true
  - args: [23, 12]
    expected: 193536720
    hidden: true
    label: tall grid
time_limit_ms: 4000
---
A robot stands in the top-left cell of a grid with `m` rows and `n` columns. Each move takes it one cell right or one cell down; it can never move left or up, and it cannot leave the grid. Return the number of distinct routes that take it to the bottom-right cell.

### Examples

| Input | Output | Why |
|---|---|---|
| `m = 2`, `n = 2` | `2` | Right then down, or down then right |
| `m = 3`, `n = 4` | `10` | Every route is 2 downs and 3 rights in some order: `C(5, 2) = 10` |
| `m = 1`, `n = 9` | `1` | A single row allows only straight right |

### Constraints

- `1 ≤ m, n ≤ 100`
- The answer is at most `2 × 10⁹` for every test.

### Follow-up

The interviewer asks: "Some cells are now blocked. What changes?" Then: "Now `m` and `n` are up to `10⁶` and the answer is wanted modulo `10⁹ + 7`. Is the grid DP still the right tool?"

## Solution

### The naive approach

Recurse from the start: `count(r, c) = count(r + 1, c) + count(r, c + 1)`. Every route is explored separately, so the running time is proportional to the answer itself, which for a 16 × 16 grid is about `1.5 × 10⁸` routes. Meanwhile there are only `m · n` distinct cells.

### The insight

The number of routes into a cell depends only on the cell, not on how you got to its neighbours. The last move into `(r, c)` was either down from `(r - 1, c)` or right from `(r, c - 1)`. Those groups are disjoint and cover every route, so their counts add.

### The DP

- **State.** `paths[r][c]` is the number of routes from `(0, 0)` to `(r, c)`.
- **Transition.** `paths[r][c] = paths[r - 1][c] + paths[r][c - 1]` for `r, c ≥ 1`.
- **Base cases.** `paths[0][c] = 1` for every column (only right moves reach the top row) and `paths[r][0] = 1` for every row (only down moves). This includes `paths[0][0] = 1`.
- **Iteration order.** Row by row, left to right: each cell needs the cell above (previous row) and the cell to its left (earlier in the same row).
- **Answer.** `paths[m - 1][n - 1]`.

### Worked table for `m = 3`, `n = 4`

| row \ col | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| 0 | 1 | 1 | 1 | 1 |
| 1 | 1 | 2 | 3 | 4 |
| 2 | 1 | 3 | 6 | **10** |

For example `paths[2][2] = paths[1][2] + paths[2][1] = 3 + 3 = 6`. The table is Pascal's triangle turned on its side, which is why a binomial coefficient appears below.

### Tabulated version

```python
def unique_paths_table(m: int, n: int) -> int:
    paths = [[1] * n for _ in range(m)]
    for r in range(1, m):
        for c in range(1, n):
            paths[r][c] = paths[r - 1][c] + paths[r][c - 1]
    return paths[m - 1][n - 1]
```

Time `O(m · n)`, space `O(m · n)`.

### Space-optimised version

Keep one row. Before the update, `row[c]` still holds the value from the row above; `row[c - 1]` has already been updated to the current row. So `row[c] += row[c - 1]` is exactly the transition.

```python
def unique_paths(m: int, n: int) -> int:
    row = [1] * n                      # the top row
    for _ in range(1, m):
        for c in range(1, n):
            row[c] += row[c - 1]       # above (old row[c]) + left (new row[c - 1])
    return row[n - 1]
```

Time `O(m · n)`, space `O(n)`; swap `m` and `n` first to make it `O(min(m, n))`.

### Closed form

Every route is a sequence of exactly `m - 1` downs and `n - 1` rights, and every such sequence is a valid route. So the answer is the number of ways to choose which of the `m + n - 2` moves are downs: `C(m + n - 2, m - 1)`. `math.comb(m + n - 2, m - 1)` computes it in `O(min(m, n))` multiplications. Worth stating, but the DP is what generalises.

```viz
{"type": "dp", "algorithm": "unique-paths", "rows": 3, "cols": 4, "title": "Unique Paths on a 3 x 4 grid", "caption": "Each cell adds the routes arriving from above and from the left."}
```

### Common mistakes

- Initialising the first row and column to 0, or only `paths[0][0] = 1` without also handling the edges, so the edges read out-of-range or zero neighbours.
- Swapping which dimension is rows and which is columns in the 1-D version, then returning `row[m - 1]`.
- Computing the binomial with floating-point factorials, which loses precision well before the constraint limits; use integer arithmetic.

### How to discuss it

Give the state, the two-way transition and the edge base cases, fill a 3 × 4 table out loud, then collapse to one row. Mention the combinatorial identity as a check: if your table's corner does not equal `C(m + n - 2, m - 1)`, something is wrong.

For obstacles, the recurrence is the same but a blocked cell has `paths = 0`, and the "edges are all 1" base case no longer holds: a block in the top row makes every cell to its right 0. Initialise from `paths[0][0]` (0 if blocked) and let the recurrence handle the edges with out-of-range neighbours treated as 0. The closed form does not survive obstacles, which is why the DP is the better answer to lead with. For `10⁶ × 10⁶` without obstacles, the grid DP is `10¹²` cells and out of the question; precompute factorials and inverse factorials modulo the prime and evaluate `C(m + n - 2, m - 1)` in `O(m + n)`. Knowing when to abandon the DP for the formula is the senior move.
