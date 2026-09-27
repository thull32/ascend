---
slug: detect-squares
title: Detect Squares
difficulty: medium
patterns: [math]
lists: [ascend-150]
companies: [google, amazon, meta, bloomberg]
order: 3
lesson: interview-patterns/combinatorial-patterns/math-and-geometry
hints:
  - "An axis-aligned square is fully determined by two diagonally opposite corners. Given the query point, which stored point should you enumerate so that the other two corners are forced?"
  - "Enumerate every stored point (x2, y2) that could be the diagonal opposite of the query (x, y): that requires |x2 - x| == |y2 - y| and neither difference zero. The remaining corners are then (x, y2) and (x2, y)."
  - "Points can be added more than once and each copy counts, so keep a count per point in a hash map. Each diagonal candidate contributes count[diag] * count[(x, y2)] * count[(x2, y)]."
signatures:
  python:
    name: DetectSquares
    starter: |
      class DetectSquares:
          def __init__(self):
              pass

          def add(self, point: list[int]) -> None:
              pass

          def count(self, point: list[int]) -> int:
              pass
  javascript:
    name: DetectSquares
    starter: |
      class DetectSquares {
        constructor() {
        }
        add(point) {
        }
        count(point) {
        }
      }
tests:
  - args: [["__init__"], ["add", [1, 1]], ["add", [1, 4]], ["add", [4, 1]], ["count", [4, 4]], ["count", [2, 2]], ["add", [4, 1]], ["count", [4, 4]]]
    expected: [null, null, null, null, 1, 0, null, 2]
  - args: [["__init__"], ["add", [0, 0]], ["add", [0, 0]], ["count", [0, 0]]]
    expected: [null, null, null, 0]
    label: zero-area squares do not count
  - args: [["__init__"], ["add", [7, 7]], ["add", [5, 7]], ["add", [7, 5]], ["add", [3, 3]], ["add", [3, 5]], ["add", [5, 3]], ["add", [3, 7]], ["count", [5, 5]]]
    expected: [null, null, null, null, null, null, null, null, 3]
    label: squares in several quadrants
  - args: [["__init__"], ["add", [0, 0]], ["add", [0, 0]], ["add", [0, 2]], ["add", [0, 2]], ["add", [0, 2]], ["add", [2, 0]], ["count", [2, 2]]]
    expected: [null, null, null, null, null, null, null, 6]
    label: duplicate points multiply
  - args: [["__init__"], ["add", [0, 0]], ["add", [0, 3]], ["add", [2, 0]], ["count", [2, 3]]]
    expected: [null, null, null, null, 0]
    label: a rectangle is not a square
  - args: [["__init__"], ["add", [10, 10]], ["add", [10, 20]], ["add", [20, 10]], ["count", [20, 20]], ["add", [20, 20]], ["count", [10, 10]], ["count", [30, 30]]]
    expected: [null, null, null, null, 1, null, 1, 0]
    hidden: true
  - args: [["__init__"], ["count", [1, 1]]]
    expected: [null, 0]
    hidden: true
    label: query before any point is added
  - args: [["__init__"], ["add", [0, 0]], ["add", [0, 1000]], ["add", [1000, 0]], ["count", [1000, 1000]], ["count", [0, 0]]]
    expected: [null, null, null, null, 1, 0]
    hidden: true
    label: large square, and a query that is itself a stored corner
time_limit_ms: 4000
---
Design a class `DetectSquares` that stores points on a 2-D integer grid and counts squares.

- `__init__()` — start with no points. (In JavaScript, the `constructor`.)
- `add(point)` — store `point = [x, y]`. The same point may be added several times; each copy is a separate point.
- `count(point)` — given a query `point = [x, y]`, return the number of ways to choose **three stored points** that, together with the query point, form an **axis-aligned square with positive area**. The query point itself is not stored by this call.

Axis-aligned means the square's sides are horizontal and vertical. Choosing different copies of a duplicated point counts as different ways.

Tests are a sequence of calls starting with `__init__`; the expected output lists each call's return value, with `null` for `__init__` and `add`.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `add([1,1]), add([1,4]), add([4,1]), count([4,4])` | `…, 1` | `(1,1), (1,4), (4,1), (4,4)` is a 3 × 3 square |
| `count([2,2])` (continuing) | `0` | `(1,1)` is diagonal to `(2,2)` but `(1,2)` and `(2,1)` are missing |
| `add([4,1]), count([4,4])` (continuing) | `…, 2` | Two copies of `(4,1)`: two ways to pick the same square |

### Constraints

- `point.length == 2`, `0 ≤ x, y ≤ 1000`
- At most `3000` calls to `add` and `count` in total.

