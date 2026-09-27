---
slug: prefix-sums-and-difference-arrays
title: Prefix sums and difference arrays
description: Answer any range sum in O(1) after O(n) preprocessing, extend it to 2D with inclusion–exclusion, and invert it into difference arrays for O(1) range updates.
minutes: 40
difficulty: medium
tags: [arrays, prefix-sum, difference-array, range-query, inclusion-exclusion]
problems: [range-sum-query-immutable, subarray-sum-equals-k, find-pivot-index]
---
A dashboard shows revenue for any date range the user drags out. The table has a row per day for ten years, 3,650 numbers, and the user issues a query every time the mouse moves. Summing the range each time is 3,650 additions per query, which is fine. Now the table is per second, 3 × 10⁸ rows, and the product manager wants it "instant". Summing on demand is dead; you need each query to cost the same regardless of how wide it is.

The prefix sum is the answer, and it is the simplest instance of a very general idea: *precompute cumulative state so that any interval is the difference of two endpoints.* Once you see that shape, you will find it in bank ledgers, image processing, hash-based subarray problems and stream analytics.

## Prefix sums: range sums in O(1)

Given `a[0..n-1]`, define the prefix array `P` of length `n + 1` with `P[0] = 0` and

$$P[i+1] = P[i] + a[i]$$

so `P[i]` is the sum of the first `i` elements. Then the sum of `a[l..r]` inclusive is

$$\text{sum}(l, r) = P[r+1] - P[l]$$

Everything before `l` cancels; what remains is exactly `a[l] + … + a[r]`.

Worked example with `a = [3, 1, 4, 1, 5, 9, 2, 6]`:

```text
index i:   0  1  2  3  4   5   6   7   8
a[i]:      3  1  4  1  5   9   2   6
P[i]:      0  3  4  8  9  14  23  25  31
```

- `sum(0, 2) = P[3] − P[0] = 8 − 0 = 8` (3 + 1 + 4).
- `sum(3, 5) = P[6] − P[3] = 23 − 8 = 15` (1 + 5 + 9).
- `sum(6, 6) = P[7] − P[6] = 25 − 23 = 2`.

Building `P` is one pass, O(n). Each query is one subtraction, O(1). For `q` queries the total is O(n + q) instead of O(nq).

```viz
{"type": "array", "algorithm": "prefix-sum", "values": [3, 1, 4, 1, 5, 9, 2, 6], "title": "Building the prefix array"}
```

```python
def build_prefix(a):
    P = [0] * (len(a) + 1)
    for i, x in enumerate(a):
        P[i + 1] = P[i] + x
    return P

def range_sum(P, l, r):        # inclusive l..r
    return P[r + 1] - P[l]
```

### Why the extra leading zero

You will see prefix arrays of length `n` (`P[i] = a[0] + … + a[i]`) with a special case `sum(l, r) = P[r] − (P[l−1] if l > 0 else 0)`. The `n + 1` version removes the branch: `P[0] = 0` represents "sum of nothing", and every query is the same subtraction. Off-by-one errors in prefix sums come almost entirely from mixing the two conventions, so pick the `n + 1` one and stay with it. The same convention makes "sum of the first `k` elements" simply `P[k]`.

### Related cumulative structures

The trick is not specific to addition. It works for any operation with an inverse:

- **Prefix XOR**: `X[r+1] ^ X[l]` is the XOR of `a[l..r]`, because XOR is its own inverse.
- **Prefix counts**: `C[i]` = number of vowels (or zeros, or matches) in the first `i` characters; "how many vowels in `s[l..r]`" is `C[r+1] − C[l]`.
- **Prefix products** work with division, but zeros break it; [Product of Array Except Self](/practice/product-except-self) avoids division by combining a prefix product from the left and a suffix product from the right instead.
- **Prefix max/min** do *not* support range queries this way, because max has no inverse: knowing `max(a[0..r])` and `max(a[0..l−1])` tells you nothing about `max(a[l..r])`. Range max needs a sparse table or segment tree, covered in [Sparse tables and sqrt decomposition](/learn/advanced-data-structures/range-queries/sparse-tables-and-sqrt-decomposition).

### Worked example: the pivot index

