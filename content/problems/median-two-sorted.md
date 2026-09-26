---
slug: median-two-sorted
title: Median of Two Sorted Arrays
difficulty: hard
patterns: [binary-search]
lists: [ascend-150]
companies: [google, amazon, microsoft, apple, adobe]
order: 7
lesson: interview-patterns/array-patterns/binary-search
hints:
  - The median splits the combined multiset into a left half and a right half of known sizes. You do not need the merged order; you need a *cut* in each array such that everything left of both cuts is ≤ everything right of both cuts.
  - If you take `i` elements from the first array's left side, you must take `half - i` from the second. So there is only one free variable, and it can be binary searched.
  - Search over the shorter array. A cut is correct when `a[i-1] <= b[j]` and `b[j-1] <= a[i]`; use ±infinity for out-of-range positions. If `a[i-1] > b[j]`, move the cut in `a` left; otherwise right.
signatures:
  python:
    name: find_median_sorted_arrays
    starter: |
      def find_median_sorted_arrays(nums1: list[int], nums2: list[int]) -> float:
          pass
  javascript:
    name: find_median_sorted_arrays
    starter: |
      function find_median_sorted_arrays(nums1, nums2) {
      }
tests:
  - args: [[1, 3], [2]]
    expected: 2.0
  - args: [[1, 2], [3, 4]]
    expected: 2.5
    label: even total, median is an average
  - args: [[], [1]]
    expected: 1.0
    label: one array empty
  - args: [[2], []]
    expected: 2.0
    label: other array empty
  - args: [[1, 2, 3, 4, 5], [6, 7, 8, 9, 10]]
    expected: 5.5
    label: no interleaving at all
  - args: [[1, 1, 1], [1, 1]]
    expected: 1.0
    hidden: true
    label: all equal
  - args: [[-5, -3, -1], [0, 2, 4, 6]]
    expected: 0.0
    hidden: true
    label: negatives, odd total
  - args: [[1, 2], [1, 2, 3]]
    expected: 2.0
    label: duplicates across arrays
  - args: [[100000], [100001]]
    expected: 100000.5
    hidden: true
  - args: [[1, 3, 5, 7], [2, 4, 6, 8, 9, 10]]
    expected: 5.5
    hidden: true
time_limit_ms: 4000
---
You are given two arrays `nums1` and `nums2`, each sorted in ascending order, with total length at least 1. Return the median of all the numbers taken together, as a floating-point value. If the combined count is even, the median is the mean of the two middle values.

The expected solution runs in `O(log(min(m, n)))` time, where `m` and `n` are the array lengths. An `O(m + n)` merge is a valid warm-up, not a final answer.

### Examples

| Input | Output | Why |
|---|---|---|
| `nums1 = [1, 3]`, `nums2 = [2]` | `2.0` | Combined `[1, 2, 3]`, middle element is `2` |
| `nums1 = [1, 2]`, `nums2 = [3, 4]` | `2.5` | Combined `[1, 2, 3, 4]`, mean of `2` and `3` |
| `nums1 = []`, `nums2 = [1]` | `1.0` | One array may be empty |

### Constraints

- `0 ≤ m, n ≤ 1000`, `m + n ≥ 1`
- `-10⁶ ≤ nums1[i], nums2[i] ≤ 10⁶`

### Follow-up

The interviewer asks: "Generalise to the `k`-th smallest element of the two arrays." Then: "Now there are `p` sorted arrays. What is the best complexity you can get, and does the same idea survive?"

## Solution

### The naive approach

Merge the two arrays (or just walk them with two pointers, without allocating) until you reach the middle. `O(m + n)` time, `O(1)` space. Every interviewer expects you to say this in one breath and then explain why it is not logarithmic: it touches half the input no matter what.

### The insight

Forget the merged order. The median is defined by a *partition*: put the `half = ⌈(m + n) / 2⌉` smallest elements on the left and the rest on the right. Any such partition takes some `i` elements from `nums1` (its first `i`) and `j = half - i` from `nums2` (its first `j`). The partition is the correct one exactly when nothing on the left exceeds anything on the right, and since each array is sorted, that reduces to two comparisons across the cut:

