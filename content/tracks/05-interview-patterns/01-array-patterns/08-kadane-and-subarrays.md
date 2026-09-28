---
slug: kadane-and-subarrays
title: "Kadane and the subarray family: best subarray ending here"
description: One running value, "the best subarray that ends at this index", solves maximum sum, maximum product and best-time-to-trade in one online pass; how to recognise it when the statement hides it, and how the circular, at-least-L, k-concatenation and streaming follow-ups change it.
minutes: 28
difficulty: medium
tags: [pattern:subarray, kadane, dynamic-programming, arrays, greedy]
problems: [maximum-subarray, max-product-subarray, best-time-to-buy-sell, subarray-sum-equals-k]
---
An array of integers, some negative. Find the contiguous subarray with the largest sum. There are `n(n+1)/2` subarrays, so enumerating them is `O(n²)` even with prefix sums, and at `n = 10⁵` that is five billion additions. Sorting does not help, because contiguity is the whole constraint. A sliding window looks tempting until you notice that a negative number sometimes *helps* the eventual answer (the −1 in `[4, −1, 2, 1]` is worth keeping, because it connects 4 to `2, 1`), so there is no rule for when to shrink.

Kadane's algorithm solves it in one pass with two variables: on the machine this lesson was written on, a million elements take 19 ms in CPython 3.14 and under 1 ms in Node 24. The idea is a question you ask at every index: *what is the best subarray that ends exactly here?* It is either this element alone, or this element appended to the best subarray ending one step earlier. That recurrence extends to products, to trading profits, to circular arrays and to arrays repeated a billion times, and the reason it works is the same reason it fails on the neighbouring problems that look identical.

The theory (why the recurrence is a dynamic programme, and why it is also a prefix-sum identity) is short and covered below. The rest of the lesson is recognition and execution: the statements that hide a Kadane, the ones that look like one and are not, and the follow-ups that change the algorithm.

## The signal

Reach for Kadane when both of these hold:

1. **You optimise over contiguous subarrays**: the largest or smallest sum, product or score of *some* contiguous run. Not a count, not an exact target.
2. **The objective decomposes at the right edge**: "the best run ending at `i`" can be computed from "the best run ending at `i − 1`" plus the element at `i`, with a constant amount of state.

The quickest way to separate Kadane from a sliding window is to ask whether the statement gives you an **objective** or a **predicate**. "Largest sum", "maximum product", "best profit" are objectives: every subarray has a score and you want the best score. "Longest subarray with at most `k` distinct", "shortest with sum at least `S`" are predicates: every subarray is valid or not, and you want the longest or shortest valid one. Objectives decompose at the right edge; predicates need a window whose validity survives shrinking. A statement with an exact target ("sum equals `k`") is neither, and goes to prefix sums.

### Kadanes the statement does not name

| Statement | The hidden Kadane |
|---|---|
| "Best single buy then sell" ([Best Time to Buy and Sell Stock](/practice/best-time-to-buy-sell)) | Maximum subarray of daily price differences, with the empty trade allowed |
| "Flip one contiguous segment of a binary string to maximise the number of 1s" | Map 0 → +1 and 1 → −1; the best gain is the maximum subarray of the mapped array (or 0) |
| "Largest peak-to-trough fall in a price series" (maximum drawdown) | Minimum subarray of daily differences |
| "Largest-sum rectangle in a matrix" | Fix a pair of rows, collapse each column between them to one number, run Kadane across |
| "Largest count difference between two letters in any substring" | Map one letter to +1, the other to −1, everything else to 0, then Kadane |
| "The array repeated `k` times" | Kadane on two copies, plus `(k − 2) × total` when the total is positive |

### Near misses

| Statement | Needs instead | Why |
|---|---|---|
| "Count subarrays with sum exactly `k`" ([Subarray Sum Equals K](/practice/subarray-sum-equals-k)) | [Prefix sums](/learn/interview-patterns/array-patterns/prefix-sum) + hash map | An exact target has no "best ending here"; you need `P[j] − P[i] = k` |
| "Maximum sum of a subarray of length exactly `k`" | Fixed [sliding window](/learn/interview-patterns/array-patterns/sliding-window) | Kadane cannot enforce a length |
| "Maximum sum of a subarray of length at most `k`" | Prefix sums + a monotonic deque of prefix minima | The best start must lie within `k` of the end, a sliding minimum |
| "Maximum sum of a subarray of length at least `L`" | Kadane lagged by `L`: prefix minimum of `P[0..j−L]` | Still `O(n)`, but the plain recurrence ignores the constraint |
| "Longest subarray with sum ≤ `k`", values non-negative | Sliding window | A monotone predicate, not an objective |
| "Maximum sum of a *subsequence*" | Sum of the positive values (or the largest value if none) | Not contiguous; there is nothing to decompose |
| "Maximum average over subarrays of length ≥ `k`" | [Binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer) + the at-least-`L` check | Averages do not decompose at the right edge; subtract the guess and test "some sum ≥ 0" |
| "`k` non-overlapping subarrays with maximum total" | DP with `k` states per index | One running value holds one subarray |

