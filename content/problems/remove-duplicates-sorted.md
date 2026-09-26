---
slug: remove-duplicates-sorted
title: Remove Duplicates from a Sorted Array
difficulty: easy
patterns: [two-pointers]
lists: [ascend-150]
companies: [microsoft, meta, adobe]
order: 6
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - The array is sorted, so every duplicate is adjacent to the value it duplicates. You only need to compare each element with the last one you kept.
  - Use a slow "write" index for where the next kept element goes and a fast "read" index that scans the array.
  - The write index never overtakes the read index, so writing in place cannot destroy anything you have not read yet.
signatures:
  python:
    name: remove_duplicates
    starter: |
      def remove_duplicates(nums: list[int]) -> list:
          # Return [k, nums[:k]] after compacting in place.
          pass
  javascript:
    name: remove_duplicates
    starter: |
      function remove_duplicates(nums) {
        // Return [k, nums.slice(0, k)] after compacting in place.
      }
tests:
  - args: [[1, 1, 2]]
    expected: [2, [1, 2]]
  - args: [[0, 0, 1, 1, 1, 2, 2, 3, 3, 4]]
    expected: [5, [0, 1, 2, 3, 4]]
  - args: [[]]
    expected: [0, []]
    label: empty input
  - args: [[7]]
    expected: [1, [7]]
    label: single element
  - args: [[1, 2, 3]]
    expected: [3, [1, 2, 3]]
    label: already unique
  - args: [[2, 2, 2, 2]]
    expected: [1, [2]]
    hidden: true
    label: all equal
  - args: [[-3, -3, -1, 0, 0, 0, 5]]
    expected: [4, [-3, -1, 0, 5]]
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums` sorted in non-decreasing order. Remove the duplicates in place so that each distinct value appears exactly once, keeping the relative order, and let `k` be the number of distinct values.

The first `k` positions of `nums` must hold the distinct values in order. What is beyond position `k` does not matter. Use `O(1)` extra space.

Because the tests cannot inspect your array after the call, return `[k, nums[:k]]`: a two-element list holding `k` and the first `k` elements.

### Examples

| Input | Output | Why |
|---|---|---|
| `[1, 1, 2]` | `[2, [1, 2]]` | Two distinct values |
| `[0, 0, 1, 1, 1, 2, 2, 3, 3, 4]` | `[5, [0, 1, 2, 3, 4]]` | |
| `[2, 2, 2, 2]` | `[1, [2]]` | One distinct value |

### Constraints

- `0 ≤ len(nums) ≤ 3 × 10⁴`
- `-10⁴ ≤ nums[i] ≤ 10⁴`
- `nums` is sorted in non-decreasing order.

### Follow-up

The interviewer asks: "Allow each value to appear at most twice." Then: "Why does this in-place pattern matter in a language where I could just write `list(dict.fromkeys(nums))`?"

## Solution

### The naive approach

Build a new list, appending each element that differs from the last appended one, then copy it back. `O(n)` time but `O(n)` extra space, and the problem asks for `O(1)`.

Another common instinct is `nums.remove(x)` or `del nums[i]` inside a loop. Each deletion shifts the tail, so the total is `O(n²)`, and deleting while iterating skips elements. Do not.

### The insight

Sorted input means duplicates are adjacent, so "is this a duplicate?" is "does it equal the last value I kept?" That is a comparison with a single remembered element, not a set lookup. And because you only ever keep a prefix of what you have read, you can overwrite the array as you go: a slow pointer marks where the next kept value goes, a fast pointer reads ahead, and the slow pointer can never pass the fast one.

This read/write two-pointer shape is the general tool for in-place filtering and compaction; [Move Zeroes](/practice/move-zeroes) is the same skeleton with a different predicate.

### The optimal approach

```python
def remove_duplicates(nums: list[int]) -> list:
    if not nums:
        return [0, []]
    write = 1                                   # nums[0] is always kept
    for read in range(1, len(nums)):
        if nums[read] != nums[write - 1]:
            nums[write] = nums[read]
            write += 1
    return [write, nums[:write]]
```

Trace `[0, 0, 1, 1, 1, 2]`. `write = 1`. `read = 1`: `0 == nums[0]`, skip. `read = 2`: `1 != 0`, write to index 1 → `[0, 1, …]`, `write = 2`. `read = 3, 4`: `1 == nums[1]`, skip. `read = 5`: `2 != 1`, write to index 2, `write = 3`. Result `[3, [0, 1, 2]]`.

Time `O(n)`, one pass. Extra space `O(1)` (the returned slice is for the tests only).

### Common mistakes

- Comparing `nums[read]` with `nums[read - 1]` instead of `nums[write - 1]`. On sorted input these happen to agree, but the `write - 1` form is the one that generalises to "at most two copies" and to unsorted variants, and it is the one that expresses the invariant.
- Starting `write` at 0 and comparing with `nums[write - 1] = nums[-1]`, the last element. Handle the first element explicitly.
- Returning `len(set(nums))` for `k` without rearranging the array; the count is right but the array is not.

### How to discuss it

Say "duplicates are adjacent because sorted, so compare with the last kept value; slow write pointer, fast read pointer". Write it and trace a run of three equal values. For the at-most-twice follow-up: compare with `nums[write - 2]` instead of `nums[write - 1]`, starting `write` at 2; the invariant becomes "the kept prefix has at most two of each value", and the same comparison distance generalises to at most `m` copies. For the "why bother" follow-up: the pattern is about memory and cache behaviour, not Python. Compacting a large buffer in place with no allocation is what you do in a systems language, in a stream processor with fixed buffers, or in a database page; knowing the read/write pointer idiom cold means you can do it without thinking when it matters.
