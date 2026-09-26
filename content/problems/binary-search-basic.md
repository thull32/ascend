---
slug: binary-search-basic
title: Binary Search
difficulty: easy
patterns: [binary-search]
lists: [ascend-150]
companies: [amazon, google, microsoft, apple]
order: 1
lesson: interview-patterns/array-patterns/binary-search
hints:
  - The array is sorted, so one comparison against the middle element tells you which half can contain the target and which half cannot.
  - Keep an inclusive range `[lo, hi]`. Stop when `lo > hi`. After comparing `nums[mid]` to `target`, move `lo` to `mid + 1` or `hi` to `mid - 1`; never leave `mid` inside the range or you can loop forever.
  - Handle the empty array by letting the loop condition fail immediately, not with a special case.
signatures:
  python:
    name: binary_search
    starter: |
      def binary_search(nums: list[int], target: int) -> int:
          pass
  javascript:
    name: binary_search
    starter: |
      function binary_search(nums, target) {
      }
tests:
  - args: [[-1, 0, 3, 5, 9, 12], 9]
    expected: 4
  - args: [[-1, 0, 3, 5, 9, 12], 2]
    expected: -1
    label: absent, falls between elements
  - args: [[5], 5]
    expected: 0
    label: single element present
  - args: [[5], -5]
    expected: -1
    label: single element absent
  - args: [[], 3]
    expected: -1
    label: empty
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 1]
    expected: 0
    hidden: true
    label: first element
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10]
    expected: 9
    hidden: true
    label: last element
  - args: [[2, 4, 6, 8], 7]
    expected: -1
    hidden: true
  - args: [[1, 3], 3]
    expected: 1
    label: two elements
time_limit_ms: 4000
---
You are given an array `nums` of distinct integers sorted in ascending order and a `target`. Return the index of `target` in `nums`, or `-1` if it is not present. Your solution must run in `O(log n)` time.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [-1, 0, 3, 5, 9, 12]`, `target = 9` | `4` | `nums[4] == 9` |
| `nums = [-1, 0, 3, 5, 9, 12]`, `target = 2` | `-1` | `2` would sit between `0` and `3` but is not there |
| `nums = []`, `target = 3` | `-1` | Nothing to search |

### Constraints

- `0 ≤ len(nums) ≤ 10⁵`
- `-10⁹ ≤ nums[i], target ≤ 10⁹`
- All values in `nums` are distinct

### Follow-up

The interviewer asks: "Now there are duplicates. Return the index of the *first* occurrence." Then: "Return the position where `target` would be inserted to keep the array sorted, and tell me how it relates to the previous question."

## Solution

### The naive approach

Scan left to right. `O(n)`. It ignores the one piece of information the problem gives you, which is that the array is sorted.

### The insight

Compare `target` to the middle element. If they match, you are done. If `target` is smaller, every element from the middle rightwards is also larger than `target` (sorted), so the answer can only be in the left half. Symmetrically for larger. Each comparison discards half the remaining candidates, so after `⌈log₂(n + 1)⌉` comparisons at most one candidate remains.

### The optimal approach

The version to memorise cold is the inclusive-range one, because its invariant is easiest to state: *if `target` is in the array, it is at an index in `[lo, hi]`*.

```python
def binary_search(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
```

Time `O(log n)`, space `O(1)`. On the empty array `hi = -1`, the loop never runs, and `-1` is returned with no special case.

Three details that interviewers watch for:

- `lo + (hi - lo) // 2` rather than `(lo + hi) // 2`. In Python it makes no difference (integers do not overflow); in Java, C and Go, `lo + hi` overflows at around 2³⁰ elements, and this bug shipped in the JDK for years. Say why you write it that way.
- `lo = mid + 1`, not `lo = mid`. Because `mid` has already been examined, leaving it in the range is wasted work at best and an infinite loop at worst (when `lo == hi == mid`).
- `while lo <= hi` with an inclusive `hi`. If you prefer a half-open `[lo, hi)` range, then `hi = len(nums)`, the condition is `lo < hi`, and the shrink step is `hi = mid`. Both are correct; mixing them is the classic bug.

### Common mistakes

- `hi = mid` in the inclusive version, or `hi = mid - 1` in the half-open version. Each is an off-by-one that loses the target when it is at the boundary.
- Returning `mid` from the wrong branch, or returning `lo` after the loop (that is the *insertion point*, not a match).
- Testing only on inputs where the target is present and in the middle. Test the first index, the last index, absent, and empty.

### How to discuss it

State the invariant, then write the loop, then trace `[-1, 0, 3, 5, 9, 12]` with target `2` to show it terminating with `lo = 2, hi = 1`. For the first-occurrence follow-up, stop returning on equality: treat `nums[mid] >= target` as "the answer is at `mid` or to the left", set `hi = mid - 1`, and remember `mid` as a candidate. For the insertion point, the same loop without the candidate: the answer is `lo` when the loop exits. Both are instances of *find the first index where a predicate becomes true*, which is the form that generalises to [Koko Eating Bananas](/practice/koko-eating-bananas) and [First Bad Version](/practice/first-bad-version). Knowing that the equality-return version is the *special case* is the senior framing.
