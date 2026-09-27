---
slug: set-matrix-zeroes
title: Set Matrix Zeroes
difficulty: medium
patterns: [matrix]
lists: [core-75, ascend-150]
companies: [microsoft, amazon, meta, apple]
order: 3
lesson: interview-patterns/array-patterns/matrix-traversal
hints:
  - "Zeroing cells as soon as you find a 0 destroys information: later you cannot tell an original 0 from one you wrote. Separate the pass that finds zeros from the pass that writes them."
  - "Record which rows and which columns contain a zero (two sets, O(m + n) space), then zero every cell whose row or column is marked. To get O(1) space, where inside the matrix could those marks live?"
  - "Use the first row and first column as the marker arrays. They overlap at matrix[0][0], and their own original zeros would be lost, so first save two booleans: does row 0 contain a zero, does column 0 contain a zero. Apply those two last."
signatures:
  python:
    name: set_zeroes
    starter: |
      def set_zeroes(matrix: list[list[int]]) -> list[list[int]]:
          # Modify matrix in place, then return it so the tests can check it.
          pass
  javascript:
    name: set_zeroes
    starter: |
      function set_zeroes(matrix) {
        // Modify matrix in place, then return it so the tests can check it.
      }
tests:
  - args: [[[1, 2, 3], [4, 0, 6], [7, 8, 9]]]
    expected: [[1, 0, 3], [0, 0, 0], [7, 0, 9]]
  - args: [[[5, 0, 7, 8], [1, 2, 3, 4], [0, 6, 9, 2]]]
    expected: [[0, 0, 0, 0], [0, 0, 3, 4], [0, 0, 0, 0]]
    label: several zeros
  - args: [[[1]]]
    expected: [[1]]
    label: single non-zero cell
  - args: [[[0]]]
    expected: [[0]]
    label: single zero cell
  - args: [[[1, 2], [3, 4]]]
    expected: [[1, 2], [3, 4]]
    label: no zeros
  - args: [[[1, 0]]]
    expected: [[0, 0]]
    label: single row
  - args: [[[1], [0], [2]]]
    expected: [[0], [0], [0]]
    label: single column
  - args: [[[1, 2, 3], [4, 5, 6], [7, 8, 0]]]
    expected: [[1, 2, 0], [4, 5, 0], [0, 0, 0]]
    hidden: true
  - args: [[[0, 2, 3], [4, 5, 6], [7, 8, 9]]]
    expected: [[0, 0, 0], [0, 5, 6], [0, 8, 9]]
    hidden: true
    label: zero in the marker corner
  - args: [[[1, 2, 3, 4], [5, 6, 7, 0], [9, 0, 11, 12], [13, 14, 15, 16]]]
    expected: [[1, 0, 3, 0], [0, 0, 0, 0], [0, 0, 0, 0], [13, 0, 15, 0]]
    hidden: true
  - args: [[[-1, 0, -3], [-4, -5, -6]]]
    expected: [[0, 0, 0], [-4, 0, -6]]
    hidden: true
    label: zero in the first row only
time_limit_ms: 4000
---
You are given an `m × n` integer matrix. Wherever the **original** matrix contains a `0`, set that cell's entire row and entire column to `0`. Do it **in place**, and return the same `matrix` object afterwards so the tests can check it.

Only zeros that were present before you started count. A cell you set to `0` must not cause further rows or columns to be cleared.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 2, 3], [4, 0, 6], [7, 8, 9]]` | `[[1, 0, 3], [0, 0, 0], [7, 0, 9]]` | The zero at (1, 1) clears row 1 and column 1 |
| `[[5, 0, 7, 8], [1, 2, 3, 4], [0, 6, 9, 2]]` | `[[0, 0, 0, 0], [0, 0, 3, 4], [0, 0, 0, 0]]` | Rows 0 and 2, columns 0 and 1 |
| `[[1, 0]]` | `[[0, 0]]` | A zero anywhere in a single row clears the whole row |

### Constraints

- `1 ≤ m, n ≤ 200`
- `-2³¹ ≤ matrix[r][c] ≤ 2³¹ - 1`
- Aim for `O(1)` extra space.

### Follow-up

The interviewer asks: "Your `O(m + n)` version is fine. Can you do it in constant extra space?" Then: "The matrix is huge and stored on disk in row-major order. How many passes over the data do you need?"

## Solution

### The naive approach

Copy the matrix, scan the copy for zeros, and clear rows and columns in the original. `O(mn)` extra space. Slightly better: collect the set of zero rows and zero columns in one pass, then clear in a second pass. That is `O(mn)` time and `O(m + n)` space, and it is the answer most interviewers expect first.

```python
def set_zeroes_with_sets(matrix: list[list[int]]) -> list[list[int]]:
    rows = {r for r, row in enumerate(matrix) for v in row if v == 0}
    cols = {c for row in matrix for c, v in enumerate(row) if v == 0}
    for r, row in enumerate(matrix):
        for c in range(len(row)):
            if r in rows or c in cols:
                row[c] = 0
    return matrix
