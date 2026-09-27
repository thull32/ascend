---
slug: walls-and-gates
title: Walls and Gates
difficulty: medium
patterns: [graph]
lists: [ascend-150]
companies: [meta, google, amazon, uber]
order: 7
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "Running a BFS from every empty room to find its nearest gate repeats almost all the work. Run the search the other way round."
  - "Start one BFS from all the gates at once. Because BFS expands in order of distance, the first time a wave reaches a room is from its nearest gate."
  - "A room still holding 2147483647 is unvisited, so the 'is it unvisited?' test and the 'is it an empty room?' test are the same check. Write the distance as you enqueue."
signatures:
  python:
    name: walls_and_gates
    starter: |
      def walls_and_gates(rooms: list[list[int]]) -> list[list[int]]:
          pass
  javascript:
    name: walls_and_gates
    starter: |
      function walls_and_gates(rooms) {
      }
tests:
  - args: [[[0, 2147483647, 2147483647, -1], [2147483647, -1, 2147483647, 2147483647], [2147483647, 2147483647, 2147483647, 0], [-1, 2147483647, -1, 2147483647]]]
    expected: [[0, 1, 2, -1], [1, -1, 2, 1], [2, 2, 1, 0], [-1, 3, -1, 1]]
    label: two gates share the floor
  - args: [[[2147483647]]]
    expected: [[2147483647]]
    label: a room with no gate stays at infinity
  - args: [[[0]]]
    expected: [[0]]
    label: a single gate
  - args: [[[-1]]]
    expected: [[-1]]
    label: a single wall
  - args: [[[0, -1, 2147483647]]]
    expected: [[0, -1, 2147483647]]
    label: room walled off from the gate
  - args: [[[2147483647, 2147483647, 0, 2147483647]]]
    expected: [[2, 1, 0, 1]]
    label: single corridor
  - args: [[[0, 2147483647, 2147483647, 2147483647, 0]]]
    expected: [[0, 1, 2, 1, 0]]
    hidden: true
    label: nearest gate wins
  - args: [[[2147483647, 2147483647, 2147483647], [2147483647, 0, 2147483647], [2147483647, 2147483647, 2147483647]]]
    expected: [[2, 1, 2], [1, 0, 1], [2, 1, 2]]
    hidden: true
    label: gate in the centre
  - args: [[[0, -1, 2147483647], [2147483647, -1, 2147483647], [2147483647, 2147483647, 2147483647]]]
    expected: [[0, -1, 6], [1, -1, 5], [2, 3, 4]]
    hidden: true
    label: distance follows the corridor, not the straight line
time_limit_ms: 4000
---
You are given a floor plan as a grid of integers:

- `-1` is a wall,
- `0` is a gate,
- `2147483647` (that is, 2³¹ − 1, standing in for infinity) is an empty room.

Fill every empty room with the number of steps to its **nearest** gate, where a step moves one cell up, down, left or right and may not pass through walls. Rooms that cannot reach any gate keep the value `2147483647`. Modify the grid in place and return it.

### Examples

| Input | Output | Why |
|---|---|---|
| `[[INF,INF,0,INF]]` | `[[2,1,0,1]]` | A corridor: distances grow outward from the gate |
| `[[0,-1,INF]]` | `[[0,-1,INF]]` | The wall cuts the room off, so it stays at infinity |
| `[[0,-1,INF],[INF,-1,INF],[INF,INF,INF]]` | `[[0,-1,6],[1,-1,5],[2,3,4]]` | The top-right room is two cells from the gate as the crow flies but six steps around the wall |

(`INF` abbreviates `2147483647` in the table; the tests use the number.)

### Constraints

- `1 ≤ rows, cols ≤ 250`
- `rooms[r][c]` is `-1`, `0` or `2147483647`

### Follow-up

The interviewer asks: "Instead of the distance, I want each room labelled with *which* gate is nearest. Ties go to the gate that appears first in row-major order." And then: "Gates open and close during the day. How do you avoid recomputing the whole floor each time?"

## Solution

### The naive approach

From every empty room, run a BFS until it reaches a gate. Each BFS is `O(R·C)`, and there are up to `R·C` rooms, so the total is `O((R·C)²)`. For a 250 × 250 floor that is about 4 × 10⁹ cell visits. A variant that runs one BFS from each gate and keeps the minimum per room is `O(G·R·C)` for `G` gates, which is just as bad when gates are common.