"Find an index where the sum to its left equals the sum to its right." With the total `T = P[n]`, the left sum at `i` is `P[i]` and the right sum is `T − P[i] − a[i]`, so the check is `2 · P[i] + a[i] == T`. For `a = [1, 7, 3, 6, 5, 6]`, `T = 28`; at `i = 3` the left sum is `1 + 7 + 3 = 11` and the right sum is `5 + 6 = 11`. You do not even need the array `P`: a running left sum suffices, giving O(n) time and O(1) space. [Find Pivot Index](/practice/find-pivot-index) is the practice version; the lesson is that a prefix "array" is often just a running variable when you only need the current prefix.

## Prefix sums plus a hash map

The prefix array turns "subarray with sum `k`" into "two prefix values that differ by `k`". A subarray `a[l..r]` sums to `k` exactly when `P[r+1] − P[l] = k`, that is `P[l] = P[r+1] − k`. So walk the array once, maintaining the running sum `s = P[i]`, and ask a hash map "how many earlier prefixes equal `s − k`?"

```python
def count_subarrays_with_sum(a, k):
    seen = {0: 1}            # P[0] = 0 has been seen once
    s = count = 0
    for x in a:
        s += x
        count += seen.get(s - k, 0)
        seen[s] = seen.get(s, 0) + 1
    return count
```

Trace `a = [1, 2, 1, 2, 1]`, `k = 3`:

| x | s | s − k | seen before this step | count |
|---|---|---|---|---|
| 1 | 1 | −2 | {0:1} | 0 |
| 2 | 3 | 0 | {0:1, 1:1} | 1 |
| 1 | 4 | 1 | {0:1, 1:1, 3:1} | 2 |
| 2 | 6 | 3 | {…, 4:1} | 3 |
| 1 | 7 | 4 | {…, 6:1} | 4 |

Four subarrays: `[1,2]`, `[2,1]`, `[1,2]`, `[2,1]`. This handles negative numbers, which a sliding window cannot (a window relies on the sum growing as it extends). [Subarray Sum Equals K](/practice/subarray-sum-equals-k) is the practice problem; the same idea with `s mod m` finds subarrays whose sum is divisible by `m`, and with prefix XOR finds subarrays with a given XOR.

## Two-dimensional prefix sums

For a grid `g` of `R × C`, define `P` of `(R+1) × (C+1)` where `P[r][c]` is the sum of the rectangle from `(0, 0)` to `(r−1, c−1)`. Build it with inclusion–exclusion, because the rectangles above and to the left overlap in the rectangle above-left:

$$P[r+1][c+1] = g[r][c] + P[r][c+1] + P[r+1][c] - P[r][c]$$

A query for the rectangle with top-left `(r1, c1)` and bottom-right `(r2, c2)` inclusive is the same inclusion–exclusion in reverse:

$$\text{sum} = P[r2+1][c2+1] - P[r1][c2+1] - P[r2+1][c1] + P[r1][c1]$$

Worked example:

```text
g:            P (with the zero row and column):
1 2 3         0  0  0  0
4 5 6         0  1  3  6
7 8 9         0  5 12 21
              0 12 27 45
```

Sum of the bottom-right 2 × 2 (`5 6 / 8 9` = 28): `P[3][3] − P[1][3] − P[3][1] + P[1][1] = 45 − 6 − 12 + 1 = 28`. Correct.

Build is O(RC), each query O(1). This is the "integral image" from computer vision (Viola–Jones face detection evaluates thousands of rectangle features per window in constant time each) and the standard preprocessing for "count ones in a submatrix" and "max-sum submatrix" problems.

## Difference arrays: range updates in O(1)

Prefix sums make *reads* over a range cheap. The inverse structure makes *writes* over a range cheap. Suppose you must apply `u` updates of the form "add `v` to every element in `[l, r]`" and only read the array at the end. Applying each update literally costs O(r − l + 1), so O(nu) total.

Instead keep a difference array `D` where `D[i] = a[i] − a[i−1]` (with `D[0] = a[0]`). Adding `v` to `a[l..r]` changes only two differences: the step into `l` grows by `v`, and the step out of `r` (into `r + 1`) shrinks by `v`:

```python
D[l] += v
if r + 1 < n:
    D[r + 1] -= v
```

After all updates, recover `a` as the prefix sum of `D`. Each update is O(1), the final reconstruction is O(n), total O(n + u).

Worked example, `n = 5`, starting from zeros, updates `add 2 to [1,3]`, `add 3 to [2,4]`, `add −1 to [0,0]`:

