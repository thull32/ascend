---
slug: binary-search
title: "Binary search: the invariant and the off-by-ones"
description: Write binary search from an invariant so it is correct the first time, then extend it to first/last occurrence, rotated arrays and real-valued search.
minutes: 45
difficulty: medium
tags: [binary-search, invariants, sorted-array, rotated-array, pattern:binary-search]
problems: [binary-search-basic, first-bad-version, search-rotated, find-min-rotated, sqrt-x, search-2d-matrix, time-based-kv]
---
Jon Bentley reported in *Programming Pearls* that when he gave professional programmers a couple of hours to write binary search from a description, about 90% found bugs in their own code. The algorithm is twelve lines; the bugs live in the three places where an index is one too big or one too small. Most engineers "know" binary search the way they know a phone number: by recall, which fails under pressure. The fix is to derive it from an invariant each time, so that the boundaries are forced rather than remembered.

This lesson gives you one template, proves it correct, and then shows that first occurrence, last occurrence, insertion point, rotated-array search and even square roots are the same template with a different predicate.

## The core mechanism

Binary search maintains a range that is guaranteed to contain the answer and halves it on every step by examining the middle element. On a sorted array with `n = 8`:

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 4, 7, 9, 12, 15, 20], "target": 12, "title": "Binary search for 12", "caption": "Each probe eliminates half the remaining range; three probes settle eight elements."}
```

Each probe removes half the candidates, so after `k` probes at most `n / 2^k` remain, and the search ends after at most $\lceil \log_2 (n+1) \rceil$ probes. For a thousand elements that is 10; for a million, 20; for a billion, 30. That is the whole reason the algorithm exists.

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

Trace it on `[1, 3, 4, 7, 9, 12, 15, 20]`, first for `target = 12`, then for `target = 5`, which is absent:

| iteration | lo | hi | mid | nums[mid] | decision |
|---|---|---|---|---|---|
| 1 | 0 | 8 | 4 | 9 | `9 < 12` → `lo = 5` |
| 2 | 5 | 8 | 6 | 15 | `15 > 12` → `hi = 6` |
| 3 | 5 | 6 | 5 | 12 | found, return 5 |

| iteration | lo | hi | mid | nums[mid] | decision |
|---|---|---|---|---|---|
| 1 | 0 | 8 | 4 | 9 | `9 > 5` → `hi = 4` |
| 2 | 0 | 4 | 2 | 4 | `4 < 5` → `lo = 3` |
| 3 | 3 | 4 | 3 | 7 | `7 > 5` → `hi = 3` |
| 4 | 3 | 3 | — | — | `lo == hi`, return −1 |

In the second trace the loop ends with `lo == hi == 3`, and 3 is where 5 would be inserted to keep the array sorted. That is not a coincidence; it is the invariant doing its job, and the next section makes it the main event.

Each line of the code is forced by the invariant:

- `hi = len(nums)`, not `len(nums) - 1`, because `hi` is exclusive.
- `while lo < hi`, because `lo == hi` means the range `[lo, lo)` is empty and there is nothing left to examine.
- `mid = lo + (hi - lo) // 2` satisfies `lo <= mid < hi` whenever `lo < hi`, so `nums[mid]` is always inside the range and never out of bounds.
- When `nums[mid] < target`, everything up to and including `mid` is too small, so the new range starts at `mid + 1`.
- When `nums[mid] > target`, everything from `mid` upwards is too large, so the new range ends *before* `mid`, and because `hi` is exclusive that is `hi = mid`.

**Correctness.** The invariant holds at the start (`[0, n)` is the whole array, nothing ruled out). Each branch rules out only indices whose value is known to be on the wrong side of the target, because the array is sorted, so the invariant is preserved. When the loop ends the range is empty and nothing remains that could hold the target, so `-1` is right; when it returns early, `nums[mid] == target` was checked directly.

**Termination.** Because `mid < hi`, setting `hi = mid` strictly shrinks the range; because `mid >= lo`, setting `lo = mid + 1` strictly shrinks it too. A strictly shrinking non-negative integer quantity must reach zero. There is no input on which this loops forever.

