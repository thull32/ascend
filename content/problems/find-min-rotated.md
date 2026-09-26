---
slug: find-min-rotated
title: Find Minimum in Rotated Sorted Array
difficulty: medium
patterns: [binary-search]
lists: [core-75, ascend-150]
companies: [amazon, meta, microsoft, google]
order: 4
lesson: interview-patterns/array-patterns/binary-search
hints:
  - A rotated sorted array is two sorted runs, and the minimum is the first element of the second run. Which half of any window contains the "drop"?
  - Compare `nums[mid]` with `nums[hi]`. If `nums[mid] > nums[hi]`, the drop is to the right of `mid`. Otherwise `mid` itself might be the minimum, so keep it in the range.
  - Comparing with `nums[lo]` instead does not work when the window is not rotated at all. Test `[1, 2, 3]`.
signatures:
  python:
    name: find_min
    starter: |
      def find_min(nums: list[int]) -> int:
          pass
  javascript:
    name: find_min
    starter: |
      function find_min(nums) {
      }
tests:
  - args: [[3, 4, 5, 1, 2]]
    expected: 1
  - args: [[4, 5, 6, 7, 0, 1, 2]]
    expected: 0
  - args: [[11, 13, 15, 17]]
    expected: 11
    label: not rotated
  - args: [[1]]
    expected: 1
    label: single element
  - args: [[2, 1]]
    expected: 1
    label: two elements rotated
  - args: [[5, 1, 2, 3, 4]]
    expected: 1
    hidden: true
    label: rotated by one
  - args: [[2, 3, 4, 5, 1]]
    expected: 1
    hidden: true
    label: minimum at the end
  - args: [[-3, -2, -9, -7]]
    expected: -9
    hidden: true
    label: negatives
time_limit_ms: 4000
---
An array of distinct integers was sorted in ascending order and then rotated: some prefix was moved to the end. For example `[1, 2, 3, 4, 5]` rotated by 3 becomes `[4, 5, 1, 2, 3]`. A rotation by 0 leaves the array unchanged. Given the rotated array `nums`, return its minimum element in `O(log n)` time.

### Examples

| Input | Output | Why |
|---|---|---|
| `[3, 4, 5, 1, 2]` | `1` | Original `[1, 2, 3, 4, 5]` rotated by 2 |
| `[11, 13, 15, 17]` | `11` | Not rotated; the minimum is at the front |
| `[2, 1]` | `1` | The smallest possible rotated case |

### Constraints

- `1 ≤ len(nums) ≤ 5000`
- `-5000 ≤ nums[i] ≤ 5000`
- All elements are distinct

### Follow-up

The interviewer asks: "Now duplicates are allowed. Does your algorithm still work, and what is the worst-case complexity?" Then: "Return the rotation count instead of the minimum."

## Solution

### The naive approach

`min(nums)`, `O(n)`. It is correct and it ignores the structure. The interviewer asked for `O(log n)`.

### The insight

The array consists of two ascending runs, and the minimum is where the second run starts (or index 0 if there is only one run). Every element of the first run is greater than every element of the second run. So a single comparison against a *fixed* endpoint tells you which side of `mid` the boundary is on:

- If `nums[mid] > nums[hi]`, then `mid` is in the first run and the minimum is strictly to its right.
- Otherwise `nums[mid] < nums[hi]` (distinct values), so `mid` is in the second run, or the window is not rotated; either way the minimum is at `mid` or to its left.

Comparing with `hi` rather than `lo` matters. In an unrotated window `nums[mid] > nums[lo]` is true but tells you nothing about where the minimum is.

### The optimal approach

```python
def find_min(nums: list[int]) -> int:
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] > nums[hi]:
            lo = mid + 1   # minimum is right of mid
        else:
            hi = mid       # mid could be the minimum
    return nums[lo]
```

Time `O(log n)`, space `O(1)`.

This is the "first true" template: the predicate is `nums[i] <= nums[hi]`, which is `false` for the first run and `true` for the second, and the answer is the first `true`. `hi = mid` keeps a possible answer in the window; `lo = mid + 1` discards a known non-answer. The loop ends with `lo == hi` pointing at the minimum.

Trace `[4, 5, 6, 7, 0, 1, 2]`: `lo = 0, hi = 6`. `mid = 3 → 7 > 2`, `lo = 4`. `mid = 5 → 1 ≤ 2`, `hi = 5`. `mid = 4 → 0 ≤ 1`, `hi = 4`. Done: `nums[4] = 0`.

### Common mistakes

- Comparing with `nums[lo]` and breaking on the unrotated case.
- Using `while lo <= hi` with `hi = mid`, which loops forever when `lo == hi`.
- Using `hi = mid - 1`, which skips the minimum when `mid` is it. Test `[2, 1]`.
- Returning `mid` from inside the loop on some equality; there is no equality to detect here.

### How to discuss it

Explain the two-run picture and say "compare with the right endpoint, because that is the comparison that is informative whether or not the window is rotated." With duplicates, the `nums[mid] == nums[hi]` case is genuinely ambiguous (`[1, 1, 0, 1]` versus `[1, 0, 1, 1]`), and the only safe move is `hi -= 1`; that keeps correctness but degrades the worst case to `O(n)` on an all-equal array, and a senior answer says the degradation is unavoidable, not a flaw in the algorithm, because an adversary can hide the single `0` anywhere in a sea of `1`s. The rotation count is simply the index `lo` at the end, which is also the pivot you need for [Search in Rotated Sorted Array](/practice/search-rotated).
