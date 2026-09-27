---
slug: prefix-sum
title: "Prefix sums: precompute once, answer every range in O(1)"
description: How one pass of running totals turns range-sum queries into a subtraction and subarray-sum-equals-k into a hash-map lookup, with Range Sum Query, Find Pivot Index and Subarray Sum Equals K traced step by step.
minutes: 30
difficulty: medium
tags: [prefix-sum, arrays, range-queries, hash-map, pattern:prefix-sum]
problems: [subarray-sum-equals-k, range-sum-query-immutable, find-pivot-index]
---
You are asked for the sum of `nums[i..j]`, and then asked again for a different `i` and `j`, ten thousand times. Each query is an `O(n)` loop, so the total is `O(n × q)`; for `n = q = 10⁵` that is 10¹⁰ additions. Or you are asked how many contiguous subarrays sum to exactly `k`, and the array has negative numbers so a sliding window cannot shrink safely. Or which index has the same total on its left as on its right.

All three are the same trick. Spend one `O(n)` pass computing running totals, and every range sum becomes a subtraction of two precomputed numbers. The prefix sum is the simplest example of a general idea that shows up everywhere from database indexes to stream processing: *precompute an aggregate so that a query becomes a difference*. Recognising it under interview pressure is worth more than the arithmetic, because the hash-map extension is what turns a classic hard-looking problem into six lines.

## The signal

The words that select this pattern:

- **"Sum of the range"** or **"sum of the subarray"**, asked **repeatedly** on an array that does not change. One query is a loop; many queries is a prefix array.
- **"Number of subarrays whose sum is…"** exactly `k`, divisible by `k`, or equal to some target, especially when the array contains **negative numbers**. Negatives are the tell that a sliding window is out.
- **"Left sum equals right sum"**, "balance point", "pivot index", "split the array so that…".
- **"Longest subarray with sum…"** where a window fails for the same reason.
- Any **associative operation with an inverse**: sum, XOR, product without zeros (or under a prime modulus). The query is `prefix[j+1] ⊖ prefix[i]`.

What rules it out:

- **The array is updated between queries.** Rebuilding the prefix array per update is `O(n)`; the right tools are a Fenwick or segment tree, covered in [Fenwick trees](/learn/advanced-data-structures/range-queries/fenwick-trees) and [Segment trees](/learn/advanced-data-structures/range-queries/segment-trees).
- **The operation has no inverse.** Range *minimum* or *maximum* cannot be recovered from prefixes because you cannot subtract a min. That is a sparse table or segment tree.
- **All values are non-negative and you want a longest/shortest window with a sum bound.** A [sliding window](/learn/interview-patterns/array-patterns/sliding-window) is simpler and uses `O(1)` space. Prefix sums still work; they are just not the cheapest tool.

The nearest confusable pattern is the sliding window. The test: can the aggregate only move one way as the window grows? If yes, slide. If negatives (or any non-monotone contribution) are present, prefix.

## The template

Build `P` with `n + 1` entries and `P[0] = 0`, so that `P[i]` is the sum of the first `i` elements. Then the sum of `nums[i..j]` inclusive is `P[j + 1] - P[i]`. The leading zero is not a stylistic choice; it is what lets a range starting at index 0 use the same formula as every other range.

```python
def build_prefix(nums):
    P = [0] * (len(nums) + 1)
    for i, x in enumerate(nums):
        P[i + 1] = P[i] + x
    return P

def range_sum(P, i, j):
    """Sum of nums[i..j], inclusive."""
    return P[j + 1] - P[i]


def count_subarrays_with_sum(nums, k):
    """How many contiguous subarrays sum to exactly k (negatives allowed)."""
    seen = {0: 1}            # prefix value -> how many times it has occurred
    prefix = count = 0
    for x in nums:
        prefix += x
        count += seen.get(prefix - k, 0)     # earlier prefixes that make this one k
        seen[prefix] = seen.get(prefix, 0) + 1
    return count
```

```javascript
function buildPrefix(nums) {
  const P = new Array(nums.length + 1).fill(0);
  for (let i = 0; i < nums.length; i++) P[i + 1] = P[i] + nums[i];
  return P;
}

function rangeSum(P, i, j) {
  return P[j + 1] - P[i];               // sum of nums[i..j], inclusive
}

function countSubarraysWithSum(nums, k) {
  const seen = new Map([[0, 1]]);       // prefix value -> occurrences
  let prefix = 0, count = 0;
  for (const x of nums) {
    prefix += x;
    count += seen.get(prefix - k) ?? 0;
    seen.set(prefix, (seen.get(prefix) ?? 0) + 1);
  }
  return count;
}
```

