---
slug: largest-rectangle-histogram
title: Largest Rectangle in a Histogram
difficulty: hard
patterns: [stack]
lists: [ascend-150]
companies: [google, amazon, meta, microsoft]
order: 7
lesson: interview-patterns/sequence-patterns/stack-patterns
hints:
  - Every maximal rectangle has some bar as its height. For bar `i`, the widest rectangle of height `heights[i]` spans from the nearest shorter bar on the left to the nearest shorter bar on the right.
  - Finding "nearest shorter on each side" for all bars in O(n) is a monotonic stack. Keep indices with increasing heights; when a shorter bar arrives, the popped bars have just found their right boundary, and the new stack top is their left boundary.
  - Append a sentinel bar of height 0 so that every remaining bar is popped and resolved at the end.
signatures:
  python:
    name: largest_rectangle
    starter: |
      def largest_rectangle(heights: list[int]) -> int:
          pass
  javascript:
    name: largest_rectangle
    starter: |
      function largest_rectangle(heights) {
      }
tests:
  - args: [[2, 1, 5, 6, 2, 3]]
    expected: 10
  - args: [[2, 4]]
    expected: 4
  - args: [[1]]
    expected: 1
    label: single bar
  - args: [[]]
    expected: 0
    label: empty
  - args: [[3, 3, 3]]
    expected: 9
    label: equal heights span the full width
  - args: [[5, 4, 3, 2, 1]]
    expected: 9
    hidden: true
    label: decreasing
  - args: [[1, 2, 3, 4, 5]]
    expected: 9
    hidden: true
    label: increasing, resolved by the sentinel
  - args: [[0, 0]]
    expected: 0
    label: zero-height bars
  - args: [[2, 1, 2]]
    expected: 3
  - args: [[6, 2, 5, 4, 5, 1, 6]]
    expected: 12
    hidden: true
time_limit_ms: 4000
---
You are given a histogram as a list `heights`, where bar `i` has height `heights[i]` and width 1, and the bars sit side by side starting at `x = 0`. Return the area of the largest axis-aligned rectangle that fits entirely inside the histogram.

### Examples

| Input | Output | Why |
|---|---|---|
| `[2, 1, 5, 6, 2, 3]` | `10` | Height 5 across bars 2 and 3 (`5 × 2`); the width-6 rectangle is only height 1 |
| `[3, 3, 3]` | `9` | Height 3 across all three bars |
| `[6, 2, 5, 4, 5, 1, 6]` | `12` | Height 4 across bars 2, 3 and 4 |

### Constraints

- `0 ≤ len(heights) ≤ 10⁵`
- `0 ≤ heights[i] ≤ 10⁴`

### Follow-up

The interviewer asks: "Now the input is a binary matrix and I want the largest rectangle of 1s. Can you reuse this?" Then: "Can you do it without the stack, using two precomputed arrays, and what does that cost?"

## Solution

### The naive approach

Every rectangle is determined by a pair of bars `(l, r)` and has height `min(heights[l..r])`. Enumerate all pairs and track the running minimum as `r` extends: `O(n²)`. For `n = 10⁵` it is 5 × 10⁹ steps. Say it, then abandon it.

### The insight

Change what you enumerate. Instead of rectangles, enumerate *heights*: the best rectangle of height exactly `heights[i]` that uses bar `i` extends left until it hits a bar strictly shorter than `heights[i]` and right until it hits another. Call those boundaries `L[i]` and `R[i]`; the area is `heights[i] × (R[i] - L[i] - 1)`. The largest rectangle overall has *some* bar as its limiting height, so the maximum over `i` is the answer.

"Nearest strictly shorter bar on each side" is the monotonic-stack problem from [Daily Temperatures](/practice/daily-temperatures), and a single pass can compute both sides at once. Keep a stack of indices whose heights are increasing bottom to top. When bar `i` is shorter than the top, the top has just found its right boundary (`i`) and, because the stack is increasing, the element beneath it is its left boundary. Pop it, compute its area, and keep popping while the top is taller than `i`.

### The optimal approach

```python
def largest_rectangle(heights: list[int]) -> int:
    best = 0
    stack: list[int] = []  # indices, heights strictly increasing bottom to top
    extended = heights + [0]  # sentinel forces every bar to be resolved
    for i, h in enumerate(extended):
        while stack and extended[stack[-1]] > h:
            top = stack.pop()
            height = extended[top]
            left = stack[-1] if stack else -1
            width = i - left - 1
            best = max(best, height * width)
        stack.append(i)
    return best
```

Time `O(n)`: each index is pushed once and popped once. Space `O(n)`.

Why `> h` and not `>= h`? With equal heights, `[3, 3, 3]`, the first `3` is not popped when the second arrives, so its width would be computed too narrow *if* it were popped now. Leaving it on the stack means it is popped by the sentinel with `left = -1` and width 3, giving the correct 9. The middle `3` gets a width that is too small, but that does not matter because some bar in every run of equal heights gets the full width.

Trace `[2, 1, 5, 6, 2, 3]`:

| i | h | pops (height × width) | stack after |
|---|---|---|---|
| 0 | 2 | | `[0]` |
| 1 | 1 | `2 × 1 = 2` | `[1]` |
| 2 | 5 | | `[1, 2]` |
| 3 | 6 | | `[1, 2, 3]` |
| 4 | 2 | `6 × 1 = 6`, `5 × 2 = 10` | `[1, 4]` |
| 5 | 3 | | `[1, 4, 5]` |
| 6 | 0 (sentinel) | `3 × 1 = 3`, `2 × 4 = 8`, `1 × 6 = 6` | `[6]` |

Maximum 10.

### Common mistakes

- Computing `width = i - top` instead of `i - stack[-1] - 1`. The rectangle for a popped bar extends *past* other popped bars to the left, all the way to the new stack top.
- Forgetting the sentinel and then writing a second loop to drain the stack. The second loop works but doubles the chance of an off-by-one.
- Starting with `best = heights[0]` and crashing on the empty input.

### How to discuss it

Say "for each bar, the best rectangle with that bar as the shortest one; nearest shorter on each side via a monotonic stack" before touching code, then state the amortised `O(n)` argument. For the binary-matrix follow-up (Maximal Rectangle): treat each row as the base of a histogram where a cell's height is the number of consecutive 1s above it including itself, run this function per row, take the max; `O(rows × cols)`. For the two-array variant, compute `L[]` and `R[]` in two separate monotonic-stack passes and combine; same complexity, more memory, easier to explain, and it shows you understand that the single-pass version is the two-pass version with the passes interleaved.
