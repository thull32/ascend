---
slug: sliding-window-maximum
title: Sliding Window Maximum
difficulty: hard
patterns: [sliding-window]
lists: [ascend-150]
companies: [amazon, google, uber, citadel]
order: 6
lesson: interview-patterns/array-patterns/sliding-window
hints:
  - A heap gives O(n log k) but stale entries must be skipped lazily. To get O(n), ask which elements can never again be the maximum.
  - "If a newer element is larger than an older one, the older one is useless forever: it leaves the window first and is smaller. Discard it."
  - Keep a deque of indices whose values are decreasing from front to back. The front is the current maximum; drop it when it falls out of the window.
signatures:
  python:
    name: max_sliding_window
    starter: |
      def max_sliding_window(nums: list[int], k: int) -> list[int]:
          pass
  javascript:
    name: max_sliding_window
    starter: |
      function max_sliding_window(nums, k) {
      }
tests:
  - args: [[1, 3, -1, -3, 5, 3, 6, 7], 3]
    expected: [3, 3, 5, 5, 6, 7]
  - args: [[1], 1]
    expected: [1]
    label: single element
  - args: [[1, -1], 1]
    expected: [1, -1]
    label: window of size one
  - args: [[9, 8, 7, 6, 5], 2]
    expected: [9, 8, 7, 6]
    label: strictly decreasing
  - args: [[1, 2, 3, 4, 5], 5]
    expected: [5]
    label: window is the whole array
  - args: [[-7, -8, 7, 5, 7, 1, 6, 0], 4]
    expected: [7, 7, 7, 7, 7]
  - args: [[4, 4, 4, 4], 2]
    expected: [4, 4, 4]
    hidden: true
    label: equal values
  - args: [[2, 1, 3, 4, 6, 3, 8, 9, 10, 12, 56], 4]
    expected: [4, 6, 6, 8, 9, 10, 12, 56]
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums` and a window size `k`. A window of `k` consecutive elements slides from the left end of the array to the right, one position at a time. Return an array containing the maximum of each window, in order.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [1, 3, -1, -3, 5, 3, 6, 7]`, `k = 3` | `[3, 3, 5, 5, 6, 7]` | Windows: `[1,3,-1]`, `[3,-1,-3]`, `[-1,-3,5]`, … |
| `nums = [9, 8, 7, 6, 5]`, `k = 2` | `[9, 8, 7, 6]` | Each window's maximum is its left element |
| `nums = [1, 2, 3, 4, 5]`, `k = 5` | `[5]` | One window |

### Constraints

- `1 ≤ len(nums) ≤ 10⁵`
- `1 ≤ k ≤ len(nums)`
- `-10⁴ ≤ nums[i] ≤ 10⁴`

### Follow-up

The interviewer asks: "Every element is pushed and popped at most once. Walk me through why, and what that implies about the total cost." Then: "The window is now defined by time, not count: the maximum over the last 5 minutes of a stream of timestamped values. What changes?"

## Solution

### The naive approach

Compute the maximum of each window from scratch: `O(n · k)`. With `n = 10⁵` and `k = 5 × 10⁴` that is billions of comparisons.

### The heap approach

Keep a max-heap of `(value, index)`. For each new window, push the entering element, then pop from the top while the top's index has fallen out of the window (lazy deletion), and read the top. `O(n log n)` in the worst case because stale entries pile up. It is a perfectly good first answer, and knowing lazy deletion is worth something on its own, but it is not the optimal solution.

### The insight

Ask which elements can *never* be a window maximum again. If `nums[j] ≥ nums[i]` for some `j > i`, then `i` is dominated: every future window containing `i` also contains `j` (since `j` leaves later), and `j` is at least as large. So `i` can be thrown away the moment `j` arrives.

Keep the surviving candidates in a deque of indices. Because each new element evicts all smaller ones from the back before joining, the values in the deque are strictly decreasing from front to back. The front is therefore the maximum of the current window, and it only ever needs to be removed when its index slides out of range.

### The optimal approach

```python
def max_sliding_window(nums: list[int], k: int) -> list[int]:
    dq: collections.deque[int] = collections.deque()   # indices, values decreasing
    out: list[int] = []
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:
            dq.pop()                       # dominated by x
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()                   # fell out of the window
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out
```

Trace `[1, 3, -1, -3, 5, 3, 6, 7]`, `k = 3`. `i=0` (1): deque `[0]`. `i=1` (3): 1 is dominated, deque `[1]`. `i=2` (-1): deque `[1, 2]`, window complete, output `3`. `i=3` (-3): deque `[1, 2, 3]`, output `3`. `i=4` (5): everything dominated, deque `[4]`, output `5`. `i=5` (3): `[4, 5]`, output `5`. `i=6` (6): `[6]`, output `6`. `i=7` (7): `[7]`, output `7`.

Time `O(n)`: each index is appended once and popped at most once (from either end), so the inner `while` costs `O(n)` in total across all iterations. Space `O(k)` for the deque.

The `<=` in the eviction is a choice: with `<`, equal values are kept, which is also correct and produces the same output, but the deque can grow larger on runs of equal values. `<=` keeps only the most recent of a tie, which is the one that survives longest.

### Common mistakes

- Storing values instead of indices in the deque, and then being unable to tell when the front has expired.
- Popping the front with `dq[0] == i - k` instead of `<=`; equality is sufficient in practice because the front is checked every step, but `<=` is the robust form and costs nothing.
- Emitting output before the first full window (`i < k - 1`).
- Using a plain list as the deque and calling `pop(0)`, which is `O(k)` and silently reintroduces the `O(nk)` cost.

### How to discuss it

Give the naive cost, mention the heap with lazy deletion and its logarithm, then state the domination argument: "an older, smaller element can never be the maximum again". Write the deque version and give the amortised argument without being asked. For the time-based follow-up: nothing structural changes; the front is evicted by timestamp instead of index (`while front.time < now - 5min`), and the domination rule is identical. Then mention the honest production caveat: a monotonic deque over an unbounded stream is exact and `O(1)` amortised, but its memory is bounded only by the number of non-dominated elements in the window, which is fine for maxima but does not generalise to, say, percentiles, where you need a sketch or a bucketed structure instead.
