---
slug: prefix-sum
title: "Prefix sums: precompute once, answer every range in O(1)"
description: How to spot a prefix-sum problem (including the ones that need a transform first), choose between the array, count-map and first-index forms, and execute Range Sum Query, Find Pivot Index, Subarray Sum Equals K and Product of Array Except Self with full traces.
minutes: 45
difficulty: medium
tags: [prefix-sum, arrays, range-queries, hash-map, pattern:prefix-sum]
problems: [subarray-sum-equals-k, range-sum-query-immutable, find-pivot-index, product-except-self]
---
You are asked for the sum of `nums[i..j]`, and then asked again for a different `i` and `j`, thousands of times. Each query is a loop over the range. Even with CPython's C-level `sum()` over a slice, 2,000 random range queries on a 10⁵-element list took 867 ms on the machine this lesson was measured on, 433 µs per query; the prefix-array version answered each in 33 ns, a factor of about 13,000. Or you are asked how many contiguous subarrays sum to exactly `k`, and the array holds negative numbers, so a sliding window cannot shrink safely. Or which index has the same total on its left as on its right.

All three are one idea. Spend one `O(n)` pass computing running totals, and every range sum becomes the difference of two stored numbers. The hash-map extension goes further: "how many subarrays sum to `k`" becomes "how many earlier running totals equal the current one minus `k`", which a dictionary answers in `O(1)`. That turns a problem that looks quadratic into six lines.

The mechanics (the telescoping identity, remainder buckets, XOR and parity-mask prefixes, 2D tables, difference arrays) are taught in [Prefix sums and difference arrays](/learn/data-structures/arrays-strings/prefix-sums-and-difference-arrays) and [Prefix sums and hashing tricks](/learn/algorithms/technique-mastery/prefix-sums-and-hashing-tricks). This lesson is about the interview: reading the signal, including the problems that need a transform before the prefix appears, choosing the form, and typing it without the three classic off-by-ones.

## The signal

Reach for prefix sums when the statement has any of these:

- **Many range aggregates on data that does not change**: "sum of `nums[i..j]`" asked `q` times. With one query, a loop is optimal. The build costs `n` additions, and a random range averages `n/3` elements, so the table pays for itself from about the third query.
- **"How many subarrays"** have a sum, XOR or count **exactly equal** to a target, or **divisible by** `k`. Equality is the word that selects the hash map.
- **"Longest subarray"** with an exact sum, especially when values can be **negative**. Negatives are the tell that a window is out.
- **"Left total equals right total"**: pivot, equilibrium, "split into parts with equal sums".
- **"Everything except `i`"**: a prefix from the left combined with a suffix from the right.
- **An operation with an inverse**: sum (subtraction), XOR (itself), counts. The query is `P[j + 1] ⊖ P[i]`.

### Prefixes the statement hides

The most valuable signals are statements that become "subarray sum equals `k`" after one transform:

| Statement | Transform | Then |
|---|---|---|
| "Longest subarray with equal numbers of 0s and 1s" | Map 0 → −1 | Longest subarray with sum 0 |
| "Number of subarrays with exactly `k` odd numbers" | Map odd → 1, even → 0 | Count subarrays with sum `k` |
| "Number of queries: how many vowels in `s[l..r]`?" | Map vowel → 1 | Range sum per query |
| "Fewest elements removed from the two ends so the removed total is `x`" | Removed ends ⇔ kept middle | Longest subarray with sum `total − x` |
| "Longest substring where every vowel appears an even number of times" | One parity bit per vowel, XOR prefix | Longest subarray whose XOR prefix repeats |
| "Apply `m` range increments, then read the array" | Difference array | One prefix pass at the end |

### Near misses

| Statement | Needs instead | Why |
|---|---|---|
| Range sums **with point updates** between queries | [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees) | One update invalidates every later prefix, an `O(n)` rebuild |
| Range **minimum or maximum** | Sparse table, segment tree, or a deque for sliding ranges | `min` has no inverse, so two prefix minima cannot be subtracted |
| Longest subarray with sum ≤ `k`, **values non-negative** | [Sliding window](/learn/interview-patterns/array-patterns/sliding-window) | Works and uses `O(1)` space; prefixes work too but cost `O(n)` |
| Longest subarray with sum ≤ `k`, **negatives allowed** | Prefix sums + binary search on the running prefix maximum, `O(n log n)` | An inequality: a hash map answers only equality |
| **Count** subarrays with sum ≥ `k`, negatives allowed | Fenwick tree over compressed prefix values | Also an inequality |
| **Maximum** subarray sum | [Kadane](/learn/interview-patterns/array-patterns/kadane-and-subarrays) | It is `max(P[j] − min P[i])`, a running minimum, not a map |
| Count **pairs** `i < j` with `nums[i] + nums[j] == k` | [Hash map of values](/learn/interview-patterns/sequence-patterns/hash-map-patterns) | Pairs of elements, not ranges, so no prefix |