Kadane is not a sliding window. A window needs a predicate that survives shrinking; with negatives the sum is not monotone in the window's length. Kadane replaces "shrink from the left" with "restart from scratch", which is valid only because the objective is additive and a prefix with negative sum can never help any later subarray.

## Four decisions before you type

| Problem | State ending at `i` | Transition | Answer | Restart |
|---|---|---|---|---|
| [Maximum Subarray](/practice/maximum-subarray) | `cur`: best sum ending at `i` | `max(x, cur + x)` | max `cur` | when `cur < 0` |
| [Maximum Product Subarray](/practice/max-product-subarray) | `hi`, `lo`: largest and smallest product ending at `i` | max and min of `{x, hi·x, lo·x}` from the *old* pair | max `hi` | a zero resets both automatically |
| [Best Time to Buy and Sell](/practice/best-time-to-buy-sell) | `cur` on differences, equal to `price − min_so_far` | `max(0, cur + d)` | max `cur` | clamps at 0, since not trading is allowed |
| Circular maximum | `cur_max`, `cur_min`, `total` | two Kadanes in one pass | `max(best, total − worst)` | all negative: return `best` |
| At most one deletion | `keep`, `drop` | `drop = max(keep_prev, drop_prev + x)` | max of both | per state |

The decisions: what the state is, how it transitions (from the *old* values), what the answer aggregates, and whether the empty subarray is allowed. The last one decides the initialisation, and it is the question to ask the interviewer before writing a line.

## The template

`cur` is the largest sum of any subarray ending exactly at the current index; `best` is the largest `cur` seen.

```python
def max_subarray(nums):
    best = cur = nums[0]                   # non-empty: seed from the data, not 0
    for x in nums[1:]:
        cur = max(x, cur + x)              # extend the previous run, or start at x
        best = max(best, cur)
    return best


def max_subarray_span(nums):
    """Return (best_sum, left, right) for the earliest maximum subarray."""
    best = cur = nums[0]
    start = left = right = 0
    for i in range(1, len(nums)):
        if cur < 0:                        # the run ending at i - 1 only hurts: restart
            cur, start = nums[i], i
        else:                              # cur >= 0: extending never hurts (ties keep the longer run)
            cur += nums[i]
        if cur > best:                     # strict: the earliest best wins ties
            best, left, right = cur, start, i
    return best, left, right
```

```javascript
function maxSubarray(nums) {
  let best = nums[0], cur = nums[0];
  for (let i = 1; i < nums.length; i++) {
    const x = nums[i];
    cur = Math.max(x, cur + x);
    best = Math.max(best, cur);
  }
  return best;
}

function maxSubarraySpan(nums) {
  let best = nums[0], cur = nums[0], start = 0, left = 0, right = 0;
  for (let i = 1; i < nums.length; i++) {
    if (cur < 0) { cur = nums[i]; start = i; } else { cur += nums[i]; }
    if (cur > best) { best = cur; left = start; right = i; }
  }
  return [best, left, right];
}
```

The invariant after index `i`: `cur` is the maximum sum over subarrays ending at `i`, and `best` is the maximum over all subarrays ending at or before `i`. It holds because every subarray ending at `i` either is `[x]` or is some subarray ending at `i − 1` with `x` appended, and the best of the latter is `cur + x`. `cur + x < x` exactly when `cur < 0`, which is the restart rule in the span version.

Two views, one code. **As DP:** `dp[i] = max(nums[i], dp[i−1] + nums[i])` with the table compressed to one variable ([one-dimensional DP](/learn/algorithms/dynamic-programming/one-dimensional-dp)); this is the view that extends to products and deletions, because each extra decision adds a state. **As prefix sums:** the best subarray ending at `j` is `P[j+1] − min(P[0..j])`, so Kadane is "prefix sum minus running minimum prefix", and `cur` is exactly that difference. This is the view that handles length constraints.

**Why restarting is safe.** Suppose the best subarray is `nums[l..r]` and some proper prefix `nums[l..m]` of it, with `m < r`, has a negative sum. Dropping that prefix leaves `nums[m+1..r]` with a strictly larger sum, a contradiction. So no optimal subarray starts with a negative-sum prefix. When `cur < 0` at index `i − 1`, the run ending there is exactly such a prefix for anything that extends it, and throwing it away loses nothing. This is the greedy form of the argument ([exchange arguments](/learn/algorithms/greedy/greedy-and-exchange-arguments)); the DP form proves the same thing by cases on whether the best subarray ending at `i` has length 1.

