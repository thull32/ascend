---
slug: search-rotated
title: Search in Rotated Sorted Array
difficulty: medium
patterns: [binary-search]
lists: [core-75, ascend-150]
companies: [amazon, meta, microsoft, google, linkedin]
order: 5
lesson: interview-patterns/array-patterns/binary-search
hints:
  - Whichever way you split a rotated sorted array at `mid`, at least one of the two halves is a plain sorted run. Work out which one with a single comparison of `nums[lo]` and `nums[mid]`.
  - Once you know which half is sorted, you can check with two comparisons whether `target` lies inside that half's value range. If it does, search there; if not, it must be in the other half.
  - Handle the equality `nums[mid] == target` first, and remember that with `lo == mid` the left "half" is a single element, which is trivially sorted.
signatures:
  python:
    name: search
    starter: |
      def search(nums: list[int], target: int) -> int:
          pass
  javascript:
    name: search
    starter: |
      function search(nums, target) {
      }
tests:
  - args: [[4, 5, 6, 7, 0, 1, 2], 0]
    expected: 4
  - args: [[4, 5, 6, 7, 0, 1, 2], 3]
    expected: -1
    label: absent
  - args: [[1], 0]
    expected: -1
    label: single element absent
  - args: [[1], 1]
    expected: 0
    label: single element present
  - args: [[1, 3], 3]
    expected: 1
    label: two elements, not rotated
  - args: [[3, 1], 1]
    expected: 1
    hidden: true
    label: two elements, rotated
  - args: [[5, 6, 7, 1, 2, 3, 4], 6]
    expected: 1
    hidden: true
    label: target in the left run
  - args: [[5, 6, 7, 1, 2, 3, 4], 4]
    expected: 6
    hidden: true
    label: target is the last element
  - args: [[2, 3, 4, 5, 6, 7, 1], 1]
    expected: 6
    label: rotated by one, minimum at the end
  - args: [[], 5]
    expected: -1
    label: empty
time_limit_ms: 4000
---
An array of distinct integers was sorted in ascending order and then rotated at some unknown pivot, so that `[1, 2, 3, 4, 5, 6, 7]` might have become `[5, 6, 7, 1, 2, 3, 4]`. Given the rotated array `nums` and a `target`, return the index of `target`, or `-1` if it is not present. Your solution must run in `O(log n)`.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums = [4, 5, 6, 7, 0, 1, 2]`, `target = 0` | `4` | `0` is the first element of the second run |
| `nums = [4, 5, 6, 7, 0, 1, 2]`, `target = 3` | `-1` | `3` would sit between `2` and `4`, across the rotation seam |
| `nums = [3, 1]`, `target = 1` | `1` | Two elements, rotated by one |

### Constraints

- `0 ≤ len(nums) ≤ 5000`
- `-10⁴ ≤ nums[i], target ≤ 10⁴`
- All elements are distinct

### Follow-up

The interviewer asks: "Do it as two binary searches, one to find the pivot and one to search the correct run. Which version would you rather maintain?" Then: "Now the array may contain duplicates. Where does your reasoning break?"

## Solution

### The naive approach

Linear scan, `O(n)`. Correct, and not what was asked.

### The insight

Plain binary search fails because "target is less than `nums[mid]`" no longer means "target is to the left": the seam might be there. But a rotated sorted array has a saving property: for any `mid`, at least one of `nums[lo..mid]` and `nums[mid..hi]` is a plain sorted run, because the seam can only be on one side. You can tell which with one comparison: if `nums[lo] <= nums[mid]`, the left side is sorted; otherwise the right side is.

Once you know which side is sorted, you know its exact value range, so you can decide whether `target` is inside it. If yes, search there; if no, it must be on the other side (which you know nothing about, but you also do not need to). Either way you discard half.

### The optimal approach

```python
def search(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:           # left half is sorted
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:                                # right half is sorted
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1
```

Time `O(log n)`, space `O(1)`.

Trace `[4, 5, 6, 7, 0, 1, 2]`, `target = 0`: `lo = 0, hi = 6, mid = 3 → 7`. Left is sorted (`4 ≤ 7`); is `0` in `[4, 7)`? No, so `lo = 4`. `mid = 5 → 1`. Left is sorted (`0 ≤ 1`); is `0` in `[0, 1)`? Yes, `hi = 4`. `mid = 4 → 0`. Found: `4`.

Trace `[3, 1]`, `target = 1`: `lo = 0, hi = 1, mid = 0 → 3`. Left is sorted (`3 ≤ 3`, one element); is `1` in `[3, 3)`? No, `lo = 1`. `mid = 1 → 1`. Found: `1`.

### Common mistakes

- Using `<` instead of `<=` in `nums[lo] <= nums[mid]`. When `lo == mid` the left half is one element and *is* sorted; with `<` you take the wrong branch and, for `[3, 1]` with target `1`, return `-1`.
- Testing `target < nums[mid]` alone in the sorted-left branch, which forgets the lower bound and sends `target = 0` left in `[4, 5, 6, 7, 0, 1, 2]`.
- Writing the range checks with inclusive bounds on the `mid` side; `mid` has already been ruled out by the equality check, so the correct ranges are `[lo, mid)` and `(mid, hi]`.

### How to discuss it

Say "at least one half is sorted; I check which, check whether the target is in that half's range, and discard the other half." Write both range conditions explicitly with their bounds; interviewers grade the bounds. The two-search version (find the pivot with [Find Minimum in Rotated Sorted Array](/practice/find-min-rotated), then ordinary binary search on the correct run, or on the whole array with a modular index offset) is `O(log n)` too and arguably easier to get right, since each piece is a known template; say you would prefer it in a codebase because each piece is independently testable. With duplicates, `nums[lo] == nums[mid]` no longer tells you which half is sorted (`[1, 1, 1, 0, 1]` versus `[1, 0, 1, 1, 1]`); the fix is to shrink `lo += 1` in that case, which is correct but degrades to `O(n)` in the worst case, and no algorithm can do better against an adversary who hides a single distinct value among duplicates.
