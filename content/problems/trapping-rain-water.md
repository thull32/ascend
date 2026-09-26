---
slug: trapping-rain-water
title: Trapping Rain Water
difficulty: hard
patterns: [two-pointers]
lists: [ascend-150]
companies: [amazon, google, apple, bloomberg]
order: 5
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - Water above column `i` is `min(tallest to the left, tallest to the right) - height[i]`, or zero if that is negative. Compute both maxima arrays and you have an O(n) time, O(n) space solution.
  - To drop the arrays, walk two pointers inward. Whichever side currently has the smaller running maximum is the side whose water level is already decided.
  - If `left_max < right_max`, the column at `lo` is bounded by `left_max` no matter what lies further right, because something at least `right_max` tall is waiting there.
signatures:
  python:
    name: trap
    starter: |
      def trap(heights: list[int]) -> int:
          pass
  javascript:
    name: trap
    starter: |
      function trap(heights) {
      }
tests:
  - args: [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]]
    expected: 6
  - args: [[4, 2, 0, 3, 2, 5]]
    expected: 9
  - args: [[]]
    expected: 0
    label: empty input
  - args: [[3]]
    expected: 0
    label: single column
  - args: [[1, 2, 3, 4]]
    expected: 0
    label: monotonic, nothing trapped
  - args: [[2, 0, 2, 0, 2]]
    expected: 4
  - args: [[5, 0, 5]]
    expected: 5
    hidden: true
  - args: [[3, 0, 1, 0, 3]]
    expected: 8
    hidden: true
  - args: [[4, 1, 1, 0, 2, 3]]
    expected: 8
    hidden: true
    label: right wall lower than left wall
time_limit_ms: 4000
---
You are given an array `heights` of non-negative integers describing an elevation map: column `i` is a bar of width 1 and height `heights[i]`. After it rains, water settles in the dips between bars. Return the total volume of water trapped.

### Examples

| Input | Output | Why |
|---|---|---|
| `[4, 2, 0, 3, 2, 5]` | `9` | Water levels above each column: `0, 2, 4, 1, 2, 0` |
| `[3, 0, 1, 0, 3]` | `8` | The two outer walls of height 3 hold `3 + 2 + 3` |
| `[1, 2, 3, 4]` | `0` | A staircase drains completely |

### Constraints

- `0 ≤ len(heights) ≤ 2 × 10⁴`
- `0 ≤ heights[i] ≤ 10⁵`

### Follow-up

The interviewer asks: "Explain why you can move the pointer on the side with the smaller maximum without knowing what lies between." Then: "Now the map is 2D, a grid of heights, and water can escape off any edge. What changes?"

## Solution

### The naive approach

For each column, scan left for the tallest bar and scan right for the tallest bar; the water above the column is `min(left, right) - height[i]`, clamped at zero. `O(n²)` time.

### The prefix-maximum approach

The two scans are prefix computations. Build `left_max[i]`, the tallest bar at or before `i`, in one forward pass and `right_max[i]` in one backward pass. Then sum `min(left_max[i], right_max[i]) - heights[i]` over all `i`. `O(n)` time and `O(n)` space. Write this first if you are at all unsure; it is correct, obviously so, and the interviewer will accept it before asking for the space improvement.

### The insight

You do not need both maxima at every column. The water above column `i` is decided by the *smaller* of the two walls. Walk two pointers inward and maintain the running maximum seen from each end. If `left_max < right_max`, then column `lo` is bounded on the right by *at least* `right_max` (that bar exists somewhere at or beyond `hi`), so its water level is exactly `left_max - heights[lo]`: the right side cannot make it lower, and the left side cannot make it higher. So you can finalise `lo` and move it. The symmetric case handles `hi`.

### The optimal approach

```python
def trap(heights: list[int]) -> int:
    lo, hi = 0, len(heights) - 1
    left_max = right_max = 0
    water = 0
    while lo < hi:
        if heights[lo] < heights[hi]:
            left_max = max(left_max, heights[lo])
            water += left_max - heights[lo]
            lo += 1
        else:
            right_max = max(right_max, heights[hi])
            water += right_max - heights[hi]
            hi -= 1
    return water
```

Comparing `heights[lo]` with `heights[hi]` rather than the running maxima works because the running maximum on the side you process is always at least the current bar, and the far side's maximum is at least the far bar; the branch you take guarantees the near side's bound is the binding one.

Trace `[4, 1, 1, 0, 2, 3]`. `(0, 5)`: `4 ≥ 3`, process right: `right_max = 3`, water `+0`, `hi = 4`. `(0, 4)`: `4 ≥ 2`, right: water `+1`, `hi = 3`. `(0, 3)`: `4 ≥ 0`, right: `+3`, `hi = 2`. `(0, 2)`: `4 ≥ 1`: `+2`, `hi = 1`. `(0, 1)`: `4 ≥ 1`: `+2`, `hi = 0`. Total 8.

Time `O(n)`, space `O(1)`.

### Common mistakes

- Trying to reuse the [Container With Most Water](/practice/container-with-most-water) logic of "one best pair". Here the answer is a sum over every column and depends on the bars in between.
- Computing water as `max(left, right) - height` instead of `min`.
- Forgetting to clamp when using the prefix-maximum version; in the two-pointer version `left_max ≥ heights[lo]` is maintained by the `max` update so no clamp is needed, but say why.
- Not handling `n < 3`, where nothing can be trapped; the loop handles it naturally, but check with an empty array.

### How to discuss it

Present the prefix-maximum solution first and say its space cost. Then explain the one sentence that justifies the two-pointer version: "the side with the lower bar is bounded by its own maximum, because the other side has something at least as tall waiting." Code it and trace a case where the right wall is lower than the left, since that is where sign errors show. For the 2D follow-up: the "walls" become the entire boundary, and water at a cell is bounded by the lowest path to the edge rather than two directional maxima; the standard solution is a min-heap seeded with the border cells, flooding inward from the lowest boundary (Trapping Rain Water II), which is a Dijkstra-shaped algorithm at `O(mn log(mn))`.
