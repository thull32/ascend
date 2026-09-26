---
slug: max-consecutive-ones-iii
title: Max Consecutive Ones with k Flips
difficulty: medium
patterns: [sliding-window]
lists: [ascend-150]
companies: [meta, amazon, google]
order: 7
lesson: interview-patterns/array-patterns/sliding-window
hints:
  - Flipping at most k zeros means the answer is the longest window containing at most k zeros. Do not actually flip anything.
  - Grow the right edge, counting zeros. When the count exceeds k, move the left edge until it does not.
  - The left edge never moves backwards, so the total work is O(n). Compare with the "stale maximum" trick in Longest Repeating Character Replacement.
signatures:
  python:
    name: longest_ones
    starter: |
      def longest_ones(nums: list[int], k: int) -> int:
          pass
  javascript:
    name: longest_ones
    starter: |
      function longest_ones(nums, k) {
      }
tests:
  - args: [[1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0], 2]
    expected: 6
  - args: [[0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1], 3]
    expected: 10
  - args: [[0, 0, 0], 0]
    expected: 0
    label: no flips, no ones
  - args: [[1, 1, 1], 0]
    expected: 3
    label: no flips needed
  - args: [[0, 0, 0], 3]
    expected: 3
    label: flip everything
  - args: [[1], 5]
    expected: 1
    label: k larger than the array
  - args: [[], 1]
    expected: 0
    label: empty input
  - args: [[1, 0, 1, 0, 1], 1]
    expected: 3
    hidden: true
  - args: [[0, 1, 0, 1, 1, 0, 1], 2]
    expected: 6
    hidden: true
time_limit_ms: 4000
---
You are given a binary array `nums` (every element is `0` or `1`) and an integer `k`. You may flip at most `k` zeros to ones. Return the length of the longest run of consecutive ones you can obtain.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0]`, `k = 2` | `6` | Flip the zeros at positions 4 and 5 to get `1 1 1 0 1 1 1 1 1 1 0`; the run from position 4 to 9 has length 6 |
| `nums = [0, 0, 0]`, `k = 3` | `3` | Flip all three |
| `nums = [1, 0, 1, 0, 1]`, `k = 1` | `3` | Flip either zero to join two ones |

### Constraints

- `0 ≤ len(nums) ≤ 10⁵`
- `nums[i]` is `0` or `1`
- `0 ≤ k ≤ len(nums)`

### Follow-up

The interviewer asks: "What if I ask for the longest run with at most k zeros *and* at most m ones flipped the other way?" Then: "How would you answer many queries with different k on the same array?"

## Solution

### The naive approach

For every start index, extend to the right until you have seen `k + 1` zeros: `O(n²)`. Or literally try all `C(zeros, k)` flip sets, which is hopeless.

### The insight

Reframe: "at most `k` flips" means the final run is a window of the original array containing at most `k` zeros. That condition is monotone under shrinking (a sub-window has no more zeros than its parent), so a sliding window applies. Expand the right edge, count zeros, and whenever the count exceeds `k`, advance the left edge past zeros until the count is back to `k`. The window with the most elements you ever hold is the answer.

### The optimal approach

```python
def longest_ones(nums: list[int], k: int) -> int:
    left = 0
    zeros = 0
    best = 0
    for right, x in enumerate(nums):
        if x == 0:
            zeros += 1
        while zeros > k:
            if nums[left] == 0:
                zeros -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
```

Trace `[0, 1, 0, 1, 1, 0, 1]`, `k = 2`. Right edge 0: zeros 1, window 1. Right 1: window 2. Right 2: zeros 2, window 3. Right 3, 4: window 5. Right 5: zeros 3 > 2, shrink: `nums[0]` is 0 → zeros 2, `left = 1`; window `[1..5]` length 5. Right 6: window `[1..6]` length 6. Answer 6.

Time `O(n)`: each edge moves forward at most `n` times. Space `O(1)`.

An equivalent form uses `if` instead of `while` and lets the window slide without ever shrinking below its best size, exactly as in [Longest Repeating Character Replacement](/practice/longest-repeating-replacement). Both are correct; the `while` form is easier to reason about because the window is always valid at the moment you measure it.

### Common mistakes

- Actually flipping elements in the array and then counting runs, which makes it very hard to undo when the window moves.
- Counting *ones* instead of zeros and getting the condition backwards.
- Not handling `k = 0`, which reduces the problem to the longest existing run of ones; the code above handles it because the window shrinks the moment any zero enters.
- Off-by-one in `right - left + 1`.

### How to discuss it

Say the reframing sentence out loud: "longest window with at most `k` zeros". That sentence is the entire solution; the code is a template. Then note the monotonicity that justifies the window. For the two-sided follow-up: two counters, `zeros ≤ k` and `ones ≤ m`, and shrink while either is violated; still a single window because the conjunction of two shrink-monotone conditions is shrink-monotone. For many queries with different `k`: precompute the positions of the zeros; for a given `k`, the best window with at most `k` zeros spans from just after zero `i - 1` to just before zero `i + k`, so each query is a linear scan over the zero positions, `O(zeros)` per query instead of `O(n)`, and with an additional prefix structure you can do better still.