```text
start:            D = [ 0,  0,  0,  0,  0]
add 2 to [1,3]:   D = [ 0,  2,  0,  0, -2]      D[1] += 2, D[4] -= 2
add 3 to [2,4]:   D = [ 0,  2,  3,  0, -2]      D[2] += 3, r+1 = 5 is out of range
add -1 to [0,0]:  D = [-1,  3,  3,  0, -2]      D[0] += -1, D[1] -= -1
prefix sums of D:     [-1,  2,  5,  5,  3]
```

Check by hand: index 0 received only the −1; index 1 received +2; indices 2 and 3 received +2 and +3; index 4 received +3. The reconstruction matches.

Applications: "how many meetings overlap at each minute" (add 1 on `[start, end)`), bulk price adjustments over date ranges, flight bookings across seat ranges, and the *sweep line* over events, which is the same idea with a sorted map instead of an array when coordinates are sparse. [Meeting Rooms II](/practice/meeting-rooms-ii) is the sweep-line form. A 2D difference array (four corner updates per rectangle, then a 2D prefix sum) handles "add `v` to every cell in a sub-rectangle".

## Choosing between prefix sums, difference arrays and trees

| Need | Structure | Build | Update | Query |
|---|---|---|---|---|
| Many range sums, array never changes | Prefix sum | O(n) | — | O(1) |
| Many range adds, read everything once at the end | Difference array | O(n) | O(1) | O(n) once |
| Interleaved point updates and range sums | Fenwick tree (BIT) | O(n) | O(log n) | O(log n) |
| Interleaved range updates and range queries, or non-invertible ops (max, gcd) | Segment tree (with lazy propagation for range updates) | O(n) | O(log n) | O(log n) |

The prefix sum is a special case that happens to be perfect for read-heavy workloads. If the interviewer adds "and now elements can change", the prefix array needs an O(n) rebuild per change, and you should move to the [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees). If the operation has no inverse, you should say so and go straight to a segment tree.

In production the same table reappears at a different scale: a column store precomputes running totals per block; a metrics system stores cumulative counters (Prometheus counters are prefix sums over time, and `rate()` is the range difference); a ledger stores a running balance so a statement for any period is two lookups.

## Exercises

```exercise
id: range-sums
title: Range sum queries with a prefix array
prompt: |
  Given `nums` and a list of inclusive `[l, r]` queries, return the sum of
  `nums[l..r]` for each query. Build a prefix array of length `n + 1` once
  and answer every query in O(1).
languages: [python, javascript]
entry: range_sums
starter:
  python: |
    def range_sums(nums, queries):
        # your code here
        return []
  javascript: |
    function range_sums(nums, queries) {
      // your code here
      return [];
    }
tests:
  - args: [[3, 1, 4, 1, 5, 9, 2, 6], [[0, 2], [3, 5], [0, 7], [6, 6]]]
    expected: [8, 15, 31, 2]
  - args: [[3, 1, 4], []]
    expected: []
    label: no queries
  - args: [[-2, 5, -1], [[0, 1], [1, 2], [0, 2]]]
    expected: [3, 4, 2]
    label: negatives
  - args: [[7], [[0, 0]]]
    expected: [7]
    hidden: true
    label: single element
  - args: [[1, 2, 3, 4, 5], [[1, 3], [2, 2], [0, 4]]]
    expected: [9, 3, 15]
    hidden: true
hints:
  - "`P[0] = 0` and `P[i+1] = P[i] + nums[i]`; the answer for `[l, r]` is `P[r+1] - P[l]`."
```

```exercise
id: range-adds
title: Apply range additions with a difference array
prompt: |
  Start from an array of `n` zeros. Each update `[l, r, v]` adds `v` to
  every index in the inclusive range `[l, r]`. Return the final array.
  Record each update in O(1) on a difference array and reconstruct the
  result with one prefix-sum pass at the end.
languages: [python, javascript]
entry: apply_range_adds
starter:
  python: |
    def apply_range_adds(n, updates):
        # your code here
        return [0] * n
  javascript: |
    function apply_range_adds(n, updates) {
      // your code here
      return new Array(n).fill(0);
    }
tests:
  - args: [5, [[1, 3, 2], [2, 4, 3], [0, 0, -1]]]
    expected: [-1, 2, 5, 5, 3]
  - args: [3, []]
    expected: [0, 0, 0]
    label: no updates
  - args: [4, [[0, 3, 1], [0, 3, 1]]]
    expected: [2, 2, 2, 2]
    label: updates covering the whole array
  - args: [1, [[0, 0, 5]]]
    expected: [5]
    hidden: true
  - args: [6, [[0, 2, 1], [3, 5, 2], [1, 4, 10]]]
    expected: [1, 11, 11, 12, 12, 2]
    hidden: true
hints:
  - "`D[l] += v` and, if `r + 1 < n`, `D[r + 1] -= v`."
  - "The final array is the running sum of `D`."
```

