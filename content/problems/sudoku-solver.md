---
slug: sudoku-solver
title: Sudoku Solver
difficulty: hard
patterns: [backtracking]
lists: [ascend-150]
companies: [amazon, google, uber, microsoft]
order: 10
lesson: interview-patterns/combinatorial-patterns/backtracking-pattern
hints:
  - "Precompute which digits are already used in each row, column and 3×3 box as sets. A candidate for a cell is any digit in none of the three sets."
  - "Backtrack over the empty cells: pick one, try each candidate, update the three sets, recurse, and undo on failure. Return `True` as soon as the last empty cell is filled."
  - "Choosing the empty cell with the *fewest* candidates first (rather than the next one in reading order) shrinks the search tree dramatically on hard puzzles."
signatures:
  python:
    name: solve_sudoku
    starter: |
      def solve_sudoku(board: list[list[str]]) -> list[list[str]]:
          pass
  javascript:
    name: solve_sudoku
    starter: |
      function solve_sudoku(board) {
      }
tests:
  - args: [[[".", ".", ".", "5", "1", "8", "4", ".", "."], [".", ".", ".", ".", "7", ".", "5", ".", "8"], ["1", ".", "8", ".", ".", "9", "2", ".", "."], ["6", "3", "4", ".", "8", ".", ".", "9", "5"], ["8", "7", ".", "1", ".", ".", ".", "6", "."], ["9", ".", "5", "3", "6", "4", ".", ".", "2"], [".", ".", ".", ".", ".", ".", ".", ".", "."], [".", ".", "7", "9", "4", ".", "6", ".", "3"], ["2", "6", "3", ".", ".", "7", ".", ".", "."]]]
    expected: [["7", "2", "6", "5", "1", "8", "4", "3", "9"], ["3", "4", "9", "2", "7", "6", "5", "1", "8"], ["1", "5", "8", "4", "3", "9", "2", "7", "6"], ["6", "3", "4", "7", "8", "2", "1", "9", "5"], ["8", "7", "2", "1", "9", "5", "3", "6", "4"], ["9", "1", "5", "3", "6", "4", "7", "8", "2"], ["4", "9", "1", "6", "2", "3", "8", "5", "7"], ["5", "8", "7", "9", "4", "1", "6", "2", "3"], ["2", "6", "3", "8", "5", "7", "9", "4", "1"]]
  - args: [[["7", "9", "5", "3", "2", "4", "1", "6", "8"], [".", "2", "4", "8", "6", "1", "5", "9", "7"], ["8", "6", "1", "7", "9", "5", "4", "2", "3"], ["1", "3", "2", "5", "8", "6", "9", "7", "4"], ["4", "7", "9", "1", "3", "2", "6", "8", "5"], ["5", "8", "6", "4", "7", "9", "2", "3", "1"], ["6", "1", "3", "9", "5", "8", "7", "4", "2"], ["2", "4", "7", "6", "1", "3", "8", "5", "9"], ["9", "5", "8", "2", "4", "7", "3", "1", "6"]]]
    expected: [["7", "9", "5", "3", "2", "4", "1", "6", "8"], ["3", "2", "4", "8", "6", "1", "5", "9", "7"], ["8", "6", "1", "7", "9", "5", "4", "2", "3"], ["1", "3", "2", "5", "8", "6", "9", "7", "4"], ["4", "7", "9", "1", "3", "2", "6", "8", "5"], ["5", "8", "6", "4", "7", "9", "2", "3", "1"], ["6", "1", "3", "9", "5", "8", "7", "4", "2"], ["2", "4", "7", "6", "1", "3", "8", "5", "9"], ["9", "5", "8", "2", "4", "7", "3", "1", "6"]]
    label: one blank cell
  - args: [[["1", "3", "4", ".", "6", ".", "5", "8", "9"], ["9", "8", ".", "1", "3", "4", "2", "6", "7"], ["7", "6", "2", "9", "8", ".", "4", ".", "1"], ["3", "2", ".", "6", "5", "7", "9", "4", "8"], ["8", ".", "9", "3", "2", "1", ".", "5", "6"], [".", "5", "7", "8", "4", "9", ".", ".", "3"], [".", "7", ".", "5", "9", "6", "8", "1", "4"], ["5", ".", "6", "4", "1", ".", "3", "7", "2"], ["4", ".", "8", "2", ".", "3", ".", ".", "."]]]
    expected: [["1", "3", "4", "7", "6", "2", "5", "8", "9"], ["9", "8", "5", "1", "3", "4", "2", "6", "7"], ["7", "6", "2", "9", "8", "5", "4", "3", "1"], ["3", "2", "1", "6", "5", "7", "9", "4", "8"], ["8", "4", "9", "3", "2", "1", "7", "5", "6"], ["6", "5", "7", "8", "4", "9", "1", "2", "3"], ["2", "7", "3", "5", "9", "6", "8", "1", "4"], ["5", "9", "6", "4", "1", "8", "3", "7", "2"], ["4", "1", "8", "2", "7", "3", "6", "9", "5"]]
    hidden: true
    label: twenty blanks
  - args: [[["7", "5", ".", "6", ".", ".", ".", ".", "."], ["1", "9", ".", ".", ".", ".", ".", ".", "4"], ["6", "3", ".", ".", "2", "9", ".", ".", "8"], [".", ".", "7", ".", ".", "4", "2", "3", "1"], [".", ".", ".", "3", ".", "2", ".", ".", "7"], ["3", ".", ".", "9", ".", ".", ".", ".", "6"], [".", "1", ".", ".", ".", ".", ".", ".", "5"], [".", "6", ".", "4", "3", "1", ".", "2", "."], ["2", "7", ".", ".", ".", ".", ".", ".", "."]]]
    expected: [["7", "5", "8", "6", "4", "3", "9", "1", "2"], ["1", "9", "2", "7", "8", "5", "3", "6", "4"], ["6", "3", "4", "1", "2", "9", "5", "7", "8"], ["9", "8", "7", "5", "6", "4", "2", "3", "1"], ["5", "4", "6", "3", "1", "2", "8", "9", "7"], ["3", "2", "1", "9", "7", "8", "4", "5", "6"], ["4", "1", "3", "2", "9", "7", "6", "8", "5"], ["8", "6", "5", "4", "3", "1", "7", "2", "9"], ["2", "7", "9", "8", "5", "6", "1", "4", "3"]]
    hidden: true
    label: fifty blanks
