---
slug: binary-search
title: "Binary search: the invariant and the off-by-ones"
description: Write binary search from an invariant so it is correct the first time, then extend it to first/last occurrence, rotated arrays and real-valued search.
minutes: 40
difficulty: medium
tags: [binary-search, invariants, sorted-array, rotated-array, pattern:binary-search]
problems: [binary-search-basic, first-bad-version, search-rotated, find-min-rotated, sqrt-x, search-2d-matrix, time-based-kv]
---
Jon Bentley asked a room of professional programmers to write binary search and gave them two hours. About 90% produced a version with a bug. The algorithm is twelve lines; the bugs live in the three places where an index is one too big or one too small. Most engineers "know" binary search the way they know a phone number: by recall, which fails under pressure. The fix is to derive it from an invariant each time, so that the boundaries are forced rather than remembered.

This lesson gives you one template, proves it correct, and then shows that first occurrence, last occurrence, insertion point, rotated-array search and even square roots are the same template with a different predicate.

## The core mechanism

Binary search maintains a range that is guaranteed to contain the answer and halves it on every step by examining the middle element. On a sorted array with `n = 8`:

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 4, 7, 9, 12, 15, 20], "target": 12, "title": "Binary search for 12", "caption": "Each probe eliminates half the remaining range; three probes settle eight elements."}
```

Each probe removes half the candidates, so after `k` probes at most `n / 2^k` remain, and the search ends after $\lceil \log_2 (n+1) \rceil$ probes. For a billion elements that is 30 probes. That is the whole reason the algorithm exists.

## The invariant, and the code it forces

Here is the discipline. Choose a **half-open range** `[lo, hi)`: `lo` is inclusive, `hi` is exclusive. The invariant is

> the answer, if present, lies in `nums[lo:hi]`; every index below `lo` and every index at or above `hi` has been ruled out.

```python
def binary_search(nums, target):
    lo, hi = 0, len(nums)          # [lo, hi) is the whole array
    while lo < hi:                 # range is non-empty
        mid = lo + (hi - lo) // 2  # lo <= mid < hi, always
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1           # mid is ruled out, so exclude it
        else:
            hi = mid               # mid is ruled out; hi is exclusive so hi = mid excludes it
    return -1
```

Each line is forced by the invariant:

- `hi = len(nums)`, not `len(nums) - 1`, because `hi` is exclusive.
- `while lo < hi`, because `lo == hi` means the range `[lo, lo)` is empty and there is nothing left to examine.
- `mid = lo + (hi - lo) // 2` satisfies `lo <= mid < hi` whenever `lo < hi`, so `nums[mid]` is always inside the range and never out of bounds.
- When `nums[mid] < target`, everything up to and including `mid` is too small, so the new range starts at `mid + 1`.
- When `nums[mid] > target`, everything from `mid` upwards is too large, so the new range ends *before* `mid`, and because `hi` is exclusive that is `hi = mid`.

**Termination.** Because `mid < hi`, setting `hi = mid` strictly shrinks the range; because `mid >= lo`, setting `lo = mid + 1` strictly shrinks it too. A strictly shrinking non-negative integer quantity must reach zero. There is no input on which this loops forever.

The `lo + (hi - lo) // 2` form instead of `(lo + hi) // 2` is not pedantry. In a language with fixed-width integers, `lo + hi` overflows when both are above `2³¹ − 1`, which for arrays of a billion elements is reachable. This bug sat in Java's `Arrays.binarySearch` for nine years before it was noticed in 2006. Python integers do not overflow; JavaScript numbers are doubles and do not overflow at these sizes either. Write the safe form anyway, because the interviewer will ask, and because you will write it in Go or Rust one day.

## Off-by-one taxonomy

Every binary-search bug is one of four mistakes. Learn to name them.

| Symptom | Cause | Rule that prevents it |
|---|---|---|
| Index out of range on `nums[mid]` | `hi` is exclusive but the loop uses `lo <= hi` | Half-open range means `lo < hi` |
| Infinite loop | `lo = mid` when `mid` can equal `lo` (range of size 2 never shrinks) | Always move `lo` to `mid + 1`, or `hi` to `mid`; never assign `mid` to the side it was computed from |
| Misses the target at the boundary | `hi = mid - 1` with an exclusive `hi` (skips an element) | Exclusive `hi` moves to `mid`; inclusive `hi` moves to `mid - 1` |
| Wrong answer when the target is absent | Returning `mid` after the loop instead of `lo` | The insertion point is `lo` after the loop; `mid` is stale |