The `lo + (hi - lo) // 2` form instead of `(lo + hi) // 2` is not pedantry. In a language with fixed-width integers, `lo + hi` overflows when both are above `2³¹ − 1`, which for arrays of a billion elements is reachable. This bug sat in Java's `Arrays.binarySearch` for about nine years until it broke someone's program; Joshua Bloch, who wrote that code, [described it in 2006](https://research.google/blog/extra-extra-read-all-about-it-nearly-all-binary-searches-and-mergesorts-are-broken/) and showed that the binary search Bentley proved correct in *Programming Pearls* has it too. Python integers do not overflow; JavaScript numbers are doubles and represent integers exactly up to 2⁵³. Write the safe form anyway, because the interviewer will ask, and because you will write it in Go or Rust one day, where `(lo + hi) / 2` on `usize` panics in debug builds and wraps in release.

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

The only difference from the earlier code is that a `True` at `mid` does not end the search; it narrows the range to `[lo, mid]` (still half-open: `hi = mid` keeps `mid` reachable as the eventual `lo`). The invariant is now "`pred` is false for every index below `lo` and true for every index at or above `hi`". After the loop `lo == hi`, so `lo` is the first index where the predicate holds, or `n` if it never does.

Now the variants are one-liners:

| Want | Predicate | Result |
|---|---|---|
| First occurrence of `t` (`lower_bound`) | `nums[i] >= t` | `first_true`; check `nums[i] == t` |
| Insertion point of `t` | `nums[i] >= t` | `first_true` directly |
| Last occurrence of `t` | `nums[i] > t` | `first_true(...) - 1`; check `nums[i] == t` |
| Count of `t` | both | `upper - lower` |
| First bad version | `is_bad(i)` | `first_true` over version numbers |

Trace `lower_bound([1, 2, 2, 2, 3], 2)`:

| iteration | lo | hi | mid | nums[mid] >= 2? | decision |
|---|---|---|---|---|---|
| 1 | 0 | 5 | 2 | yes | `hi = 2` |
| 2 | 0 | 2 | 1 | yes | `hi = 1` |
| 3 | 0 | 1 | 0 | no (`1 < 2`) | `lo = 1` |
| 4 | 1 | 1 | — | — | return 1 |

Index 1 is the first 2. Note that the search kept going after finding a 2 at index 2; that is the point.

## Under the hood: `bisect`, `lower_bound` and friends

Python's `bisect` module is the `first_true` template in C. Its exact semantics are worth memorising because they are asked in interviews and misused in code review:

- `bisect_left(a, x, lo=0, hi=len(a))` returns the first index `i` with `a[i] >= x`; every element before it is `< x`. That is `lower_bound`. If `x` is present it is the index of its first occurrence.
- `bisect_right(a, x)` (alias `bisect`) returns the first index with `a[i] > x`; every element before it is `<= x`. That is `upper_bound`, the index *after* the last occurrence.
- `bisect_right - bisect_left` is the count of `x`; `bisect_right(a, x) - 1` is the last occurrence, or `-1` past the start.
- Both accept `key=` since Python 3.10, applied to the *array elements only*, so you pass `x` already in key form: `bisect_left(records, "m", key=lambda r: r.name)`.
- `insort_left`/`insort_right` do the search and then `list.insert`, which shifts every later element, so maintaining a sorted list by repeated `insort` is $O(n)$ per insert and $O(n^2)$ overall; for that job you want a balanced tree or `sortedcontainers`.
- `bisect` never checks that the list is sorted. On an unsorted list it returns an index that satisfies nothing, silently.

The same template appears as C++ `std::lower_bound` / `std::upper_bound` / `std::partition_point` (all half-open, all taking a predicate or a comparator), Rust `slice::partition_point` and `binary_search` (which returns `Ok(index)` for *some* matching index, not necessarily the first, or `Err(insertion_point)`), and Java `Arrays.binarySearch`, which returns `-(insertion point) - 1` when the key is absent so that the sign carries the "found" bit and the magnitude carries the position. Go's `sort.Search(n, f)` is `first_true` exactly, and `slices.BinarySearch` returns `(index, found)`.

What a probe costs is decided by memory, not arithmetic. On an array of 10⁹ 8-byte integers (8 GB), the first probes land in different pages every time; on a cold lookup roughly the first 20 of the 30 probes miss every cache level, at the order of 100 ns each, so a single lookup costs a few microseconds while the arithmetic is under 30 ns. Only the last 3 probes fall inside one 64-byte cache line (8 integers) and hit; the 6 before them share a 4 KB page, which saves TLB misses but not cache misses. Two techniques address that in real systems: **Eytzinger layout**, which stores the array in breadth-first heap order so that the next probes are contiguous and prefetchable, and which [Khuong and Morin](https://arxiv.org/abs/1509.05053) found usually the fastest layout for large arrays; and B-tree-style node layout, which is what databases use for the same reason ([B-trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees)). Branch prediction matters too: `mid`'s comparison is unpredictable by construction (that is what "one bit per probe" means), so fast implementations write the update as a **branchless** conditional move (`lo = cond ? mid + 1 : lo`), often with an explicit prefetch; Khuong and Morin's implementations use both. How much each trick buys depends on the CPU and the array size; the ordering of costs does not.

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

Trace for target `0`:

| iteration | lo | hi | mid | nums[mid] | sorted half | target inside it? | decision |
|---|---|---|---|---|---|---|---|
| 1 | 0 | 7 | 3 | 7 | left (`4 <= 7`) | `4 <= 0 < 7`? no | `lo = 4` |
| 2 | 4 | 7 | 5 | 1 | left (`0 <= 1`) | `0 <= 0 < 1`? yes | `hi = 5` |
| 3 | 4 | 5 | 4 | 0 | found | | return 4 |

Why one half is always sorted: the array is two ascending pieces, and the rotation point lies in at most one of `[lo, mid]` and `[mid, hi)`; the other contains no rotation point and is therefore sorted. The `<=` in `nums[lo] <= nums[mid]` matters: when the range has one element, `lo == mid` and the "left half" is that single element, which is sorted. Use `<` and the single-element case goes to the wrong branch. With duplicates allowed, `nums[lo] == nums[mid]` no longer tells you which half is sorted (`[1, 1, 1, 0, 1]`), and the honest answer is to advance `lo` by one and retry, which makes the worst case $O(n)$. Say that if asked. [Find minimum in rotated array](/practice/find-min-rotated) is the same idea with the predicate `nums[i] <= nums[n-1]`.

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

Two decisions here that separate working code from a bug report. First, the loop runs a **fixed number of iterations** instead of `while hi - lo > eps`. Each iteration halves the interval, so 100 iterations give 2⁻¹⁰⁰ of the starting range, far below double precision; an epsilon loop, by contrast, can spin forever when `lo` and `hi` are adjacent doubles whose difference is bigger than `eps` and cannot be halved. That happens sooner than you expect: doubles near 10¹⁶ are spaced 2 apart, so `while hi - lo > 1e-9` never exits there. Second, `hi = max(1, x)` because for `x < 1` the root is *larger* than `x`. Integer square root ([sqrt-x](/practice/sqrt-x)) is `first_true` over integers with the predicate `i * i > x`, minus one; `math.isqrt` does it exactly for arbitrary-size integers.

## Binary search on implicit structure

The pattern extends to anything you can index and that is monotone along the index:

- A **2D matrix** whose rows are sorted and each row starts after the previous ends is a sorted array of `rows * cols` elements; index `i` maps to `(i // cols, i % cols)`. That is [search-2d-matrix](/practice/search-2d-matrix).
- A **time-versioned key-value store** ([time-based-kv](/practice/time-based-kv)) keeps, per key, a list of `(timestamp, value)` appended in timestamp order; `get(key, t)` is "last index with timestamp `<= t`", which is `bisect_right - 1`.
- A **function call**, such as `is_bad(version)`, where each call is expensive; binary search minimises calls, and the problem statement's "minimise API calls" is the signal.
- An **unbounded** sorted sequence (a stream, a file of unknown length, an API with `get(i)` that fails past the end): probe indices `1, 2, 4, 8, ...` until the value exceeds the target, then binary search the last doubling interval. That is exponential (galloping) search, $O(\log i)$ where `i` is the answer's position, and it is the same galloping Timsort uses inside its merge.

The next lesson, [binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer), takes this to its conclusion: the "array" is the space of possible answers, and the predicate is "is this answer feasible".

## Failure modes

**`ArrayIndexOutOfBoundsException` at index −1,073,741,824 on a large array.** Symptom: a binary search that has worked for years fails once the array passes about 2³⁰ elements. Diagnosis: `mid = (lo + hi) / 2` overflowed `int`, producing a negative `mid`. Fix: `lo + (hi - lo) / 2`, or `(lo + hi) >>> 1` in Java (unsigned shift reinterprets the overflowed sum correctly).

**The search returns different answers for the same key on different days.** Symptom: `bisect_left` on a list of records finds the key sometimes and not others; no exceptions. Diagnosis: the list is not sorted by the key being searched (sorted case-sensitively, searched case-insensitively; sorted by one field, searched by another; or a `NaN` in a float array, which compares false to everything and breaks the `F...F T...T` shape). `bisect` does not check sortedness. Fix: an `assert all(a[i] <= a[i+1])` in tests, sort with the same key function you search with, and strip or reject `NaN` before sorting.

**A request hangs at 100% CPU.** Symptom: one input never returns; a thread dump shows it inside the search loop. Diagnosis: `lo = mid` with `mid` rounded down, so a range of size 2 never shrinks; or a real-valued search with an epsilon that is below the double spacing at that magnitude. Fix: `lo = mid + 1`, or round `mid` up when `lo = mid` is the update you need; use a fixed iteration count for floats.

**The version bisection blames the wrong commit.** Symptom: `git bisect` (or your own `first_true` over builds) lands on a commit that cannot be the cause. Diagnosis: the predicate is not monotone: the test is flaky, or the bug was introduced, fixed and re-introduced, so the sequence is `F T F T` and binary search assumes a single boundary. Fix: make the predicate deterministic (retry and majority-vote, pin the environment), and when the history is genuinely non-monotone, a linear scan of the suspicious range is the only correct tool.

## Interviewer follow-ups

**"How many comparisons for a billion elements, and what does each cost?"** Model answer: at most 30, but the first 20 or so are cache misses at around 100 ns each, so a lookup is a few microseconds, dominated by memory rather than arithmetic; on disk-resident data that is why B-trees with high fan-out replace binary search. Common wrong answer: "30, so it is instant."

**"The array is sorted but you do not know its length and can only call `get(i)`, which throws past the end."** Model answer: exponential search: probe `1, 2, 4, ...` until `get` throws or exceeds the target, then binary search the last interval; $O(\log i)$ calls where `i` is the answer's index. Common wrong answer: binary search with `hi = 2⁶³`, which wastes ~63 probes and treats an exception as a comparison.

**"Find a peak element (any index `i` with `nums[i] > nums[i-1]` and `nums[i] > nums[i+1]`) in O(log n)."** Model answer: compare `nums[mid]` with `nums[mid+1]`; if the slope is up, a peak exists to the right, else at or to the left. The predicate "slope is down at `i`" is not globally monotone, but the argument that each half kept contains a peak is what binary search needs. Common wrong answer: "the array is not sorted, so binary search does not apply".

**"Count occurrences of a value in a sorted array of 10 million."** Model answer: `bisect_right(a, x) - bisect_left(a, x)`, two searches, $O(\log n)$. Common wrong answer: find one occurrence and scan outward, which is $O(\text{count})$ and linear when the array is mostly that value.

**"Why does Rust's `binary_search` return `Result` and not `-1`?"** Model answer: `Err(i)` carries the insertion point, which callers need for insert-in-order and for `lower_bound`-style logic, and the type forces the caller to handle the absent case. Java packs the same information as `-(insertion) - 1`. Common wrong answer: "it is a style choice".

## What mid-level engineers get wrong

- **Mixing conventions**: `hi = len(nums)` with `while lo <= hi`, or `hi = mid - 1` with an exclusive `hi`. Consequence: an out-of-bounds read or a missed boundary element that only shows up on certain inputs.
- **Assigning `mid` back to the side it came from** (`lo = mid`). Consequence: an infinite loop on a two-element range, which is exactly the range a random test rarely hits.
- **Stopping at the first match.** Consequence: a wrong first-occurrence, and a wrong count, whenever duplicates exist.
- **Calling `bisect` on data sorted by a different key.** Consequence: silent garbage, no exception.
- **Epsilon loops over doubles.** Consequence: a hang at large magnitudes.
- **Treating monotonicity as given.** Consequence: a binary search over a flaky test or a non-monotone history that confidently returns the wrong answer.

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

- You write binary search from a stated **invariant** and a half-open range, and you can explain why each boundary update is `mid + 1` or `mid`, and why the loop terminates.
- You reach for the **first-true** formulation and express first/last occurrence, insertion point and count as predicates over it; you know `bisect_left`/`bisect_right` exactly and that `bisect` never checks sortedness.
- You know the `(lo + hi) / 2` **overflow** bug, which languages it affects, and write `lo + (hi - lo) / 2` regardless.
- You know a probe on a large array is a **cache miss**, put numbers on it, and can name Eytzinger layout and B-trees as the responses.
- You search real numbers with a **fixed iteration count**, and can say why an epsilon loop can fail to terminate.
- You explain why rotated-array search works ("one half is always sorted") and why duplicates break the $O(\log n)$ guarantee.
- You recognise binary search on **implicit** structures (matrices, versioned stores, expensive monotone calls, unbounded sequences via exponential search) and you verify the predicate is monotone before trusting the answer.

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
- q: >-
    a = [1, 2, 2, 2, 3]. What do bisect_left(a, 2) and bisect_right(a, 2) return, and what does bisect_right(a, 4) return?
  options: ["1, 3 and 5: first and last occurrence of 2, and len(a) when absent", "1, 4 and 5: first index >= 2, first index > 2, and len(a) when nothing is greater", "2, 2 and -1: any matching index twice, and -1 when absent", "1, 4 and 4: first index >= 2, first index > 2, and the last valid index when absent"]
  answer: 1
  explanation: >-
    bisect_left returns the first index whose element is >= 2, which is 1; bisect_right returns the first index whose element is > 2, which is 4, one past the last 2. For a value larger than everything both return len(a) = 5, never -1 and never a last valid index. The last occurrence is bisect_right - 1 = 3, not bisect_right itself.
```