## Three decisions before you type

Every prefix problem is fixed by three choices: the **form** (array, running scalar, or map), the **key and stored value** (count for "how many", first position for "longest", last position for "shortest"), and the **seed and order** (what the empty prefix contributes, and whether you look up before inserting).

| Problem | Form | Key → value | Seed | Order |
|---|---|---|---|---|
| [Range Sum Query](/practice/range-sum-query-immutable) | array `P` of length `n + 1` | — | `P[0] = 0` | build once; answer `P[j+1] − P[i]` |
| [Find Pivot Index](/practice/find-pivot-index) | `total` + running `left` | — | `left = 0` | test before adding `nums[i]` |
| [Subarray Sum Equals K](/practice/subarray-sum-equals-k) | map | prefix → count | `{0: 1}` | look up `p − k`, then insert `p` |
| Longest subarray with sum `k` | map | prefix → first position | `{0: 0}` | look up, insert only if absent |
| Sum divisible by `k` | map, or array of `k` counters | `p mod k`, normalised → count | `{0: 1}` | look up, then insert |
| Equal 0s and 1s | map after 0 → −1 | prefix → first position | `{0: 0}` | as longest |
| [Product of Array Except Self](/practice/product-except-self) | two passes, output array | — | running product 1 | left pass writes, right pass multiplies |

"Position" in this table means the number of elements consumed so far, so the empty prefix is at position 0 and a subarray from position `a` to position `b` has length `b − a`. Pick that one convention and every length is a plain subtraction; mixing it with element indices is the most common off-by-one in this pattern.

## The template

```python
from itertools import accumulate

def build_prefix(nums):
    return list(accumulate(nums, initial=0))  # [0, n0, n0+n1, ...], length n + 1

def range_sum(P, i, j):
    """Sum of nums[i..j], inclusive."""
    return P[j + 1] - P[i]


def count_subarrays_with_sum(nums, k):
    seen = {0: 1}                            # the empty prefix occurs once
    prefix = count = 0
    for x in nums:
        prefix += x
        count += seen.get(prefix - k, 0)     # earlier prefixes that complete a sum of k
        seen[prefix] = seen.get(prefix, 0) + 1   # insert AFTER the lookup
    return count


def longest_subarray_with_sum(nums, k):
    first = {0: 0}                           # prefix value -> first position it occurred
    prefix = best = 0
    for pos, x in enumerate(nums, start=1):  # pos = elements consumed so far
        prefix += x
        if prefix - k in first:
            best = max(best, pos - first[prefix - k])
        if prefix not in first:              # keep the earliest: it gives the longest
            first[prefix] = pos
    return best
```

```javascript
function buildPrefix(nums) {
  const P = new Array(nums.length + 1);
  P[0] = 0;
  for (let i = 0; i < nums.length; i++) P[i + 1] = P[i] + nums[i];
  return P;
}

function rangeSum(P, i, j) {
  return P[j + 1] - P[i];                    // sum of nums[i..j], inclusive
}

function countSubarraysWithSum(nums, k) {
  const seen = new Map([[0, 1]]);
  let prefix = 0, count = 0;
  for (const x of nums) {
    prefix += x;
    count += seen.get(prefix - k) ?? 0;      // look up first
    seen.set(prefix, (seen.get(prefix) ?? 0) + 1);
  }
  return count;
}

function longestSubarrayWithSum(nums, k) {
  const first = new Map([[0, 0]]);
  let prefix = 0, best = 0;
  for (let pos = 1; pos <= nums.length; pos++) {
    prefix += nums[pos - 1];
    if (first.has(prefix - k)) best = Math.max(best, pos - first.get(prefix - k));
    if (!first.has(prefix)) first.set(prefix, pos);
  }
  return best;
}
```

The non-obvious lines. `accumulate(nums, initial=0)` (Python 3.8 and later) produces the leading zero for free and runs in C. `enumerate(nums, start=1)` makes `pos` the number of elements consumed, which is the convention that makes `pos − first[...]` a length with no `+ 1`. `if prefix not in first` is what makes the longest variant correct: overwriting keeps the latest position, which gives the shortest match.

