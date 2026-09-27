---
slug: rotate-image
title: Rotate Image
difficulty: medium
patterns: [matrix]
lists: [core-75, ascend-150]
companies: [amazon, microsoft, apple, meta]
order: 1
lesson: interview-patterns/array-patterns/matrix-traversal
hints:
  - "Work out where the element at (r, c) ends up after a clockwise quarter turn of an n × n matrix. Write the formula down before touching code."
  - "It moves to (c, n - 1 - r). Following that formula four times brings you back to (r, c), so elements move in cycles of four; you can rotate each cycle with one temporary variable."
  - "An easier route to the same result: a clockwise rotation equals a transpose (swap across the main diagonal) followed by reversing every row. Both steps are simple in-place swaps."
signatures:
  python:
    name: rotate
    starter: |
      def rotate(matrix: list[list[int]]) -> list[list[int]]:
          # Rotate in place, then return matrix so the tests can check it.
          pass
  javascript:
    name: rotate
    starter: |
      function rotate(matrix) {
        // Rotate in place, then return matrix so the tests can check it.
      }
tests:
  - args: [[[1, 2], [3, 4]]]
    expected: [[3, 1], [4, 2]]
  - args: [[[2, 4, 6], [8, 10, 12], [14, 16, 18]]]
    expected: [[14, 8, 2], [16, 10, 4], [18, 12, 6]]
  - args: [[[5]]]
    expected: [[5]]
    label: 1 × 1
  - args: [[[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16]]]
    expected: [[13, 9, 5, 1], [14, 10, 6, 2], [15, 11, 7, 3], [16, 12, 8, 4]]
    label: even size, two rings
  - args: [[[-1, 0], [0, -1]]]
    expected: [[0, -1], [-1, 0]]
    label: negatives
  - args: [[[1, 2, 3, 4, 5], [6, 7, 8, 9, 10], [11, 12, 13, 14, 15], [16, 17, 18, 19, 20], [21, 22, 23, 24, 25]]]
    expected: [[21, 16, 11, 6, 1], [22, 17, 12, 7, 2], [23, 18, 13, 8, 3], [24, 19, 14, 9, 4], [25, 20, 15, 10, 5]]
    hidden: true
    label: odd size, centre stays put
  - args: [[[1, 1, 2], [2, 3, 3], [4, 4, 4]]]
    expected: [[4, 2, 1], [4, 3, 1], [4, 3, 2]]
    hidden: true
    label: duplicate values
time_limit_ms: 4000
---
You are given an `n × n` matrix of integers, for example the pixels of a square image. Rotate it by 90 degrees **clockwise**, **in place**: modify the input matrix directly rather than allocating a second `n × n` matrix.

The tests need to see the result, so after rotating, return the same `matrix` object you were given.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1, 2], [3, 4]]` | `[[3, 1], [4, 2]]` | The left column, read bottom to top, becomes the top row |
| `[[2, 4, 6], [8, 10, 12], [14, 16, 18]]` | `[[14, 8, 2], [16, 10, 4], [18, 12, 6]]` | Corners move one step clockwise; `10` in the centre stays |
| `[[5]]` | `[[5]]` | A 1 × 1 matrix is its own rotation |

### Constraints

- `1 ≤ n ≤ 20`
- `-1000 ≤ matrix[r][c] ≤ 1000`
- Use `O(1)` extra space.

### Follow-up

The interviewer asks: "Now rotate counter-clockwise, and then by 180 degrees. Which steps change?" Then: "The matrix is `m × n`, not square. Can it still be done in place?"

## Solution

### The naive approach

Allocate a new matrix `out` and set `out[c][n - 1 - r] = matrix[r][c]` for every cell, then copy back. `O(n²)` time, `O(n²)` extra space. It is correct and is the easiest way to *derive* the index formula, but it breaks the in-place requirement.

### The insight

A clockwise quarter turn sends `(r, c)` to `(c, n - 1 - r)`. Split that mapping into two moves that are each easy to do in place:

1. **Transpose**: `(r, c) → (c, r)`. Swap `matrix[r][c]` with `matrix[c][r]` for every cell above the diagonal.
2. **Reverse each row**: `(c, r) → (c, n - 1 - r)`.

Composing them gives `(r, c) → (c, n - 1 - r)`, exactly the rotation. Each step is a set of disjoint swaps, so no temporary buffer is needed.

### The optimal approach

```python
def rotate(matrix: list[list[int]]) -> list[list[int]]:
    n = len(matrix)
    # 1. Transpose across the main diagonal (only swap each pair once).
    for r in range(n):
        for c in range(r + 1, n):
            matrix[r][c], matrix[c][r] = matrix[c][r], matrix[r][c]
    # 2. Reverse every row.
    for row in matrix:
        row.reverse()
    return matrix
```

Trace `[[2, 4, 6], [8, 10, 12], [14, 16, 18]]`:

- After the transpose: `[[2, 8, 14], [4, 10, 16], [6, 12, 18]]`.
- After reversing rows: `[[14, 8, 2], [16, 10, 4], [18, 12, 6]]`.

Time `O(n²)`: every cell is touched a constant number of times. Space `O(1)` extra.

### The four-way cycle alternative

The other classic solution rotates ring by ring. In ring `layer`, the four cells `top`, `right`, `bottom`, `left` that map onto each other are rotated with one temporary variable:

```text
tmp    <- top
top    <- left
left   <- bottom
bottom <- right
right  <- tmp
```

It does each cell in exactly one move (the transpose-reverse touches each cell twice), so it performs fewer writes, but the index arithmetic (`matrix[n - 1 - i][layer]` and friends) is where candidates make off-by-one errors under pressure. If you choose it, derive the four indices from the `(r, c) → (c, n - 1 - r)` formula on the whiteboard rather than from memory.

### Common mistakes

- Transposing with `c` starting at `0` instead of `r + 1`. Every pair is swapped twice, which undoes the transpose, so the row reversal then produces a left-right mirror image instead of a rotation.
- Reversing columns instead of rows. Transpose then reverse *columns* gives the counter-clockwise rotation.
- In Python, writing `matrix = [list(row) for row in zip(*matrix[::-1])]`. It computes the right answer but rebinds a local name to a new matrix; the caller's matrix is unchanged and the extra space is `O(n²)`.

### How to discuss it

Write the index mapping first, then say "that mapping is a transpose followed by a horizontal flip, both of which are in-place swaps". Having the formula on the board also answers the follow-ups: counter-clockwise is transpose then reverse each column (or reverse rows first, then transpose); 180 degrees is reversing the row order and then each row, no transpose needed. For a non-square `m × n` matrix the rotated shape is `n × m`, so a true in-place rotation must permute a flat buffer by following cycles of the index permutation (in-place matrix transposition). It is possible but intricate, and saying that most real systems just allocate a new buffer, or rotate lazily by changing how they index, is the pragmatic senior answer. Image libraries often do exactly that: they record an orientation flag instead of moving pixels.