The invariant for the plain form is a definition: `P[i] = nums[0] + … + nums[i-1]`, so `P[j+1] - P[i]` telescopes to exactly the elements from `i` to `j`. Step through it on a real array:

```viz
{"type": "array", "algorithm": "prefix-sum", "values": [3, 1, 4, 1, 5, 9, 2, 6]}
```

The hash-map form is where the pattern earns its keep. A subarray `nums[i..j]` sums to `k` exactly when `P[j+1] - P[i] = k`, that is, `P[i] = P[j+1] - k`. So as you compute each new prefix value, ask "how many earlier prefixes equal `current - k`?" A map from prefix value to occurrence count answers that in `O(1)`. The invariant: *when processing index `j`, `seen` holds the counts of `P[0..j]`*, which is why `seen` starts with `{0: 1}` (the empty prefix `P[0]`) and why you look up before you insert. Look up after inserting and every element with `k = 0` counts itself.

You do not need the array `P` at all in the hash-map form; the running `prefix` scalar is enough. Space is the map, `O(n)` in the worst case, and time is one pass.

The foundations, including 2D prefix sums and difference arrays for range *updates*, are in [Prefix sums and difference arrays](/learn/data-structures/arrays-strings/prefix-sums-and-difference-arrays) and [Prefix sums and hashing tricks](/learn/algorithms/technique-mastery/prefix-sums-and-hashing-tricks). This lesson is about spotting the pattern and executing the hash-map form without an off-by-one.

## Worked problems

### Range Sum Query – Immutable

[Range Sum Query – Immutable](/practice/range-sum-query-immutable): given an array that never changes, support `sumRange(i, j)` for many `(i, j)` pairs.

The insight: the constructor does the `O(n)` work once; each query is one subtraction. Interviewers use this as a warm-up and then test whether you place the leading zero correctly.

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

So `P = [0, -2, -2, 1, -4, -2, -3]`. Queries:

| query | formula | value | check by hand |
|---|---|---|---|
| `sumRange(0, 2)` | `P[3] - P[0]` = 1 − 0 | 1 | −2 + 0 + 3 = 1 |
| `sumRange(2, 5)` | `P[6] - P[2]` = −3 − (−2) | −1 | 3 − 5 + 2 − 1 = −1 |
| `sumRange(0, 5)` | `P[6] - P[0]` | −3 | whole array sums to −3 |

Construction `O(n)`, each query `O(1)`, space `O(n)`. If the interviewer adds "now support point updates", the prefix array is the wrong structure: an update at index 2 invalidates `P[3..n]`. That is the cue for a Fenwick tree with `O(log n)` for both operations.

### Find Pivot Index

[Find Pivot Index](/practice/find-pivot-index): return the leftmost index where the sum of everything to its left equals the sum of everything to its right, or −1.

The insight: you do not need the whole prefix array. The right sum at `i` is `total - left - nums[i]`, so one pass with a running `left` and the precomputed `total` suffices, `O(1)` extra space.

```python
def pivot_index(nums):
    total = sum(nums)
    left = 0
    for i, x in enumerate(nums):
        if left == total - left - x:
            return i
        left += x
    return -1
```

Trace on `nums = [1, 7, 3, 6, 5, 6]`, `total = 28`:

| `i` | `nums[i]` | `left` (before) | `right` = 28 − left − nums[i] | equal? |
|---|---|---|---|---|
| 0 | 1 | 0 | 27 | no |
| 1 | 7 | 1 | 20 | no |
| 2 | 3 | 8 | 17 | no |
| 3 | 6 | 11 | 11 | yes, return 3 |

Time `O(n)`, space `O(1)`. The edge cases that matter: the pivot can be index 0 (left sum 0, so the rest must sum to 0) or the last index; both fall out of the formula without special-casing. An array like `[2, 1, -1]` has pivot 0, which a solution that starts its loop at `i = 1` will miss.

### Subarray Sum Equals K

[Subarray Sum Equals K](/practice/subarray-sum-equals-k): count the contiguous subarrays whose elements sum to `k`. Values can be negative.

