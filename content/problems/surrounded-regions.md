---
slug: surrounded-regions
title: Surrounded Regions
difficulty: medium
patterns: [graph]
lists: [ascend-150]
companies: [google, amazon, microsoft, bloomberg]
order: 5
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "Deciding for each 'O' region whether it is enclosed means exploring the region and remembering whether it touched the edge. Is there an easier set of cells to find first?"
  - "An 'O' survives exactly when it is connected to an 'O' on the border. So start from the border 'O's and mark everything they can reach."
  - "Use a temporary marker such as '#'. After the border flood fill, every remaining 'O' is enclosed and becomes 'X', and every '#' goes back to 'O'."
signatures:
  python:
    name: capture_regions
    starter: |
      def capture_regions(board: list[list[str]]) -> list[list[str]]:
          pass
  javascript:
    name: capture_regions
    starter: |
      function capture_regions(board) {
      }
tests:
  - args: [[["X", "X", "X", "X", "X"], ["X", "O", "O", "X", "X"], ["X", "X", "O", "X", "O"], ["X", "O", "X", "X", "O"], ["X", "X", "X", "O", "X"]]]
    expected: [["X", "X", "X", "X", "X"], ["X", "X", "X", "X", "X"], ["X", "X", "X", "X", "O"], ["X", "X", "X", "X", "O"], ["X", "X", "X", "O", "X"]]
    label: two enclosed regions captured, two border regions kept
  - args: [[["X"]]]
    expected: [["X"]]
    label: single X
  - args: [[["O"]]]
    expected: [["O"]]
    label: single O is on the border
  - args: [[["X", "X", "X"], ["X", "O", "X"], ["X", "X", "X"]]]
    expected: [["X", "X", "X"], ["X", "X", "X"], ["X", "X", "X"]]
    label: one enclosed cell
  - args: [[["O", "O", "O"], ["O", "X", "O"], ["O", "O", "O"]]]
    expected: [["O", "O", "O"], ["O", "X", "O"], ["O", "O", "O"]]
    label: a ring of O on the border stays
  - args: [[["O", "O", "O"], ["O", "O", "O"], ["O", "O", "O"]]]
    expected: [["O", "O", "O"], ["O", "O", "O"], ["O", "O", "O"]]
    label: all O, the centre connects to the border
  - args: [[["X", "X", "X", "X"], ["X", "O", "O", "X"], ["X", "X", "O", "X"], ["X", "X", "O", "X"]]]
    expected: [["X", "X", "X", "X"], ["X", "O", "O", "X"], ["X", "X", "O", "X"], ["X", "X", "O", "X"]]
    hidden: true
    label: interior region escapes through a winding path
  - args: [[["X", "O", "X", "X", "X"], ["X", "O", "X", "O", "X"], ["X", "O", "X", "O", "X"], ["X", "X", "X", "X", "X"]]]
    expected: [["X", "O", "X", "X", "X"], ["X", "O", "X", "X", "X"], ["X", "O", "X", "X", "X"], ["X", "X", "X", "X", "X"]]
    hidden: true
  - args: [[["O", "X", "O"]]]
    expected: [["O", "X", "O"]]
    hidden: true
    label: single row, everything is border
time_limit_ms: 4000
---
You are given a rectangular board of `"X"` and `"O"` cells. A **region** is a maximal group of `"O"` cells connected horizontally or vertically. A region is **captured** when none of its cells lies on the outer edge of the board: it is completely enclosed by `"X"` cells. Capturing a region turns every one of its cells into `"X"`.

Capture every enclosed region, modifying the board in place, and return the board.

### Examples

| Input | Output | Why |
|---|---|---|
| `[["X","X","X"],["X","O","X"],["X","X","X"]]` | all `"X"` | The single `"O"` is enclosed |
| `[["O","O","O"],["O","X","O"],["O","O","O"]]` | unchanged | Every `"O"` is on the edge |
| `[["X","X","X","X"],["X","O","O","X"],["X","X","O","X"],["X","X","O","X"]]` | unchanged | The inner `"O"`s connect down to `(3,2)` on the bottom edge |

### Constraints

