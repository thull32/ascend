---
slug: pacific-atlantic
title: Pacific Atlantic Water Flow
difficulty: medium
patterns: [graph]
lists: [core-75, ascend-150]
companies: [google, amazon, meta, microsoft, uber]
order: 4
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "Asking 'where can water from this cell reach?' for every cell repeats a lot of work. Flip the question: 'which cells can drain into this ocean?'"
  - "Start from the cells that touch an ocean and walk *uphill*: from a cell you may step to a neighbour whose height is greater than or equal to yours, because water from that neighbour could flow down to you."
  - "Run the uphill search once for the Pacific borders and once for the Atlantic borders. The answer is the set of cells both searches reached."
signatures:
  python:
    name: pacific_atlantic
    starter: |
      def pacific_atlantic(heights: list[list[int]]) -> list[list[int]]:
          pass
  javascript:
    name: pacific_atlantic
    starter: |
      function pacific_atlantic(heights) {
      }
tests:
  - args: [[[1, 2, 3], [8, 9, 4], [7, 6, 5]]]
    expected: [[0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]]
    any_order: true
    label: spiral terrain
  - args: [[[5]]]
    expected: [[0, 0]]
    any_order: true
    label: single cell touches both oceans
  - args: [[[1, 1], [1, 1]]]
    expected: [[0, 0], [0, 1], [1, 0], [1, 1]]
    any_order: true
    label: flat terrain
  - args: [[[3, 1, 4]]]
    expected: [[0, 0], [0, 1], [0, 2]]
    any_order: true
    label: single row borders both oceans everywhere
  - args: [[[5, 5, 5], [5, 1, 5], [5, 5, 5]]]
    expected: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]]
    any_order: true
    label: a pit in the middle drains nowhere
  - args: [[[2, 2, 3, 1], [1, 5, 4, 2], [3, 6, 1, 4], [2, 3, 2, 5]]]
    expected: [[0, 2], [0, 3], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 3], [3, 0], [3, 1], [3, 3]]
    any_order: true
  - args: [[[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]]
    expected: [[0, 3], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3]]
    any_order: true
    hidden: true
    label: everything slopes toward the Pacific
  - args: [[[4, 8, 2, 6, 1], [3, 7, 9, 5, 2], [6, 1, 4, 8, 3], [2, 5, 7, 3, 9], [8, 3, 1, 6, 4]]]
    expected: [[0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 1], [3, 2], [3, 4], [4, 0]]
    any_order: true
    hidden: true
  - args: [[[9, 8, 7], [8, 1, 6], [7, 6, 5]]]
    expected: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]]
    any_order: true
    hidden: true
    label: only the high ridge reaches both
time_limit_ms: 4000
---
You are given a height map `heights` of a rectangular piece of land, where `heights[r][c]` is the elevation of cell `(r, c)`. The land is surrounded by two oceans: the **Pacific** touches the top row and the left column, and the **Atlantic** touches the bottom row and the right column.

When rain falls on a cell, it can run into any horizontally or vertically adjacent cell whose height is **less than or equal to** the current cell's height. Water on a border cell can run straight into the ocean that border touches (a corner cell touches both oceans).

