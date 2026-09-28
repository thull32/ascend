---
slug: binary-search
title: "Binary search: find the boundary, not the value"
description: One template, the first-true boundary, that solves exact lookup, rotated arrays, versioned stores, the median partition and every "minimum speed such that" problem; how to recognise the predicate when there is no array, and what bisect and the cache do per probe.
minutes: 45
difficulty: medium
tags: [binary-search, monotone-predicate, search-on-the-answer, pattern:binary-search]
problems: [binary-search-basic, search-2d-matrix, koko-eating-bananas, find-min-rotated, search-rotated, time-based-kv, median-two-sorted, first-bad-version, sqrt-x]
---
You have a range of candidates too large to try one by one, but for any single candidate you can answer a yes/no question, and the answers, laid out across the range, look like `FFFFTTTT`. That shape is the whole pattern. Every binary search problem, whether the statement says "sorted array", "minimum eating speed" or "first bad version", is a search for the index where `F` turns into `T`. Each probe halves the candidates, so a billion candidates need 30 probes; when each probe is an API call that takes a second, that is half a minute, against about sixteen years for a linear scan that on average covers half the range.

Candidates who learn binary search as "find the target in a sorted array" stall when there is no array (Koko's speed is an integer, not an element), when the array is sorted only in pieces (rotated), or when the thing being searched is a *cut* rather than an element (the median of two arrays). Candidates who learn it as a boundary search do not stall: the predicate is the thing they write, and the loop is the thing they never touch. The mechanics and their proofs are in [Binary search](/learn/algorithms/sorting-searching/binary-search) and [Binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer); this lesson is about recognising the predicate under pressure and executing the loop without the off-by-ones.

## The signal

Any one of three things in the statement selects the pattern.

**Sorted input, or sorted in pieces.** "Sorted", "non-decreasing", "a rotated sorted array", "each row is sorted and each row starts after the previous row ends" ([Search a 2D Matrix](/practice/search-2d-matrix)), "timestamps are strictly increasing" ([Time-Based Key-Value Store](/practice/time-based-kv)). Sortedness is monotonicity handed to you.

**A minimum or maximum that satisfies a feasibility condition.** "The minimum speed such that she finishes within `h` hours", "the smallest capacity that ships everything in `d` days", "the largest integer whose square does not exceed `x`" ([Sqrt(x)](/practice/sqrt-x)). The answer is a number, checking one number is cheap, and a bigger number is never worse at satisfying the condition.

**An explicit log hint.** "O(log n)", or "each call is expensive, minimise calls" ([First Bad Version](/practice/first-bad-version)).

Underneath all three is one requirement: a **monotone predicate** over the candidate range, false for a prefix and true for the rest. If you cannot name the predicate and argue in one sentence that it flips exactly once, do not binary search. The sentence to say out loud: "The predicate is `hours(k) ≤ h`. Small `k` fails, and once some `k` succeeds every larger `k` succeeds, so I search for the first true `k`." That sentence is the correctness proof.

### Predicates the statement hides

| Statement | Candidate space | Predicate |
|---|---|---|
| "Minimise the largest …" (split an array into `k` pieces, ship in `d` days) | the value of the largest piece | "can I do it with every piece ≤ `x`?" (greedy check) |
| "Maximise the smallest …" (place cows, gas stations, routers) | the minimum gap | "can I place all with every gap ≥ `x`?"; search the first false, minus one |
| "`k`-th smallest in a sorted matrix or multiplication table" | values, not positions | "at least `k` entries ≤ `x`?" (count with a staircase walk) |
| "Find the rotation point" / "minimum of a rotated array" ([Find Minimum in Rotated](/practice/find-min-rotated)) | indices | `nums[i] ≤ nums[-1]` |
| "Median of two sorted arrays" ([Median of Two Sorted Arrays](/practice/median-two-sorted)) | how many elements the shorter array puts left of the cut | "is `A`'s first right element ≥ `B`'s last left element?" |
| "A peak element", array unsorted | indices | "is the slope going down at `i`?"; each kept half contains a peak |
| "Sorted, but you do not know its length" | indices | probe 1, 2, 4, 8 … until past the target, then bisect (exponential search) |
| "To within 10⁻⁶" | reals | a fixed number of halvings, never an epsilon loop |

### Near misses

| Statement | Needs instead | Why |
|---|---|---|
| Sorted array, find a **pair** with a sum | [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) | Binary search per element works but costs an extra `log n` factor, and interviewers notice |
| Unsorted array, find a value | Hash set | Sorting to enable binary search is `O(n log n)` for an `O(n)` job |
| "`k`-th largest" of an **unsorted** array | Quickselect or a heap of size `k` | One selection, not repeated lookups |
| "Best batch size": throughput rises then falls | Ternary or golden-section search, or a scan | Unimodal, not monotone: the predicate flips twice |
| "Count subarrays with sum `k`" | [Prefix sums](/learn/interview-patterns/array-patterns/prefix-sum) | No single boundary |
| Search a **linked list** or a stream | A scan, or a structure with random access | Probing the middle costs `O(n)` without an index |
| Rows and columns each sorted, no order across rows | Staircase walk from the top-right corner, `O(rows + cols)` | The grid is not one sorted sequence |

## Five decisions before you type

| Problem | Candidates `[lo, hi)` | Predicate (F…F T…T) | Answer | If nothing is true |
|---|---|---|---|---|
| [Binary Search](/practice/binary-search-basic) | indices `[0, n)` | `a[i] ≥ t` | first true, if `a[i] == t` | −1 |
| [First Bad Version](/practice/first-bad-version) | `[1, n + 1)` | `isBad(v)` | first true | cannot happen: `n` is bad |
| [Sqrt(x)](/practice/sqrt-x) | `[0, x + 2)` | `k · k > x` | first true − 1 | cannot happen |
| [Koko Eating Bananas](/practice/koko-eating-bananas) | `[1, max + 1)` | `hours(k) ≤ h` | first true | cannot happen: `h ≥ len(piles)` |
| [Find Minimum in Rotated](/practice/find-min-rotated) | `[0, n)` | `nums[i] ≤ nums[-1]` | `nums[first true]` | cannot happen: `i = n − 1` is true |
| [Time-Based KV](/practice/time-based-kv) `get` | `[0, len)` | `ts[i] > t` | first true − 1 | index −1, return `""` |
| [Median of Two Sorted Arrays](/practice/median-two-sorted) | `[0, m + 1)` | `B[j − 1] ≤ A[i]`, `j = half − i` | cut at first true | cannot happen: `i = m` is true |

The five columns are the five decisions: the candidate space, a half-open range whose `hi` is one past the last candidate, the predicate written so it goes false-then-true, whether the answer is the first true or the one before it, and what "nothing true" means. The last column is where hidden-test failures come from; say it before you code. Maximisation problems ("largest `k` with …") are always "first false, minus one"; you never write a separate last-true loop.

## The template

Search a half-open range `[lo, hi)` for the first index where the predicate is true. The invariant: **everything before `lo` is false, everything at or after `hi` is true**. When `lo == hi` the two regions meet and `lo` is the boundary.

```python
def first_true(lo: int, hi: int, pred) -> int:
    """Smallest i in [lo, hi) with pred(i) True; returns hi if none is.
    pred must be False...False True...True over [lo, hi)."""
    while lo < hi:
        mid = lo + (hi - lo) // 2   # floor; never overflows; lo <= mid < hi
        if pred(mid):
            hi = mid                # mid is true, so the boundary is mid or earlier
        else:
            lo = mid + 1            # mid is false, so the boundary is strictly later
    return lo
```

```javascript
function firstTrue(lo, hi, pred) {
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);  // floor even when lo is negative
    if (pred(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
```

Termination: `mid` is strictly less than `hi` because the midpoint of a non-empty range is floored, so `hi = mid` shrinks the range, and `lo = mid + 1` shrinks it too. Every update keeps the invariant: a true `mid` joins the true region, a false `mid` joins the false region.

The closed-interval exact-match loop is what most people memorise. It is fine, but it has a different invariant (`lo <= hi`, `hi = mid − 1`), and mixing the two styles in one function is the source of most off-by-ones.

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

Watch the exact form work, then the boundary form on an array with duplicates. The boundary form finds the *first* 8, which the exact form cannot promise.

```viz
{"type": "array", "algorithm": "binary-search", "values": [1, 3, 4, 7, 9, 12, 15, 20], "target": 12}
```

```viz
{"type": "array", "algorithm": "binary-search-first-true", "values": [1, 3, 3, 5, 8, 8, 8, 10], "target": 8, "caption": "Predicate: values[i] >= 8. The first true index is 4, the leftmost 8."}
```

| You want | Predicate on `i` | Answer |
|---|---|---|
| First element `≥ t` (lower bound) | `a[i] >= t` | `first_true` |
| First element `> t` (upper bound) | `a[i] > t` | `first_true` |
| Last element `≤ t` | `a[i] > t` | `first_true − 1` (check `≥ lo`) |
| Last element `< t` | `a[i] >= t` | `first_true − 1` |
| Exact match | `a[i] >= t`, then check `a[i] == t` | index or −1 |
| Copies of `t` | upper bound − lower bound | count |
| Minimum feasible answer | `feasible(x)` | `first_true` |
| Maximum feasible answer | `not feasible(x)` | `first_true − 1` |

## Worked problems

### Koko Eating Bananas

[Koko Eating Bananas](/practice/koko-eating-bananas): the minimum integer speed `k` such that eating each pile at `ceil(pile / k)` hours finishes within `h`. Speed is the candidate; faster never takes longer, so `hours(k) ≤ h` is monotone. The range is `[1, max(piles)]`: at `max(piles)` every pile takes one hour, and no faster speed does better.

```python
def min_eating_speed(piles: list[int], h: int) -> int:
    def fast_enough(k: int) -> bool:
        return sum((p + k - 1) // k for p in piles) <= h   # integer ceiling
    return first_true(1, max(piles) + 1, fast_enough)
```

Take `piles = [3, 6, 7, 11]`, `h = 8`: `hours(3) = 10` and `hours(4) = 8`, so the predicate flips between 3 and 4. Search `[1, 12)`:

| `lo` | `hi` | `mid` | `hours(mid)` | `≤ 8`? | Move |
|---|---|---|---|---|---|
| 1 | 12 | 6 | 6 | true | `hi = 6` |
| 1 | 6 | 3 | 10 | false | `lo = 4` |
| 4 | 6 | 5 | 8 | true | `hi = 5` |
| 4 | 5 | 4 | 8 | true | `hi = 4` |
| 4 | 4 | | | | return 4 |

Four predicate evaluations instead of eleven; `O(n log m)` for `n` piles and largest pile `m`. `hi = max(piles) + 1` because the range is half-open: `hi = max(piles)` excludes the answer exactly when `h == len(piles)`. `(p + k − 1) // k` is the integer ceiling; `math.ceil(p / k)` goes through a float and is wrong once `p` passes 2⁵³.

### Search in Rotated Sorted Array

[Search in Rotated Sorted Array](/practice/search-rotated): distinct values, rotated at an unknown pivot; find `target` in `O(log n)`. `nums[mid] < target` is not monotone here. The insight: **at every `mid`, at least one half is sorted**, and `nums[lo] ≤ nums[mid]` tells you which. If the target lies in the sorted half's value range go there, otherwise go to the other half.

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

Trace `nums = [4, 5, 6, 7, 0, 1, 2]`, `target = 0`:

| `lo` | `hi` | `mid` | `nums[mid]` | Sorted half | Target in it? | Move |
|---|---|---|---|---|---|---|
| 0 | 6 | 3 | 7 | left (`4 ≤ 7`) | `4 ≤ 0 < 7`? no | `lo = 4` |
| 4 | 6 | 5 | 1 | left (`0 ≤ 1`) | `0 ≤ 0 < 1`? yes | `hi = 4` |
| 4 | 4 | 4 | 0 | | equals target | return 4 |

The `<=` in `nums[lo] <= nums[mid]` matters: when `lo == mid` the left half is one element and trivially sorted. The alternative many seniors prefer is two boundary searches: the rotation point with predicate `nums[i] ≤ nums[-1]` (that is [Find Minimum in Rotated](/practice/find-min-rotated) exactly), then an ordinary lower bound on the half that can hold the target. Two `O(log n)` passes, no four-way branch.

### Time-Based Key-Value Store

[Time-Based Key-Value Store](/practice/time-based-kv): `set(key, value, t)` arrives with increasing `t` per key; `get(key, t)` returns the value with the largest stored timestamp `≤ t`, or `""`. Per key, keep parallel lists of timestamps and values; they are sorted because they arrive in order. "Largest `≤ t`" is a last-true query: first `> t`, minus one.

```python
from bisect import bisect_right
from collections import defaultdict

class TimeMap:
    def __init__(self):
        self.ts = defaultdict(list)
        self.vals = defaultdict(list)

    def set(self, key: str, value: str, timestamp: int) -> None:
        self.ts[key].append(timestamp)
        self.vals[key].append(value)

    def get(self, key: str, timestamp: int) -> str:
        i = bisect_right(self.ts[key], timestamp) - 1   # last index with ts <= timestamp
        return self.vals[key][i] if i >= 0 else ""
```

For timestamps `[1, 4, 7, 10, 15]` and values `[a, b, c, d, e]`, `get(key, 8)` searches `[0, 5)` with predicate `ts[i] > 8`:

| `lo` | `hi` | `mid` | `ts[mid]` | `> 8`? | Move |
|---|---|---|---|---|---|
| 0 | 5 | 2 | 7 | false | `lo = 3` |
| 3 | 5 | 4 | 15 | true | `hi = 4` |
| 3 | 4 | 3 | 10 | true | `hi = 3` |
| 3 | 3 | | | | first true 3 |

Index `3 − 1 = 2`, value `c`. The edges make the "minus one" honest: `get(key, 0)` gives first true 0, index −1, `""`; `get(key, 20)` gives first true 5, index 4, `e`. `set` is amortised `O(1)`, `get` is `O(log v)` for `v` versions. It is the question a multi-version store answers for every read ("newest version at or before my snapshot"); see [MVCC and locking](/learn/databases/relational-fundamentals/mvcc-and-locking).

### Median of Two Sorted Arrays

[Median of Two Sorted Arrays](/practice/median-two-sorted) hides the predicate best. Take `i` elements from the shorter array `A` (length `m`) into the left half; `B` must supply `j = half − i`, where `half = (m + n + 1) // 2`. The cut is right when everything left is ≤ everything right, which reduces to `A[i − 1] ≤ B[j]` and `B[j − 1] ≤ A[i]`. As `i` grows, `A[i]` grows and `B[j − 1]` shrinks, so `B[j − 1] ≤ A[i]` goes false-then-true: first-true over `i` in `[0, m]`, with `−∞`/`+∞` beyond the ends. At the first true `i`, the predicate was false at `i − 1`, which is exactly `A[i − 1] < B[j]`, so both conditions hold.

```python
def find_median_sorted_arrays(A, B):
    if len(A) > len(B):
        A, B = B, A                       # search the shorter array: keeps j in [0, n]
    m, n = len(A), len(B)
    half = (m + n + 1) // 2
    NEG, POS = float("-inf"), float("inf")

    def cut_ok(i):                        # B[j-1] <= A[i], with sentinels
        j = half - i
        b_left = B[j - 1] if j > 0 else NEG
        a_right = A[i] if i < m else POS
        return b_left <= a_right

    i = first_true(0, m + 1, cut_ok)
    j = half - i
    left_max = max(A[i - 1] if i > 0 else NEG, B[j - 1] if j > 0 else NEG)
    if (m + n) % 2:
        return float(left_max)
    right_min = min(A[i] if i < m else POS, B[j] if j < n else POS)
    return (left_max + right_min) / 2
```

Trace `A = [1, 3, 8, 9, 15]`, `B = [7, 11, 18, 19, 21, 25]`, `half = 6`:

| `lo` | `hi` | `i = mid` | `j` | `B[j − 1]` | `A[i]` | `B[j − 1] ≤ A[i]`? | Move |
|---|---|---|---|---|---|---|---|
| 0 | 6 | 3 | 3 | 18 | 9 | false | `lo = 4` |
| 4 | 6 | 5 | 1 | 7 | +∞ | true | `hi = 5` |
| 4 | 5 | 4 | 2 | 11 | 15 | true | `hi = 4` |
| 4 | 4 | | | | | | cut at `i = 4`, `j = 2` |

The left half is `[1, 3, 8, 9]` from `A` and `[7, 11]` from `B`; the total is odd, so the median is the left maximum, 11. Merged, the arrays are `[1, 3, 7, 8, 9, 11, 15, 18, 19, 21, 25]`, and the sixth element is 11. Three predicate evaluations, `O(log min(m, n))`.

## Variants

| Variant | What changes | Cost |
|---|---|---|
| Maximise ("largest `k` with …") | Search the first false, return it minus one | `O(log R)` probes |
| 2D matrix, rows chained | Index `i` in `[0, R·C)` is cell `(i // C, i % C)` | `O(log RC)` |
| Rows and columns sorted separately | Staircase from the top-right; binary search does not apply | `O(R + C)` |
| Rotated with duplicates | On `nums[lo] == nums[mid] == nums[hi]`, shrink both ends | `O(n)` worst case |
| `k`-th smallest by value | Binary search the value; the predicate counts elements `≤ x` | `O(log V × count cost)` |
| Unknown length or unbounded | Double `hi` until past the target, then bisect | `O(log p)` for answer position `p` |
| Real-valued answer | Fixed 60–100 halvings | constant × predicate |
| Expensive or remote predicate | Same loop; cache results; gallop from a known-good bound | `⌈log₂ n⌉` calls |

## Complexity, derived

With `s = hi − lo` candidates, a true `mid` leaves `mid − lo = ⌊s/2⌋` candidates and a false one leaves `hi − mid − 1 = ⌈s/2⌉ − 1 ≤ ⌊s/2⌋`. The range at least halves each iteration, so the loop runs at most `⌊log₂ s⌋ + 1` times: 10 for a thousand, 20 for a million, 30 for a billion, 60 for 10¹⁸. The total cost is iterations × predicate cost: `O(log n)` for an array lookup, `O(n log R)` when each probe scans the input (Koko, shipping). Anything inside the predicate that does not depend on `mid`, such as a sort, belongs outside the loop.

| Approach to "find `t` or its insertion point" | Per query | Preprocessing | Handles "first ≥ t" | Extra memory | Unknown length |
|---|---|---|---|---|---|
| Linear scan | `O(n)` | none | yes | none | yes |
| Binary search | `O(log n)` | sort, `O(n log n)` | yes | none | with exponential search |
| Hash set | `O(1)` expected | `O(n)` build | no, equality only | `O(n)` | no |
| Interpolation search | `O(log log n)` on uniform keys, `O(n)` worst | sort | yes | none | no |
| B-tree or Eytzinger layout | `O(log n)` with fewer cache misses | build | yes | small | no |

## Under the hood

### What `bisect` does per probe

`bisect.bisect_left(a, x, lo=0, hi=len(a), *, key=None)` is `first_true` with predicate `a[i] >= x`, written in C in `Modules/_bisectmodule.c`. Two facts, both measured on CPython 3.14.7:

- **Only `<` is called.** On a million objects defining nothing but `__lt__`, one `bisect_left` made exactly 20 calls to `__lt__`, one per probe. The C loop computes `mid` with unsigned arithmetic so `lo + hi` cannot overflow, fetches `a[mid]`, and asks whether `a[mid] < x` (or `x < a[mid]` for `bisect_right`).
- **`key` is called on every probe, not cached.** With `key=` (Python 3.10 and later) a search over a million records called the key function 20 times. `x` is passed already in key form. A key that does real work (parsing a date string) is paid `log₂ n` times per search, so precompute a parallel list of keys when you search the same data repeatedly.

`bisect` never checks that the list is sorted, and `insort` does the search and then `list.insert`, which shifts every later element: `O(log n)` to find the slot, `O(n)` to make room.

### What a probe costs at scale

Per-search time on sorted integers with random queries, AMD Ryzen 9 9950X3D, best of several runs:

| `n` | probes | CPython `bisect_left` | CPython loop (`first_true`) | Node 24, `Int32Array` |
|---|---|---|---|---|
| 10³ | 10 | 139 ns | 373 ns | 51 ns |
| 10⁵ | 17 | 201 ns | 650 ns | 97 ns |
| 10⁷ | 24 | 894 ns | 2,194 ns | 200 ns |
| 10⁸ | 27 | — | — | 343 ns |

The probe count grows by a factor of 2.7 from 10³ to 10⁸, while the time per search in Node grows by 6.7. The extra is memory: at 10³ the array sits in L1 and each probe costs about 5 ns, and since each comparison is a coin flip by design the branch predictor cannot help; at 10⁸ the 400 MB array is far beyond the 96 MB L3 cache this machine reports, and the early probes each wait on DRAM. In CPython the effect is larger at 10⁷ because each probe dereferences a pointer to a separate `int` object: 894 ns when the objects were allocated in order, 1,217 ns when the same number of large integers were allocated in random order and then sorted, because the pointer-chase lands on unrelated cache lines. Eytzinger layout and B-trees exist to fix exactly this; the technique lesson covers them.

### JavaScript has no `lower_bound`

The standard library has `indexOf`, `includes` and `findIndex`, all linear. You write the loop yourself, and two details matter. `(lo + hi) >> 1` breaks once `lo + hi` reaches 2³¹, because `>>` converts its operand to a signed 32-bit integer; `lo + Math.floor((hi − lo) / 2)` is exact for every index below 2⁵³. And the default `Array.prototype.sort` compares as strings, so an array "sorted" with `.sort()` is not sorted numerically and every search on it is wrong: `[10, 9, 1].sort()` is `[1, 10, 9]`.

## Failure modes

**A versioned store returns stale values after a deploy.** *Symptom:* `get(key, t)` occasionally returns an older value than one that was definitely written before `t`. *Diagnosis:* writes now come from several hosts, timestamps arrive out of order (clock skew, retries), and `append` no longer keeps the list sorted; `bisect` does not check, so it returns an index that satisfies nothing. *Fix:* `insort` on write (`O(v)` per write) or sort on read, reject out-of-order writes, or use a sorted structure per key; add an assertion that timestamps are non-decreasing.

**The rotated search misses a target that is present.** *Symptom:* `search([1, 0, 1, 1, 1], 0)` returns −1; only inputs with duplicates fail. *Diagnosis:* `nums[lo] ≤ nums[mid]` is `1 ≤ 1`, so the code assumes the left half `[1, 0, 1]` is sorted, sees that 0 is outside `[1, 1)`, and discards it. *Fix:* when `nums[lo] == nums[mid] == nums[hi]`, step `lo` and `hi` inward and accept `O(n)` worst case.

**Koko returns 3 for the sample instead of 4.** *Symptom:* too-small answers. *Diagnosis:* `p // k` instead of a ceiling: at `k = 3` the floor sum is `1 + 2 + 2 + 3 = 8 ≤ 8`, so an infeasible speed looks feasible. *Fix:* `(p + k − 1) // k`; check the predicate by hand at the two values around the expected answer.

**A search over negative candidates hangs in Java, C or Go.** *Symptom:* a first-true over `[−3, −2)` never returns. *Diagnosis:* `(lo + hi) / 2` truncates toward zero, so `(−3 + −2) / 2` is −2, which equals `hi`: `mid` is not strictly below `hi`, and a true predicate sets `hi = mid`, making no progress. *Fix:* `lo + (hi − lo) / 2`, which floors because `hi − lo ≥ 0`. Python's `//` and JavaScript's `Math.floor` floor already.

**Sqrt returns garbage for large `x` in a fixed-width language.** *Symptom:* `mySqrt(2147395600)` is wrong in Java. *Diagnosis:* `mid * mid` overflows `int` once `mid > 46,340`, the square goes negative, and the predicate stops being monotone. *Fix:* compare `mid > x / mid`, or widen to 64 bits; for 64-bit inputs near 10¹⁸, `mid * mid` overflows again, so use division or 128-bit arithmetic.

## Interviewer follow-ups

**"Now the input is a stream."** Model answer: you cannot binary search what you have not stored. If items arrive sorted (TimeMap), append and search; if they arrive in arbitrary order and you need ordered queries, keep a balanced tree or skip list, `O(log n)` insert and search; if the source is sorted but its length is unknown, gallop: probe 1, 2, 4 … and bisect the last interval, `O(log p)`. Common wrong answer: `insort` into a list, which is `O(n)` per insert.

**"Now values can be negative."** Model answer: the predicate is unchanged, but check the midpoint arithmetic: floor division matters, and C-family `/` truncates toward zero. For search on the answer, also recheck that the range covers negative answers (`lo` may need to be below 0). Common wrong answer: "binary search does not care about signs", then a hang on `[−3, −2)`.

**"Now `k` (or the range) is 10¹⁸."** Model answer: 60 probes, so the loop is fine; the risks are in the predicate. `mid * mid` and `mid * count` overflow 64-bit arithmetic, and a linear predicate over 10⁵ items is 6 × 10⁶ steps. In Python integers do not overflow but get slower past 2⁶³. Common wrong answer: "log of 10¹⁸ is big, so switch algorithms".

**"The sorted data is 100 GB on SSD."** Model answer: 100 GB of 8-byte keys is about 1.25 × 10¹⁰ keys, so 34 probes; the last nine share one 4 KB page, leaving about 25 random page reads of order 100 µs each, a few milliseconds per lookup; a B-tree with a few hundred keys per page answers in 3–4 page reads, and its top levels stay in memory ([B-trees](/learn/advanced-data-structures/balanced-trees/b-trees-and-b-plus-trees)). Common wrong answer: "still log n, so still fast".

**"The rotated array may contain duplicates. What is the complexity?"** Model answer: when both ends and the middle are equal nothing tells you where the pivot is; shrink both ends and accept `O(n)` worst case, as on all 1s with a single 0. Common wrong answer: claiming `O(log n)` by discarding a half on a tie, which can discard the target.

## What mid-level engineers get wrong

- **Writing the loop before naming the predicate.** Consequence: a comparison that is not monotone (rotated arrays) and a bug they cannot locate.
- **Mixing half-open and closed conventions.** Consequence: `hi = mid − 1` inside a `lo < hi` loop skips the boundary.
- **Writing a separate last-true loop.** Consequence: `lo = mid` with a floored `mid` hangs on a two-element range; searching the first false and stepping back avoids the case.
- **Guessing the answer range.** Consequence: too small is wrong on exactly the edge input (`hi = max(piles)` without `+ 1`); too large is only slower, so err large.
- **Ignoring the "nothing true" return.** Consequence: indexing one past the end, or returning `hi` as an answer to an infeasible instance.
- **Trusting `bisect` on data they did not sort.** Consequence: silent wrong answers, with no exception ever raised.

## Exercises

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

```exercise
id: search-rotated-with-duplicates
title: Search a rotated array that may contain duplicates
prompt: |
  `nums` was sorted in non-decreasing order and then rotated at an unknown
  pivot, and it may contain repeated values. Return true if `target` occurs
  in `nums`, false otherwise.

  Use the "one half is sorted" rule, and decide what to do when
  `nums[lo]`, `nums[mid]` and `nums[hi]` are all equal, since then neither
  half is known to be sorted. O(log n) when values are distinct; O(n) in
  the worst case is expected with duplicates.
languages: [python, javascript]
entry: search_rotated_dups
starter:
  python: |
    def search_rotated_dups(nums, target):
        # your code here
        return False
  javascript: |
    function search_rotated_dups(nums, target) {
      // your code here
      return false;
    }
tests:
  - args: [[2, 5, 6, 0, 0, 1, 2], 0]
    expected: true
  - args: [[2, 5, 6, 0, 0, 1, 2], 3]
    expected: false
  - args: [[1, 0, 1, 1, 1], 0]
    expected: true
    label: ends and middle equal, target in the left half
  - args: [[], 5]
    expected: false
    label: empty input
  - args: [[1], 0]
    expected: false
  - args: [[1, 1, 1, 1, 1, 1, 1, 2, 1, 1], 2]
    expected: true
    hidden: true
  - args: [[1, 3, 1, 1, 1], 3]
    expected: true
    hidden: true
  - args: [[3, 1], 1]
    expected: true
    hidden: true
hints:
  - "If nums[mid] == target you are done. If nums[lo] == nums[mid] == nums[hi], you learn nothing: move lo up and hi down by one and continue."
  - "Otherwise if nums[lo] <= nums[mid] the left half is sorted: go left when nums[lo] <= target < nums[mid], else go right."
  - "If the left half is not sorted, the right half is: go right when nums[mid] < target <= nums[hi], else go left."
```

## Senior signals

- You name the **predicate** and say why it flips exactly once before writing a loop; that sentence is the proof, and it turns rotated arrays, the median cut and search-on-the-answer into the same problem.
- You use **one loop shape** (half-open, first true) and derive lower bound, upper bound, last true and exact match from it.
- You state the **five decisions** out loud, especially the candidate range and what "nothing true" returns.
- You spot **hidden predicates**: minimise-the-maximum, maximise-the-minimum, `k`-th smallest by value, the median partition.
- You know what a probe costs: 20 `__lt__` calls and 20 key calls for a million-element `bisect`, and a per-search time that grows faster than `log n` once the array leaves cache.
- You name the degradations before the interviewer does: duplicates make the rotated search `O(n)`, C-family `/` breaks the midpoint on negatives, and fixed-width products overflow inside the predicate.

## Check yourself

```quiz
- q: >-
    In the loop while lo < hi: mid = lo + (hi - lo) // 2; if pred(mid): hi = mid else: lo = mid + 1, which single change causes an infinite loop on some inputs?
  options: ["Returning hi instead of lo after the loop ends", "Changing lo = mid + 1 to lo = mid on a false", "Changing hi = mid to hi = mid - 1 on a true", "Computing mid as (lo + hi) // 2 in Python"]
  answer: 1
  explanation: >-
    With a floored midpoint and a two-element range, mid equals lo, so lo = mid makes no progress and the loop never exits. hi = mid - 1 is wrong (it can skip the boundary) but still terminates, (lo + hi) // 2 floors identically in Python, and returning hi is fine because lo == hi at exit.
- q: >-
    A sorted array contains duplicates and you need the index of the last element that is <= t. Which search do you write?
  options: ["Predicate a[i] <= t, return the first true index as it is", "Predicate a[i] == t, return the index where it first holds", "Predicate a[i] >= t, return the first true index minus one", "Predicate a[i] > t, return the first true index minus one"]
  answer: 3
  explanation: >-
    a[i] > t is false for a prefix and true afterwards, so first-true is well defined, and the element just before it is the last one <= t. a[i] >= t minus one lands on the last element < t, one short of a run equal to t. a[i] <= t is true-then-false, the wrong shape for a first-true search.
- q: >-
    In Median of Two Sorted Arrays, you search i over [0, m] with predicate B[j-1] <= A[i], where j = half - i. Why is this predicate false-then-true?
  options: ["Because A is the shorter array, every cut beyond the median is valid", "As i grows, A[i] and B[j-1] both rise, so the gap between them keeps shrinking", "Because the merged array is sorted, every predicate on a cut is monotone", "As i grows, A[i] rises and B[j-1] falls, so once it holds it keeps holding"]
  answer: 3
  explanation: >-
    Moving the cut right in A takes a larger A[i] and forces j down, so B[j-1] is a smaller element; the inequality can only go from false to true. At the first true i, the predicate was false at i - 1, which means A[i-1] < B[j], so both partition conditions hold. Searching the shorter array keeps j in range; it does not make the predicate monotone.
- q: >-
    bisect_left runs on a list of one million objects whose class defines only __lt__, with key=None. How many comparisons does one search make, and which?
  options: ["About 40 calls to __lt__, since each probe tests both directions", "It raises TypeError, because bisect needs __le__ and __eq__ too", "About 20 calls each to __lt__ and __eq__, to detect exact matches", "About 20 calls to __lt__, one per probe of the halving loop"]
  answer: 3
  explanation: >-
    The C loop asks one question per probe, whether a[mid] < x, and log2 of a million is about 20; a measured run made exactly 20 __lt__ calls. bisect never tests equality, which is why it returns an insertion point rather than a found flag, and it needs no other comparison methods.
- q: >-
    A search for the first true candidate over [-3, -2) hangs in Java but not in Python. The midpoint is written (lo + hi) / 2. Why?
  options: ["Python's // rounds up for negatives, which happens to skip the stuck case", "Java's int overflows when adding two negatives, so mid becomes a huge positive", "Java evaluates the predicate lazily, so the true branch is never taken here", "Java's / truncates toward zero, so mid is -2, equal to hi, and hi = mid stalls"]
  answer: 3
  explanation: >-
    (-3 + -2) / 2 is -2.5, which Java truncates to -2, the value of hi, so mid is not strictly below hi and a true predicate sets hi to itself forever. Python's // floors to -3 (it rounds down, not up), keeping lo <= mid < hi. Writing lo + (hi - lo) / 2 floors in every language because hi - lo is non-negative. No overflow happens at these magnitudes.
- q: >-
    On the same machine, a JavaScript binary search takes 51 ns per lookup on 10^3 sorted integers and 343 ns on 10^8, although the probe count rises only from 10 to 27. What explains the rest?
  options: ["The JIT deoptimises the loop for large arrays, which runs it in the interpreter", "Later probes miss the caches once the array outgrows them, and wait on DRAM", "Math.floor becomes slow past 2^31, which penalises every midpoint calculation", "Typed arrays above 10^7 elements are paged to disk by the engine on demand"]
  answer: 1
  explanation: >-
    Small arrays sit in L1 and each probe costs a few nanoseconds, mostly a mispredicted branch. A 400 MB array exceeds the 96 MB L3, so the early probes, which jump far apart, each wait on main memory. Layouts such as Eytzinger order or B-tree nodes reduce those misses. Nothing about the JIT, Math.floor or paging explains it.
```
