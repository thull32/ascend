---
slug: container-with-most-water
title: Container With Most Water
difficulty: medium
patterns: [two-pointers]
lists: [core-75, ascend-150]
companies: [amazon, google, meta, bloomberg]
order: 4
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - The area between two lines is width × the shorter height. Start with the widest possible container.
  - Moving either pointer inward shrinks the width. Only moving the shorter line has any chance of increasing the height, so that is the only move worth making.
  - "Argue why the taller line can be left where it is: every container using the shorter line and a narrower width is smaller than the one you just measured."
signatures:
  python:
    name: max_area
    starter: |
      def max_area(heights: list[int]) -> int:
          pass
  javascript:
    name: max_area
    starter: |
      function max_area(heights) {
      }
tests:
  - args: [[1, 8, 6, 2, 5, 4, 8, 3, 7]]
    expected: 49
  - args: [[1, 1]]
    expected: 1
    label: two lines
  - args: [[4, 3, 2, 1, 4]]
    expected: 16
  - args: [[1, 2, 1]]
    expected: 2
  - args: [[5, 5, 5, 5, 5]]
    expected: 20
  - args: [[0, 0]]
    expected: 0
    hidden: true
    label: zero heights
  - args: [[2, 3, 4, 5, 18, 17, 6]]
    expected: 17
    hidden: true
    label: tall neighbours beat wide spans
  - args: [[10, 1, 1, 1, 1, 1, 10]]
    expected: 60
    hidden: true
time_limit_ms: 4000
---
You are given an array `heights` where `heights[i]` is the height of a vertical line drawn at `x = i`. Choose two lines; together with the x-axis they form a container. Return the largest amount of water any such container can hold.

The container's capacity is the horizontal distance between the two lines multiplied by the height of the shorter one. Water does not spill over the shorter line; lines in between do not matter.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 8, 6, 2, 5, 4, 8, 3, 7]` | `49` | Lines at `x = 1` (height 8) and `x = 8` (height 7): `7 × 7` |
| `[4, 3, 2, 1, 4]` | `16` | The two ends: `4 × 4` |
| `[2, 3, 4, 5, 18, 17, 6]` | `17` | `x = 4` and `x = 5`: `1 × 17`; wider containers are capped by shorter lines |

### Constraints

- `2 ≤ len(heights) ≤ 10⁵`
- `0 ≤ heights[i] ≤ 10⁴`

### Follow-up

The interviewer asks: "Your algorithm skips most pairs. Prove it never skips the best one." Then: "How is this different from Trapping Rain Water, and why is that one harder?"

## Solution

### The naive approach

Try every pair `(i, j)` and take the maximum of `(j - i) · min(h[i], h[j])`: `O(n²)`. For `n = 10⁵` that is 5 billion pairs.

### The insight

Start with the widest container, `lo = 0` and `hi = n - 1`. Any other container is narrower. So for a narrower container to beat the current one, it must be taller, and its height is bounded by its shorter line. Now look at the shorter of the two current lines, say `h[lo] ≤ h[hi]`. Every container that keeps `lo` and moves `hi` inward is narrower and still capped at `h[lo]` or less, so it cannot beat the one you just measured. That means `lo` is finished: you can discard it and move on. Each step discards one line permanently, so the walk is `O(n)`.

### The optimal approach

```python
def max_area(heights: list[int]) -> int:
    lo, hi = 0, len(heights) - 1
    best = 0
    while lo < hi:
        h = min(heights[lo], heights[hi])
        best = max(best, (hi - lo) * h)
        if heights[lo] <= heights[hi]:
            lo += 1
        else:
            hi -= 1
    return best
```

Trace `[1, 8, 6, 2, 5, 4, 8, 3, 7]`. `(0, 8)`: `8 · 1 = 8`, left is shorter → `lo = 1`. `(1, 8)`: `7 · 7 = 49`, right is shorter → `hi = 7`. `(1, 7)`: `6 · 3 = 18` → `hi = 6`. `(1, 6)`: `5 · 8 = 40`, tie, move `lo` → `lo = 2`. `(2, 6)`: `4 · 6 = 24` → `lo = 3` … nothing beats 49.

Time `O(n)`, space `O(1)`.

### The proof

Claim: when the shorter line is discarded, no unexamined container that uses it can beat the current best. Let `h[lo] ≤ h[hi]`. Any container `(lo, j)` with `lo < j < hi` has width `j - lo < hi - lo` and height `min(h[lo], h[j]) ≤ h[lo]`, so its area is strictly less than `(hi - lo) · h[lo]`, which has already been recorded. Therefore every container involving `lo` that has not been examined is dominated, and `lo` can go. The symmetric argument covers `hi`. Since the optimal pair is never discarded before being measured, the algorithm measures it.

Ties (`h[lo] == h[hi]`): moving either pointer is safe by the same argument, since the bound applies to both.

### Common mistakes

- Moving the *taller* pointer, or moving whichever pointer "looks promising" based on its neighbour. The argument only works for the shorter line.
- Computing the area with `max` instead of `min` of the heights.
- Confusing this with [Trapping Rain Water](/practice/trapping-rain-water), where the lines in between do matter.

### How to discuss it

Give the `O(n²)` in one sentence. Say "start widest, and the shorter line can never do better, so discard it", write the loop, and then give the domination argument in two sentences before the interviewer asks. On the Trapping Rain Water contrast: here the answer is a single pair, and water between the lines is irrelevant; there, every column holds water bounded by the tallest line on each side, so the answer is a sum over columns and the two-pointer walk has to track running maxima rather than one best pair.