The insight is the reduction stated in the template: a subarray from `i` to `j` sums to `k` if and only if the prefix at `j + 1` minus the prefix at `i` is `k`. Turn the question "how many `i` satisfy `P[i] = P[j+1] - k`" into a hash-map count.

Trace on `nums = [3, 4, 7, 2, -3, 1, 4, 2]`, `k = 7`. `seen` starts as `{0: 1}`:

| `j` | `nums[j]` | `prefix` | look up `prefix − k` | found | `count` | `seen` after insert |
|---|---|---|---|---|---|---|
| 0 | 3 | 3 | −4 | 0 | 0 | {0:1, 3:1} |
| 1 | 4 | 7 | 0 | 1 | 1 | {…, 7:1} |
| 2 | 7 | 14 | 7 | 1 | 2 | {…, 14:1} |
| 3 | 2 | 16 | 9 | 0 | 2 | {…, 16:1} |
| 4 | −3 | 13 | 6 | 0 | 2 | {…, 13:1} |
| 5 | 1 | 14 | 7 | 1 | 3 | {…, 14:2} |
| 6 | 4 | 18 | 11 | 0 | 3 | {…, 18:1} |
| 7 | 2 | 20 | 13 | 1 | 4 | {…, 20:1} |

Answer 4. Map the hits back to subarrays to see that nothing was double-counted: `[3, 4]` (prefix 0 → 7), `[7]` (7 → 14), `[7, 2, -3, 1]` (7 → 14 again, the second occurrence of 14), and `[1, 4, 2]` (13 → 20). The row at `j = 5` is the one a sliding window could never find: the subarray `[7, 2, -3, 1]` contains a negative number, and its prefix value 14 *repeats* an earlier prefix, which is exactly the situation the map handles by storing counts rather than a set.

Time `O(n)`, space `O(n)`. The interviewer's follow-ups are predictable: "what if I want the *longest* such subarray?" (store the first index of each prefix value instead of a count and take `j + 1 - firstIndex`), and "what if I want sums divisible by `k`?" (store `prefix mod k`, normalised to be non-negative).

## Variations

- **Divisible by `k`.** Two prefixes with the same remainder mod `k` bound a subarray divisible by `k`. Key the map by `prefix % k`, and in JavaScript (and C, Java, Go) normalise with `((p % k) + k) % k` because `%` keeps the sign of the dividend. Python's `%` is already non-negative for positive `k`.
- **Longest instead of count.** Store the *first* index at which each prefix value appeared and never overwrite it; the answer at `j` is `j + 1 - first[prefix - k]`. Storing the last index gives the shortest.
- **XOR instead of sum.** XOR is its own inverse, so `prefix ^ target` is the lookup key. "Count subarrays whose XOR equals `x`" is the same six lines with `^` for `+` and `-`.
- **Prefix and suffix products.** [Product of Array Except Self](/practice/product-except-self) is a prefix product from the left multiplied by a suffix product from the right, with zeros handled by never dividing. It is the same telescoping idea with an operation that lacks a safe inverse, which is why the suffix pass replaces the subtraction.
- **Two dimensions.** `P[r+1][c+1] = nums[r][c] + P[r][c+1] + P[r+1][c] - P[r][c]`, and a rectangle sum is four lookups with inclusion–exclusion. Same leading-zero discipline, now on a whole row and column.
- **Range updates, point queries.** The difference array is the prefix sum run backwards: add `v` at `l` and subtract it at `r + 1`, then prefix-sum at the end. It appears in "schedule bookings" and "range increment" problems.

## Pitfalls

- **Prefix array of length `n` instead of `n + 1`.** Without `P[0] = 0`, a query starting at index 0 needs a special case, and the hash-map form needs `seen[0] = 1` (the same missing empty prefix) or every subarray that starts at index 0 is uncounted.
- **Inserting before looking up.** With `k = 0` every position then matches its own prefix and the count is inflated by `n`. Look up, then insert.
- **`P[j] - P[i]` when you meant `P[j+1] - P[i]`.** Decide once whether `j` is inclusive and write the formula down before coding. The trace tables above make the convention explicit; do the same on the whiteboard.
- **Negative remainders in JavaScript.** `-7 % 3` is `-1` in JS and `2` in Python. Keying a map by an unnormalised remainder splits one equivalence class into two and undercounts.
- **Precision in JavaScript.** Numbers are IEEE doubles; sums beyond 2⁵³ silently lose integers. For `10⁵` values up to `10⁹` you are at `10¹⁴`, safe, but say the bound out loud. In fixed-width languages use 64-bit accumulators.
- **Rebuilding the prefix array per query**, which brings you back to `O(n × q)`. The whole point is one build.
- **Mutable arrays.** If the array changes, prefix sums go stale. Ask the interviewer whether updates happen before you commit to this pattern.