The invariants. **Array form:** `P[i]` is the sum of the first `i` elements, so `P[j + 1] − P[i]` telescopes to `nums[i] + … + nums[j]`. **Count form:** when element `j` is processed, `seen` holds the counts of exactly the prefixes at positions `0 … j`, all strictly before the current one; that is why the seed is `{0: 1}` and why the lookup comes before the insert. **Longest form:** `first[v]` is the smallest position whose prefix is `v`, so `pos − first[prefix − k]` is the longest subarray ending here with sum `k`.

```viz
{"type": "array", "algorithm": "prefix-sum", "values": [3, 1, 4, 1, 5, 9, 2, 6]}
```

## Worked problems

### Range Sum Query – Immutable

[Range Sum Query – Immutable](/practice/range-sum-query-immutable): support `sumRange(i, j)` many times on an array that never changes. The constructor does the `O(n)` work; each query is one subtraction.

```python
class NumArray:
    def __init__(self, nums):
        self.P = [0]
        for x in nums:
            self.P.append(self.P[-1] + x)

    def sumRange(self, i, j):
        return self.P[j + 1] - self.P[i]
```

Trace on `nums = [-2, 0, 3, -5, 2, -1]`:

| index `i` | `nums[i]` | `P[i + 1]` = `P[i]` + `nums[i]` |
|---|---|---|
| — | — | `P[0]` = 0 |
| 0 | −2 | −2 |
| 1 | 0 | −2 |
| 2 | 3 | 1 |
| 3 | −5 | −4 |
| 4 | 2 | −2 |
| 5 | −1 | −3 |

| query | formula | value | check by hand |
|---|---|---|---|
| `sumRange(0, 2)` | `P[3] − P[0]` = 1 − 0 | 1 | −2 + 0 + 3 = 1 |
| `sumRange(2, 5)` | `P[6] − P[2]` = −3 − (−2) | −1 | 3 − 5 + 2 − 1 = −1 |
| `sumRange(0, 5)` | `P[6] − P[0]` | −3 | whole array |

The query starting at index 0 uses `P[0]` like every other query; without the leading zero it would need a special case. If the interviewer adds "now `nums[2]` can change", say before they finish that an update invalidates `P[3..n]` and name the Fenwick tree.

### Find Pivot Index

[Find Pivot Index](/practice/find-pivot-index): the leftmost index whose left total equals its right total, or −1. You do not need `P` at all: the right total at `i` is `total − left − nums[i]`.

```python
def pivot_index(nums):
    total = sum(nums)
    left = 0
    for i, x in enumerate(nums):
        if left == total - left - x:          # test BEFORE adding x to left
            return i
        left += x
    return -1
```

Trace on `nums = [1, 7, 3, 6, 5, 6]`, `total = 28`:

| `i` | `nums[i]` | `left` before | right = 28 − left − nums[i] | equal? |
|---|---|---|---|---|
| 0 | 1 | 0 | 27 | no |
| 1 | 7 | 1 | 20 | no |
| 2 | 3 | 8 | 17 | no |
| 3 | 6 | 11 | 11 | yes, return 3 |

The edge the hidden tests use: `[2, 1, −1]` has pivot 0 (left 0, right 1 − 1 = 0). A loop that starts at `i = 1`, or that adds `x` to `left` before testing, misses it.

### Subarray Sum Equals K

[Subarray Sum Equals K](/practice/subarray-sum-equals-k): count the subarrays with sum `k`, negatives allowed. Trace `count_subarrays_with_sum` on `nums = [3, 4, 7, 2, -3, 1, 4, 2]`, `k = 7`:

| `j` | `nums[j]` | `prefix` | look up `prefix − 7` | found | `count` | `seen` after insert |
|---|---|---|---|---|---|---|
| 0 | 3 | 3 | −4 | 0 | 0 | {0:1, 3:1} |
| 1 | 4 | 7 | 0 | 1 | 1 | {…, 7:1} |
| 2 | 7 | 14 | 7 | 1 | 2 | {…, 14:1} |
| 3 | 2 | 16 | 9 | 0 | 2 | {…, 16:1} |
| 4 | −3 | 13 | 6 | 0 | 2 | {…, 13:1} |
| 5 | 1 | 14 | 7 | 1 | 3 | {…, 14:2} |
| 6 | 4 | 18 | 11 | 0 | 3 | {…, 18:1} |
| 7 | 2 | 20 | 13 | 1 | 4 | {…, 20:1} |

Answer 4: `[3, 4]` (prefix 0 → 7), `[7]` (7 → 14), `[7, 2, −3, 1]` (7 → 14 again) and `[1, 4, 2]` (13 → 20). Row 5 is the one a window cannot find: the subarray contains a negative and its prefix 14 *repeats* an earlier prefix, so `seen[14]` is now 2. A later prefix of 21 would complete two subarrays at once, which is why the map stores counts, not a set. At row 1 the hit comes from the seed: without `{0: 1}`, `[3, 4]` is never counted.