You can write the closed-range version (`hi = n - 1`, `while lo <= hi`, `hi = mid - 1`) correctly too; the point is to *pick one convention and derive from it*, not to mix them. Python's `bisect` module, C++'s `lower_bound` and Rust's `partition_point` all use half-open ranges, and so does this lesson.

## First true: the general form

The `== target` version is the least useful variant because it stops at *some* matching index. Interview questions want the *first* occurrence, the *last* occurrence, the *insertion point*, or the *first version that is bad*. All of those are the same question: the array, viewed through a predicate, looks like `F F F F T T T T`, and you want the index of the first `T`.

```viz
{"type": "array", "algorithm": "binary-search-first-true", "values": [1, 2, 2, 2, 3, 5, 8], "target": 2, "title": "First index where nums[i] >= 2", "caption": "The predicate nums[i] >= target is false then true; the search returns the boundary."}
```

```python
def first_true(n, pred):
    """Smallest i in [0, n) with pred(i) True; returns n if none.
    Requires pred to be monotone: once True, stays True."""
    lo, hi = 0, n
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if pred(mid):
            hi = mid          # mid might be the answer; keep it in range
        else:
            lo = mid + 1      # mid is False, so the answer is after it
    return lo
```

The only difference from the earlier code is that a `True` at `mid` does not end the search; it narrows the range to `[lo, mid]` (still half-open: `hi = mid` keeps `mid` reachable as the eventual `lo`). After the loop `lo == hi`, and `lo` is the first index where the predicate holds, or `n` if it never does.

Now the variants are one-liners:

| Want | Predicate | Result |
|---|---|---|
| First occurrence of `t` (`lower_bound`) | `nums[i] >= t` | `first_true`; check `nums[i] == t` |
| Insertion point of `t` | `nums[i] >= t` | `first_true` directly |
| Last occurrence of `t` | `nums[i] > t` | `first_true(...) - 1`; check `nums[i] == t` |
| Count of `t` | both | `upper - lower` |
| First bad version | `is_bad(i)` | `first_true` over version numbers |

Trace `lower_bound([1, 2, 2, 2, 3], 2)`: `lo=0, hi=5, mid=2`, `nums[2]=2 >= 2` so `hi=2`; `mid=1`, `nums[1]=2 >= 2` so `hi=1`; `mid=0`, `nums[0]=1 < 2` so `lo=1`; loop ends with `lo == hi == 1`. Index 1 is the first 2. Note that the search kept going after finding a 2 at index 2; that is the point.

Python has this built in: `bisect.bisect_left(nums, t)` is `lower_bound` and `bisect.bisect_right(nums, t)` is the index after the last `t`. Use them in interviews when allowed and say what they compute.

## Rotated sorted arrays

`[4, 5, 6, 7, 0, 1, 2]` is a sorted array rotated at index 4. Searching it looks like it should break binary search, because the array is not monotone. The saving fact: **at least one half of any range is sorted**. Compare `nums[mid]` with `nums[lo]` to find out which, then check whether the target lies inside that sorted half; if so, search it, otherwise search the other half.

```python
def search_rotated(nums, target):
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:                    # left half [lo, mid] is sorted
            if nums[lo] <= target < nums[mid]:
                hi = mid
            else:
                lo = mid + 1
        else:                                        # right half [mid, hi) is sorted
            if nums[mid] < target <= nums[hi - 1]:
                lo = mid + 1
            else:
                hi = mid
    return -1
```

Trace for target `0`: `lo=0, hi=7, mid=3` (`7`). `nums[0]=4 <= 7`, left half sorted; is `4 <= 0 < 7`? No, so `lo=4`. `mid=5` (`1`); `nums[4]=0 <= 1`, left sorted; is `0 <= 0 < 1`? Yes, `hi=5`. `mid=4` (`0`), found. Three probes.

The `<=` in `nums[lo] <= nums[mid]` matters: when the range has one element, `lo == mid` and the "left half" is that single element, which is trivially sorted. Use `<` and the single-element case goes to the wrong branch. With duplicates allowed, `nums[lo] == nums[mid]` no longer tells you which half is sorted (`[1, 1, 1, 0, 1]`), and the honest answer is to advance `lo` by one and retry, which makes the worst case $O(n)$. Say that if asked. [Find minimum in rotated array](/practice/find-min-rotated) is the same idea with the predicate `nums[i] <= nums[n-1]`.