### Follow-up

The interviewer asks: "`count` is called far more often than `add`. Can you make it faster?" Then: "Now count squares at any rotation, not just axis-aligned ones."

## Solution

### The naive approach

For each query, try every triple of stored points and test whether the four points form an axis-aligned square. With `p` stored points that is `O(p³)` per query; at 3000 points, billions of checks. Even trying every *pair* of stored points is `O(p²)`. The structure of a square lets you do much better.

### The insight

An axis-aligned square with one corner at the query `(x, y)` is determined by the **diagonally opposite corner** `(x2, y2)`. Once you fix that corner, the other two must be `(x, y2)` and `(x2, y)`; there is nothing left to choose. For `(x2, y2)` to be a genuine diagonal of a square:

- `|x2 - x| == |y2 - y|` (equal side lengths), and
- `x2 != x` (positive area; with the first condition this also gives `y2 != y`).

So enumerate stored points as diagonal candidates and look up the other two corners by count. The number of squares for a candidate is the product of the three corner counts, which handles duplicates for free.

### The optimal approach

```python
from collections import defaultdict


class DetectSquares:
    def __init__(self):
        self.counts: dict[tuple[int, int], int] = defaultdict(int)

    def add(self, point: list[int]) -> None:
        self.counts[(point[0], point[1])] += 1

    def count(self, point: list[int]) -> int:
        x, y = point
        total = 0
        for (x2, y2), diag in self.counts.items():   # (x2, y2) as the diagonal
            if x2 == x or abs(x2 - x) != abs(y2 - y):
                continue
            total += diag * self.counts.get((x, y2), 0) * self.counts.get((x2, y), 0)
        return total
```

Use `.get(..., 0)` for the lookups: indexing a `defaultdict` with a missing key *inserts* it, which silently grows the map on every query and, inside this loop, raises "dictionary changed size during iteration".

Trace the squares-in-several-quadrants test, query `(5, 5)`. Stored: `(7,7), (5,7), (7,5), (3,3), (3,5), (5,3), (3,7)`.

| candidate | diagonal? | other corners | product |
|---|---|---|---|
| (7, 7) | yes, side 2 | (5, 7) ✓, (7, 5) ✓ | 1 |
| (3, 3) | yes, side 2 | (5, 3) ✓, (3, 5) ✓ | 1 |
| (3, 7) | yes, side 2 | (5, 7) ✓, (3, 5) ✓ | 1 |
| (5, 7), (7, 5), (3, 5), (5, 3) | no: shares x or y | | 0 |

Total `3`.

Complexity: `add` is `O(1)`. `count` is `O(d)` where `d` is the number of *distinct* stored points (at most 3000 here), with `O(1)` hash lookups each. Space `O(d)`.

### A faster `count` for the follow-up

Index points by x-coordinate: `by_x[x]` maps each `y` to its count. For a query `(x, y)`, only points on the same vertical line can be the corner `(x, y2)`, so iterate over `by_x[x]` (one column, at most 1001 entries), derive the side `d = y2 - y`, and look up `(x ± d, y)` and `(x ± d, y2)`. That makes `count` proportional to the number of points in one column instead of the whole set, which matters when `count` dominates.

### Common mistakes

- Counting zero-area "squares" where the diagonal candidate equals the query point (or shares its x). Adding `(0, 0)` twice and querying `(0, 0)` must return `0`.
- Using a set instead of a counter, which loses duplicate points.
- Enumerating adjacent corners instead of the diagonal and then forgetting that a side can extend either left or right (or up or down); each candidate then needs two checks, and it is easy to miss one.
- Mutating the map during `count` (the `defaultdict` insertion trap). In Python it raises `RuntimeError` mid-iteration; in languages that tolerate it, the map quietly grows with every query and `count` gets slower over time.

### How to discuss it

Say "an axis-aligned square is fixed by one diagonal; the other two corners are forced", then state the two diagonal conditions. Design discussion is expected here: point out the read/write trade-off (a counter makes `add` `O(1)` and `count` `O(d)`; a coordinate index makes `count` cheaper at the cost of more bookkeeping), and ask which operation dominates before choosing. For rotated squares, the diagonal trick changes shape: take each stored point `p` as a corner *adjacent* to the query `q`, so `v = p - q` is a side, and rotating `v` by +90° or -90° gives the two squares that side can belong to. That is still `O(d)` per query, but each square is found twice (once from each of `q`'s two neighbours), so halve the total, and the looked-up corners can fall outside the grid. Spotting the double count before the interviewer does is the point of the follow-up.