```viz
{"type": "array", "algorithm": "prefix-sum", "values": [3, 4, 7, 2, -3, 1, 4, 2], "title": "Prefixes of the Subarray Sum Equals K input", "caption": "Two prefixes that differ by k bracket a subarray summing to k; the value 14 appears twice, so two different subarrays end at a prefix of 14."}
```

### Product of Array Except Self

[Product of Array Except Self](/practice/product-except-self): `out[i]` is the product of every element except `nums[i]`, without division, in `O(n)`. The prefix here is a product, and product has no safe inverse (a zero makes division undefined), so instead of subtracting you *combine* a prefix from the left with a suffix from the right.

```python
def product_except_self(nums):
    n = len(nums)
    out = [1] * n
    left = 1
    for i in range(n):              # out[i] = product of nums[0..i-1]
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):  # multiply in product of nums[i+1..n-1]
        out[i] *= right
        right *= nums[i]
    return out
```

Trace on `nums = [2, 3, 0, 4]`:

| pass | `i` | running product before | `out` after this step |
|---|---|---|---|
| left | 0 | 1 | [1, 1, 1, 1] |
| left | 1 | 2 | [1, 2, 1, 1] |
| left | 2 | 6 | [1, 2, 6, 1] |
| left | 3 | 0 | [1, 2, 6, 0] |
| right | 3 | 1 | [1, 2, 6, 0] |
| right | 2 | 4 | [1, 2, 24, 0] |
| right | 1 | 0 | [1, 0, 24, 0] |
| right | 0 | 0 | [0, 0, 24, 0] |

Result `[0, 0, 24, 0]`: only the zero's own slot is non-zero. The division approach (`total // nums[i]`) crashes on index 2, and even with that index skipped it cannot recover the 24 there from a `total` of 0. The output array doubles as the prefix store, so the extra space is `O(1)` beyond the output.

## Variants

| Variant | What changes in the template | Cost |
|---|---|---|
| Many range sums, static data | `P` of length `n + 1`, `P[j+1] − P[i]` | `O(n)` build, `O(1)` query |
| Count subarrays with sum `k` | map prefix → count, seed `{0: 1}`, look up then insert | `O(n)`, `O(n)` space |
| Longest with sum `k` | map prefix → first position, seed `{0: 0}`, never overwrite | `O(n)` |
| Shortest with sum `k` | map prefix → **last** position, overwrite every time | `O(n)` |
| Divisible by `k` | key `p mod k`, normalised in JavaScript with `((p % k) + k) % k`; an array of `k` counters when `k` is small | `O(n)`, `O(min(n, k))` space |
| XOR equals `x` | `^` for both `+` and `−`; look up `prefix ^ x` | `O(n)` |
| Balanced 0s and 1s, odd counts, vowels | transform first, then one of the above | `O(n)` |
| Everything except `i` | prefix from the left times suffix from the right | `O(n)`, `O(1)` extra |
| Range increments, read once | difference array: `+v` at `l`, `−v` at `r + 1`, prefix at the end | `O(n + m)` |
| Rectangle sums | 2D table, four lookups | `O(RC)` build, `O(1)` query |
| Append-only data | extend `P` with `P[-1] + x` per append | `O(1)` per append |
| Sum ≤ `k` with negatives, longest | binary search on the running prefix maximum | `O(n log n)` |

## When the question is an inequality

The follow-up that changes the pattern most is "longest subarray with sum **at most** `k`, negatives allowed". A window fails (dropping a negative raises the sum), and the hash map fails too, because it finds only prefixes *equal* to `P[b] − k`, while you need the earliest position `a` with `P[a] ≥ P[b] − k`. The fix is one observation: the running maximum `M[a] = max(P[0..a])` never decreases, and the first position where `M` reaches a value is the first position where `P` does. So a binary search on `M` finds `a`.

```python
from bisect import bisect_left

def longest_sum_at_most(nums, k):
    P, M = [0], [0]                  # prefixes and their running maximum, by position
    best = 0
    for x in nums:
        p = P[-1] + x                # prefix at the current position b = len(P)
        a = bisect_left(M, p - k)    # earliest position whose running max >= p - k
        if a < len(M):
            best = max(best, len(M) - a)
        P.append(p)
        M.append(max(M[-1], p))
    return best
```

Trace on `nums = [3, -2, 1, 4, -5, 2]`, `k = 2`:

| position `b` | `P[b]` | need `P[a] ≥` | `M` before | earliest `a` | length |
|---|---|---|---|---|---|
| 1 | 3 | 1 | [0] | none | — |
| 2 | 1 | −1 | [0, 3] | 0 | 2 |
| 3 | 2 | 0 | [0, 3, 3] | 0 | 3 |
| 4 | 6 | 4 | [0, 3, 3, 3] | none | — |
| 5 | 1 | −1 | [0, 3, 3, 3, 6] | 0 | 5 |
| 6 | 3 | 1 | [0, 3, 3, 3, 6, 6] | 1 | 5 |

Answer 5 (`[3, −2, 1, 4, −5]` sums to 1). A sliding window on the same input reports 2, because it evicts the 3 at position 1 and the −2 at position 4 and never gets them back. Time `O(n log n)`, space `O(n)`.

## Complexity, derived

**Array form.** The build does one addition per element, `n` additions, and stores `n + 1` numbers. A query is two reads and a subtraction. For `q` queries the total is `O(n + q)` against `O(n · q)` for looping, so the build pays for itself once the queries' total length exceeds `n`, about three random queries, and every later query saves up to `n` additions.

**Map form.** Each element does one addition, one lookup and one insert, each expected `O(1)`, so `O(n)` expected time. Space is the number of *distinct* prefix values, at most `n + 1`. Why it counts every subarray exactly once: a subarray is a pair of positions `a < b`, and it is counted when `b` is processed, once for each earlier `a` with `P[a] = P[b] − k`, which is exactly what `seen[P[b] − k]` holds at that moment.

| Approach to "count subarrays with sum `k`" | Time | Extra space | Negatives | Online (one pass, no replay) | Also answers |
|---|---|---|---|---|---|
| All pairs with a running sum | `O(n²)` | `O(1)` | yes | no | any predicate |
| Prefix sums + hash map | `O(n)` expected | `O(n)` | yes | yes | longest, shortest, divisible, XOR |
| Sliding window | `O(n)` | `O(1)` | no | yes | longest, count with at-most trick |
| Fenwick tree over compressed prefixes | `O(n log n)` | `O(n)` | yes | no (compression needs all values) | inequalities (sum ≥ `k`) |

| Structure for range sums | Build | Update | Query | Needs an inverse |
|---|---|---|---|---|
| Prefix array | `O(n)` | `O(n)` rebuild | `O(1)` | yes |
| Fenwick tree | `O(n)` | `O(log n)` | `O(log n)` | yes |
| Segment tree | `O(n)` | `O(log n)` | `O(log n)` | no |
| Sparse table (min, max, gcd) | `O(n log n)` | rebuild | `O(1)` | no, needs idempotence |

## Under the hood

### Building the array, measured

On one million random integers, best of five, CPython 3.14.7 and Node 24 on an AMD Ryzen 9 9950X3D:

| Build | CPython | Node |
|---|---|---|
| Preallocated array, index loop | 32.7 ns/elem | 3.8 ns/elem (`new Array(n + 1)`) |
| `append` / `push` of `P[-1] + x` | 24.1 ns/elem | 12.8 ns/elem |
| Running scalar, bound `append` | 19.7 ns/elem | — |
| `list(accumulate(nums, initial=0))` | 15.6 ns/elem | — |
| `Float64Array(n + 1)` | — | 4.2 ns/elem |

`itertools.accumulate` wins in CPython because the loop runs in C: one `PyNumber_Add` per element and no bytecode dispatch. The index loop loses because every iteration does two subscripts and a store through the interpreter. In V8 the preallocated array and the typed array are within about 10% of each other; `push` pays for capacity checks and growth.

### Hash map or array for the counts

When prefix values are bounded, an array indexed by `prefix + offset` can replace the map. With values in `{−1, 0, 1}` every prefix lies in `[−n, n]`, so an array of `2n + 1` counters works. Measured on 10⁶ elements: CPython 59 ns per element for both the `dict` and the offset `list`, because interpreter dispatch dominates either way; Node 13 ns per element with a `Map` and 1.4 ns with an `Int32Array`. In JavaScript the typed array is a ninefold win and worth writing; in Python choose whichever you can type correctly. When `k` in "divisible by `k`" is at most about 10⁶, the residue array is the same trick.

### Float prefixes lose precision in the difference

A float prefix array has two separate precision problems. First, the running total accumulates rounding error: adding 0.1 one million times gives `100000.00000133288` with a plain loop, with `itertools.accumulate`, and in JavaScript. CPython's built-in `sum()` returns exactly `100000.0`, because since Python 3.12 it uses compensated ([Neumaier](https://docs.python.org/3/whatsnew/3.12.html)) summation for floats, so `sum(nums)` and `P[-1]` now disagree. NumPy draws the same line: `np.sum` uses pairwise summation, while `np.cumsum` accumulates sequentially, so its last element carries the full sequential error (not measured here; NumPy was not installed on the measurement machine).