## Exercise

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

## Senior signals

- You say **"telescoping"** or "difference of two prefixes" before writing code, and you place the leading zero deliberately rather than patching a special case for index 0.
- You **route on negatives**: non-negative bounded sums go to a sliding window in `O(1)` space; negatives go to prefix sums with a hash map, and you can say why in one sentence.
- You know the **inverse requirement**: sum and XOR have inverses, min and max do not, product does only without zeros, and this determines whether prefixes apply.
- You ask whether the array is **immutable** before committing, and you name the Fenwick tree as the structure for the mutable version.
- You handle **modular remainders** correctly across languages and can explain why storing counts (not a set) is what makes repeated prefix values work.
- You can extend the pattern to **2D** and to **difference arrays** on request, and you know they are the same idea with the operation run in the other direction.

## Check yourself

```quiz
- q: >-
    In the hash-map form of Subarray Sum Equals K, the map is seeded with {0: 1} before the loop. What breaks if you leave that out?
  options: ["Subarrays containing negative values are counted twice in the total", "Subarrays ending at the last index are missed, since no prefix follows", "Nothing breaks; the seed only saves one lookup on the first element", "Subarrays starting at index 0 are missed, since their left prefix is 0"]
  answer: 3
  explanation: >-
    A subarray nums[0..j] corresponds to P[j+1] - P[0], and P[0] is 0. Without recording that empty prefix the lookup for prefix - k never finds it. This is the same reason the array form needs n + 1 entries. Subarrays ending at the last index are fine: they are found when the final prefix is processed.
- q: >-
    You look up prefix - k in the map after inserting the current prefix. For k = 0 the result is:
  options: ["Too high by n, because every position matches its own prefix", "Always zero, because the lookup key is never in the map yet", "Correct, since an empty subarray also sums to k when k = 0", "Too high by one, because the seeded 0 prefix matches itself once"]
  answer: 0
  explanation: >-
    With k = 0 the lookup key equals the current prefix, which you have just inserted, so every index counts an empty subarray. The problem counts non-empty subarrays, so that is n spurious matches. Look up first, then insert, so the map only ever contains strictly earlier prefixes.
- q: >-
    An interviewer changes Range Sum Query so that single elements can be updated between queries. Prefix sums are now the wrong choice because:
  options: ["Subtraction no longer cancels the prefix once values have changed", "Queries become O(n), because each must re-add the updated element", "An update invalidates every later prefix, so updates cost O(n) each", "Prefix sums need non-negative values, and updates may add negatives"]
  answer: 2
  explanation: >-
    P[i] depends on every element before i, so changing nums[2] changes P[3..n]. Queries stay O(1) but updates cost a rebuild. A Fenwick or segment tree stores partial sums so that both operations touch only O(log n) entries.
- q: >-
    Which of these range queries can NOT be answered with a prefix array plus one subtraction?
  options: ["Range sum modulo a prime", "Range sum of integers", "Range minimum of integers", "Range XOR of integers"]
  answer: 2
  explanation: >-
    Prefixes need an operation with an inverse so the left part can be cancelled. Sum and XOR have inverses (subtraction, XOR itself), and modular sum does too. Minimum has no inverse: knowing min(0..j) and min(0..i-1) tells you nothing about min(i..j).
- q: >-
    Counting subarrays whose sum is divisible by 5 in JavaScript, a candidate keys the map by prefix % 5. The count is too low on inputs with negatives. Why?
  options: ["JavaScript Map objects cannot store negative numbers as keys", "The map should be keyed by Math.floor(prefix / 5), not the remainder", "JS % keeps the dividend's sign, so -3 and 2 get different keys", "Prefix sums lose divisibility once a negative value is added"]
  answer: 2
  explanation: >-
    Two prefixes bound a divisible subarray when they are congruent mod 5. JavaScript's remainder can be negative, splitting one congruence class into two keys and losing matches; normalise with ((p % 5) + 5) % 5. Maps accept negative keys without trouble, and Python's % is already non-negative for a positive modulus.
```