### The insight

"Distance to the nearest of several sources" is a single shortest-path problem, not many. Imagine a super-gate connected by a zero-length edge to every real gate. The distance from the super-gate to a room is the distance to its nearest real gate. BFS from the super-gate is the same as BFS whose initial queue holds every gate at distance 0. That is **multi-source BFS**, and it runs in the time of one BFS.

Why is the first visit the right one? BFS dequeues cells in non-decreasing order of distance from the source set. When a room is first reached from a cell at distance `d`, no gate can be closer than `d + 1`, because any shorter path would have been expanded earlier.

### The optimal approach

1. Enqueue every gate.
2. Pop a cell at distance `d`. For each in-bounds neighbour still holding `INF`, write `d + 1` into it and enqueue it.
3. Walls are never `INF`, so they are skipped automatically; gates are never `INF`, so they are never overwritten.

The `INF` check is simultaneously "is it an empty room?" and "have I not visited it yet?". Writing the distance at enqueue time makes the grid its own visited set.

Trace the first test. Gates: `(0,0)` and `(2,3)`. Wave 1 writes 1 into `(0,1) (1,0) (1,3) (3,3) (2,2)`. Wave 2 writes 2 into `(0,2) (2,0) (1,2) (2,1)`. Wave 3 writes 3 into `(3,1)`, whose only open neighbour is `(2,1)`. The queue empties; nothing remains at `INF`.

```python
from collections import deque

def walls_and_gates(rooms: list[list[int]]) -> list[list[int]]:
    INF = 2147483647
    if not rooms or not rooms[0]:
        return rooms
    rows, cols = len(rooms), len(rooms[0])
    queue = deque((r, c) for r in range(rows) for c in range(cols) if rooms[r][c] == 0)
    while queue:
        r, c = queue.popleft()
        for nr, nc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
            if 0 <= nr < rows and 0 <= nc < cols and rooms[nr][nc] == INF:
                rooms[nr][nc] = rooms[r][c] + 1
                queue.append((nr, nc))
    return rooms
```

Time `O(R·C)`: every cell is enqueued at most once. Space `O(R·C)` for the queue in the worst case (an open floor with gates everywhere enqueues most cells in the first wave).

### Common mistakes

- **Using DFS.** DFS reaches a room by *some* path, not the shortest one, so you would have to overwrite distances when a shorter path turns up later, which can re-explore cells many times. BFS gets the order right for free.
- **Using a stack by accident.** In Python, `list.pop()` pops from the end and turns your BFS into a DFS. Use `collections.deque` and `popleft()`.
- **Running the BFS gate by gate with the `== INF` check.** If you scan, find the first gate, BFS from it to completion, then move on to the next gate, the first gate claims every room it can reach, including rooms that are closer to a later gate, and the later BFS never corrects them because they are no longer `INF`. All gates must be in the queue before the first pop.
- **Treating the sentinel as a real number.** `2147483647 + 1` overflows a 32-bit integer in languages that have them. You never add to an `INF` cell here, because only finite distances propagate, but say that you checked.

### How to discuss it

Name the pattern in one breath: "nearest of many sources means multi-source BFS; seed the queue with every gate." Then give the super-source argument for correctness. That is the difference between knowing the trick and understanding it, and interviewers at the senior bar ask "why is the first visit optimal?" to find out which one you have.

For the "which gate" follow-up, store a gate id alongside the distance and propagate it with the wave. Ties are the subtle part: two waves can reach a room at the same distance, and the first to arrive wins. Seeding the gates in row-major order turns out to be enough. By induction, each BFS level leaves the queue sorted by gate rank (level 1 inherits the seed order, and every later level is enqueued in its parents' order), so the first parent to reach a room carries the lowest-ranked of its nearest gates. Say that argument out loud: "first arrival wins" sounds arbitrary until you show the queue stays sorted. If you cannot control the seed order, store `(distance, gate_rank)` and let a strictly smaller pair overwrite. For gates opening and closing, recomputing is `O(R·C)`; an opening gate can be handled incrementally by a BFS from the new gate that only overwrites strictly larger distances, while a closing gate is genuinely harder (decremental shortest paths) and usually justifies periodic full recomputation.