time_limit_ms: 4000
---
You are given a partially filled `9 × 9` Sudoku board as a list of nine rows, each a list of nine single-character strings: a digit `"1"` to `"9"` or `"."` for an empty cell. Fill every empty cell so that each row, each column and each of the nine `3 × 3` boxes contains the digits `1` to `9` exactly once. Every input has exactly one solution. Fill the board in place and also return it.

### Examples

| Input | Output |
|---|---|
| A board with one blank at row 1, column 0 whose row lacks `3` | The same board with `"3"` in that cell |
| A board with twenty blanks | The unique completed grid |

### Constraints

- The board is always `9 × 9`
- The given digits never violate the rules
- Exactly one solution exists

### Follow-up

The interviewer asks: "Which empty cell do you fill first, and why does it matter?" Then: "How would you detect that a puzzle has *no* solution or *several*, and what does that cost?"

## Solution

### The naive approach

Fill empty cells in reading order with any digit, and validate the whole board at the end. With `k` empty cells that is `9ᵏ` boards, and a typical puzzle has `k ≈ 50`. Even checking validity after each placement by scanning the row, column and box is `O(27)` per placement; correct, but slower than it needs to be and, more importantly, it does not choose *which* cell to fill.

### The insight

Sudoku is a constraint-satisfaction problem: variables (empty cells), domains (digits `1`–`9`), constraints (row, column, box uniqueness). Backtracking assigns one variable at a time and checks constraints incrementally. Three families of sets, `rows[r]`, `cols[c]`, `boxes[b]`, hold the digits already placed, so the candidates for a cell are `all_digits − rows[r] − cols[c] − boxes[b]` in `O(1)` set operations. The single most effective optimisation is *variable ordering*: always fill the empty cell with the fewest candidates. A cell with one candidate is forced and costs nothing; a cell with zero candidates proves the current branch is dead immediately.

### The optimal approach

```python
def solve_sudoku(board: list[list[str]]) -> list[list[str]]:
    digits = set("123456789")
    rows = [set() for _ in range(9)]
    cols = [set() for _ in range(9)]
    boxes = [set() for _ in range(9)]
    empties: list[tuple[int, int]] = []
    for r in range(9):
        for c in range(9):
            v = board[r][c]
            if v == ".":
                empties.append((r, c))
            else:
                rows[r].add(v)
                cols[c].add(v)
                boxes[(r // 3) * 3 + c // 3].add(v)

    def candidates(r: int, c: int) -> set[str]:
        return digits - rows[r] - cols[c] - boxes[(r // 3) * 3 + c // 3]

    def solve() -> bool:
        if not empties:
            return True
        # Most-constrained cell first.
        idx = min(range(len(empties)), key=lambda i: len(candidates(*empties[i])))
        r, c = empties[idx]
        options = candidates(r, c)
        if not options:
            return False
        empties[idx], empties[-1] = empties[-1], empties[idx]
        empties.pop()
        b = (r // 3) * 3 + c // 3
        for v in sorted(options):
            board[r][c] = v
            rows[r].add(v); cols[c].add(v); boxes[b].add(v)
            if solve():
                return True
            rows[r].discard(v); cols[c].discard(v); boxes[b].discard(v)
        board[r][c] = "."
        empties.append((r, c))
        empties[idx], empties[-1] = empties[-1], empties[idx]
        return False

    solve()
    return board
```

The swap-with-last trick removes the chosen cell from `empties` in `O(1)` and restores it on backtrack so the list is unchanged for the caller's loop. Selecting the most-constrained cell costs `O(k)` per call, which is negligible against the branching it prevents. Worst-case time is exponential in the number of empty cells; on real puzzles the forced cells cascade and the search visits a few hundred nodes. Space `O(k)` for the recursion plus the `27` sets.

### Common mistakes

- Computing the box index as `r // 3 + c // 3` (gives 0–4, merging boxes) instead of `(r // 3) * 3 + c // 3`.
- Forgetting to reset the cell to `"."` when the branch fails, which leaves garbage on the board for later branches.
- Returning `None` from the recursive call and then continuing to loop after a solution was found, which un-does the solution.

### How to discuss it

Frame it as CSP backtracking with incremental constraint checks, then talk about ordering: reading order is `O(9ᵏ)` in the worst case; most-constrained-first turns most puzzles into chains of forced moves. Mention that production solvers go further with constraint propagation (when a digit has only one legal cell in a row, place it), and that Knuth's Dancing Links formulation treats it as exact cover. For the uniqueness follow-up, turn `return True` into "count solutions and stop at 2": no solution means the count is 0, several means it reaches 2. That costs a second traversal of the search tree at most, and it is how puzzle generators verify that a puzzle is well-formed.