## Searching real numbers

Binary search does not need an array; it needs a monotone function and a range. Square root of `x` is the largest `r` with `r² <= x`, and `r² <= x` is a monotone predicate over the reals.

```python
def sqrt(x, iterations=100):
    lo, hi = 0.0, max(1.0, x)
    for _ in range(iterations):
        mid = (lo + hi) / 2
        if mid * mid <= x:
            lo = mid
        else:
            hi = mid
    return lo
```

Two decisions here that separate working code from a bug report. First, the loop runs a **fixed number of iterations** instead of `while hi - lo > eps`. Each iteration halves the interval, so 100 iterations give 2⁻¹⁰⁰ of the starting range, far below double precision; an epsilon loop, by contrast, can spin forever when `lo` and `hi` are adjacent doubles whose difference is bigger than `eps` and cannot be halved. Second, `hi = max(1, x)` because for `x < 1` the root is *larger* than `x`. Integer square root ([sqrt-x](/practice/sqrt-x)) is `first_true` over integers with the predicate `i * i > x`, minus one.

## Binary search on implicit structure

The pattern extends to anything you can index and that is monotone along the index:

- A **2D matrix** whose rows are sorted and each row starts after the previous ends is a sorted array of `rows * cols` elements; index `i` maps to `(i // cols, i % cols)`. That is [search-2d-matrix](/practice/search-2d-matrix).
- A **time-versioned key-value store** ([time-based-kv](/practice/time-based-kv)) keeps, per key, a list of `(timestamp, value)` appended in timestamp order; `get(key, t)` is "last index with timestamp `<= t`", which is `bisect_right - 1`.
- A **function call**, such as `is_bad(version)`, where each call is expensive; binary search minimises calls, and the problem statement's "minimise API calls" is the signal.

The next lesson, [binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer), takes this to its conclusion: the "array" is the space of possible answers, and the predicate is "is this answer feasible".

## Exercises

```exercise
id: lower-bound
title: Implement lower_bound
prompt: |
  Return the smallest index `i` such that `nums[i] >= target`, where
  `nums` is sorted ascending. If every element is smaller than `target`,
  return `len(nums)`. This is the insertion point that keeps the array
  sorted, and the index of the first occurrence when `target` is present.

  Use the half-open `[lo, hi)` template and do not use `bisect` or any
  library search.
languages: [python, javascript]
entry: lower_bound
starter:
  python: |
    def lower_bound(nums, target):
        # your code here
        return 0
  javascript: |
    function lower_bound(nums, target) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2, 2, 2, 3], 2]
    expected: 1
  - args: [[1, 3, 5, 7], 4]
    expected: 2
    label: target absent, lands between
  - args: [[1, 3, 5, 7], 8]
    expected: 4
    label: larger than everything
  - args: [[], 1]
    expected: 0
    label: empty input
  - args: [[5], 5]
    expected: 0
  - args: [[1, 1, 1, 1], 1]
    expected: 0
    hidden: true
  - args: [[2, 4, 6], 1]
    expected: 0
    hidden: true
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 10]
    expected: 9
    hidden: true
hints:
  - "lo = 0, hi = len(nums); loop while lo < hi."
  - "If nums[mid] >= target the answer is mid or earlier: hi = mid. Otherwise lo = mid + 1. Return lo."
```

```exercise
id: search-rotated-array
title: Search a rotated sorted array
prompt: |
  `nums` is a sorted array of distinct integers that may have been
  rotated at an unknown pivot (for example `[4, 5, 6, 7, 0, 1, 2]`).
  Return the index of `target`, or -1 if absent, in O(log n).
languages: [python, javascript]
entry: search_rotated
starter:
  python: |
    def search_rotated(nums, target):
        # your code here
        return -1
  javascript: |
    function search_rotated(nums, target) {
      // your code here
      return -1;
    }
tests:
  - args: [[4, 5, 6, 7, 0, 1, 2], 0]
    expected: 4
  - args: [[4, 5, 6, 7, 0, 1, 2], 3]
    expected: -1
  - args: [[1], 0]
    expected: -1
    label: single element, absent
  - args: [[1, 3], 3]
    expected: 1
  - args: [[3, 1], 1]
    expected: 1
    label: two elements, rotated
  - args: [[5, 1, 2, 3, 4], 5]
    expected: 0
    hidden: true
  - args: [[1, 2, 3, 4, 5], 4]
    expected: 3
    hidden: true
    label: not rotated at all
  - args: [[], 1]
    expected: -1
    hidden: true
hints:
  - "At each step decide which half is sorted by comparing nums[lo] with nums[mid] (use <=)."
  - "If the target lies within the sorted half's value range, search that half; otherwise search the other half."
```