## Senior signals

- You use the `n + 1` prefix convention with `P[0] = 0` and can explain why it removes the branch and the off-by-one.
- You recognise "subarray with sum k" as "two prefixes differing by k" and reach for a hash map of prefix counts, and you know why a sliding window fails with negatives.
- You can write the 2D inclusion–exclusion formulas from scratch and check them on a 3 × 3.
- You know prefix sums require an invertible operation and name the structures (sparse table, segment tree) for max/min.
- You see a batch of range updates and reach for a difference array, and you know the sweep-line generalisation for sparse coordinates.
- You can say when the array becomes mutable you move to a Fenwick tree, and why.

## Check yourself

```quiz
- q: >-
    With prefix array P of length n + 1 (P[0] = 0), which expression gives the sum of a[l..r] inclusive?
  options: ["P[r] − P[l − 1]", "P[r + 1] − P[l]", "P[r] − P[l]", "P[r + 1] − P[l + 1]"]
  answer: 1
  explanation: >-
    P[i] holds the sum of the first i elements. The sum up to and including index r is P[r + 1]; subtracting the sum of the first l elements leaves a[l..r]. P[r] − P[l − 1] is the length-n convention and breaks at l = 0.
- q: >-
    Why can a prefix array not answer range maximum queries the way it answers range sums?
  options: ["Max is not associative, so prefix maxima cannot be combined", "Max has no inverse, so a prefix max cannot be subtracted away", "Range max needs the values sorted first, which loses their positions", "Max needs a comparison per element, which costs more than an addition"]
  answer: 1
  explanation: >-
    Range sums work because subtraction undoes addition. There is no operation that removes a[0..l−1]'s contribution from max(a[0..r]), so knowing the max of a prefix tells you nothing about the max of a suffix of it. Max is associative, which is exactly why a sparse table or segment tree can answer range max; a monotonic deque handles sliding windows.
- q: >-
    You have 10⁶ updates of the form "add v to indices l..r" followed by a single read of the whole array. The best approach is:
  options: ["A difference array: O(1) per update, one O(n) prefix pass to read", "A Fenwick tree: O(log n) per update, O(n log n) to read everything", "A loop per update: O(r − l) per update, then O(n) to read", "A lazy segment tree: O(log n) per update, O(n) to read at the end"]
  answer: 0
  explanation: >-
    Because there are no reads between updates, the difference array's O(1) update plus one reconstruction is optimal. A lazy segment tree also works but costs O(log n) per update and far more code; it earns its keep only when reads and writes interleave. The literal loop is O(n) per update in the worst case.
- q: >-
    Counting subarrays whose sum equals k with a running sum s and a map of prefix counts, why must the map start as {0: 1}?
  options: ["It handles k = 0, where every element would otherwise be counted twice", "It records the empty prefix, so subarrays starting at index 0 are counted", "It prevents a KeyError the first time s − k is looked up in the map", "It is only an optimisation that saves one lookup and could be omitted"]
  answer: 1
  explanation: >-
    The empty prefix has sum 0, and a subarray a[0..r] with sum k needs that earlier prefix P[0] = 0 to subtract. Omitting the seed does not crash (the lookup uses a default); it silently undercounts every subarray that starts at index 0, whatever k is.
- q: >-
    For a 2D prefix array P where P[r][c] is the sum of the rectangle from (0,0) to (r−1,c−1), the sum of the rectangle (r1,c1)–(r2,c2) inclusive is:
  options: ["P[r2+1][c2+1] − P[r1][c2+1] − P[r2+1][c1] − P[r1][c1]", "P[r2][c2] − P[r1−1][c2] − P[r2][c1−1] + P[r1−1][c1−1]", "P[r2+1][c2+1] − P[r1][c2+1] − P[r2+1][c1]", "P[r2+1][c2+1] − P[r1][c2+1] − P[r2+1][c1] + P[r1][c1]"]
  answer: 3
  explanation: >-
    Subtracting the strip above and the strip to the left removes the top-left corner rectangle twice, so it must be added back once. Leaving out the add-back, or subtracting the corner a third time, undercounts. The P[r2][c2] version uses the indexing for a prefix array without the zero row and column, so it is off by one here.
```
