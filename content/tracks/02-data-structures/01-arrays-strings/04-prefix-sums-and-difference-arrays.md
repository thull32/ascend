---
slug: prefix-sums-and-difference-arrays
title: Prefix sums and difference arrays
description: Answer any range sum in O(1) after O(n) preprocessing, extend it to 2D with inclusion–exclusion traced cell by cell, invert it into difference arrays for O(1) range updates, pair it with a hash map for subarray-sum problems, and know where it overflows.
minutes: 40
difficulty: medium
tags: [arrays, prefix-sum, difference-array, range-query, inclusion-exclusion, hash-map, overflow]
problems: [range-sum-query-immutable, subarray-sum-equals-k, find-pivot-index]
---
A dashboard shows revenue for any date range the user drags out. The table has a row per day for ten years, 3,650 numbers, and the user issues a query every time the mouse moves. Summing the range each time is 3,650 additions per query, which is fine. Now the table is per second, 3 × 10⁸ rows of 8-byte totals, 2.4 GB, and the product manager wants it "instant". Summing a single day is 86,400 rows (691 KB, about 70 µs at 10 GB/s); summing the full decade is a 2.4 GB scan, about a quarter of a second, and the user drags the slider forty times a second. You need each query to cost the same regardless of how wide it is.

The prefix sum is the answer: two memory reads (about 200 ns if both miss cache) per query, whatever the width. It is the simplest instance of a very general idea: *precompute cumulative state so that any interval is the difference of two endpoints.* Once you see that shape, you will find it in bank ledgers, image processing, hash-based subarray problems, Kafka offsets and metrics counters.

## Prefix sums: range sums in O(1)

Given `a[0..n-1]`, define the prefix array `P` of length `n + 1` with `P[0] = 0` and

$$P[i+1] = P[i] + a[i]$$

so `P[i]` is the sum of the first `i` elements. Then the sum of `a[l..r]` inclusive is

$$\text{sum}(l, r) = P[r+1] - P[l]$$

Everything before `l` cancels; what remains is exactly `a[l] + … + a[r]`.

### Hand trace: building `P` for `a = [3, 1, 4, 1, 5, 9, 2, 6]`

| i | a[i] | P[i] (before) | P[i+1] = P[i] + a[i] |
|---|---|---|---|
| 0 | 3 | 0 | 3 |
| 1 | 1 | 3 | 4 |
| 2 | 4 | 4 | 8 |
| 3 | 1 | 8 | 9 |
| 4 | 5 | 9 | 14 |
| 5 | 9 | 14 | 23 |
| 6 | 2 | 23 | 25 |
| 7 | 6 | 25 | 31 |

So `P = [0, 3, 4, 8, 9, 14, 23, 25, 31]`, and:

- `sum(0, 2) = P[3] − P[0] = 8 − 0 = 8` (3 + 1 + 4).
- `sum(3, 5) = P[6] − P[3] = 23 − 8 = 15` (1 + 5 + 9).
- `sum(6, 6) = P[7] − P[6] = 25 − 23 = 2`.
- `sum(2, 7) = P[8] − P[2] = 31 − 4 = 27`.

Building `P` is one pass, O(n), with one addition per element. Each query is one subtraction, O(1). For `q` queries the total is O(n + q) instead of O(nq).

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

You will see prefix arrays of length `n` (`P[i] = a[0] + … + a[i]`) with a special case `sum(l, r) = P[r] − (P[l−1] if l > 0 else 0)`. The `n + 1` version removes the branch: `P[0] = 0` represents "sum of nothing", and every query is the same subtraction. Off-by-one errors in prefix sums come almost entirely from mixing the two conventions, so pick the `n + 1` one and stay with it. The same convention makes "sum of the first `k` elements" `P[k]` with no adjustment.

## Related cumulative structures

The trick is not specific to addition. It works for any operation with an inverse:

- **Prefix XOR**: `X[r+1] ^ X[l]` is the XOR of `a[l..r]`, because XOR is its own inverse.
- **Prefix counts**: `C[i]` = number of vowels (or zeros, or matches) in the first `i` characters; "how many vowels in `s[l..r]`" is `C[r+1] − C[l]`.
- **Prefix products** work with division, but zeros break it; [Product of Array Except Self](/practice/product-except-self) avoids division by combining a prefix product from the left and a suffix product from the right instead.
- **Prefix max/min** do *not* support range queries this way, because max has no inverse: knowing `max(a[0..r])` and `max(a[0..l−1])` tells you nothing about `max(a[l..r])`. Range max needs a sparse table or segment tree, covered in [Sparse tables and sqrt decomposition](/learn/advanced-data-structures/range-queries/sparse-tables-and-sqrt-decomposition).

