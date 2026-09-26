---
slug: sqrt-x
title: Integer Square Root
difficulty: easy
patterns: [binary-search]
lists: [ascend-150]
companies: [amazon, apple, bloomberg, microsoft]
order: 9
lesson: interview-patterns/array-patterns/binary-search
hints:
  - The answer is the largest integer `r` with `r * r <= x`. The predicate `r * r <= x` is true for small `r` and false beyond the answer, so it is binary-searchable.
  - Search `r` in `[0, x]` (or a tighter upper bound). On `mid * mid <= x` remember `mid` as a candidate and move right; otherwise move left.
  - Compare `mid * mid <= x`, never `mid <= x / mid` with floating point; and in fixed-width languages watch for `mid * mid` overflowing.
signatures:
  python:
    name: my_sqrt
    starter: |
      def my_sqrt(x: int) -> int:
          pass
  javascript:
    name: my_sqrt
    starter: |
      function my_sqrt(x) {
      }
tests:
  - args: [4]
    expected: 2
  - args: [8]
    expected: 2
    label: rounds down
  - args: [0]
    expected: 0
  - args: [1]
    expected: 1
  - args: [2]
    expected: 1
  - args: [15]
    expected: 3
  - args: [16]
    expected: 4
    hidden: true
    label: perfect square
  - args: [2147395599]
    expected: 46339
    hidden: true
    label: just below a perfect square near the 32-bit limit
  - args: [99]
    expected: 9
    hidden: true
  - args: [1000000]
    expected: 1000
time_limit_ms: 4000
---
Given a non-negative integer `x`, return the integer part of its square root: the largest integer `r` such that `r × r ≤ x`. Do not use a built-in square root or exponent function.

### Examples

| Input | Output | Why |
|---|---|---|
| `4` | `2` | `2 × 2 = 4` |
| `8` | `2` | `2 × 2 = 4 ≤ 8 < 9 = 3 × 3` |
| `2147395599` | `46339` | `46340² = 2147395600` is one too many |

### Constraints

- `0 ≤ x ≤ 2³¹ - 1`

### Follow-up

The interviewer asks: "Give me the answer to 6 decimal places instead." Then: "Do you know a method that converges faster than halving, and when would you use it?"

## Solution

### The naive approach

Count up: `r = 0, 1, 2, …` while `(r + 1)² ≤ x`. `O(√x)`, which for `x ≈ 2 × 10⁹` is about 46,000 steps. Fast enough on a laptop, and the interviewer will still want the logarithmic version, because the point of the question is whether you see the monotone predicate.

### The insight

`r² ≤ x` is true for `r = 0, 1, …, answer` and false for every larger `r`. That is a monotone predicate over the integers, so the *last true* can be found by binary search. This is the same template as [Koko Eating Bananas](/practice/koko-eating-bananas) with the direction flipped: you want the rightmost `true` rather than the leftmost.

### The optimal approach

```python
def my_sqrt(x: int) -> int:
    lo, hi = 0, x
    answer = 0
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if mid * mid <= x:
            answer = mid      # mid works; look for something larger
            lo = mid + 1
        else:
            hi = mid - 1
    return answer
```

Time `O(log x)`, about 31 iterations at the top of the range. Space `O(1)`.

The "remember the candidate" style is the easiest way to get the last-true variant right: the loop is the standard inclusive one, and the answer is whatever the last successful probe was. The alternative is the `while lo < hi` template with `mid` rounded *up*, `mid = lo + (hi - lo + 1) // 2`, `lo = mid` on success and `hi = mid - 1` on failure; it is equivalent, and it is the version people get wrong by rounding down and looping forever on `lo = hi - 1`.

You can tighten the upper bound to `hi = x // 2 + 1` (since `√x ≤ x/2` for `x ≥ 4`) or `hi = min(x, 46341)` for 32-bit inputs; it saves one or two iterations and is not worth the extra reasoning in an interview.

Trace `x = 8`: `lo = 0, hi = 8`. `mid = 4 → 16 > 8`, `hi = 3`. `mid = 1 → 1 ≤ 8`, `answer = 1, lo = 2`. `mid = 2 → 4 ≤ 8`, `answer = 2, lo = 3`. `mid = 3 → 9 > 8`, `hi = 2`. Done: `2`.

### Common mistakes

- `mid * mid` overflowing a 32-bit integer in Java, C or Go when `mid > 46340`; use a 64-bit intermediate or compare `mid <= x // mid`. Python does not overflow, and saying that out loud is expected.
- `x = 0` or `x = 1` mishandled by a solution that starts `lo = 1` and never probes `0`, or that returns `lo` after the loop instead of the recorded candidate.
- Using `mid <= x / mid` with floating-point division; it can be off by one near perfect squares.

### How to discuss it

Say "largest `r` with `r² ≤ x`, monotone, binary search for the last true", write the candidate-tracking loop, and mention overflow. For decimal places, binary search on a float range with a tolerance, or note that you want the integer square root of `x × 10¹²` and reuse the same code, which is more precise. For the faster method: Newton's iteration `r ← (r + x / r) / 2` converges quadratically (doubling the correct digits each step) from any starting guess above the root; it is what hardware and libm actually use, with a handful of iterations after a good initial estimate. Binary search is what you write when you need a *guaranteed* integer answer with no floating-point subtleties, and Newton is what you write when you need speed and are comfortable proving the iteration stays on the right side of the answer. See [Binary Search](/practice/binary-search-basic) for the base template.