```viz
{"type": "array", "algorithm": "kadane", "values": [-2, 1, -3, 4, -1, 2, 1, -5, 4], "title": "Kadane on the classic input", "caption": "Watch cur reset at index 3 when the running sum has gone negative, then survive the -1 at index 4 because the prefix 4 is still worth keeping."}
```

## Worked problems

### Maximum Subarray

[Maximum Subarray](/practice/maximum-subarray). Trace of the span version on `[-2, 1, -3, 4, -1, 2, 1, -5, 4]`:

| `i` | `x` | `cur` before | restart? | `cur` after | `start` | `best` | span |
|---|---|---|---|---|---|---|---|
| 0 | −2 | | | −2 | 0 | −2 | [0, 0] |
| 1 | 1 | −2 | yes | 1 | 1 | 1 | [1, 1] |
| 2 | −3 | 1 | no | −2 | 1 | 1 | [1, 1] |
| 3 | 4 | −2 | yes | 4 | 3 | 4 | [3, 3] |
| 4 | −1 | 4 | no | 3 | 3 | 4 | [3, 3] |
| 5 | 2 | 3 | no | 5 | 3 | 5 | [3, 5] |
| 6 | 1 | 5 | no | 6 | 3 | 6 | [3, 6] |
| 7 | −5 | 6 | no | 1 | 3 | 6 | [3, 6] |
| 8 | 4 | 1 | no | 5 | 3 | 6 | [3, 6] |

Answer 6 from `[4, −1, 2, 1]`, indices 3 to 6. At `i = 4` the −1 is absorbed because the run before it is still positive; no window rule could justify keeping it. On an all-negative input such as `[-3, -1, -2]` the answer is −1, and the seed `best = nums[0]` is what makes that come out: a `best = 0` seed returns the empty subarray.

```viz
{"type": "dp", "algorithm": "max-subarray", "values": [5, -3, 5, -7, 4, 2], "title": "The same recurrence as a DP table", "caption": "dp[i] is the best sum ending at i: 5, 2, 7, 0, 4, 6. At i = 3 the choice is max(-7, 7 + (-7)) = 0, so the prefix is kept even though it has been dragged to zero; the answer is 7 from [5, -3, 5]. Check each cell against max(x, dp[i-1] + x)."}
```

### Maximum Product Subarray

[Maximum Product Subarray](/practice/max-product-subarray). One variable is not enough: a negative `x` turns the *smallest* product ending at `i − 1` into the largest ending at `i`. Keep both extremes, and compute both from the old pair.

```python
def max_product(nums):
    best = hi = lo = nums[0]
    for x in nums[1:]:
        cands = (x, hi * x, lo * x)        # built from the OLD hi and lo
        hi, lo = max(cands), min(cands)
        best = max(best, hi)
    return best
```

Trace on `[2, -5, -2, -4, 3]`:

| `i` | `x` | candidates `{x, hi·x, lo·x}` | `hi` | `lo` | `best` |
|---|---|---|---|---|---|
| 0 | 2 | | 2 | 2 | 2 |
| 1 | −5 | {−5, −10, −10} | −5 | −10 | 2 |
| 2 | −2 | {−2, 10, 20} | 20 | −2 | 20 |
| 3 | −4 | {−4, −80, 8} | 8 | −80 | 20 |
| 4 | 3 | {3, 24, −240} | 24 | −240 | 24 |

Answer 24 from `[-2, -4, 3]`. At `i = 2` the winner is `lo · x`: the worst run `[2, −5]` times −2 became the best. At `i = 3` the new `hi` of 8 comes from `lo = −2`, a run that had restarted at `x` one step earlier. Zeros need no special case: on `[-2, 0, -1]` the candidates at the zero are all 0, so `hi = lo = 0`, the next step restarts at −1, and the answer is 0.

### Best Time to Buy and Sell Stock

[Best Time to Buy and Sell Stock](/practice/best-time-to-buy-sell). Buying on day `i` and selling on day `j` earns `prices[j] − prices[i]`, the sum of the daily differences `d[k] = prices[k] − prices[k−1]` for `k` in `i+1..j`. So the best trade is the maximum subarray of `d`, with the empty trade (profit 0) allowed, which turns the restart into a clamp at 0.

```python
def max_profit(prices):
    cur = best = 0                          # empty trade allowed: seed 0 is correct here
    for k in range(1, len(prices)):
        cur = max(0, cur + prices[k] - prices[k - 1])
        best = max(best, cur)
    return best
```