Second, and worse, a range sum computed as `P[j + 1] − P[i]` inherits the rounding of both prefixes, whose magnitude is that of the whole array so far, not of the range. The three-element range `nums[999996..999998]` of the 0.1 array came out as `0.3000000000174623` from the prefix difference against `0.30000000000000004` summed directly. Over 2,000 random short ranges of uniform `[0, 1)` values, the largest error was 1.1 × 10⁻¹⁴ near the start of a 10⁶-element array and 1.7 × 10⁻¹⁰ near its end: four orders of magnitude worse for the same range length, purely because of where it sits. Integers do not have this problem; money and counts should be integers.

### At scale

Running totals are how production systems answer range questions: SQL's `SUM(x) OVER (ORDER BY t)`, ledger running balances, Kafka offsets and Prometheus counters are all prefix sums, and the [data-structures lesson](/learn/data-structures/arrays-strings/prefix-sums-and-difference-arrays) walks through each. The interview insight carries over directly: they work because the data is append-only, and they break (counter resets, backfills) when history is rewritten.

## Failure modes

**A reconciliation job flags thousands of mismatches that are not real.** *Symptom:* daily usage computed as the difference of two cumulative float counters disagrees with summing the raw rows, by around 10⁻¹⁰ relative, only for days late in the month. *Diagnosis:* the prefix-difference cancellation measured above; the counters' magnitude grows through the month, and so does the absolute error of every difference. *Fix:* store integer units; if floats are unavoidable, compare with a tolerance proportional to the counter's magnitude, not the day's value.

**The longest-subarray answer is too short.** *Symptom:* `[0, 0, 0]` with `k = 0` returns 1 instead of 3. *Diagnosis:* `first[prefix] = pos` runs unconditionally, so the map keeps the latest position and every match is as short as possible. *Fix:* insert only if the key is absent.

**Answers are off by one only for subarrays that start at index 0.** *Symptom:* `[1, 2, 3]` with `k = 3` finds `[3]` but not `[1, 2]`, or the length of the full-array match is one too long. *Diagnosis:* no seed, or a seed in a different convention from the loop (`first[0] = −1` with `pos − first[...]`, where `pos` counts elements). *Fix:* one convention: positions count consumed elements, seed `{0: 0}` for positions and `{0: 1}` for counts.

**A cached range-sum service drifts after an edit.** *Symptom:* after a correction to one historical row, every report covering later dates is wrong until the service restarts. *Diagnosis:* the prefix array was built once and the underlying data is not append-only; the edit invalidated every later prefix. *Fix:* rebuild from the edited index, `O(n)` per edit; use a Fenwick tree if edits are frequent; appends alone are safe and cost `O(1)`.

**Product of Array Except Self crashes or returns `NaN`.** *Symptom:* `ZeroDivisionError` in Python, `NaN` and `Infinity` in JavaScript, on any input containing a 0. *Diagnosis:* the solution divides a total product by `nums[i]`. *Fix:* prefix and suffix products, which never divide.

## Interviewer follow-ups

**"Now the input is a stream."** Model answer: the count and longest forms are already one pass and never look back, so they run online with memory equal to the number of distinct prefixes seen. Range queries over an append-only stream extend `P` in `O(1)` per element; queries over only the last `W` elements need a ring buffer of the last `W + 1` prefixes. Common wrong answer: "prefix sums need the whole array first".

**"Now values can be negative."** Model answer: nothing changes for equality questions (count or longest with sum `k`) or for range sums. Inequalities change: "longest subarray with sum ≤ `k`" is no longer a window; binary-search the smallest `i` whose running prefix maximum is at least `P[j+1] − k`, `O(n log n)`. Common wrong answer: using the hash map for "≤ `k`", which only matches exact values.

**"Now values go up to 10⁹ and `n` to 10⁵."** Model answer: prefixes reach 10¹⁴: fine in Python, in 64-bit integers and in a JavaScript `Number` (below 2⁵³ ≈ 9 × 10¹⁵), fatal in a 32-bit `int`. For "divisible by `k`" with `k = 10⁹`, the residue array is 4 GB, so use the map; `k` itself never enters the time bound. Common wrong answer: sizing an array by `k` or by the value range.

**"Return the subarrays, not the count."** Model answer: store a list of positions per prefix value and emit one pair per match; time is `O(n + output)`, and the output can be `Θ(n²)` (all zeros with `k = 0`), so ask whether the count is what they need. Common wrong answer: claiming the listing is still `O(n)`.