Return the coordinates `[r, c]` of every cell from which rainwater can reach **both** oceans. The order of the coordinates does not matter.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[1,2,3],[8,9,4],[7,6,5]]` | `[[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]]` | `(0,1)` with height 2 can only run to `(0,0)` (height 1), which reaches the Pacific but is walled in from the Atlantic |
| `[[5,5,5],[5,1,5],[5,5,5]]` | every cell except `[1,1]` | The centre is a pit: all its neighbours are higher, so its water goes nowhere |
| `[[3,1,4]]` | `[[0,0],[0,1],[0,2]]` | A single row touches the top and bottom edges at once |

### Constraints

- `1 ≤ rows, cols ≤ 200`
- `0 ≤ heights[r][c] ≤ 10⁵`

### Follow-up

The interviewer asks: "The map is now 10⁴ × 10⁴ and you have plenty of disk but only a few hundred megabytes of RAM. What does your visited state cost, and how would you shrink it?"

## Solution

### The naive approach

From each cell, run a DFS that follows water downhill (to neighbours of height `≤` the current one) and record whether it ever touches a Pacific edge and an Atlantic edge. Each search can visit the whole grid, so with `N = R·C` cells this is `O(N²)`. On a 200 × 200 grid that is 1.6 billion cell visits in the worst case (think of a perfectly flat map, where every search floods everything).

### The insight

Many cells share the same fate, and the naive approach rediscovers it from scratch every time. Reverse the direction of the question. Instead of asking "where can water from this cell go?", ask "which cells can water reach **this ocean** from?"

If water can flow from `a` down to its neighbour `b`, then `height[a] ≥ height[b]`. So starting from the ocean's border cells, you can walk **uphill**: from `b` you may step to any neighbour `a` with `height[a] ≥ height[b]`. Every cell this reverse search reaches can drain into that ocean. It is a multi-source traversal: all border cells of one ocean start in the frontier together, and each cell is visited at most once per ocean.

Do it twice, once per ocean, and intersect the two visited sets.

### The optimal approach

1. Seed a stack with every Pacific border cell (row 0 and column 0), marking them in `pacific`.
2. Pop a cell; for each in-bounds neighbour not yet in `pacific` whose height is `≥` the current cell's height, mark and push it.
3. Repeat with the Atlantic borders (last row and last column) into `atlantic`.
4. Return every cell in both sets.

Trace the first example. Pacific seeds: `(0,0) (0,1) (0,2) (1,0) (2,0)`. From `(0,2)` = 3 you climb to `(1,2)` = 4, then to `(2,2)` = 5 and `(1,1)` = 9, then from `(2,2)` to `(2,1)` = 6. Every cell is in `pacific`. Atlantic seeds: `(2,0) (2,1) (2,2) (0,2) (1,2)`. From `(1,2)` = 4 you climb to `(1,1)` = 9; from `(2,0)` = 7 to `(1,0)` = 8. Neither `(0,0)` = 1 nor `(0,1)` = 2 is reachable, because every route to them goes downhill from a higher cell. The intersection is the seven cells in the answer.

```python
def pacific_atlantic(heights: list[list[int]]) -> list[list[int]]:
    if not heights or not heights[0]:
        return []
    rows, cols = len(heights), len(heights[0])

    def climb(seeds: list[tuple[int, int]]) -> set[tuple[int, int]]:
        seen = set(seeds)
        stack = list(seen)
        while stack:
            r, c = stack.pop()
            for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if (0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in seen
                        and heights[nr][nc] >= heights[r][c]):
                    seen.add((nr, nc))
                    stack.append((nr, nc))
        return seen

    pacific = climb([(0, c) for c in range(cols)] + [(r, 0) for r in range(rows)])
    atlantic = climb([(rows - 1, c) for c in range(cols)] + [(r, cols - 1) for r in range(rows)])
    return [[r, c] for r in range(rows) for c in range(cols)
            if (r, c) in pacific and (r, c) in atlantic]
```

Time `O(R·C)`: each search visits every cell at most once and looks at four neighbours. Space `O(R·C)` for the two visited sets and the stack.

### Common mistakes

- **Comparing in the wrong direction.** In the reverse search you move to neighbours that are *higher or equal*. Writing `<=` (the forward rule) silently computes something else and often still passes the flat-terrain tests.
- **Using strict `>`.** Water flows between equal heights, so equal neighbours must be reachable. The pit example has a ring of equal 5s that only works with `>=`.
- **Sharing one visited set for both oceans.** A cell reached by the Pacific search must still be explorable by the Atlantic search. Keep two sets (or two boolean grids, or two bits per cell).
- **Forgetting the corners and single rows.** A one-row grid touches both oceans in every cell; seeding from row 0 and row `rows - 1` handles that without special cases.

### How to discuss it

Say the reversal out loud: "Forward search from every cell is `O(N²)` because cells share outcomes. I'll run a multi-source search backwards from each ocean, climbing uphill, so each cell is settled once per ocean." That sentence contains the entire idea, and it is the same move as multi-source BFS in [Rotting Oranges](/practice/rotting-oranges) and border-first search in [Surrounded Regions](/practice/surrounded-regions).

For the memory follow-up: two Python sets of tuples cost on the order of 100 bytes per entry, which for 10⁸ cells is far too much. Two bitsets cost 2 bits per cell, about 25 MB for 10⁸ cells. The frontier is the remaining risk: a winding, flat-ish terrain can put a large fraction of the grid on the stack at once. Name that worst case, then offer to process the map in tiles that fit in memory, streaming each tile from disk and re-running the uphill search when a tile's border cells gain new reachable neighbours, until nothing changes.
