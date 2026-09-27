---
slug: number-of-islands
title: Number of Islands
difficulty: medium
patterns: [graph]
lists: [core-75, ascend-150]
companies: [amazon, google, meta, microsoft, bloomberg]
order: 1
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "The grid is an implicit graph. Every land cell is a node and its four orthogonal land neighbours are its edges. You never need to build an adjacency list."
  - "Count how many times you *start* a traversal. Each start that finds an unvisited land cell is one island; the traversal itself sinks everything connected to it."
  - "Sink cells in place (flip '1' to '0') or keep a visited set. Either way, a cell must be marked before its neighbours are pushed, not after it is popped, or you enqueue the same cell many times."
signatures:
  python:
    name: num_islands
    starter: |
      def num_islands(grid: list[list[str]]) -> int:
          pass
  javascript:
    name: num_islands
    starter: |
      function num_islands(grid) {
      }
tests:
  - args: [[["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]]
    expected: 3
  - args: [[["1","1","1"],["0","1","0"],["1","1","1"]]]
    expected: 1
    label: one island shaped like an H
  - args: [[["0"]]]
    expected: 0
    label: single water cell
  - args: [[["1"]]]
    expected: 1
    label: single land cell
  - args: [[["1","0","1","0","1"]]]
    expected: 3
    label: single row
  - args: [[["1","0"],["0","1"]]]
    expected: 2
    hidden: true
    label: diagonal cells are not connected
  - args: [[["0","0","0"],["0","0","0"],["0","0","0"]]]
    expected: 0
    hidden: true
    label: all water
  - args: [[["1","1","1","1"],["1","0","0","1"],["1","0","0","1"],["1","1","1","1"]]]
    expected: 1
    hidden: true
    label: ring around a lake
time_limit_ms: 4000
---
You are given a rectangular grid where each cell is either `"1"` (land) or `"0"` (water). An **island** is a maximal group of land cells connected horizontally or vertically. Diagonal adjacency does not count. The grid is bordered by water on all sides.

Return the number of islands.

### Examples

| Input | Output | Why |
|---|---|---|
| `[["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]` | `3` | A 2×2 block top-left, a lone cell in the middle, a pair bottom-right |
| `[["1","1","1"],["0","1","0"],["1","1","1"]]` | `1` | The middle column joins the two rows |
| `[["1","0"],["0","1"]]` | `2` | The two land cells only touch at a corner |

### Constraints

- `1 ≤ rows, cols ≤ 300`
- `grid[r][c]` is `"0"` or `"1"`

### Follow-up

The interviewer asks: "The grid is 10⁵ × 10⁵ and does not fit in memory; you get it as a stream of rows. Can you still count islands?" And then: "Now cells flip from water to land one at a time and I want the count after every flip."

## Solution

### The naive approach

For each land cell, try to work out which island it belongs to by looking at its neighbours and merging labels. This is the connected-component labelling algorithm from image processing and it works, but done naively it needs a second pass to resolve label equivalences and a union-find to do that cleanly. It is more machinery than the question needs.

### The insight

The grid is a graph you never have to build. A cell `(r, c)` is a node; its edges go to `(r±1, c)` and `(r, c±1)` when those are in bounds and land. An island is a connected component. Counting connected components has a one-line strategy: scan every node, and each time you find one you have not visited, that is a new component, so increment the count and run a traversal that marks the entire component visited. The traversal guarantees nothing in that component will start a second count later.

### The optimal approach

Scan row-major. On an unvisited `"1"`, increment the answer and flood-fill from it with an explicit stack (or a queue; the choice does not matter for counting). Mark cells visited *when they are pushed*, not when they are popped. Sinking the cell in place (`grid[r][c] = "0"`) is the cheapest marker because it costs no extra memory and the "visited" test becomes the same as the "is land" test.

Trace on the first example. `(0,0)` is land: count 1, flood sinks `(0,0) (0,1) (1,0) (1,1)`. The scan continues; nothing is land until `(2,2)`: count 2, flood sinks it alone. Then `(3,3)`: count 3, flood sinks `(3,3) (3,4)`. Scan ends, answer 3.

```python
def num_islands(grid: list[list[str]]) -> int:
    if not grid or not grid[0]:
        return 0
    rows, cols = len(grid), len(grid[0])
    count = 0
    for r0 in range(rows):
        for c0 in range(cols):
            if grid[r0][c0] != "1":
                continue
            count += 1
            grid[r0][c0] = "0"           # mark on push
            stack = [(r0, c0)]
            while stack:
                r, c = stack.pop()
                for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1":
                        grid[nr][nc] = "0"
                        stack.append((nr, nc))
    return count
```

Time `O(rows × cols)`: every cell is examined by the scan once and pushed at most once. Space `O(rows × cols)` worst case for the stack (an all-land grid pushes almost everything before popping), `O(1)` extra if you count the in-place marking as free.

Recursive DFS is shorter but a 300×300 all-land grid recurses 90,000 deep, which overflows Python's default limit of 1,000 and is uncomfortable in JavaScript too. Use an explicit stack in interviews unless you know the depth is bounded.

### Common mistakes

- Marking a cell visited when it is popped instead of when it is pushed. The code still returns the right count, but a cell can be pushed by all four neighbours, so the stack grows to several times the grid size and the traversal does redundant work.
- Treating diagonals as connected. Read the definition; interviewers sometimes switch to 8-connectivity as a follow-up precisely to see whether you hard-coded the four directions.
- Mutating the input without saying so. Sinking in place is fine, but say "I am going to modify the grid; if that is not acceptable I will use a visited set of `(r, c)` pairs or a parallel boolean grid".

### How to discuss it

Say "implicit graph, connected components, count the number of traversal starts" before you write anything; that sentence is the whole solution. For the streaming follow-up, keep only the previous row plus union-find labels for its islands: each new row's land cells either extend an existing label, merge two labels (one fewer island), or start a new one. For the dynamic follow-up, union-find is the right structure: each flip adds a node and unions it with up to four land neighbours, and the count is `flips - successful_unions`. Both follow-ups are exactly why [Number of Provinces](/practice/number-of-provinces) and [Count Components](/practice/count-components) teach the same problem from the union-find side.