## Worked example: the pivot index

"Find an index where the sum to its left equals the sum to its right." With the total `T = P[n]`, the left sum at `i` is `P[i]` and the right sum is `T − P[i] − a[i]`, so the check is `2 · P[i] + a[i] == T`. For `a = [1, 7, 3, 6, 5, 6]`, `T = 28`; at `i = 3` the left sum is `1 + 7 + 3 = 11` and the right sum is `5 + 6 = 11`. You do not need the array `P`: a running left sum suffices, giving O(n) time and O(1) space. [Find Pivot Index](/practice/find-pivot-index) is the practice version; the lesson is that a prefix "array" is often a single running variable when you only need the current prefix.

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

The invariant: before processing `a[i]`, `seen` holds the multiset `{P[0], …, P[i]}` with counts. Trace `a = [1, 2, 1, 2, 1]`, `k = 3`:

| x | s | s − k | seen before this step | matches | count |
|---|---|---|---|---|---|
| 1 | 1 | −2 | {0:1} | 0 | 0 |
| 2 | 3 | 0 | {0:1, 1:1} | 1 | 1 |
| 1 | 4 | 1 | {0:1, 1:1, 3:1} | 1 | 2 |
| 2 | 6 | 3 | {…, 4:1} | 1 | 3 |
| 1 | 7 | 4 | {…, 6:1} | 1 | 4 |

Four subarrays: `[1,2]`, `[2,1]`, `[1,2]`, `[2,1]`. Seeding `{0: 1}` is what counts subarrays that start at index 0; omit it and the second row finds no match. This handles negative numbers, which a sliding window cannot (a window relies on the sum growing as it extends). [Subarray Sum Equals K](/practice/subarray-sum-equals-k) is the practice problem. Three variants use the same table with a different key: `s mod m` finds subarrays whose sum is divisible by `m` (store `s mod m`, and in Python `%` is already non-negative); prefix XOR finds subarrays with a given XOR; storing the *first index* of each prefix instead of a count finds the longest subarray with sum `k`. [Prefix sums and hashing tricks](/learn/algorithms/technique-mastery/prefix-sums-and-hashing-tricks) and [Hash-map patterns](/learn/interview-patterns/sequence-patterns/hash-map-patterns) go through each.

## Two-dimensional prefix sums

For a grid `g` of `R × C`, define `P` of `(R+1) × (C+1)` where `P[r][c]` is the sum of the rectangle from `(0, 0)` to `(r−1, c−1)`. Build it with inclusion–exclusion, because the rectangles above and to the left overlap in the rectangle above-left:

$$P[r+1][c+1] = g[r][c] + P[r][c+1] + P[r+1][c] - P[r][c]$$

### Hand trace: building `P` for `g = [[1,2,3],[4,5,6],[7,8,9]]`

| cell (r, c) | g | above `P[r][c+1]` | left `P[r+1][c]` | diagonal `P[r][c]` | `P[r+1][c+1]` |
|---|---|---|---|---|---|
| (0, 0) | 1 | 0 | 0 | 0 | 1 |
| (0, 1) | 2 | 0 | 1 | 0 | 3 |
| (0, 2) | 3 | 0 | 3 | 0 | 6 |
| (1, 0) | 4 | 1 | 0 | 0 | 5 |
| (1, 1) | 5 | 3 | 5 | 1 | 12 |
| (1, 2) | 6 | 6 | 12 | 3 | 21 |
| (2, 0) | 7 | 5 | 0 | 0 | 12 |
| (2, 1) | 8 | 12 | 12 | 5 | 27 |
| (2, 2) | 9 | 21 | 27 | 12 | 45 |

```text
P (with the zero row and column):
0  0  0  0
0  1  3  6
0  5 12 21
0 12 27 45
```

Row (1, 1) shows why the diagonal term exists: the 3 above and the 5 to the left both include `g[0][0] = 1`, so it is subtracted once. A query for the rectangle with top-left `(r1, c1)` and bottom-right `(r2, c2)` inclusive is the same inclusion–exclusion in reverse:

$$\text{sum} = P[r2+1][c2+1] - P[r1][c2+1] - P[r2+1][c1] + P[r1][c1]$$

