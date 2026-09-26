---
slug: valid-sudoku
title: Valid Sudoku
difficulty: medium
patterns: [hash-map]
lists: [ascend-150]
companies: [amazon, apple, uber]
order: 9
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - 'Three independent rules: no repeat in a row, in a column, or in a 3×3 box. Each rule is a "have I seen this digit in this group?" question.'
  - Keep a set per row, per column and per box (27 sets), or one set of tuples like `("row", r, d)`. One pass over 81 cells is enough.
  - The box index of cell `(r, c)` is `(r // 3) * 3 + c // 3`.
signatures:
  python:
    name: is_valid_sudoku
    starter: |
      def is_valid_sudoku(board: list[list[str]]) -> bool:
          pass
  javascript:
    name: is_valid_sudoku
    starter: |
      function is_valid_sudoku(board) {
      }
tests:
  - args:
      - - ["1", ".", ".", "4", ".", ".", "7", ".", "."]
        - [".", "5", ".", ".", "8", ".", ".", "2", "."]
        - [".", ".", "9", ".", ".", "3", ".", ".", "6"]
        - ["2", ".", ".", "5", ".", ".", "8", ".", "."]
        - [".", "6", ".", ".", "9", ".", ".", "3", "."]
        - [".", ".", "1", ".", ".", "4", ".", ".", "7"]
        - ["3", ".", ".", "6", ".", ".", "9", ".", "."]
        - [".", "7", ".", ".", "1", ".", ".", "4", "."]
        - [".", ".", "2", ".", ".", "5", ".", ".", "8"]
    expected: true
    label: valid partial board
  - args:
      - - ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
        - ["4", "5", "6", "7", "8", "9", "1", "2", "3"]
        - ["7", "8", "9", "1", "2", "3", "4", "5", "6"]
        - ["2", "3", "4", "5", "6", "7", "8", "9", "1"]
        - ["5", "6", "7", "8", "9", "1", "2", "3", "4"]
        - ["8", "9", "1", "2", "3", "4", "5", "6", "7"]
        - ["3", "4", "5", "6", "7", "8", "9", "1", "2"]
        - ["6", "7", "8", "9", "1", "2", "3", "4", "5"]
        - ["9", "1", "2", "3", "4", "5", "6", "7", "8"]
    expected: true
    label: complete valid board
  - args:
      - - ["1", ".", ".", "1", ".", ".", "7", ".", "."]
        - [".", "5", ".", ".", "8", ".", ".", "2", "."]
        - [".", ".", "9", ".", ".", "3", ".", ".", "6"]
        - ["2", ".", ".", "5", ".", ".", "8", ".", "."]
        - [".", "6", ".", ".", "9", ".", ".", "3", "."]
        - [".", ".", "1", ".", ".", "4", ".", ".", "7"]
        - ["3", ".", ".", "6", ".", ".", "9", ".", "."]
        - [".", "7", ".", ".", "1", ".", ".", "4", "."]
        - [".", ".", "2", ".", ".", "5", ".", ".", "8"]
    expected: false
    label: duplicate in a row only
  - args:
      - - ["1", ".", ".", "4", ".", ".", "7", ".", "."]
        - [".", "5", ".", ".", "8", ".", ".", "2", "."]
        - [".", ".", "9", ".", ".", "3", ".", ".", "6"]
        - ["3", ".", ".", "5", ".", ".", "8", ".", "."]
        - [".", "6", ".", ".", "9", ".", ".", "3", "."]
        - [".", ".", "1", ".", ".", "4", ".", ".", "7"]
        - ["3", ".", ".", "6", ".", ".", "9", ".", "."]
        - [".", "7", ".", ".", "1", ".", ".", "4", "."]
        - [".", ".", "2", ".", ".", "5", ".", ".", "8"]
    expected: false
    label: duplicate in a column only
  - args:
      - - ["1", ".", ".", "4", ".", ".", "7", ".", "."]
        - ["9", "5", ".", ".", "8", ".", ".", "2", "."]
        - [".", ".", "9", ".", ".", "3", ".", ".", "6"]
        - ["2", ".", ".", "5", ".", ".", "8", ".", "."]
        - [".", "6", ".", ".", "9", ".", ".", "3", "."]
        - [".", ".", "1", ".", ".", "4", ".", ".", "7"]
        - ["3", ".", ".", "6", ".", ".", "9", ".", "."]
        - [".", "7", ".", ".", "1", ".", ".", "4", "."]
        - [".", ".", "2", ".", ".", "5", ".", ".", "8"]
    expected: false
    label: duplicate in a box only
  - args:
      - - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
    expected: true
    hidden: true
    label: empty board
  - args:
      - - ["5", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", "5", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", "5", ".", "."]
        - [".", "5", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", "5", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", "5", "."]
        - [".", ".", "5", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", "5", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "5"]
    expected: true
    hidden: true
    label: nine fives, one per row, column and box
  - args:
      - - ["7", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", "7", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
        - [".", ".", ".", ".", ".", ".", ".", ".", "."]
    expected: false
    hidden: true
    label: diagonal neighbours share a box
time_limit_ms: 4000
---
You are given a 9×9 Sudoku board as a list of nine rows, each a list of nine one-character strings. A cell is either a digit `"1"` to `"9"` or `"."` for empty.

Return `true` if the filled cells obey the three Sudoku rules and `false` otherwise:

1. No digit repeats within a row.
2. No digit repeats within a column.
3. No digit repeats within any of the nine 3×3 boxes.

You are checking *validity*, not *solvability*: a board that breaks no rule is valid even if it cannot be completed. Empty cells are ignored.

### Examples

A partially filled board with no conflicts returns `true`. Changing one cell so a row holds two `1`s:

```text
1 . . | 1 . . | 7 . .      ← row 0 has "1" twice → false
. 5 . | . 8 . | . 2 .
. . 9 | . . 3 | . . 6
```

Two `7`s at `(0, 0)` and `(1, 1)` are in different rows and different columns, but the same top-left box, so the board is invalid.

### Constraints

- The board is always 9×9.
- Every cell is one of `"1"`..`"9"` or `"."`.

### Follow-up

The interviewer asks: "Generalise to an N²×N² board with N×N boxes. What is the complexity, and what changes in your code?" Then: "The board is being edited live by a user. How do you validate each keystroke in O(1)?"

## Solution

### The naive approach

Write three separate triple loops: for each row, check its nine cells for duplicates; for each column, the same; for each box, the same. That is 27 groups of 9 cells each and it is perfectly correct. The cost is fixed (`81 · 3` cell visits) so there is no asymptotic argument to be had; the argument is about code shape. Three copies of the same duplicate check, each with different index arithmetic, is where the bugs live, especially the box loop.

### The insight

Every rule is the same question: "has digit `d` already been seen in group `g`?" A row, a column and a box are all just groups. If you give each group an identity, one pass over the 81 cells can ask the question three times per cell against one set of `(group, digit)` keys. The only non-obvious part is naming the box: cell `(r, c)` lies in box `(r // 3, c // 3)`, or as a single number `(r // 3) * 3 + c // 3`.

### The optimal approach

```python
def is_valid_sudoku(board: list[list[str]]) -> bool:
    seen: set[tuple[str, int, str]] = set()
    for r in range(9):
        for c in range(9):
            d = board[r][c]
            if d == ".":
                continue
            box = (r // 3) * 3 + c // 3
            keys = (("row", r, d), ("col", c, d), ("box", box, d))
            for key in keys:
                if key in seen:
                    return False
                seen.add(key)
    return True
```

Trace the two-sevens board: `(0, 0)` adds `("row", 0, "7")`, `("col", 0, "7")`, `("box", 0, "7")`. `(1, 1)` computes box `(1 // 3) * 3 + 1 // 3 = 0`, finds `("box", 0, "7")` already present, returns `false`.

Time `O(81)`, which is `O(1)` for the fixed board; for the general N²×N² board it is `O(N⁴)` cells with `O(1)` work each. Space: at most `3 · 81` keys.

A tighter variant uses three arrays of nine 9-bit masks (`rows[r] & (1 << d)`), which fits in 27 integers and is what you would write in a hot loop. Mention it; do not start with it.

### Common mistakes

- Box index arithmetic: `r % 3 * 3 + c % 3` (wrong) versus `r // 3 * 3 + c // 3` (right). Test with `(1, 1)` and `(4, 4)`: they must be boxes 0 and 4.
- Treating `"."` as a value and flagging a row with two empties as a duplicate.
- Checking that every row *contains* all nine digits. A partial board does not, and the problem is validity, not completeness.
- Trying to check solvability. That is a backtracking problem, and a much harder one.

### How to discuss it

Say "three rules, but one question: seen `d` in group `g` before?" and describe the `(group, index, digit)` key. Write the box formula and justify it with two cells before coding. Then trace a box-only conflict, because that is the case where a bug in the arithmetic hides. For the generalisation follow-up: the only constants are `9` and `3`; replace them with `N²` and `N` and the complexity is `O(N⁴)`. For the live-editing follow-up: keep the 27 sets (or bitmasks) as persistent state; a keystroke placing `d` at `(r, c)` is three membership checks and three inserts, and clearing a cell is three removals. That turns full re-validation into `O(1)` per edit, which is the standard "maintain the invariant incrementally" move.