```

### The insight

The two marker arrays have lengths `m` and `n`. The matrix already has a row of length `n` and a column of length `m`: row 0 and column 0. Store "column `c` must be cleared" in `matrix[0][c]` and "row `r` must be cleared" in `matrix[r][0]`. Those cells are going to be zero anyway if their row or column is marked, so writing a zero early loses nothing *for the rest of the matrix*.

Two cells need care:

- Row 0 and column 0 have their own original zeros, which get mixed up with the marks. Record `first_row_zero` and `first_col_zero` as two booleans before marking.
- `matrix[0][0]` belongs to both. With the two booleans handling row 0 and column 0 themselves, the corner is only ever read as part of those, so the conflict disappears.

Order matters: mark from the interior, clear the interior using the marks, and only then clear row 0 and column 0 using the booleans. Clearing row 0 first would wipe out the column marks you still need.

### The optimal approach

```python
def set_zeroes(matrix: list[list[int]]) -> list[list[int]]:
    m, n = len(matrix), len(matrix[0])
    first_row_zero = any(matrix[0][c] == 0 for c in range(n))
    first_col_zero = any(matrix[r][0] == 0 for r in range(m))

    # 1. Mark: an interior zero writes a 0 into its row head and column head.
    for r in range(1, m):
        for c in range(1, n):
            if matrix[r][c] == 0:
                matrix[r][0] = 0
                matrix[0][c] = 0

    # 2. Clear the interior from the marks.
    for r in range(1, m):
        for c in range(1, n):
            if matrix[r][0] == 0 or matrix[0][c] == 0:
                matrix[r][c] = 0

    # 3. Finally the first row and first column themselves.
    if first_row_zero:
        for c in range(n):
            matrix[0][c] = 0
    if first_col_zero:
        for r in range(m):
            matrix[r][0] = 0
    return matrix
```

Trace `[[0, 2, 3], [4, 5, 6], [7, 8, 9]]`: `first_row_zero` and `first_col_zero` are both true (the corner is 0). The interior has no zeros, so step 1 marks nothing and step 2 clears nothing. Step 3 clears row 0 and column 0, giving `[[0, 0, 0], [0, 5, 6], [0, 8, 9]]`.

Time `O(mn)`: a constant number of passes. Space `O(1)` extra: two booleans.

### Common mistakes

- Clearing rows and columns immediately on seeing a zero, in a single pass. The zeros you write are then mistaken for original zeros and the whole matrix cascades to 0.
- Using a sentinel value such as `-1` or `None` to mean "will become zero". It breaks as soon as the sentinel is a legitimate value, which the constraints allow, and it is the kind of hack interviewers push back on.
- Clearing row 0 or column 0 before step 2. The marks stored there are destroyed and interior cells that should be cleared survive.
- Using a single `matrix[0][0]` flag for both the first row and the first column. It can be made to work with one extra boolean, but most attempts get the order of the final two clears wrong.

### How to discuss it

Present the `O(m + n)` two-set solution first and state its complexity; it is clean and correct. Then say: "the marker arrays can live inside the matrix, in row 0 and column 0, as long as I first remember whether those two lines had zeros of their own." Walk through the order of operations explicitly, because that is where the bugs are. For the on-disk follow-up, the marker version needs two full passes (read to mark, then read-modify-write to clear); a single pass is impossible, because a zero in the last row can clear a cell in the first row. With `O(m + n)` bits of RAM for the markers, which is tiny even for very large matrices, two sequential passes are the practical answer, and sequential access is what a row-major file on disk rewards.