| query | terms | result | check |
|---|---|---|---|
| bottom-right 2 × 2, (1,1)–(2,2) | 45 − 6 − 12 + 1 | 28 | 5 + 6 + 8 + 9 |
| top-right 2 × 2, (0,1)–(1,2) | 21 − 0 − 5 + 0 | 16 | 2 + 3 + 5 + 6 |
| bottom row, (2,0)–(2,2) | 45 − 21 − 0 + 0 | 24 | 7 + 8 + 9 |

```python
def build_prefix_2d(g):
    R, C = len(g), len(g[0]) if g else 0
    P = [[0] * (C + 1) for _ in range(R + 1)]
    for r in range(R):
        for c in range(C):
            P[r + 1][c + 1] = g[r][c] + P[r][c + 1] + P[r + 1][c] - P[r][c]
    return P

def rect_sum(P, r1, c1, r2, c2):       # inclusive corners
    return P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1]
```

Build is O(RC), each query O(1), and the build walks rows in the inner loop, so it is cache-friendly in row-major storage (see [Two-dimensional arrays](/learn/data-structures/arrays-strings/two-dimensional-arrays)). This is the "integral image" of computer vision: in the Viola–Jones face detector (CVPR 2001) any rectangle sum is four array reads and a two-rectangle feature six, which is what let a 38-layer cascade holding 6,061 features run in real time, evaluating on average 10 of them per sub-window. OpenCV's `integral` writes the table in a wider type than the input because a 4K 8-bit image sums to 3840 × 2160 × 255 ≈ 2.1 × 10⁹, right at the edge of a signed 32-bit integer.

## Difference arrays: range updates in O(1)

Prefix sums make *reads* over a range cheap. The inverse structure makes *writes* over a range cheap. Suppose you must apply `u` updates of the form "add `v` to every element in `[l, r]`" and only read the array at the end. Applying each update literally costs O(r − l + 1), so O(nu) total.

Instead keep a difference array `D` where `D[i] = a[i] − a[i−1]` (with `D[0] = a[0]`). Adding `v` to `a[l..r]` changes only two differences: the step into `l` grows by `v`, and the step out of `r` (into `r + 1`) shrinks by `v`:

```python
D[l] += v
if r + 1 < n:
    D[r + 1] -= v
```

After all updates, recover `a` as the prefix sum of `D`. Each update is O(1), the final reconstruction is O(n), total O(n + u).

### Hand trace: `n = 5`, updates `+2 on [1,3]`, `+3 on [2,4]`, `−1 on [0,0]`

| step | update | writes | D after |
|---|---|---|---|
| 0 | start | | `[0, 0, 0, 0, 0]` |
| 1 | add 2 to [1, 3] | `D[1] += 2`, `D[4] −= 2` | `[0, 2, 0, 0, −2]` |
| 2 | add 3 to [2, 4] | `D[2] += 3`; `r + 1 = 5` is out of range, no second write | `[0, 2, 3, 0, −2]` |
| 3 | add −1 to [0, 0] | `D[0] += −1`, `D[1] −= −1` | `[−1, 3, 3, 0, −2]` |
| 4 | prefix-sum D | running sums −1, 2, 5, 5, 3 | `a = [−1, 2, 5, 5, 3]` |

Check by hand: index 0 received only the −1; index 1 received +2; indices 2 and 3 received +2 and +3; index 4 received +3. Allocating `D` with `n + 1` slots removes the range check, in the same way the leading zero removed it for prefix sums.

Applications: "how many meetings overlap at each minute" (add 1 on `[start, end)`), bulk price adjustments over date ranges, seat bookings across ranges, and the *sweep line* over events, which is the same idea with a sorted map instead of an array when coordinates are sparse. [Meeting Rooms II](/practice/meeting-rooms-ii) is the sweep-line form. A 2D difference array handles "add `v` to every cell in a sub-rectangle" with four corner writes, `D[r1][c1] += v`, `D[r1][c2+1] −= v`, `D[r2+1][c1] −= v`, `D[r2+1][c2+1] += v`, followed by one 2D prefix-sum pass.

## Under the hood: overflow, floats and memory

**Integers.** A prefix array holds sums, not values, so it needs a wider type than the input. 10⁵ elements of magnitude 10⁵ sum to 10¹⁰, past the signed 32-bit limit of 2,147,483,647; a Java `int[]` or Go `int32` prefix wraps silently to a negative number. Use 64-bit accumulators, or in JavaScript stay under the safe-integer limit of 2⁵³ − 1 ≈ 9 × 10¹⁵ (a prefix over 10⁹ values of 10⁶ is 10¹⁵, still safe; over 10⁹ values of 10⁷ is not). CPython promotes to arbitrary precision, at a cost: an `int` grows from 28 to 32 bytes past 2³⁰ and arithmetic slows as digits are added.

