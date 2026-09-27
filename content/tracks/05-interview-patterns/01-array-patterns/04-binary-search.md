---
slug: binary-search
title: "Binary search: find the boundary, not the value"
description: One template, the first-true boundary, that solves exact lookup, rotated arrays, versioned stores and every "minimum speed such that" problem, plus the invariant that keeps you off the off-by-one.
minutes: 32
difficulty: medium
tags: [binary-search, monotone-predicate, search-on-the-answer, pattern:binary-search]
problems: [binary-search-basic, search-2d-matrix, koko-eating-bananas, find-min-rotated, search-rotated, time-based-kv, median-two-sorted, first-bad-version, sqrt-x]
---
You have a range of candidates too large to try one by one, but for any single candidate you can answer a yes/no question, and the answers, laid out across the range, look like `FFFFTTTT`. That shape is the whole pattern. Every binary search problem, whether the statement says "sorted array", "minimum eating speed" or "first bad version", is a search for the index where `F` turns into `T`. Once you see a problem that way the loop is the same eleven lines every time; only the predicate changes.

Candidates who learn binary search as "find the target in a sorted array" stall when there is no array (Koko's speed is an integer, not an element) or when the array is only sorted in pieces (rotated). Candidates who learn it as a boundary search do not stall, because the predicate is the thing they write and the loop is the thing they never touch. This lesson builds that habit on top of the mechanics from [Binary search](/learn/algorithms/sorting-searching/binary-search) and [Binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer).

## The signal

Any one of three things in the statement selects the pattern.

**Sorted input, or sorted in pieces.** "Sorted", "non-decreasing", "a rotated sorted array", "each row is sorted and the first element of each row is greater than the last of the previous row" ([Search a 2D Matrix](/practice/search-2d-matrix)), "timestamps are strictly increasing" ([Time-Based Key-Value Store](/practice/time-based-kv)). Sortedness is monotonicity handed to you.

**A minimum or maximum that satisfies a feasibility condition.** "The minimum speed such that she finishes within `h` hours", "the smallest capacity that ships everything in `d` days", "the largest integer whose square does not exceed `x`" ([Sqrt(x)](/practice/sqrt-x)). The answer is a number, checking one number is cheap, and a bigger number is never worse at satisfying the condition. This is binary search on the answer, and it is the version that mid-level candidates miss because there is no array in sight.

**An explicit log hint.** "O(log n)", or "the API call is expensive, minimise the number of calls" ([First Bad Version](/practice/first-bad-version)).

Underneath all three is a single requirement: a **monotone predicate** over the candidate range, false for a prefix and true for the rest (or the reverse). If you cannot name the predicate and argue in one sentence that it flips exactly once, do not binary search. That test also rules out the neighbours you might confuse it with:

- Sorted array, but you need a *pair* with a property ([Two Sum II](/practice/two-sum-sorted), [3Sum](/practice/three-sum)): two pointers. Binary searching per element works but costs an extra log factor and interviewers notice.
- Unsorted array, need an element by value: hash map. Sorting first to enable binary search is O(n log n) for an O(n) job.
- "Count the subarrays such that": sliding window or prefix sums. There is no single boundary.
- A minimum over a space where feasibility is not monotone (adding capacity can make things worse, or the answer is a sequence rather than a number): DP or greedy.

The senior habit is to say the predicate before writing code. "The predicate is `hours_needed(k) <= h`. Small `k` fails, and once some `k` succeeds every larger `k` succeeds too, so I binary search for the first true `k`." That sentence is the correctness argument, and the interviewer hears it as one.

## The template

Search a half-open range `[lo, hi)` for the first index where the predicate is true. The invariant that the loop maintains: **everything before `lo` is false, everything at or after `hi` is true**. When `lo == hi` the two halves meet and `lo` is the boundary.

```python
def first_true(lo: int, hi: int, pred) -> int:
    """Smallest i in [lo, hi) with pred(i) True; returns hi if none is.
    pred must be False...False True...True over [lo, hi)."""
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if pred(mid):
            hi = mid          # mid is true, so the boundary is mid or earlier
        else:
            lo = mid + 1      # mid is false, so the boundary is strictly later
    return lo
```

```javascript
function firstTrue(lo, hi, pred) {
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
```

Termination is worth being able to argue: `mid` is always strictly less than `hi` (floor of a midpoint of a non-empty range), so `hi = mid` shrinks the range, and `lo = mid + 1` shrinks it too. The range loses at least one element per iteration and at most halves in size, so the loop runs about `log2(hi - lo)` times.

Every other binary search is this function with a different predicate. The classic exact-match form is what most people memorise; it is fine, but note that it has a different invariant (closed interval, `lo <= hi`) and that mixing the two styles in one function is the source of most off-by-one bugs.

```python
def exact(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1          # closed interval [lo, hi]
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

```javascript
function exact(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] === target) return mid;
    if (nums[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
```

Watch the exact-match form work, then the boundary form on an array with duplicates. The boundary form finds the *first* 8, which the exact-match form cannot promise.

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 4, 7, 9, 12, 15, 20], "target": 12}
```

```viz
{"type": "array", "algorithm": "binary-search-first-true", "values": [1, 3, 3, 5, 8, 8, 8, 10], "target": 8, "caption": "Predicate: values[i] >= 8. The first true index is 4, the leftmost 8."}
```

The boundary form derives every variant you will meet:

| You want | Predicate on `i` | Answer |
|---|---|---|
| First element `>= t` (lower bound) | `a[i] >= t` | `first_true` |
| First element `> t` (upper bound) | `a[i] > t` | `first_true` |
| Last element `<= t` | `a[i] > t` | `first_true - 1` (check `>= lo`) |
| Exact match | `a[i] >= t`, then check `a[i] == t` | index or `-1` |
| Number of copies of `t` | upper bound minus lower bound | count |
| Minimum feasible answer | `feasible(x)` | `first_true` over the answer range |
| Maximum feasible answer | `not feasible(x)` | `first_true - 1` |

The "last true" rows are the ones to memorise. You never write a separate last-true loop (which needs `mid` rounded *up* to avoid an infinite loop); you search for the first false and step back one.

## Worked problems

### Koko Eating Bananas

[Koko Eating Bananas](/practice/koko-eating-bananas): given pile sizes and `h` hours, find the minimum integer speed `k` (bananas per hour) such that eating each pile at `ceil(pile / k)` hours finishes within `h`.

The key insight is that speed is the candidate and `hours(k) <= h` is the predicate. Faster never takes longer, so the predicate is monotone. The candidate range is `[1, max(piles)]`: at speed `max(piles)` every pile takes one hour and no faster speed can improve on that, so nothing above it can be the minimum.

Take `piles = [3, 6, 7, 11]`, `h = 8`. First compute `hours(k)` so the trace is checkable: `hours(1) = 27`, `hours(2) = 15`, `hours(3) = 10`, `hours(4) = 8`, `hours(5) = 8`, `hours(6) = 6`. The predicate flips between 3 and 4.

Search `[lo, hi) = [1, 12)`:

| `lo` | `hi` | `mid` | `hours(mid)` | `<= 8`? | Move |
|---|---|---|---|---|---|
| 1 | 12 | 6 | 6 | true | `hi = 6` |
| 1 | 6 | 3 | 10 | false | `lo = 4` |
| 4 | 6 | 5 | 8 | true | `hi = 5` |
| 4 | 5 | 4 | 8 | true | `hi = 4` |
| 4 | 4 | | | | stop, return 4 |

Four predicate evaluations instead of eleven. Time is `O(n log m)` where `n` is the number of piles and `m` is the largest pile: each predicate evaluation walks all piles, and there are `log m` of them. Space `O(1)`.

```python
import math

def min_eating_speed(piles: list[int], h: int) -> int:
    def fast_enough(k: int) -> bool:
        return sum(math.ceil(p / k) for p in piles) <= h
    return first_true(1, max(piles) + 1, fast_enough)
```

Say the bound out loud: `hi = max(piles) + 1` because the range is half-open. Setting `hi = max(piles)` excludes the correct answer whenever `h == len(piles)`.

### Search in Rotated Sorted Array

[Search in Rotated Sorted Array](/practice/search-rotated): a sorted array of distinct integers has been rotated at an unknown pivot (`[4, 5, 6, 7, 0, 1, 2]`); find the index of `target` in `O(log n)`.

The plain comparison `nums[mid] < target` is not a monotone predicate here, so the exact-match loop cannot be used as is. The insight is that **at every `mid`, at least one half is properly sorted**, and you can tell which by comparing `nums[lo]` with `nums[mid]`. If the target lies inside the sorted half's value range, go there; otherwise go to the other half. That restores a decision that shrinks the range by half.

Trace `nums = [4, 5, 6, 7, 0, 1, 2]`, `target = 0`, closed interval:

| `lo` | `hi` | `mid` | `nums[mid]` | Sorted half | Target in it? | Move |
|---|---|---|---|---|---|---|
| 0 | 6 | 3 | 7 | left (`4 <= 7`) | `4 <= 0 < 7`? no | `lo = 4` |
| 4 | 6 | 5 | 1 | left (`0 <= 1`) | `0 <= 0 < 1`? yes | `hi = 4` |
| 4 | 4 | 4 | 0 | | equals target | return 4 |

```python
def search_rotated(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:                    # left half sorted
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:                                        # right half sorted
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1
```

The alternative that many seniors prefer is two boundary searches: find the rotation point with the predicate `nums[i] <= nums[-1]` (false for the large prefix, true from the pivot on; that is [Find Minimum in Rotated Sorted Array](/practice/find-min-rotated) exactly), then run an ordinary lower bound on whichever sorted half contains the target. It is two `O(log n)` passes with no four-way branch to get wrong, and it demonstrates that you see the rotation as a boundary too.

Time `O(log n)`, space `O(1)`. The `<=` in `nums[lo] <= nums[mid]` matters: when `lo == mid` (a two-element range) the left "half" is one element and is trivially sorted.

### Time-Based Key-Value Store

[Time-Based Key-Value Store](/practice/time-based-kv): `set(key, value, timestamp)` is called with strictly increasing timestamps per key; `get(key, timestamp)` returns the value with the largest stored timestamp `<= timestamp`, or `""`.

The store is a hash map from key to two parallel lists (timestamps and values), and the timestamps are sorted because they arrive in order, so no sorting is ever needed. The insight is that "largest timestamp `<= t`" is a **last-true** query, which you answer as "first `> t`, minus one".

For key `"foo"` with timestamps `[1, 4, 7, 10, 15]` and values `[a, b, c, d, e]`, `get("foo", 8)` searches `[0, 5)` with predicate `ts[i] > 8`:

| `lo` | `hi` | `mid` | `ts[mid]` | `> 8`? | Move |
|---|---|---|---|---|---|
| 0 | 5 | 2 | 7 | false | `lo = 3` |
| 3 | 5 | 4 | 15 | true | `hi = 4` |
| 3 | 4 | 3 | 10 | true | `hi = 3` |
| 3 | 3 | | | | stop; first true is 3 |

The answer index is `3 - 1 = 2`, value `c` (stored at time 7). Two edge cases make the "minus one" honest: `get("foo", 0)` finds first true at index 0, so the answer index is `-1` and you return `""`; `get("foo", 20)` finds first true at 5 (nothing is greater), so the answer index is 4, value `e`.

```python
from collections import defaultdict

class TimeMap:
    def __init__(self):
        self.ts = defaultdict(list)
        self.vals = defaultdict(list)

    def set(self, key: str, value: str, timestamp: int) -> None:
        self.ts[key].append(timestamp)
        self.vals[key].append(value)

    def get(self, key: str, timestamp: int) -> str:
        t = self.ts[key]
        i = first_true(0, len(t), lambda m: t[m] > timestamp) - 1
        return self.vals[key][i] if i >= 0 else ""
```

`set` is amortised `O(1)`, `get` is `O(log k)` for `k` versions of that key. In Python `bisect.bisect_right(t, timestamp) - 1` is the same search; naming it as a library call is a small senior signal, as long as you can also write the loop.

## Variations

**Maximise instead of minimise.** [Sqrt(x)](/practice/sqrt-x) asks for the largest `k` with `k * k <= x`. Do not write a "last true" loop. Search for the first `k` with `k * k > x` and return `k - 1`. The same trick handles "maximum side length", "largest capacity that still fails" and any other upper boundary.

**Two dimensions that are really one.** [Search a 2D Matrix](/practice/search-2d-matrix) gives a grid whose rows are sorted and whose row starts are increasing. Treat index `i` in `[0, rows * cols)` as the cell `(i // cols, i % cols)` and the grid is a sorted array. If only rows and columns are individually sorted (no promise across rows), that is a different problem, solved with the staircase walk from the top-right corner in `O(rows + cols)`.

**Duplicates in a rotated array.** With duplicates, `nums[lo] == nums[mid] == nums[hi]` gives no information about which half is sorted. The fix is `lo += 1; hi -= 1` in that case, which is correct but makes the worst case `O(n)` (an array of all 1s with one 2). Say that trade-off out loud; it is the follow-up.

**Binary search on a partition.** [Median of Two Sorted Arrays](/practice/median-two-sorted) hides the predicate well. Choose `i` elements from the shorter array `A` for the left half; the longer array must then contribute `j = (m + n + 1) // 2 - i`. The partition is correct when `A[i-1] <= B[j]` and `B[j-1] <= A[i]`. The predicate `A[i-1] <= B[j]` is monotone in `i` (taking more from `A` makes its last-left element larger), so you search `i` in `[0, m]` for the first `i` that satisfies it. Searching the shorter array keeps `j` within bounds. It is `O(log(min(m, n)))` and it is hard mostly because of the sentinel handling at `i = 0` and `i = m`.

**Predicate with side effects or cost.** [First Bad Version](/practice/first-bad-version) makes the predicate an API call. The template already minimises calls (`ceil(log2 n)` of them; about 30 for a billion versions). The variation an interviewer adds is caching or a rate limit, and the answer is that binary search is already the optimal comparison-based strategy; only a prior about where the bad version likely is (interpolation search) can beat it in expectation.

**Floating-point answers.** "Find the speed to within 1e-6" replaces the integer loop with a fixed number of iterations (about 100 halvings covers any double range) or a `while hi - lo > eps` loop. Never test floats for equality.

## Pitfalls

- **`lo = mid` with a floored midpoint.** When the range is two elements, `mid == lo` and `lo = mid` makes no progress: the loop never ends. This is why the template only ever writes `lo = mid + 1`, and why "last true" is searched as "first false minus one". If you must write `lo = mid`, round the midpoint up: `mid = lo + (hi - lo + 1) // 2`.
- **Half-open upper bound off by one.** In the boundary form `hi` is *one past* the largest candidate. `first_true(1, max(piles), ...)` silently excludes `max(piles)` and returns a wrong answer only on inputs where that is the answer, which is exactly the kind of bug that survives your own tests.
- **Sentinel confusion.** `first_true` returns `hi` when nothing is true. Every caller must decide what that means: `-1` for exact match, `""` for the time map, "infeasible" for search-on-the-answer. Forgetting the check indexes one past the end.
- **Overflow in `(lo + hi) / 2`.** Irrelevant in Python and safe in JavaScript below 2^53, but in Java, C++, Go and Rust `lo + hi` overflows for large arrays. Write `lo + (hi - lo) / 2` everywhere so the habit is there when it matters. In JavaScript `(lo + hi) >>> 1` is fine only below 2^31.
- **A predicate that is not monotone.** Using `nums[mid] < target` on a rotated array, or `hours(k) <= h` when `hours` is computed with integer division instead of ceiling (which makes small speeds look feasible). Check the predicate on the two ends of the range before trusting the search.
- **Wrong candidate range for search-on-the-answer.** Koko's `hi` is the largest pile, not `h` and not the total. A range that is too small misses the answer; one that is too large (the total) is merely slower, so when in doubt err large and then tighten.
- **Using `bisect` without knowing which side.** `bisect_left` is lower bound, `bisect_right` is upper bound. `bisect_right(t, x) - 1` is "last `<= x`"; `bisect_left(t, x) - 1` is "last `< x`". Mixing them up is off-by-one on duplicates only, so tests without duplicates will not catch it.

## Exercise

```exercise
id: min-ship-capacity
title: Minimum ship capacity
prompt: |
  Packages must be shipped in the given order, one ship per day, and the ship
  has a fixed weight capacity. Return the minimum capacity such that all
  packages are shipped within `days` days.

  `weights` is non-empty and `1 <= days <= len(weights)`. Aim for
  O(n log S) where S is the total weight: binary search the capacity and
  write a greedy `feasible(capacity)` check.
languages: [python, javascript]
entry: min_capacity
starter:
  python: |
    def min_capacity(weights, days):
        def feasible(cap):
            # count the days needed with this capacity, greedily filling each day
            return True

        lo, hi = max(weights), sum(weights)
        # binary search for the first feasible capacity in [lo, hi]
        return lo
  javascript: |
    function min_capacity(weights, days) {
      function feasible(cap) {
        // count the days needed with this capacity, greedily filling each day
        return true;
      }
      let lo = Math.max(...weights), hi = weights.reduce((a, b) => a + b, 0);
      // binary search for the first feasible capacity in [lo, hi]
      return lo;
    }
tests:
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5]
    expected: 15
  - args: [[3, 2, 2, 4, 1, 4], 3]
    expected: 6
  - args: [[1, 2, 3, 1, 1], 4]
    expected: 3
    label: answer equals the heaviest package
  - args: [[7], 1]
    expected: 7
    label: single package
  - args: [[5, 5, 5, 5], 4]
    expected: 5
    hidden: true
  - args: [[5, 5, 5, 5], 1]
    expected: 20
    hidden: true
    label: one day, must carry everything
  - args: [[10, 1, 1, 1, 10], 2]
    expected: 12
    hidden: true
    label: the split point is not at the largest package
hints:
  - "The lower bound is the heaviest single package (it must fit on some day); the upper bound is the total weight (one day carries all)."
  - "feasible(cap): walk the packages, start a new day whenever adding the next package would exceed cap, and compare the day count to days."
  - "Feasibility is monotone in capacity, so search for the first capacity where feasible is true."
```

## Senior signals

- You name the **predicate** before writing the loop, and you state in one sentence why it flips exactly once. That is the correctness proof, and it is what makes the rotated-array and search-on-the-answer variants routine.
- You use one loop shape (half-open, first-true) and derive lower bound, upper bound, last-true and exact match from it, instead of carrying four slightly different loops in your head.
- You can explain **why `lo = mid` hangs** and why the fix is either rounding the midpoint up or searching for the first false instead.
- You state the candidate range and its justification for search-on-the-answer problems (`max(piles)` for Koko, `[0, m]` for the median partition), and you know that a range that is too large is slow while a range that is too small is wrong.
- You know that duplicates turn the rotated-array search into `O(n)` worst case and say so before the interviewer asks.
- You reach for `bisect` / a library lower bound in production and can say which side of a run of duplicates each call lands on.

## Check yourself

```quiz
- q: >-
    In the loop `while lo < hi: mid = lo + (hi - lo) // 2; if pred(mid): hi = mid else: lo = mid + 1`, which single change causes an infinite loop on some inputs?
  options: ["Returning `hi` instead of `lo`", "Changing `mid` to `(lo + hi) // 2`", "Changing `hi = mid` to `hi = mid - 1`", "Changing `lo = mid + 1` to `lo = mid`"]
  answer: 3
  explanation: >-
    With a floored midpoint and a two-element range, mid equals lo, so `lo = mid` makes no progress and the loop never exits. `hi = mid - 1` is merely wrong (it can skip the boundary), and `(lo + hi) // 2` is the same value in Python; returning `hi` is fine since `lo == hi` at exit.
- q: >-
    A sorted array contains duplicates and you need the index of the last element that is `<= t`. Which search do you write?
  options: ["Predicate `a[i] >= t`, return the first true index minus one", "Predicate `a[i] > t`, return the first true index minus one", "Predicate `a[i] == t`, return the index where it first holds", "Predicate `a[i] <= t`, return the first true index"]
  answer: 1
  explanation: >-
    `a[i] > t` is false for a prefix and true afterwards, so first-true is well defined; the element just before it is the last `<= t`. `a[i] >= t` minus one lands on the last element `< t`, one short of a run of values equal to t. `a[i] <= t` is true-then-false, the wrong shape for a first-true search.
- q: >-
    You are searching a rotated sorted array that may contain duplicates and hit `nums[lo] == nums[mid] == nums[hi]`. What is the honest statement about complexity?
  options: ["It becomes O(log² n), since each tie costs one extra binary search", "It stays O(log n) as long as you discard the right half on a tie", "No half is known to be sorted; shrink both ends and accept O(n)", "Sort the array first, then run an ordinary O(log n) binary search"]
  answer: 2
  explanation: >-
    Equal values at both ends and the middle carry no information about where the pivot lies, so no half can be safely discarded. Stepping both ends inward is correct, and on an array like all 1s with a single 2 it degrades to a linear scan. Discarding a half on a tie can throw away the target, and sorting costs O(n log n) and destroys the indices.
- q: >-
    For Koko Eating Bananas, what is the tightest correct upper bound on the speed to search?
  options: ["`len(piles)`, the number of piles", "`max(piles)`, the largest pile size", "`sum(piles)`, the total banana count", "`h`, the number of hours available"]
  answer: 1
  explanation: >-
    At speed `max(piles)` every pile takes one hour, and no larger speed can reduce that, so the minimum feasible speed is at most `max(piles)`. The total also works but wastes iterations. `h` and `len(piles)` are unrelated to speed and can exclude the answer.
- q: >-
    First Bad Version has one billion versions and each `isBadVersion` call takes a second. Roughly how long does the search take?
  options: ["About 30 seconds", "About 1,000 seconds", "About 10⁶ seconds", "About 5 × 10⁸ seconds"]
  answer: 0
  explanation: >-
    Binary search makes about log2(10^9) ≈ 30 predicate calls. A linear scan from either end is the 5 × 10⁸-second answer, and there is no comparison-based strategy that beats log n in the worst case.
- q: >-
    In Median of Two Sorted Arrays, why binary search over the shorter array's partition index rather than the longer one's?
  options: ["To keep the extra memory for the partition arrays smaller", "So the derived index in the longer array always stays in bounds", "It has a smaller constant factor per iteration of the loop", "Because only the shorter array is guaranteed to be sorted"]
  answer: 1
  explanation: >-
    The longer array's cut is `j = (m + n + 1) // 2 - i`. If `i` ranges over the shorter array of length `m`, then `j` stays between 0 and `n` inclusive; if you iterated over the longer array instead, `j` could go negative. Both arrays are sorted and memory is O(1) either way.
```
