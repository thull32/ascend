---
slug: sort-colors
title: Sort Colors
difficulty: medium
patterns: [two-pointers]
lists: [ascend-150]
companies: [microsoft, meta, amazon]
order: 8
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - Counting the 0s, 1s and 2s and rewriting the array is two passes and trivially correct. The interviewer wants one pass.
  - "Keep three regions: 0s at the front, 2s at the back, and an unexamined middle. Three indices mark the boundaries."
  - When you swap a 2 to the back, the element you receive is unexamined, so do not advance the middle pointer. When you swap a 0 to the front, the element you receive has already been examined and is a 1.
signatures:
  python:
    name: sort_colors
    starter: |
      def sort_colors(nums: list[int]) -> list[int]:
          # Sort in place and return nums.
          pass
  javascript:
    name: sort_colors
    starter: |
      function sort_colors(nums) {
        // Sort in place and return nums.
      }
tests:
  - args: [[2, 0, 2, 1, 1, 0]]
    expected: [0, 0, 1, 1, 2, 2]
  - args: [[2, 0, 1]]
    expected: [0, 1, 2]
  - args: [[0]]
    expected: [0]
    label: single element
  - args: [[]]
    expected: []
    label: empty input
  - args: [[1, 1, 1]]
    expected: [1, 1, 1]
    label: only the middle colour
  - args: [[0, 1, 2]]
    expected: [0, 1, 2]
    label: already sorted
  - args: [[2, 2, 0, 0]]
    expected: [0, 0, 2, 2]
    hidden: true
    label: no 1s
  - args: [[1, 2, 0, 1, 2, 0, 1]]
    expected: [0, 0, 1, 1, 1, 2, 2]
    hidden: true
time_limit_ms: 4000
---
You are given an array `nums` whose elements are only `0`, `1` and `2`, representing three colours. Sort the array in place so that all `0`s come first, then all `1`s, then all `2`s, in a single pass and without using the library sort.

Return `nums` after sorting it, so the tests can check the result.

### Examples

| Input | Output |
|---|---|
| `[2, 0, 2, 1, 1, 0]` | `[0, 0, 1, 1, 2, 2]` |
| `[2, 2, 0, 0]` | `[0, 0, 2, 2]` |
| `[1, 1, 1]` | `[1, 1, 1]` |

### Constraints

- `0 ≤ len(nums) ≤ 300`
- `nums[i]` is `0`, `1` or `2`.

### Follow-up

The interviewer asks: "Why does one pointer sometimes not advance after a swap? Show me the invariant." Then: "Four colours. Does the approach extend, and what is the general version called?"

## Solution

### The naive approach

Count how many of each value there are, then overwrite the array with that many 0s, 1s and 2s. Two passes, `O(n)` time, `O(1)` space. This is counting sort with three buckets and it is entirely acceptable; the problem's "single pass" restriction exists to make you produce the three-way partition.

### The insight

Maintain three regions with three indices:

- `nums[0 : lo]` is all 0s (finished).
- `nums[lo : mid]` is all 1s (finished).
- `nums[mid : hi + 1]` is unexamined.
- `nums[hi + 1 :]` is all 2s (finished).

Look at `nums[mid]`. If it is 0, swap it to `lo` and advance both `lo` and `mid`: the element that came back from `lo` was in the 1s region, so it is a 1 and needs no further examination. If it is 1, it is already where it belongs, advance `mid`. If it is 2, swap it to `hi` and retreat `hi` only: the element that came back is unexamined, so `mid` must look at it next. Each iteration either advances `mid` or retreats `hi`, so the unexamined region shrinks by one every step, and the loop ends after at most `n` iterations.

This is the Dutch national flag partition, the same three-way split that a good quicksort uses to handle equal keys.

### The optimal approach

```python
def sort_colors(nums: list[int]) -> list[int]:
    lo, mid, hi = 0, 0, len(nums) - 1
    while mid <= hi:
        if nums[mid] == 0:
            nums[lo], nums[mid] = nums[mid], nums[lo]
            lo += 1
            mid += 1
        elif nums[mid] == 1:
            mid += 1
        else:
            nums[mid], nums[hi] = nums[hi], nums[mid]
            hi -= 1
    return nums
```

Trace `[2, 0, 2, 1, 1, 0]`. `mid = 0` sees 2: swap with index 5 → `[0, 0, 2, 1, 1, 2]`, `hi = 4`. `mid = 0` sees 0: swap with `lo = 0` (itself), `lo = 1`, `mid = 1`. `mid = 1` sees 0: swap with itself, `lo = 2`, `mid = 2`. `mid = 2` sees 2: swap with index 4 → `[0, 0, 1, 1, 2, 2]`, `hi = 3`. `mid = 2` sees 1, `mid = 3`. `mid = 3` sees 1, `mid = 4`. `mid > hi`, done.

Time `O(n)`, one pass, at most `n` swaps. Space `O(1)`.

### Common mistakes

- Advancing `mid` after swapping a 2 to the back. The incoming element is unexamined and may itself be a 2 or a 0; `[2, 0, 1]` becomes wrong.
- Using `mid < hi` as the loop condition. The element at `hi` is unexamined until `mid` passes it; with `<` the input `[1, 0]` stops after the first step and returns `[1, 0]` unchanged.
- Not advancing `lo` and `mid` together on a 0, which lets the 1s region contain a 0.
- Relying on `nums[lo]` being 1 without stating why (everything between `lo` and `mid` has been examined and found to be 1). Say the invariant out loud.

### How to discuss it

Offer counting sort in one sentence. Then describe the four regions and their boundaries before writing code; a candidate who names the invariant first almost never gets the `mid`-does-not-advance case wrong. Code it and trace an input beginning with 2. For the four-colours follow-up: three-way partition does not extend cleanly to four in one pass with fixed pointers; you would run the partition twice (split `{0, 1}` from `{2, 3}`, then each half), or fall back to counting sort, which is the general answer for any small fixed alphabet. The name to know is three-way partitioning, and the place it matters in production is quicksort on inputs with many duplicate keys, where a two-way partition degrades to `O(n²)` and a three-way one stays `O(n log n)`.