**Floats.** Addition of floats is not associative and a running sum accumulates error. In `float32`, `16,777,216 + 1` equals `16,777,216`: a running count in single precision stops increasing at 2²⁴. In `float64` the worst-case relative error of a naive running sum of `n` terms is about `n × 2⁻⁵³`, roughly 10⁻⁸ for `n = 10⁸`, which is fine for a dashboard and wrong for a ledger; NumPy's `sum` uses pairwise summation along the contiguous axis, which its source describes as rounding error O(log n) instead of O(n), and Kahan summation carries a correction term. Money is integers in the smallest unit.

**Memory.** The prefix array is a second copy of the data in a wider type. A 1 GB array of `uint8` pixel values needs a 4 GB `int32` (or 8 GB `int64`) prefix table, which is why integral images are computed per tile or per row block on large frames.

**Building it.** `itertools.accumulate` and `numpy.cumsum` build a prefix array in one pass; the serial dependency (`P[i+1]` needs `P[i]`) means a naive loop cannot be vectorised, and parallel prefix scans get around it: Blelloch's work-efficient scan does about 2n additions in `O(log n)` depth, and NVIDIA's CUB library uses a single-pass successor (Merrill and Garland's "decoupled look-back" scan) on GPUs.

## Where prefix sums live in real systems

- **Kafka** offsets are prefix counts: the number of records written to a partition before a given one, so consumer lag is a subtraction of two offsets. Compaction removes records but, per Kafka's design docs, never changes an offset, so on a compacted topic the difference is an upper bound on the records remaining; see [Kafka internals](/learn/big-data/streaming/kafka-internals).
- **Prometheus** counters are prefix sums over time; `rate(x[5m])` is a range difference divided by the window, and the counter-reset handling exists because a restarted process makes the difference negative.
- **SQL** window functions (`SUM(amount) OVER (ORDER BY day)`) compute running totals, and ledgers store a running balance so a statement for any period is two lookups.
- **Column stores** keep per-block aggregates so a range query adds a few block totals plus two partial blocks instead of scanning every row.
- **Computer vision** uses the integral image for box filters and Haar features, as above.

## Choosing between prefix sums, difference arrays and trees

| Need | Structure | Build | Update | Query | Extra memory | Needs an inverse |
|---|---|---|---|---|---|---|
| Many range sums, array never changes | Prefix sum | O(n) | O(n) rebuild | O(1) | n + 1 wide cells | yes |
| Many range adds, read everything once at the end | Difference array | O(n) | O(1) | O(n) once | n + 1 cells | yes |
| Interleaved point updates and range sums | Fenwick tree (BIT) | O(n) | O(log n) | O(log n) | n cells | yes |
| Interleaved range updates and range queries, or max/min/gcd | Segment tree (lazy propagation for range updates) | O(n) | O(log n) | O(log n) | 2n–4n cells | no |

The prefix sum is a special case that happens to be perfect for read-heavy workloads. If the interviewer adds "and now elements can change", the prefix array needs an O(n) rebuild per change, and you should move to the [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees). If the operation has no inverse, say so and go straight to a [segment tree](/learn/advanced-data-structures/range-queries/segment-trees).

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Range totals go negative on large ranges; small ranges are correct | The prefix array is 32-bit and wrapped past 2³¹ − 1 | 64-bit prefix cells; assert the maximum possible total fits |
| A running total drifts from a recomputed total by an amount that grows with time | Float accumulation error in a long-lived running sum, or a `float32` count stuck at 2²⁴ | Integer units for money and counts; periodic recomputation; pairwise or Kahan summation |
| Every range answer is off by exactly one element at one edge | Two prefix conventions (`P[r] − P[l−1]` and `P[r+1] − P[l]`) mixed in one codebase | Standardise on the `n + 1` array with `P[0] = 0` |
| Write latency spikes proportional to the array size | Someone rebuilds the prefix array on every point update | Fenwick tree, or batch the updates and rebuild once |
| `rate()` on a metrics counter shows a huge negative spike after a deploy | The process restarted and the counter reset; a prefix difference across the reset is negative | Detect resets (the value dropped) and treat the new value as the delta, which is what Prometheus does |
| Memory doubled or octupled after "adding prefix sums" to a byte array | The prefix table is a wider type than the input | Compute per tile, per block or on the fly for one-off queries |

## Interviewer follow-ups

**"Now the elements can change between queries."** Model answer: each change invalidates every prefix after it, an O(n) rebuild, so switch to a Fenwick tree for O(log n) point update and range sum, or a segment tree if range updates are also needed. Common wrong answer: update the prefix array in place from the changed index, which is the O(n) rebuild with extra steps.

**"Can you answer range minimum the same way?"** Model answer: no, min has no inverse, so prefix minima cannot be subtracted; use a sparse table (O(n log n) build, O(1) query, static) or a segment tree (O(log n), mutable), or a monotonic deque for a sliding window. Common wrong answer: store prefix minima and take the min of the two endpoints.

**"Count subarrays whose sum is divisible by `m`."** Model answer: two prefixes with the same residue mod `m` bracket a divisible subarray; keep counts per residue, seeded with `{0: 1}`, and normalise negative residues in languages where `%` can be negative. Common wrong answer: a sliding window, which fails on negative numbers and on the "count all" requirement.

**"The values are dollar amounts as floats. Anything to worry about?"** Model answer: yes: store cents as integers, or accept and bound the float error; a naive running sum of 10⁸ `float64` values can be off in the eighth significant digit. Common wrong answer: "doubles have 15 digits, so it is fine".

## What mid-level engineers get wrong

- **Forgetting `seen = {0: 1}`.** Consequence: every subarray that starts at index 0 is silently uncounted; tests with the answer in the middle pass.
- **Using a sliding window for "subarray sum equals k".** Consequence: correct on positive inputs, wrong the first time a negative value appears.
- **Keeping the prefix array in the input's type.** Consequence: correct on the examples, negative totals at 10⁵ elements, in a language that does not raise on overflow.
- **Rebuilding the prefix array after each update.** Consequence: O(nq) instead of O((n + q) log n), noticed only under production write rates.
- **Writing the 2D query without the `+ P[r1][c1]` term.** Consequence: every rectangle that does not touch the top-left corner is short by its overlap.

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
- You recognise "subarray with sum k" as "two prefixes differing by k", reach for a hash map of prefix counts seeded with `{0: 1}`, and you know why a sliding window fails with negatives.
- You can write the 2D inclusion–exclusion formulas from scratch, trace the build cell by cell, and check a query on a 3 × 3.
- You know prefix sums require an invertible operation and name the structures (sparse table, segment tree) for max/min.
- You see a batch of range updates and reach for a difference array, and you know the sweep-line generalisation for sparse coordinates.
- You put the prefix array in a wider type than the input, treat float running sums as approximate, and can say where 2³¹ and 2⁵³ bite.
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
    A Java service stores a prefix array of request byte counts in an int[]. Small ranges are correct but week-long ranges come back negative. What happened?
  options: ["Integer division in the average step truncated toward negative infinity", "The array was rebuilt concurrently and a reader saw a half-built prefix", "The prefix array used the P[r] − P[l − 1] convention and read index −1", "The running total passed 2³¹ − 1 and wrapped, so later prefixes are negative"]
  answer: 3
  explanation: >-
    A prefix array holds sums, which grow without bound, so it needs a wider type than the values: a few gigabytes of traffic exceeds the signed 32-bit limit of 2,147,483,647 and Java wraps silently. Short ranges subtract two wrapped values that are both past the limit by the same amount, which is why they still look right. Use long for the prefix cells.
- q: >-
    For a 2D prefix array P where P[r][c] is the sum of the rectangle from (0,0) to (r−1,c−1), the sum of the rectangle (r1,c1)–(r2,c2) inclusive is:
  options: ["P[r2+1][c2+1] − P[r1][c2+1] − P[r2+1][c1] − P[r1][c1]", "P[r2][c2] − P[r1−1][c2] − P[r2][c1−1] + P[r1−1][c1−1]", "P[r2+1][c2+1] − P[r1][c2+1] − P[r2+1][c1]", "P[r2+1][c2+1] − P[r1][c2+1] − P[r2+1][c1] + P[r1][c1]"]
  answer: 3
  explanation: >-
    Subtracting the strip above and the strip to the left removes the top-left corner rectangle twice, so it must be added back once. Leaving out the add-back, or subtracting the corner a third time, undercounts. The P[r2][c2] version uses the indexing for a prefix array without the zero row and column, so it is off by one here.
```