Trace on `[7, 1, 5, 3, 6, 4]`, differences `[-6, 4, -2, 3, -2]`:

| `k` | `d[k]` | `cur = max(0, cur + d)` | `best` | same thing as: min price so far, profit selling today |
|---|---|---|---|---|
| 1 | −6 | 0 | 0 | min 1, profit 0 |
| 2 | 4 | 4 | 4 | min 1, profit 4 |
| 3 | −2 | 2 | 4 | min 1, profit 2 |
| 4 | 3 | 5 | 5 | min 1, profit 5 |
| 5 | −2 | 3 | 5 | min 1, profit 3 |

Answer 5 (buy at 1, sell at 6). The right-hand column is the form most people write: `cur` in the Kadane form always equals `prices[k] − min_so_far`, which is the prefix-sum view again (prices are the prefix sums of the differences). Seeing that equivalence is what lets you find Kadane in a statement that never says "subarray". Here, and only here, seeding with 0 is right, because the empty trade is a legal answer.

### Hidden Kadane: flip one segment

"You may flip at most one contiguous segment of a bit array (0 becomes 1 and 1 becomes 0). Maximise the number of 1s." Flipping a segment gains one for every 0 in it and loses one for every 1, so map 0 → +1 and 1 → −1 and find the maximum subarray of the mapped array, clamped at 0 because flipping nothing is allowed. The answer is the original count of 1s plus that gain.

Trace on `[1, 0, 0, 1, 0, 1, 1, 0]`, which has four 1s. Mapped: `[−1, +1, +1, −1, +1, −1, −1, +1]`.

| `i` | bit | mapped | `cur = max(0, cur + m)` | `best` gain |
|---|---|---|---|---|
| 0 | 1 | −1 | 0 | 0 |
| 1 | 0 | +1 | 1 | 1 |
| 2 | 0 | +1 | 2 | 2 |
| 3 | 1 | −1 | 1 | 2 |
| 4 | 0 | +1 | 2 | 2 |
| 5 | 1 | −1 | 1 | 2 |
| 6 | 1 | −1 | 0 | 2 |
| 7 | 0 | +1 | 1 | 2 |

Best gain 2 (flip indices 1..2), so the answer is 4 + 2 = 6. Nothing in the statement says "subarray sum"; the recognition step is noticing that the score of a segment is a sum of per-element contributions.

## Variants

| Variant | What changes | Cost |
|---|---|---|
| Minimum subarray | Every `max` becomes `min` | `O(n)` |
| Return the span | Track `start` on restart; record `(start, i)` on a strict improvement; decide ties up front | `O(n)` |
| Circular | `max(best, total − worst)`, unless `best < 0` (all negative: the wrapped formula is the empty subarray) | `O(n)`, one pass |
| At most one deletion | States `keep` and `drop`: `drop = max(keep_prev, drop_prev + x)` | `O(n)` |
| Length at least `L` | `best = max over j of P[j] − min(P[0..j−L])` | `O(n)` |
| Length at most `k` | Monotonic deque of prefix minima over the last `k` prefixes | `O(n)` |
| Repeated `k` times | `k = 1`: Kadane; otherwise Kadane on two copies, plus `(k − 2) × total` if `total > 0` | `O(n)` for any `k` |
| 2D maximum submatrix | Fix row pair, collapse columns, Kadane across | `O(rows² × cols)` |
| Range queries with updates | Segment tree whose node stores (sum, best prefix, best suffix, best) | `O(log n)` per operation |
| Several transactions, cooldown or fee | A small state machine over "holding" and "not holding" ([sequence DP](/learn/algorithms/dynamic-programming/sequence-dp)) | `O(n)` |

### The one-deletion variant, traced

"Maximum subarray sum if you may delete at most one element (the result must stay non-empty)." Add a state: `keep` is the best sum ending at `i` with no deletion, `drop` is the best ending at `i` with one deletion used. Deleting `x` itself leaves the best run ending at `i − 1`, so `drop = max(keep_prev, drop_prev + x)`. Trace on `[1, −2, 0, 3]`:

| `i` | `x` | `keep = max(x, keep + x)` | `drop = max(keep_prev, drop_prev + x)` | `best` |
|---|---|---|---|---|
| 0 | 1 | 1 | none yet | 1 |
| 1 | −2 | −1 | 1 (delete the −2) | 1 |
| 2 | 0 | 0 | 1 | 1 |
| 3 | 3 | 3 | 4 (`drop_prev + 3`) | 4 |

Answer 4 from `[1, 0, 3]` with the −2 deleted. Each extra decision in the statement becomes one more running value, and every transition reads the previous row only.

