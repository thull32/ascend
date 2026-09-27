---
slug: rotting-oranges
title: Rotting Oranges
difficulty: medium
patterns: [graph]
lists: [ascend-150]
companies: [amazon, microsoft, google, meta]
order: 6
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "Rot spreads one step per minute from *every* rotten orange at the same time. What traversal processes nodes in waves of equal distance?"
  - "Put all the initially rotten oranges in the BFS queue before you start. That is multi-source BFS: the minute a fresh orange rots is its distance to the nearest rotten one."
  - "Count fresh oranges up front and decrement as they rot. If any remain when the queue empties, return -1. If there were none to begin with, the answer is 0."
signatures:
  python:
    name: oranges_rotting
    starter: |
      def oranges_rotting(grid: list[list[int]]) -> int:
          pass
  javascript:
    name: oranges_rotting
    starter: |
      function oranges_rotting(grid) {
      }
tests:
  - args: [[[2, 1, 0], [1, 1, 0], [0, 1, 1]]]
    expected: 4
    label: rot winds down to the far corner
  - args: [[[2, 1, 1], [0, 0, 0], [1, 1, 1]]]
    expected: -1
    label: a row of fresh oranges is cut off
  - args: [[[0, 2]]]
    expected: 0
    label: no fresh oranges
  - args: [[[0]]]
    expected: 0
    label: empty crate
  - args: [[[1]]]
    expected: -1
    label: fresh with nothing to rot it
  - args: [[[2, 1, 1, 1, 2]]]
    expected: 2
    label: two sources meet in the middle
  - args: [[[2, 1, 1], [1, 1, 1], [1, 1, 2]]]
    expected: 2
    hidden: true
    label: opposite corners rot simultaneously
  - args: [[[1, 1, 1], [1, 1, 1], [1, 1, 2]]]
    expected: 4
    hidden: true
  - args: [[[2, 0, 1], [0, 0, 0], [1, 1, 1]]]
    expected: -1
    hidden: true
    label: empty cells block the spread
time_limit_ms: 4000
---
A storage crate is a grid of cells. Each cell holds one of three values:

- `0`: the cell is empty,
- `1`: the cell holds a fresh orange,
- `2`: the cell holds a rotten orange.

Every minute, each fresh orange that is horizontally or vertically adjacent to a rotten orange becomes rotten. All oranges that are due to rot in a given minute rot at the same time. Empty cells do not carry rot.

Return the number of minutes until no fresh orange remains. If some fresh orange can never rot, return `-1`.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[2,1,0],[1,1,0],[0,1,1]]` | `4` | Minute 1: `(0,1)` and `(1,0)`. Minute 2: `(1,1)`. Minute 3: `(2,1)`. Minute 4: `(2,2)` |
| `[[2,1,1,1,2]]` | `2` | Both ends spread inward; the middle orange rots at minute 2 |
| `[[2,1,1],[0,0,0],[1,1,1]]` | `-1` | The bottom row is separated by empty cells |

### Constraints

- `1 ≤ rows, cols ≤ 10`
- `grid[r][c]` is `0`, `1` or `2`

### Follow-up

The interviewer asks: "Each orange now has its own resistance: a fresh orange at `(r, c)` rots `k[r][c]` minutes after its first rotten neighbour rots. What changes?"

## Solution

### The naive approach

Simulate minute by minute: scan the whole grid, collect every fresh orange with a rotten neighbour, rot them all, and repeat until a scan changes nothing. Each scan is `O(R·C)` and there can be up to `O(R·C)` minutes (think of a long snake of oranges rotting one cell per minute), so the simulation is `O((R·C)²)`. It is correct, and for a 10 × 10 grid it is fine, but it re-examines every settled cell every minute.

### The insight

The minute at which a fresh orange rots is exactly its shortest-path distance, in grid steps through oranges, to the **nearest** initially rotten orange. Shortest paths in an unweighted graph are what BFS computes, because BFS expands nodes in order of distance.

There are several sources, not one. Seed the queue with **all** of them at distance 0. This is multi-source BFS, and it is equivalent to adding an imaginary super-source joined to every rotten orange: the queue then expands in waves, and wave `d` is exactly the set of oranges that rot at minute `d`.

### The optimal approach

1. Scan once: push every rotten orange into the queue and count the fresh ones.
2. If there are no fresh oranges, return 0.
3. Process the queue one level at a time. For each rotten orange in the current level, rot every fresh neighbour (set it to 2 immediately so nobody else enqueues it), decrement the fresh count, and push it into the next level. After a level that rotted at least one orange, add one minute.
4. When the queue is empty, return the minutes if the fresh count is 0, otherwise `-1`.

```python
from collections import deque

def oranges_rotting(grid: list[list[int]]) -> int:
    rows, cols = len(grid), len(grid[0])
    queue = deque()
    fresh = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                queue.append((r, c))
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0
    while queue and fresh:
        for _ in range(len(queue)):          # exactly one minute's wave
            r, c = queue.popleft()
            for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:
                    grid[nr][nc] = 2
                    fresh -= 1
                    queue.append((nr, nc))
        minutes += 1
    return minutes if fresh == 0 else -1
```

The loop condition `while queue and fresh` matters. It stops as soon as the last fresh orange rots, so the final wave (the oranges that rotted last, which have nothing left to infect) does not add a phantom extra minute.

Time `O(R·C)`: each cell enters the queue at most once. Space `O(R·C)` for the queue.

### Common mistakes

- **Running a separate BFS from each rotten orange.** That computes the distance from each source independently and then needs a minimum per cell; it is `O(k·R·C)` for `k` sources and misses the point that all sources spread simultaneously.
- **Off-by-one on the minute count.** Incrementing after every level, including the final one that rots nothing, returns one too many. Either guard on `fresh` as above or track the distance stored with each cell and return the maximum.
- **Returning 0 versus -1 on edge cases.** No fresh oranges means 0 minutes even if there are no rotten ones either. A fresh orange with no rotten source anywhere means -1.
- **Marking at dequeue time.** Two rotten neighbours in the same wave would both enqueue the same fresh orange and decrement `fresh` twice.

### How to discuss it

Say: "The rot time of each orange is its BFS distance from the nearest rotten orange, so I'll run one BFS seeded with all of them at once." Then name the level-by-level loop as the clock. Mention the super-source equivalence; it is the cleanest argument for why multi-source BFS is correct, and the same idea powers [Walls and Gates](/practice/walls-and-gates) and the reverse search in [Pacific Atlantic Water Flow](/practice/pacific-atlantic).

The follow-up breaks BFS. Once different oranges take different times to rot, the graph is weighted: the rot time of a fresh orange is `min over neighbours (neighbour's rot time) + k[r][c]`. That is a shortest-path problem with non-negative weights, so switch to Dijkstra with all rotten oranges at time 0 in the heap, exactly as in [Network Delay Time](/practice/network-delay-time). Recognising when an unweighted BFS has quietly become a weighted problem is the senior signal here.
