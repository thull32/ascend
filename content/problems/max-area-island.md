---
slug: max-area-island
title: Max Area of Island
difficulty: medium
patterns: [graph]
lists: [ascend-150]
companies: [amazon, google, meta, microsoft]
order: 3
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "This is Number of Islands with one change: instead of counting how many traversals you start, measure how many cells each traversal visits."
  - "Make the flood fill return (or accumulate) a size. Every cell you mark as visited adds one to the current island's area."
  - "Mark a cell when you push it, not when you pop it. Otherwise a cell reachable from two neighbours is counted twice and the area comes out too large."
signatures:
  python:
    name: max_area_of_island
    starter: |
      def max_area_of_island(grid: list[list[int]]) -> int:
          pass
  javascript:
    name: max_area_of_island
    starter: |
      function max_area_of_island(grid) {
      }
tests:
  - args: [[[1, 1, 0, 0, 0], [1, 1, 0, 0, 1], [0, 0, 0, 1, 1], [0, 0, 0, 1, 1]]]
    expected: 5
    label: the irregular island beats the square
  - args: [[[0, 0, 0], [0, 0, 0]]]
    expected: 0
    label: all water
  - args: [[[1]]]
    expected: 1
    label: single land cell
  - args: [[[1, 0, 1], [0, 1, 0], [1, 0, 1]]]
    expected: 1
    label: diagonals do not connect
  - args: [[[1, 1, 1, 1], [0, 0, 0, 1], [1, 1, 1, 1], [1, 0, 0, 0], [1, 1, 1, 1]]]
    expected: 14
    label: one snake-shaped island
  - args: [[[1, 1, 1], [1, 1, 1]]]
    expected: 6
    label: all land
  - args: [[[1, 0, 0, 1, 1], [1, 0, 0, 1, 0], [1, 1, 0, 0, 0], [0, 0, 0, 1, 1], [1, 0, 1, 1, 1]]]
    expected: 5
    hidden: true
    label: four islands of sizes 4, 3, 5 and 1
  - args: [[[1, 1, 0, 1, 1, 1, 0, 1]]]
    expected: 3
    hidden: true
    label: single row
  - args: [[[1], [1], [0], [1]]]
    expected: 2
    hidden: true
    label: single column
time_limit_ms: 4000
---
You are given a rectangular grid of `0`s (water) and `1`s (land). Land cells that touch horizontally or vertically belong to the same island; cells that only touch at a corner do not. The **area** of an island is the number of land cells in it.

Return the area of the largest island, or `0` if the grid contains no land.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1,1,0,0,0],[1,1,0,0,1],[0,0,0,1,1],[0,0,0,1,1]]` | `5` | The top-left square has area 4; the shape on the right has area 5 |
| `[[1,0,1],[0,1,0],[1,0,1]]` | `1` | Five islands of one cell each; corners do not join them |
| `[[0,0,0],[0,0,0]]` | `0` | No land at all |

### Constraints

- `1 ≤ rows, cols ≤ 50`
- `grid[r][c]` is `0` or `1`

### Follow-up

The interviewer asks: "You may turn exactly one water cell into land. What is the largest island you can create?" Aim for a solution that does not re-run a flood fill for every water cell.

## Solution

### The naive approach

For every land cell, run a fresh flood fill to measure the island it belongs to, and keep the maximum. Each flood fill can touch the entire grid, so on an all-land `R × C` grid this is `O((R·C)²)`: for 50 × 50 that is over six million cell visits, and it repeats identical work for every cell in the same island.

### The insight

Every cell belongs to exactly one island, so each island only needs to be measured once. Use the same skeleton as [Number of Islands](/practice/number-of-islands): scan the grid, and each time you hit unvisited land, flood-fill that island and mark every cell you reach. The only change is that the flood fill counts the cells it marks. The count at the end of the fill is the island's area.

### The optimal approach

Scan row-major. On a `1`, set it to `0` (visited), push it onto a stack, and start `area = 1`. While the stack is non-empty, pop a cell and look at its four neighbours; each in-bounds `1` is flipped to `0`, pushed, and adds one to `area`. When the stack empties, compare `area` with the best so far.

Trace the first example. The scan hits `(0,0)`: the fill marks `(0,0) (0,1) (1,0) (1,1)`, area 4, best 4. The scan continues to `(1,4)`: the fill reaches `(2,4)`, then `(2,3) (3,4)`, then `(3,3)`, area 5, best 5. Nothing else is land. Answer 5.

```python
def max_area_of_island(grid: list[list[int]]) -> int:
    if not grid or not grid[0]:
        return 0
    rows, cols = len(grid), len(grid[0])
    best = 0
    for r0 in range(rows):
        for c0 in range(cols):
            if grid[r0][c0] != 1:
                continue
            grid[r0][c0] = 0                 # mark on push
            stack = [(r0, c0)]
            area = 1
            while stack:
                r, c = stack.pop()
                for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                        grid[nr][nc] = 0
                        stack.append((nr, nc))
                        area += 1
            best = max(best, area)
    return best
```

Time `O(R·C)`: the scan visits every cell once and each land cell is pushed and popped once. Space `O(R·C)` in the worst case for the stack; the in-place marking needs no separate visited set.

### Common mistakes

- **Marking on pop.** If a cell is only marked when it comes off the stack, two neighbours can both push it first. Counting at push time then counts it twice, and so does counting at pop time unless you skip cells that are already marked when popped. Mark and count at the same moment, on push.
- **Forgetting to update the maximum for the last island.** Put the `best = max(...)` after every fill, not only when a new island starts.
- **Mutating the input silently.** Sinking cells to `0` destroys the caller's grid. Say "I'll mutate the grid; if that is not allowed I'll keep a `visited` boolean grid of the same size".
- **Recursive DFS without thinking about depth.** A 50 × 50 all-land grid recurses up to 2,500 deep, past Python's default limit of 1,000. The explicit stack avoids the question entirely.

### How to discuss it

State the reduction first: "this is connected components on an implicit grid graph, and I want the size of the largest component." Then say that one scan with a counting flood fill does it in linear time, because each cell is visited by exactly one fill.

The follow-up is where seniors separate themselves. Do one pass that labels each island with an id (2, 3, 4, … so labels never collide with 0 and 1) and records `size[id]`. Then, for each water cell, collect the **distinct** ids among its four neighbours and compute `1 + sum(size[id])`. The word *distinct* is the trap: a water cell touching the same island from two sides must not count it twice. Also handle the all-land grid, where there is no water cell to flip and the answer is simply `R·C`. Total time stays `O(R·C)`.