### The at-least-`L` variant, traced

Maximum sum over subarrays of length at least 3 in `[6, −7, 2, −1, 3]`. Plain Kadane answers 6 (the single 6), which violates the constraint. With prefixes `P = [0, 6, −1, 1, 0, 3]`, a subarray ending before prefix `j` with length at least 3 starts at a prefix index `i ≤ j − 3`, so keep the running minimum of `P[0..j−3]`:

| `j` | `P[j]` | newly allowed `P[j − 3]` | running min | `P[j] − min` | `best` |
|---|---|---|---|---|---|
| 3 | 1 | `P[0]` = 0 | 0 | 1 (`[6, −7, 2]`) | 1 |
| 4 | 0 | `P[1]` = 6 | 0 | 0 | 1 |
| 5 | 3 | `P[2]` = −1 | −1 | 4 (`[2, −1, 3]`) | 4 |

Answer 4. It is Kadane in its prefix-minimum form with the minimum lagged by `L`, still one pass.

## Complexity, derived

One pass, constant work per element (two comparisons and an addition; six multiplications and comparisons for the product version), so `O(n)` time and `O(1)` space. The lower bound is also `n`: an algorithm that skips an element cannot know whether that element is a huge positive, so Kadane is optimal. The at-least-`L` form needs the prefix `L` steps back, which is `O(n)` space with a stored prefix array or `O(1)` with a lagged running sum.

| Approach | Time | Extra space | Online (one pass, streamable) | Parallel or range queries | Handles length limits |
|---|---|---|---|---|---|
| All pairs with prefix sums | `O(n²)` | `O(n)` | no | no | yes |
| Divide and conquer (best left, right, crossing) | `O(n log n)` | `O(log n)` stack | no | yes | awkward |
| Kadane | `O(n)` | `O(1)` | yes | no | at least `L` by lagging |
| Prefix sum − running min prefix | `O(n)` | `O(1)` to `O(n)` | yes | no | at least `L`, at most `k` with a deque |
| Segment tree of 4-tuples | `O(n)` build, `O(log n)` query | `O(n)` | no | yes, with point updates | per query range |

The divide-and-conquer version is slower but its combine step, "(sum, best prefix, best suffix, best)", is associative, which is what the segment tree and a parallel reduction reuse.

## Under the hood

### What one pass costs, measured

Maximum Subarray on 10⁶ random integers in `[−100, 100]`, best of five runs on an AMD Ryzen 9 9950X3D, CPython 3.14 and Node 24 (`kd_bench.py`, `kd_bench.mjs`):

| Implementation | CPython 3.14 | Node 24 |
|---|---|---|
| `cur = max(x, cur + x)`, `best = max(best, cur)` over `nums[1:]` | 40.6 ns/elem | 0.74 ns/elem (`Math.max`) |
| `cur = cur + x if cur > 0 else x`, `if cur > best` | 23.5 ns/elem (indexing) | 0.65 ns/elem (ternary) |
| Same, iterating over `iter(nums)` | 19.4 ns/elem | — |
| `itertools.accumulate` prefix sums minus running min, via `map(sub, …)` | 67.6 ns/elem | — |
| `Array.prototype.reduce` with a `[cur, best]` accumulator | — | 5.7 ns/elem |

In CPython each `max(...)` is a call into a builtin, twice per element, and `nums[1:]` copies 8 MB of pointers before the loop starts; the comparison form uses the interpreter's int-specialised compare and no calls. The "all in C" `accumulate` form is the slowest here, because it builds two full lists and a new int object for every difference. In V8 both loops compile to a handful of machine instructions; the `reduce` form allocates a two-element array per element, and the allocation and garbage collection cost it 8×.

### Overflow and precision

Sums first. The usual constraints (`|x| ≤ 10⁴`, `n ≤ 10⁵`) keep every partial sum within 10⁹, inside a 32-bit int's 2.1 × 10⁹; with `|x|` up to 10⁹ you need 64-bit. JavaScript numbers are exact to 2⁵³ (about 9 × 10¹⁵).

Products are worse, in a different way in each runtime. In Python, `hi` and `lo` on a long run without zeros become big integers: a run of `n` threes has an `n × 1.58`-bit product, and each multiplication costs time proportional to that size, so the "`O(n)`" loop is quadratic. Measured (`kd_bench.py`): 2.5 ms for 10⁴ threes, 25 ms for 4 × 10⁴, 91 ms for 8 × 10⁴, each doubling of the length costing 3 to 3.6×; the same lengths with a zero every 100 elements stay linear at 1 to 8 ms. In JavaScript the product overflows to `Infinity` after about 1,024 doublings, and then a zero produces `Infinity × 0 = NaN`, which `Math.max` propagates: 1,100 twos followed by `0, 3` returned `NaN` in Node 24. The problem's guarantee that the answer fits in 32 bits rules these inputs out; when the guarantee is absent, track the sign and the sum of `log|x|` instead of the product.