**"Two dimensions: count submatrices summing to `t`."** Model answer: fix a pair of rows, collapse the columns between them into one array of column sums, and run the count template on it: `O(R² C)`, with the smaller dimension squared. Common wrong answer: a 2D prefix table and a check of all `O(R² C²)` rectangles.

## What mid-level engineers get wrong

- **Missing the transform.** "Equal 0s and 1s" gets a sliding window or a nested loop, because nothing in it says "sum". Consequence: `O(n²)` or a wrong window.
- **Inserting before looking up.** Consequence: with `k = 0` every position matches itself and the count is too high by `n`.
- **Overwriting the first position** in the longest form. Consequence: the shortest match instead of the longest.
- **Two index conventions in one function.** Consequence: off by one only for subarrays starting at 0, which the sample may not contain.
- **Using the map for an inequality.** Consequence: `seen.get(p − k)` finds only exact matches, so "sum at least `k`" is undercounted with no error.
- **Trusting a float prefix difference as exact.** Consequence: errors that depend on where the range sits in the array, invisible in small tests.

## Exercises

```exercise
id: longest-subarray-with-sum-k
title: Longest subarray with sum exactly k
prompt: |
  Given an array of integers `nums` (negatives allowed) and an integer `k`,
  return the length of the longest contiguous subarray whose sum is
  exactly `k`. Return 0 if none exists.

  Use a running prefix sum and a map from prefix value to the first index
  at which it occurred. Remember that the empty prefix (value 0) occurs
  at index 0, before any element.
languages: [python, javascript]
entry: longest_subarray_sum_k
starter:
  python: |
    def longest_subarray_sum_k(nums, k):
        # your code here
        return 0
  javascript: |
    function longest_subarray_sum_k(nums, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, -1, 5, -2, 3], 3]
    expected: 4
  - args: [[-2, -1, 2, 1], 1]
    expected: 2
  - args: [[], 0]
    expected: 0
    label: empty input
  - args: [[0, 0, 0], 0]
    expected: 3
    label: repeated prefix values; keep the first index
  - args: [[1, 2, 3], 7]
    expected: 0
    hidden: true
    label: no subarray qualifies
  - args: [[5], 5]
    expected: 1
    hidden: true
  - args: [[2, -2, 2, -2, 3], 3]
    expected: 5
    hidden: true
    label: whole array with cancelling negatives
hints:
  - "Let P be the running sum after j + 1 elements. A subarray ending at j has sum k when an earlier prefix equals P - k; its length is (j + 1) - firstIndex[P - k]."
  - "Seed the map with {0: 0} so subarrays that start at index 0 are found."
  - "Only store a prefix value the first time you see it; later occurrences would shorten the subarray."
```

```exercise
id: longest-balanced-bits
title: Longest subarray with equal 0s and 1s
prompt: |
  `bits` contains only 0s and 1s. Return the length of the longest
  contiguous subarray with the same number of 0s as 1s, or 0 if there
  is none.

  Nothing here says "sum". Find the transform that turns it into a
  prefix-sum problem, then decide what the map should store for a
  "longest" question. Aim for O(n).
languages: [python, javascript]
entry: longest_balanced
starter:
  python: |
    def longest_balanced(bits):
        # your code here
        return 0
  javascript: |
    function longest_balanced(bits) {
      // your code here
      return 0;
    }
tests:
  - args: [[0, 1]]
    expected: 2
  - args: [[0, 1, 0]]
    expected: 2
  - args: [[0, 0, 1, 0, 0, 0, 1, 1]]
    expected: 6
  - args: [[]]
    expected: 0
    label: empty input
  - args: [[1, 1, 1]]
    expected: 0
    label: no balanced subarray
  - args: [[0, 1, 1, 0, 1, 1, 1, 0]]
    expected: 4
    hidden: true
  - args: [[1, 0, 1, 0, 1, 0]]
    expected: 6
    hidden: true
    label: the whole array is balanced
hints:
  - "Count a 0 as -1 and a 1 as +1. A subarray is balanced exactly when its sum is 0."
  - "A zero-sum subarray lies between two positions with equal prefix values; for the longest one, remember the first position of each prefix value."
  - "Seed the map with prefix 0 at position 0 so a balanced subarray starting at the first element is found."
```

## Senior signals