- `1 ≤ rows, cols ≤ 200`
- `board[r][c]` is `"X"` or `"O"`

### Follow-up

The interviewer asks: "Now also tell me how many regions you captured and the size of the largest one, without a second full pass over the board."

## Solution

### The naive approach

For every `"O"`, flood-fill its region while tracking whether any cell touches the border. If none does, flip the region to `"X"`; if one does, you must still remember the region as "safe" so you do not explore it again from its next cell. Done carefully this is linear, but it needs two kinds of marks (captured versus safe) and a second pass over each region to flip it, because you only learn a region's fate after exploring all of it. Done carelessly, re-exploring the same safe region from each of its cells makes it `O((R·C)²)`.

### The insight

The condition for survival is simpler than the condition for capture. A cell survives **if and only if** it is connected to an `"O"` on the border. So do not search from the interior at all. Search from the border inward: every `"O"` reachable from a border `"O"` is safe, and everything else is captured. You never have to explore a region and then decide; the border search tells you directly.

### The optimal approach

1. Walk the four edges. For each border `"O"`, flood-fill its region, changing `"O"` to a temporary `"#"`.
2. Scan the whole board once: `"O"` becomes `"X"` (it was not reached, so it is enclosed), and `"#"` becomes `"O"` (it was safe).

Trace the first test. Border `"O"`s: `(2,4)` and `(4,3)`. Flooding from `(2,4)` marks `(2,4)` and `(3,4)`; flooding from `(4,3)` marks only itself (its neighbour `(3,3)` is `"X"`). The final scan turns the unmarked `(1,1) (1,2) (2,2) (3,1)` into `"X"` and restores the three `"#"` cells.

```python
def capture_regions(board: list[list[str]]) -> list[list[str]]:
    if not board or not board[0]:
        return board
    rows, cols = len(board), len(board[0])

    def mark_safe(r0: int, c0: int) -> None:
        if board[r0][c0] != "O":
            return
        board[r0][c0] = "#"
        stack = [(r0, c0)]
        while stack:
            r, c = stack.pop()
            for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= nr < rows and 0 <= nc < cols and board[nr][nc] == "O":
                    board[nr][nc] = "#"
                    stack.append((nr, nc))

    for r in range(rows):
        mark_safe(r, 0)
        mark_safe(r, cols - 1)
    for c in range(cols):
        mark_safe(0, c)
        mark_safe(rows - 1, c)

    for r in range(rows):
        for c in range(cols):
            if board[r][c] == "O":
                board[r][c] = "X"
            elif board[r][c] == "#":
                board[r][c] = "O"
    return board
```

Time `O(R·C)`: each cell is marked at most once by the border floods, and the final scan touches each cell once. Space `O(R·C)` worst case for the stack; no separate visited structure is needed because the `"#"` marker is the visited set.

### Common mistakes

- **Treating a region as enclosed because one cell is surrounded.** Enclosure is a property of the whole region. `(1,1)` in the third example has `"X"` on three sides, but its region reaches the bottom edge.
- **Flipping during the border search.** If you turn cells into `"X"` while still exploring, you can cut a safe region in half. Mark first, decide in a separate scan.
- **Diagonal leaks.** Only orthogonal neighbours connect. An `"O"` touching a border `"O"` only at a corner is still captured.
- **Recursion depth.** A 200 × 200 board full of `"O"` recurses 40,000 deep from a single border cell. Use the explicit stack.

### How to discuss it

Lead with the complement: "Capturing requires knowing a whole region never touches the edge; surviving only requires one path to the edge. I'll compute the survivors from the border and capture everything else." Interviewers like hearing *why* the complement is easier, not just that you know the trick. The same border-first move appears in [Pacific Atlantic Water Flow](/practice/pacific-atlantic).

For the follow-up, the border-first approach no longer suffices on its own, because it never explores captured regions. In the final scan, whenever you meet an unmarked `"O"`, flood-fill that region to `"X"` while counting its cells: that gives the number of captured regions and each one's size in the same single scan. Union-find also answers it: union every `"O"` with its `"O"` neighbours and union every border `"O"` with a virtual "outside" node; every root other than the outside node's is a captured region, and the set sizes come for free.