Floating-point inputs are safer than they look. The running sum's rounding error grows with the length of the current run, and every restart discards it along with the run, so on typical data the error stays near a few units in the last place of the largest partial sum. The comparison `cur < 0` can still flip on a run whose true sum is within rounding of zero; if ties at zero matter to the output (they do when you return a span), compare against a tolerance or use integer units.

### At scale

Kadane is an **online** algorithm: it reads each element once, keeps `O(1)` state, and has an answer after every element, so it runs unchanged on an unbounded metric stream ("largest cumulative gain in any contiguous period so far"). Maximum drawdown in a price series is the minimum-subarray form over daily returns. When the data is sharded, each shard reduces to the 4-tuple (sum, best prefix, best suffix, best) and a coordinator combines tuples left to right: the combined best is `max(best_L, best_R, suffix_L + prefix_R)`. The same node makes a [segment tree](/learn/advanced-data-structures/range-queries/segment-trees) answer "best subarray inside `[l, r]`" with point updates in `O(log n)`.

## Failure modes

**An all-negative input reports 0.** *Symptom:* a "best streak" metric shows 0 for a series in which every period lost money; tests with a positive element all pass. *Diagnosis:* `best` or `cur` seeded with 0, which silently allows the empty subarray. *Fix:* seed from `nums[0]` whenever the answer must be non-empty, and put `[-3, -1, -2]` in the tests.

**Maximum product reports a product no subarray has.** *Symptom:* `[-1, -2, -1]` returns 4; the true answer is 2. *Diagnosis:* `hi` was updated first and the new value used to compute `lo`: at the −2, `hi` becomes 2 and then `lo = min(−2, 2 × −2, …) = −4`, a product that multiplies the −2 twice, and the final −1 turns it into 4. *Fix:* build the three candidates from the old pair, then assign both (the tuple in the template).

**`NaN` or a multi-second stall from a product loop.** *Symptom:* the JavaScript service returns `NaN`; the Python service takes seconds on one long input. *Diagnosis:* the product left the range the problem guaranteed: `Infinity × 0` in doubles, quadratic big-integer multiplication in Python. *Fix:* validate the guarantee at the boundary, or switch to sign plus log-magnitude.

**Two services report different "best windows" for the same data.** *Symptom:* a Python batch job and a JavaScript dashboard agree on the best sum but disagree on its start index. *Diagnosis:* different tie rules: one restarts when `cur ≤ 0`, the other when `cur < 0`, so a zero-sum prefix is kept by one and dropped by the other. Both are valid maximum subarrays. *Fix:* specify the tie rule (earliest start, shortest, longest) in the contract and test it with `[0, 3]` and `[2, −2, 3]`.

**The circular answer is 0 on an all-negative array.** *Symptom:* `[-3, -2, -3]` returns 0. *Diagnosis:* `total − worst` equals 0, the empty subarray, when the worst subarray is the whole array. *Fix:* if the linear `best` is negative, return it.

## Interviewer follow-ups

**"Now the input is a stream."** Model answer: nothing changes; Kadane is online with `O(1)` state, and the answer is available after every element. To report the span, keep absolute indices for `start`, `left` and `right`. Common wrong answer: buffering the stream to run a "real" algorithm at the end.

**"Now the values can all be negative", or "the empty subarray is allowed".** Model answer: this is the initialisation question. Non-empty means seeding from the first element; empty allowed means seeding with 0 and clamping `cur` at 0, as in the stock problem. Ask before coding. Common wrong answer: seeding with 0 by habit and returning 0 for `[-3, -1]`.

**"The array is repeated `k = 10⁹` times."** Model answer: a best subarray either fits within two adjacent copies or spans more, in which case it contains whole middle copies worth `total` each, which help only if `total > 0`; and when `total > 0`, spanning always beats staying inside one copy. So the answer is Kadane on two copies, plus `(k − 2) × total` when `total > 0`. For `[-1, 3, -1]`: two copies give 4, total is 1, answer `4 + (10⁹ − 2) = 1,000,000,002`. Common wrong answer: materialising the repetition, or multiplying the single-copy answer by `k`.

**"Now the subarray must have at least `L` elements."** Model answer: prefix sums with a running minimum lagged by `L`, as traced above; `O(n)`. With at most `k` elements, the minimum is over a sliding range, so a monotonic deque. Common wrong answer: plain Kadane followed by a length check, which discards the constrained optimum.