- You name the **three decisions** (form; key and stored value; seed and order) and pick "count", "first position" or "last position" from the question's wording, not from memory.
- You find the **transform** that exposes the prefix: 0 → −1 for balance, odd → 1 for odd counts, "removed ends" → "kept middle".
- You route by **query type**: equality to a hash map, inequality to a sorted structure or binary search, range aggregate without an inverse to a sparse table or segment tree, and updates to a Fenwick tree.
- You keep **one position convention** (elements consumed) so every length is a subtraction and the empty prefix is position 0.
- You know what the runtime does: `accumulate(..., initial=0)` builds the table in C, a typed array beats a `Map` ninefold in V8 for bounded prefixes, and since Python 3.12 `sum()` of floats is compensated while a prefix loop is not.
- You flag **float prefix differences**: their error scales with the prefix, not the range, which matters the moment the numbers are money.

## Check yourself

```quiz
- q: >-
    "Return the length of the longest subarray with equal numbers of 0s and 1s." Which plan solves it in O(n)?
  options: ["Map 0 to -1, then store the first position of each prefix value", "Keep the prefix value as-is and store the last position of each", "Map 0 to -1, then store the count of each prefix value in the map", "Slide a window that shrinks whenever the 0s outnumber the 1s"]
  answer: 0
  explanation: >-
    With 0 as -1 a balanced subarray is exactly a zero-sum subarray, which lies between two positions with equal prefix values. For the longest, keep the earliest position of each value. Counts answer how many, not how long; the last position gives the shortest; and balance is not monotone under shrinking, so a window cannot track it.
- q: >-
    In the longest-subarray-with-sum-k template, the line first[prefix] = pos runs on every iteration instead of only when prefix is new. What does [0, 0, 0] with k = 0 return?
  options: ["1, since each lookup finds the position just before the current one", "0, since the lookup happens after the current prefix is overwritten", "2, since the seed at position 0 is kept while the later ones move", "3, since overwriting the map does not change which prefixes exist"]
  answer: 0
  explanation: >-
    Every prefix is 0, so at position p the lookup of 0 finds the most recent position p - 1 and the best length is 1. Keeping the first position (0) would give 3. The seed is overwritten at position 1, so it is not kept, and the lookup precedes the insert in the template.
- q: >-
    A float prefix array P over 10^6 values in [0, 1) gives errors near 1e-14 for short ranges at the start and near 1e-10 for equally short ranges at the end. Why?
  options: ["The hash map loses precision once the keys exceed 2^53 in size", "Subtraction of floats is not commutative, so the order changes it", "The error of P[j+1] - P[i] scales with the size of the prefixes", "Later elements were rounded more heavily when the list was built"]
  answer: 2
  explanation: >-
    Each prefix carries rounding error proportional to its own magnitude, and near the end the prefixes are around 5e5, so their difference inherits an absolute error far larger than the short range's true value would suggest. The inputs are unchanged, nothing here passes 2^53, and float subtraction is commutative in the sense that matters.
- q: >-
    In CPython 3.14, sum([0.1] * 10**6) returns 100000.0 but list(accumulate([0.1] * 10**6))[-1] returns 100000.00000133288. Why do they differ?
  options: ["accumulate uses 32-bit floats internally to save memory on long inputs", "Since 3.12 sum() compensates float rounding; accumulate adds plainly", "accumulate starts from 0.1 rather than 0.0, which shifts every total", "sum() sorts its input before adding, which reduces the rounding error"]
  answer: 1
  explanation: >-
    CPython 3.12 changed the built-in sum() to use Neumaier compensated summation for floats, so it returns the correctly rounded total here, while accumulate performs ordinary float additions and matches a plain loop. Both use 64-bit doubles, sum() does not sort, and the starting value does not explain an error in the ninth decimal.
- q: >-
    Follow-up: the array now arrives as a stream, and between queries new elements are appended; nothing already seen is ever edited. What happens to the prefix-array solution?
  options: ["Queries become O(log n), since P must be binary-searched", "Each append extends P in O(1) and queries stay O(1)", "It no longer works, since prefix sums need the whole array first", "Each append forces an O(n) rebuild, so switch to a Fenwick tree"]
  answer: 1
  explanation: >-
    An append adds P[-1] + x at the end and invalidates nothing, so the structure is ideal for append-only data. Edits to earlier elements are what force a rebuild and justify a Fenwick tree. No search is involved in a range query.
- q: >-
    Longest subarray with sum at most k, where values can be negative. Which approach is correct?
  options: ["Binary search the running prefix maximum for each end, O(n log n)", "A hash map of first positions, looking up prefix - k at each step", "A sliding window that shrinks while the window's sum exceeds k", "A difference array over the input, followed by one prefix pass"]
  answer: 0
  explanation: >-
    You need the smallest i with P[i] >= P[j+1] - k, an inequality. The running maximum of P is non-decreasing, and the first position where it reaches a value is the first position where P does, so a binary search finds i. A hash map matches only exact values, a window needs a property that survives shrinking (negatives destroy it), and a difference array answers range updates.
```
