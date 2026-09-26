---
slug: three-sum
title: Three Sum
difficulty: medium
patterns: [two-pointers]
lists: [core-75, ascend-150]
companies: [meta, amazon, google, microsoft]
order: 3
lesson: interview-patterns/array-patterns/two-pointers
hints:
  - Fix the first element. The rest of the problem is "find two numbers that sum to `-nums[i]`", which you already know how to do on a sorted array.
  - Sort first. Sorting makes the two-pointer inner walk possible and makes duplicates adjacent, which is how you avoid emitting the same triplet twice.
  - "Skip duplicates in three places: the fixed element, and both pointers after a match."
signatures:
  python:
    name: three_sum
    starter: |
      def three_sum(nums: list[int]) -> list[list[int]]:
          pass
  javascript:
    name: three_sum
    starter: |
      function three_sum(nums) {
      }
tests:
  - args: [[-1, 0, 1, 2, -1, -4]]
    expected: [[-1, -1, 2], [-1, 0, 1]]
    any_order: true
  - args: [[0, 0, 0]]
    expected: [[0, 0, 0]]
    any_order: true
  - args: [[]]
    expected: []
    any_order: true
    label: empty input
  - args: [[1, 2, -2, -1]]
    expected: []
    any_order: true
    label: no triplet
  - args: [[-2, 0, 1, 1, 2]]
    expected: [[-2, 0, 2], [-2, 1, 1]]
    any_order: true
  - args: [[1, 1, 1]]
    expected: []
    any_order: true
  - args: [[0, 0, 0, 0]]
    expected: [[0, 0, 0]]
    any_order: true
    hidden: true
    label: extra zeros do not create extra triplets
  - args: [[3, -2, 1, 0]]
    expected: []
    any_order: true
    hidden: true
  - args: [[-4, -2, -2, 0, 2, 2, 4]]
    expected: [[-4, 0, 4], [-4, 2, 2], [-2, -2, 4], [-2, 0, 2]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
You are given an array of integers `nums`. Return every distinct triplet of values `[a, b, c]` such that `a + b + c == 0`, where the three values come from three different positions in the array.

Each triplet must be listed in non-decreasing order (`a ≤ b ≤ c`), and no two triplets in the output may contain the same three values. The order of the triplets themselves does not matter.

### Examples

| Input | Output | Why |
|---|---|---|
| `[-1, 0, 1, 2, -1, -4]` | `[[-1, -1, 2], [-1, 0, 1]]` | `[-1, 0, 1]` appears via two different `-1` positions but is listed once |
| `[0, 0, 0, 0]` | `[[0, 0, 0]]` | Four zeros still give one distinct triplet |
| `[1, 2, -2, -1]` | `[]` | No three values sum to zero |

### Constraints

- `0 ≤ len(nums) ≤ 3000`
- `-10⁵ ≤ nums[i] ≤ 10⁵`

### Follow-up

The interviewer asks: "Is O(n²) optimal?" Then: "Generalise to k-sum. What is the complexity, and where does the recursion bottom out?"

## Solution

### The naive approach

Three nested loops, `O(n³)`, plus a set of sorted tuples to deduplicate. For `n = 3000` that is roughly 4.5 billion triples; too slow, and the deduplication set adds `O(n³)` memory in the worst case.

A hash-map version fixes two elements and looks up the third: `O(n²)` time, but the deduplication is fiddly and needs `O(n)` extra space per outer iteration or a global set of results.

### The insight

Fix the first element `nums[i]`. The remaining question is "which two later elements sum to `-nums[i]`?", which is [Two Sum on a Sorted Array](/practice/two-sum-sorted). So sort once, then for each `i` run the two-pointer walk on `nums[i+1:]`. Sorting also solves deduplication: equal values are adjacent, so skipping over runs of equal values is enough to guarantee each triplet is emitted once.

### The optimal approach

```python
def three_sum(nums: list[int]) -> list[list[int]]:
    nums = sorted(nums)
    n = len(nums)
    out: list[list[int]] = []
    for i in range(n - 2):
        if nums[i] > 0:
            break                       # everything after is positive too
        if i > 0 and nums[i] == nums[i - 1]:
            continue                    # same first element as last time
        lo, hi = i + 1, n - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if s < 0:
                lo += 1
            elif s > 0:
                hi -= 1
            else:
                out.append([nums[i], nums[lo], nums[hi]])
                lo += 1
                hi -= 1
                while lo < hi and nums[lo] == nums[lo - 1]:
                    lo += 1
                while lo < hi and nums[hi] == nums[hi + 1]:
                    hi -= 1
    return out
```

Trace `[-4, -2, -2, 0, 2, 2, 4]` (already sorted). `i = 0` (`-4`): `lo = 1`, `hi = 6`: `-4 - 2 + 4 = -2 < 0` → `lo = 2`; `-2` again → `lo = 3`; `-4 + 0 + 4 = 0` → emit `[-4, 0, 4]`, `lo = 4`, `hi = 5`; `-4 + 2 + 2 = 0` → emit `[-4, 2, 2]`, pointers cross. `i = 1` (`-2`): `lo = 2`, `hi = 6`: `-2 - 2 + 4 = 0` → emit `[-2, -2, 4]`, `lo = 3`, `hi = 5`; `-2 + 0 + 2 = 0` → emit `[-2, 0, 2]`. `i = 2` is a duplicate `-2`, skipped. `i = 3` (`0`): `0 + 2 + 4 > 0`, `hi` retreats until the pointers cross. Four triplets, no duplicates.

Time `O(n²)`: `O(n log n)` to sort, then `n` outer iterations each with an `O(n)` walk. Space `O(1)` beyond the output (or `O(n)` if the sort is not in place).

### Common mistakes

- Skipping duplicates of the fixed element with `nums[i] == nums[i + 1]`, which skips the *first* copy instead of the *later* copies and loses `[-1, -1, 2]`.
- Deduplicating the pointers before recording the match, or only on one side.
- Not moving both pointers after a match. With the sum exactly zero, moving only one guarantees the next sum is non-zero, so it is not wrong, just a wasted step; but forgetting to skip duplicates after the move is wrong.
- Reaching for a set of tuples to deduplicate instead of the adjacent-skip. It works and is easy to get right, but it costs memory and signals that you did not see why sorting was enough.

### How to discuss it

Say "fix one, two-sum the rest" and "sort so I can use pointers and so duplicates are adjacent". Write the code, then trace an input with repeated values, pointing at each of the three skip sites. For optimality: no `O(n^(2-ε))` algorithm is known, and the problem is a standard hardness assumption (the 3SUM conjecture) that many lower bounds in computational geometry are built on; say that, not "it is provably optimal". For k-sum: recurse, fixing one element and calling `(k-1)`-sum on the suffix, bottoming out in the two-pointer walk at `k = 2`. That gives `O(n^(k-1))` after the sort, and the dedup logic is the same at every level.