**"Now find the maximum-sum rectangle in an `R × C` matrix."** Model answer: fix the top row, extend the bottom row one at a time while adding each row into a column-sum array of length `C`, and run Kadane on that array after every extension. That is `O(R² × C)`; transpose first if `R > C` so the squared dimension is the smaller one. Common wrong answer: 2D prefix sums over all four corners, `O(R² × C²)`.

**"The array has 10⁹ elements spread over 100 machines."** Model answer: each machine reduces its shard to (sum, best prefix, best suffix, best), and the tuples combine associatively in order, so the whole thing is a parallel reduction with 100 tiny messages. Common wrong answer: shipping every shard's `best` and taking the maximum, which misses subarrays that cross a shard boundary.

## What mid-level engineers get wrong

- **Seeding `best` with 0 by reflex.** Consequence: the empty subarray leaks into a problem that forbids it, and every all-negative test fails.
- **Forcing a sliding window onto it.** Consequence: `[2, −1, 3]` (keep the −1, answer 4) and `[2, −5, 3]` (drop the prefix, answer 3) look identical to any rule that reacts to "the sum went down", so one of them is always wrong.
- **Using Kadane for "sum exactly `k`".** Consequence: ten lost minutes; an exact target has no best-ending-here structure and needs prefix sums with a hash map.
- **Updating `hi` before computing `lo`.** Consequence: on inputs with several negatives the answer can be a product that no subarray has, such as 4 for `[-1, -2, -1]`.
- **Treating "skip negatives" as the rule.** Consequence: they drop the −1 in `[4, −1, 2, 1]`; Kadane drops a *prefix* whose sum is negative, never an element on its own.
- **Leaving ties unspecified when returning a span.** Consequence: a correct algorithm that disagrees with the expected output, or with another service.

## Exercises

```exercise
id: max-circular-subarray
title: Maximum circular subarray sum
prompt: |
  Given a non-empty array `nums`, return the maximum sum of a non-empty
  contiguous subarray, where the array is treated as circular: a subarray
  may wrap from the last element round to the first, but may not use any
  element more than once.

  Hint on shape: the answer is either an ordinary Kadane maximum, or the
  total minus the minimum-sum subarray (the wrapped case). Handle the
  all-negative array correctly.
languages: [python, javascript]
entry: max_circular_sum
starter:
  python: |
    def max_circular_sum(nums):
        # your code here
        return 0
  javascript: |
    function max_circular_sum(nums) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, -2, 3, -2]]
    expected: 3
  - args: [[5, -3, 5]]
    expected: 10
    label: wraps around
  - args: [[-3, -2, -3]]
    expected: -2
    label: all negative
  - args: [[3, -1, 2, -1]]
    expected: 4
  - args: [[1]]
    expected: 1
    label: single element
  - args: [[-2, 4, -5, 4, -5, 9, 4]]
    expected: 15
    hidden: true
  - args: [[3, -2, 2, -3]]
    expected: 3
    hidden: true
hints:
  - "Run Kadane twice in one pass: once with max to get the best linear subarray, once with min to get the worst."
  - "The wrapped answer is total - min_subarray, because the part you skip is a contiguous block in the middle."
  - "If the best linear sum is negative, every element is negative and the wrapped formula would describe the empty subarray; return the linear answer."
```

```exercise
id: max-k-concatenation
title: Maximum subarray of an array repeated k times
prompt: |
  The array `nums` (non-empty) is repeated `k` times end to end, where
  `1 <= k <= 10^9`. Return the maximum sum of a non-empty contiguous
  subarray of the repeated array.

  Do not build the repeated array. Decide what a best subarray can look
  like when it spans more than two copies, and when that can help.
languages: [python, javascript]
entry: max_k_concat
starter:
  python: |
    def max_k_concat(nums, k):
        # your code here
        return 0
  javascript: |
    function max_k_concat(nums, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2], 3]
    expected: 9
  - args: [[1, -2, 1], 5]
    expected: 2
    label: total is zero, so extra copies never help
  - args: [[-1, -2], 7]
    expected: -1
    label: all negative
  - args: [[-1, 3, -1], 1000000000]
    expected: 1000000002
    label: huge k with a positive total
  - args: [[5], 1]
    expected: 5
    label: single copy
  - args: [[3, -4, 2], 1]
    expected: 3
    hidden: true
  - args: [[2, -1, 2], 1000000000]
    expected: 3000000000
    hidden: true
  - args: [[-5, 4, -5], 1000000000]
    expected: 4
    hidden: true
hints:
  - "With k = 1 the answer is plain Kadane. With k >= 2, run Kadane on two copies: that covers every subarray spanning at most one copy boundary."
  - "A subarray spanning more copies contains whole copies worth sum(nums) each; add (k - 2) * sum(nums) only when that sum is positive."
```

