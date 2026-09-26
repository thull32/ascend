---
slug: n-queens
title: N-Queens
difficulty: hard
patterns: [backtracking]
lists: [ascend-150]
companies: [amazon, google, microsoft, apple]
order: 9
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "Place one queen per row, top to bottom. The only decision at each row is which column, so the search tree has depth `n` and branching `n`."
  - "A queen at `(r, c)` attacks column `c`, the diagonal where `r - c` is constant, and the anti-diagonal where `r + c` is constant. Three sets make the conflict check O(1)."
  - "Add to the three sets before recursing and remove after. Build the board strings only when a full placement is found."
signatures:
  python:
    name: solve_n_queens
    starter: |
      def solve_n_queens(n: int) -> list[list[str]]:
          pass
  javascript:
    name: solve_n_queens
    starter: |
      function solve_n_queens(n) {
      }
tests:
  - args: [4]
    expected: [[".Q..", "...Q", "Q...", "..Q."], ["..Q.", "Q...", "...Q", ".Q.."]]
    any_order: true
  - args: [1]
    expected: [["Q"]]
    any_order: true
    label: one queen
  - args: [2]
    expected: []
    any_order: true
    label: no solution
  - args: [3]
    expected: []
    any_order: true
    label: no solution
  - args: [5]
    expected: [["Q....", "..Q..", "....Q", ".Q...", "...Q."], ["Q....", "...Q.", ".Q...", "....Q", "..Q.."], [".Q...", "...Q.", "Q....", "..Q..", "....Q"], [".Q...", "....Q", "..Q..", "Q....", "...Q."], ["..Q..", "Q....", "...Q.", ".Q...", "....Q"], ["..Q..", "....Q", ".Q...", "...Q.", "Q...."], ["...Q.", "Q....", "..Q..", "....Q", ".Q..."], ["...Q.", ".Q...", "....Q", "..Q..", "Q...."], ["....Q", ".Q...", "...Q.", "Q....", "..Q.."], ["....Q", "..Q..", "Q....", "...Q.", ".Q..."]]
    any_order: true
    hidden: true
    label: ten solutions
  - args: [6]
    expected: [[".Q....", "...Q..", ".....Q", "Q.....", "..Q...", "....Q."], ["..Q...", ".....Q", ".Q....", "....Q.", "Q.....", "...Q.."], ["...Q..", "Q.....", "....Q.", ".Q....", ".....Q", "..Q..."], ["....Q.", "..Q...", "Q.....", ".....Q", "...Q..", ".Q...."]]
    any_order: true
    hidden: true
    label: four solutions
time_limit_ms: 4000
---
Place `n` queens on an `n × n` chessboard so that no two share a row, a column, or a diagonal. Return every distinct arrangement. Each arrangement is a list of `n` strings, one per row from top to bottom, where `Q` marks the queen and `.` an empty square. The arrangements may be returned in any order.

### Examples

| Input | Output | Why |
|---|---|---|
| `4` | `[[".Q..","...Q","Q...","..Q."], ["..Q.","Q...","...Q",".Q.."]]` | Two mirror-image solutions |
| `1` | `[["Q"]]` | Trivial board |
| `3` | `[]` | No arrangement exists for `n = 2` or `n = 3` |

### Constraints

- `1 ≤ n ≤ 9`

### Follow-up

The interviewer asks: "Only the *count* is needed and `n` is 14. How much faster can you go?" Then: "Explain why `r - c` and `r + c` identify the diagonals."

## Solution

### The naive approach

Choose `n` of the `n²` squares: `C(n², n)` combinations, `~10¹¹` for `n = 8`. Or choose one square per row and check every pair: `nⁿ` placements, `~1.7 × 10⁷` for `n = 8` with an `O(n²)` check each. Both check constraints only after a full placement, which is what backtracking fixes.

### The insight

Two queens in the same row always conflict, so any solution has exactly one queen per row and the search can proceed row by row, choosing a column for each. Conflicts with all earlier queens must be detectable in `O(1)`: a column is blocked if any earlier queen used it; a diagonal is blocked if any earlier queen sits on it. Squares on the same `↘` diagonal share `r - c`; squares on the same `↙` diagonal share `r + c`. Three hash sets (or three boolean arrays) give constant-time checks, and the search abandons a partial placement the moment a row has no legal column.

### The optimal approach

```python
def solve_n_queens(n: int) -> list[list[str]]:
    result: list[list[str]] = []
    cols: set[int] = set()
    diag: set[int] = set()       # r - c
    anti: set[int] = set()       # r + c
    placement: list[int] = []    # placement[r] = column of the queen in row r

    def backtrack(r: int) -> None:
        if r == n:
            result.append(["." * c + "Q" + "." * (n - c - 1) for c in placement])
            return
        for c in range(n):
            if c in cols or (r - c) in diag or (r + c) in anti:
                continue
            cols.add(c); diag.add(r - c); anti.add(r + c)
            placement.append(c)
            backtrack(r + 1)
            placement.pop()
            cols.discard(c); diag.discard(r - c); anti.discard(r + c)

    backtrack(0)
    return result
```

The search tree has at most `n!` leaves (each row loses at least one column to the queens above), and in practice the diagonal constraints prune far more. Space `O(n)` for the sets and the placement, plus `O(n²)` per solution for the output strings.

### Common mistakes

- Using `r + c` for both diagonals or `abs(r - c)`, which merges two different diagonals into one set and rejects valid placements.
- Building the full board as a mutable grid and scanning it for conflicts, `O(n)` per check instead of `O(1)`.
- Forgetting to remove from the sets after recursing, which is the single most common backtracking bug.

### How to discuss it

Say "one queen per row, so the decision is the column; three sets give `O(1)` conflict checks; undo on the way back." For the diagonal explanation, moving one step down-right adds 1 to both `r` and `c`, leaving `r - c` unchanged; down-left adds 1 to `r` and subtracts 1 from `c`, leaving `r + c` unchanged. For the count-only follow-up: skip building strings, replace the sets with three integer bitmasks so each row's legal columns are one `AND`/`NOT` and the next candidate is extracted with `x & -x`, and use the left-right symmetry to search only half the first row's columns and double the count. That takes `n = 14` from seconds to well under one in Python and is the standard reference for "bitmask backtracking".