```text
nums1[i-1]  ≤  nums2[j]      and      nums2[j-1]  ≤  nums1[i]
```

If the first fails, `i` is too big (you have taken a left element from `nums1` that belongs on the right), so move the cut left. If the second fails, `i` is too small. That monotone behaviour makes `i` binary-searchable. Search over the shorter array so `j` is always in range.

Once the cut is found, the median is `max(left side)` for an odd total, or the mean of `max(left side)` and `min(right side)` for an even total.

### The optimal approach

```python
def find_median_sorted_arrays(nums1: list[int], nums2: list[int]) -> float:
    a, b = (nums1, nums2) if len(nums1) <= len(nums2) else (nums2, nums1)
    m, n = len(a), len(b)
    total = m + n
    half = (total + 1) // 2
    inf = float("inf")

    lo, hi = 0, m
    while lo <= hi:
        i = lo + (hi - lo) // 2       # elements of a on the left
        j = half - i                  # elements of b on the left
        a_left = a[i - 1] if i > 0 else -inf
        a_right = a[i] if i < m else inf
        b_left = b[j - 1] if j > 0 else -inf
        b_right = b[j] if j < n else inf

        if a_left <= b_right and b_left <= a_right:
            if total % 2 == 1:
                return float(max(a_left, b_left))
            return (max(a_left, b_left) + min(a_right, b_right)) / 2
        if a_left > b_right:
            hi = i - 1
        else:
            lo = i + 1
    raise ValueError("inputs are not sorted")
```

Time `O(log(min(m, n)))`: the search is over `i ∈ [0, m]` with `m` the shorter length. Space `O(1)`.

Why is `j` always valid? With `m ≤ n`, `half = ⌈(m + n)/2⌉` satisfies `m ≤ half ≤ n`, and `0 ≤ i ≤ m`, so `0 ≤ j = half - i ≤ n`. The `±inf` sentinels handle cuts at either end without branching on them.

Trace `[1, 3]`, `[2]`: `a = [2]` (shorter), `b = [1, 3]`, `m = 1, n = 2, total = 3, half = 2`. `lo = 0, hi = 1`. `i = 0, j = 2`: `a_left = -inf, a_right = 2, b_left = 3, b_right = inf`. `b_left ≤ a_right`? `3 ≤ 2` fails, so `lo = 1`. `i = 1, j = 1`: `a_left = 2, a_right = inf, b_left = 1, b_right = 3`. `2 ≤ 3` and `1 ≤ inf`: correct cut. Odd total: `max(2, 1) = 2.0`.

### Common mistakes

- Searching over the longer array, which lets `j` go negative or past `n`.
- Off-by-one in `half`. Using `(total) // 2` instead of `(total + 1) // 2` makes the odd case pick the wrong side; the left half must hold the extra element so the median is `max(left)`.
- Returning an integer (`5` instead of `5.5`) by using integer division on the even case.
- Forgetting the sentinels and writing four separate branches for cuts at the ends, then getting one of them wrong.

### How to discuss it

Describe the partition picture with a drawing before any code: two rows, a vertical cut in each, the two cross-comparisons. Say the search variable, its range, the monotonicity argument and why the shorter array. Then trace one case with a cut at the edge. For the `k`-th smallest follow-up, the same partition works with `half = k` and the answer `max(left)`; or the classic recursive method that compares `a[k/2 - 1]` with `b[k/2 - 1]` and discards `k/2` elements from one array per step, `O(log k)`. For `p` arrays, the partition trick does not extend cleanly (there are `p - 1` free variables), and the practical answer is binary search on the *value*: guess a median `x`, count elements `≤ x` in each array with `bisect` in `O(p log n)`, and binary search `x` over the value range; `O(p log n log V)`. Knowing when to switch from searching an index to searching a value is the senior move; see [Koko Eating Bananas](/practice/koko-eating-bananas) for that template.