## Senior signals

- You state the **recurrence** ("best ending here is `x` alone or `x` appended to the best ending one step earlier") before the code, and add one state per extra decision (sign for products, a deletion flag, a length lag).
- You know the **two views**: DP with a compressed table, and prefix sum minus running minimum prefix, and you use the second for length constraints.
- You ask whether the **empty subarray** is allowed before initialising, because it decides the seed.
- You find **hidden Kadanes**: price differences, ±1 mappings, collapsed matrix rows, repeated arrays.
- You know the **boundaries**: exact targets go to prefix sums, fixed lengths to windows, averages to binary search on the answer.
- You know the **operational facts**: it is online, it shards through an associative 4-tuple, and products leave the numeric range in both runtimes in different ways.

## Check yourself

```quiz
- q: >-
    In Kadane's algorithm, what does cur hold after processing index i?
  options: ["The maximum sum of any subarray that starts at index i", "The maximum sum of any subarray within nums[0..i]", "The running total of every element in nums[0..i]", "The maximum sum of any subarray that ends exactly at i"]
  answer: 3
  explanation: >-
    cur is the best subarray ending at i, which is what the recurrence needs: the best ending at i + 1 is nums[i + 1] alone or cur plus nums[i + 1]. The maximum over nums[0..i] is tracked separately in best. A running total is the prefix sum, which Kadane equals only until the first restart.
- q: >-
    An array is repeated k = 10^9 times and nums sums to a positive total. Kadane on two copies gives B. What is the answer?
  options: ["B alone, since a best subarray never spans more than two copies", "The total times k, since the whole array is always the best", "B plus (k - 2) times the total, for the whole middle copies", "B times k, since every copy contributes a best subarray"]
  answer: 2
  explanation: >-
    A subarray spanning many copies contains whole middle copies worth the total each, and with a positive total spanning always beats staying inside one copy, so the answer is the best two-copy subarray plus k - 2 middle copies. Multiplying B by k counts overlapping pieces; B alone is right only when the total is not positive; and the whole repeated array is not best when a copy starts or ends with negatives, as [-1, 3, -1] shows.
- q: >-
    Why must maximum product subarray track the smallest product ending at each index as well as the largest?
  options: ["The running product can overflow downwards and needs a guard", "A zero resets the running maximum, so the minimum is the backup", "A negative x turns the smallest product into the largest one", "The answer may be negative, so it must be tracked separately"]
  answer: 2
  explanation: >-
    Multiplying a very negative run by a negative x gives a large positive product, as at index 2 of [2, -5, -2, -4, 3]. Without lo that run is discarded. Zeros are handled by the ordinary three-way max, and negative answers are still found through hi and best.
- q: >-
    You need the largest sum over subarrays of length at least L. Which change to Kadane is correct?
  options: ["Use a fixed window of width L and slide it across the array", "Run plain Kadane and discard the answer if it is shorter than L", "Take P[j] minus the running minimum of P[0..j-L] at every j", "Restart cur only after at least L elements have been added"]
  answer: 2
  explanation: >-
    In the prefix-sum view the best subarray ending before prefix j is P[j] minus the smallest earlier prefix; the length constraint only restricts which earlier prefixes are allowed, so lag the running minimum by L. Discarding a short answer loses the constrained optimum, a width-L window ignores longer subarrays, and delaying restarts does not bound the length.
- q: >-
    A dataset of 10^9 numbers is split across 100 machines. What should each machine send so the global maximum subarray can be computed?
  options: ["Its best subarray sum, so the coordinator takes the maximum", "Its full prefix-sum array, so the coordinator can run Kadane", "Its total, best prefix, best suffix and best subarray sum", "Its minimum and maximum element, so the extremes can be joined"]
  answer: 2
  explanation: >-
    The best subarray may cross shard boundaries, so the coordinator needs each shard's best prefix and suffix, and its total to extend prefixes across whole shards. These 4-tuples combine associatively. Sending only best misses crossing subarrays; sending prefix arrays ships the whole dataset; extremes carry no information about sums.
- q: >-
    Which problem is NOT solved by a Kadane-style single pass with constant state?
  options: ["Number of contiguous subarrays whose sum equals k", "Maximum sum of a contiguous subarray with negatives", "Best single buy-then-sell profit over daily prices", "Largest number of 1s after flipping one segment"]
  answer: 0
  explanation: >-
    An exact target has no best-ending-here structure; you need prefix sums and a hash map of prefix counts. The stock problem is Kadane on differences, and the flip problem is Kadane after mapping 0 to +1 and 1 to -1.
```