## Senior signals

- You write binary search from a stated **invariant** and a half-open range, and you can explain why each boundary update is `mid + 1` or `mid`.
- You reach for the **first-true** formulation and express first/last occurrence, insertion point and count as predicates over it.
- You know the `(lo + hi) / 2` **overflow** bug, which languages it affects, and write `lo + (hi - lo) / 2` regardless.
- You search real numbers with a **fixed iteration count**, and can say why an epsilon loop can fail to terminate.
- You explain why rotated-array search works ("one half is always sorted") and why duplicates break the $O(\log n)$ guarantee.
- You recognise binary search on **implicit** structures: matrices, versioned stores, expensive monotone function calls.

## Check yourself

```quiz
- q: >-
    In the half-open template (lo = 0, hi = n, while lo < hi), the branch for nums[mid] > target sets hi = mid. A colleague changes it to hi = mid - 1. What happens?
  options: ["Index mid - 1 is never examined and can be missed", "It can compute a negative mid and go out of bounds", "It can loop forever when the range has two elements", "Nothing, since mid itself was already ruled out"]
  answer: 0
  explanation: >-
    hi is exclusive, so hi = mid already excludes mid. hi = mid - 1 additionally excludes index mid - 1, which has not been examined; a target sitting there is missed. The range still strictly shrinks, so it terminates, and the loop exits before mid could go negative. Mixing the closed and half-open conventions is the classic off-by-one.
- q: >-
    Which loop can run forever on some inputs?
  options: ["lo = mid + 1 / hi = mid, while lo < hi, mid rounded down", "A fixed 100-iteration loop over doubles, lo = mid / hi = mid", "lo = mid / hi = mid - 1, while lo <= hi, mid rounded down", "lo = mid + 1 / hi = mid - 1, while lo <= hi, mid rounded down"]
  answer: 2
  explanation: >-
    With mid rounded down and a range of two elements, mid == lo, so lo = mid does not shrink the range and the loop spins. The half-open and closed templates always move lo past mid, so they strictly shrink; the fixed-iteration loop ends after 100 steps whatever it assigns. The rule: never assign mid back to the side it was computed from without adjusting by one.
- q: >-
    You need the number of times value 7 appears in a sorted array of 10 million integers. The cleanest O(log n) approach is:
  options: ["Linear scan, stopping at the first value above 7", "A hash map of value counts, then one lookup", "Binary search for any 7, then scan outward from it", "first_true(nums[i] > 7) - first_true(nums[i] >= 7)"]
  answer: 3
  explanation: >-
    Two boundary searches give the half-open range of 7s in O(log n): the first index above 7 minus the first index at or above 7. Scanning outward from one hit is O(count), which is O(n) when the array is mostly 7s. A hash map costs O(n) to build, and a linear scan is O(n) even with an early exit.
- q: >-
    Why is a fixed number of iterations preferred over while (hi - lo) > 1e-9 when binary searching over doubles?
  options: ["Epsilon tests lose accuracy as the interval shrinks", "Subtracting lo from hi can overflow for large doubles", "It is faster, because it skips a comparison per step", "Doubles near large values are spaced wider than 1e-9"]
  answer: 3
  explanation: >-
    For large magnitudes the spacing between representable doubles exceeds tiny epsilons; (lo + hi) / 2 then equals lo or hi, the range stops shrinking, and the epsilon loop never ends. 100 halvings always terminate and exceed double precision anyway. Speed is not the reason, and hi - lo on doubles does not overflow the way integer lo + hi can.
- q: >-
    Searching a rotated sorted array with duplicates allowed, such as [1, 1, 1, 0, 1], the guaranteed complexity becomes:
  options: ["O(n), as equal endpoints hide which half is sorted", "O(log n), since one half is always sorted", "Unbounded, since the loop may never terminate", "O(log² n), from a nested search per probe"]
  answer: 0
  explanation: >-
    One half is still sorted, but when nums[lo] == nums[mid] you cannot tell which, so the safe move is to shrink the range by one. That always makes progress, so it terminates, but an adversarial all-equal array with one odd element forces n such steps: O(n) worst case.
```
