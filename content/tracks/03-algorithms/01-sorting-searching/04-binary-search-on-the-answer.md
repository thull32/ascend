---
slug: binary-search-on-the-answer
title: "Binary search on the answer: monotone predicates"
description: Turn minimise-the-maximum and capacity problems into a monotone yes/no question, then binary search the answer space instead of the input.
minutes: 35
difficulty: medium
tags: [binary-search, monotone-predicate, optimisation, minimise-the-maximum, capacity]
problems: [koko-eating-bananas, first-bad-version, sqrt-x, kth-smallest-sorted-matrix]
---
"Koko has piles of bananas and `h` hours; find the smallest eating speed that finishes in time." "Ship these packages in order within `d` days; what is the smallest ship capacity?" "Split this array into `k` contiguous pieces; minimise the largest piece's sum." None of these mentions a sorted array, and a candidate who has only seen binary search as "find `x` in a sorted list" will try greedy, then DP, then panic.

They are all the same problem. Each asks for the smallest value of some quantity such that a condition holds, and the condition has a special shape: if it holds for a value, it holds for every larger value. That shape is called **monotone**, and a monotone yes/no question over a range of integers is exactly what binary search answers. You do not search the input. You search the space of possible answers.

## The reframing

Write the question as a predicate `feasible(x)`: "is answer `x` good enough?" Then check the one property that matters:

> If `feasible(x)` is true, is `feasible(x + 1)` also true?

If eating at speed 4 finishes in time, eating at speed 5 does too. If capacity 15 ships everything in 5 days, capacity 16 does. If the array can be split into `k` pieces each summing to at most 18, it can be split into pieces of at most 19 (the same split works). When that property holds, the answers laid out in order look like

```text
x:           1  2  3  4  5  6  7  8  9 10 11
feasible(x): F  F  F  T  T  T  T  T  T  T  T
```

and the smallest feasible `x` is the first `T`, which is [`first_true`](/learn/algorithms/sorting-searching/binary-search) from the previous lesson with the predicate swapped in.

```viz
{"type": "array", "algorithm": "binary-search-first-true", "values": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "target": 4, "title": "Searching the answer space, not the input", "caption": "The values are candidate speeds; the predicate is feasible(speed), false for 1-3 and true from 4 onwards. Each probe evaluates the predicate, not a comparison with an array element."}
```

The template has three parts, and every problem in this family is solved by filling them in.

```python
def smallest_feasible(lo, hi, feasible):
    """Smallest x in [lo, hi] with feasible(x) True. Assumes feasible(hi) is True
    and feasible is monotone (False...False True...True)."""
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if feasible(mid):
            hi = mid          # mid works; try smaller
        else:
            lo = mid + 1      # mid fails; so does everything below
    return lo
```

1. **The range `[lo, hi]`.** The smallest conceivable answer and a value you *know* is feasible. Get `hi` wrong (too small) and the search returns a non-answer.
2. **The predicate.** Usually a greedy simulation that runs in $O(n)$.
3. **The monotonicity argument.** One sentence, said out loud: "a larger `x` only makes the predicate easier to satisfy, because ...".

The total cost is $O(\text{cost of feasible} \times \log(\text{hi} - \text{lo}))$. With a linear predicate and an answer range up to 10⁹, that is `30n`, which is fine.

## Koko eating bananas

Piles `[3, 6, 7, 11]`, `h = 8` hours. At speed `s` Koko spends `ceil(p / s)` hours on pile `p` and cannot carry leftover speed to the next pile.

- **Range.** Speed 1 is the smallest conceivable. Speed `max(piles) = 11` finishes each pile in one hour, so it is feasible whenever `h >= len(piles)` (the problem guarantees that).
- **Predicate.** `hours(s) = sum(ceil(p / s)) <= h`.
- **Monotone.** Increasing `s` cannot increase any `ceil(p / s)`, so the total hours never go up.

```python
def min_eating_speed(piles, h):
    def feasible(s):
        return sum((p + s - 1) // s for p in piles) <= h
    lo, hi = 1, max(piles)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
```

Trace: `lo=1, hi=11`. `mid=6`: hours `1+1+2+2 = 6 <= 8`, feasible, `hi=6`. `mid=3`: `1+2+3+4 = 10 > 8`, `lo=4`. `mid=5`: `1+2+2+3 = 8`, feasible, `hi=5`. `mid=4`: `1+2+2+3 = 8`, feasible, `hi=4`. `lo == hi == 4`. Answer 4, in four predicate calls instead of eleven.

The `(p + s - 1) // s` is integer ceiling division. Writing `math.ceil(p / s)` works for these sizes but converts to a float; with values near 2⁵³ that rounds. Use the integer form.

## Split array largest sum

`nums = [7, 2, 5, 10, 8]`, `k = 2`. Split into `k` contiguous non-empty subarrays and minimise the largest subarray sum. This is a [dynamic programming](/learn/algorithms/dynamic-programming/interval-and-tree-dp) problem in $O(k n^2)$; it is also binary search on the answer in $O(n \log(\text{sum}))$, which is both faster and shorter.

- **Range.** `lo = max(nums)` (no piece can be smaller than its largest element) and `hi = sum(nums)` (one piece, always feasible).
- **Predicate.** `feasible(cap)`: greedily walk the array, starting a new piece whenever adding the next element would push the current piece over `cap`; count pieces; feasible if `pieces <= k`.
- **Monotone.** A larger `cap` never forces an extra piece.

```python
def split_array(nums, k):
    def feasible(cap):
        pieces, running = 1, 0
        for x in nums:
            if running + x > cap:
                pieces += 1
                running = x
            else:
                running += x
        return pieces <= k
    lo, hi = max(nums), sum(nums)
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
```

Why is the greedy predicate correct? For a fixed `cap`, extending the current piece as far as it will go can never increase the number of pieces needed compared with cutting earlier: any solution that cuts earlier can have its cut moved right without violating `cap`. So greedy computes the *minimum* number of pieces for that `cap`, and "minimum pieces `<= k`" is the right test. (Fewer than `k` pieces is fine; splitting a piece further never raises the maximum.)

Trace: `lo=10, hi=32`, `mid=21`: pieces `[7,2,5]=14`, `[10,8]=18` → 2 pieces, feasible, `hi=21`. `mid=15`: `[7,2,5]=14`, `[10]`, `[8]` → 3, `lo=16`. `mid=18`: `[7,2,5]`, `[10,8]` → 2, `hi=18`. `mid=17`: `[7,2,5]`, `[10]`, `[8]` → 3, `lo=18`. Answer 18.

## Capacity to ship packages

Weights `[1..10]`, `d = 5` days, packages shipped in order, one ship of fixed capacity. This is the previous problem with `k = d`, word for word: `lo = max(weights)`, `hi = sum(weights)`, the same greedy. Recognising that two differently-worded problems have the same predicate is the skill being tested.

## How to spot the pattern

The signals, in decreasing order of reliability:

| Signal in the statement | Reason it points here |
|---|---|
| "minimum ... such that ..." or "maximum ... such that ..." | Optimising a threshold subject to a feasibility condition |
| "minimise the maximum" / "maximise the minimum" | The classic shape; the maximum is the answer being searched |
| The answer is a number in a known range, and checking one candidate is easy | Predicate is cheap, range is bounded, so `log(range)` calls is affordable |
| A greedy or DP feels almost right but the objective is about a threshold | Binary search removes the objective; the predicate is just feasibility |
| Constraints like values up to 10⁹ with `n` up to 10⁵ | `n log(10⁹) ≈ 30n` fits; `n²` does not |

And the disqualifier: if you cannot make the one-sentence monotonicity argument, stop. "Minimum number of coins to make amount `x`" is *not* monotone in `x` (amount 6 needs one 6-coin; amount 7 might need three), so it is DP, not binary search.

The **maximise-the-minimum** variant flips the predicate's direction: feasibility looks like `T T T T F F F` and you want the *last* `T`. Either search for the first `F` and subtract one, or keep the same loop with `lo = mid` and `hi = mid - 1` and round `mid` *up* (`lo + (hi - lo + 1) // 2`) so the range still shrinks. The rounding direction is the off-by-one that catches people here; derive it from "does `lo = mid` shrink the range when `hi = lo + 1`?"

## Searching a value space that is not integers

Sometimes the answer is the `k`-th smallest element in an implicit collection rather than a threshold. In [kth-smallest-sorted-matrix](/practice/kth-smallest-sorted-matrix), the rows and columns are sorted, and the predicate `count(x) = number of matrix entries <= x` is monotone in `x` and computable in $O(n)$ with a staircase walk. Binary search the *value* range `[matrix[0][0], matrix[-1][-1]]` for the smallest `x` with `count(x) >= k`. The result is guaranteed to be an actual matrix entry, because `count` only changes at entries. That is a common interview surprise: the search space is values, `mid` is usually not in the matrix, and the answer still is.

When the answer is a real number (a rate, a ratio, a distance), use the fixed-iteration real-valued search from the previous lesson with the same predicate structure; 100 halvings of any sane range exceed double precision.

## Production sightings

This is not only an interview trick.

- **Autoscaling and capacity planning.** "Smallest number of replicas such that p99 latency under load `L` is below target" is binary search over replica count with a load test as the predicate. Each predicate call costs minutes, so `log` calls versus linear calls is the difference between an afternoon and a week.
- **`git bisect`** is `first_true` over commits with the predicate "does the bug reproduce".
- **Rate limiter and quota tuning**, choosing a batch size that keeps memory under a limit, finding the largest page size that meets a latency SLO: all of them are "largest `x` such that measurement(x) is acceptable" and all of them assume monotonicity, which you should verify rather than hope for (throughput versus batch size is famously *not* monotone once you thrash the cache).

## Exercises

```exercise
id: koko-min-speed
title: Minimum eating speed
prompt: |
  `piles` is a list of positive integers and `h` is an integer with
  `h >= len(piles)`. At speed `s` you spend `ceil(p / s)` hours on a pile
  of size `p`, one pile at a time, no carry-over. Return the smallest
  integer speed `s` that finishes every pile within `h` hours.

  Use binary search on the answer with a linear-time predicate. Use
  integer arithmetic for the ceiling.
languages: [python, javascript]
entry: min_eating_speed
starter:
  python: |
    def min_eating_speed(piles, h):
        # your code here
        return 1
  javascript: |
    function min_eating_speed(piles, h) {
      // your code here
      return 1;
    }
tests:
  - args: [[3, 6, 7, 11], 8]
    expected: 4
  - args: [[30, 11, 23, 4, 20], 5]
    expected: 30
    label: one hour per pile
  - args: [[30, 11, 23, 4, 20], 6]
    expected: 23
  - args: [[1], 1]
    expected: 1
    label: single pile
  - args: [[1000000000], 2]
    expected: 500000000
    label: large pile
  - args: [[2, 2], 4]
    expected: 1
    hidden: true
  - args: [[5, 5, 5], 3]
    expected: 5
    hidden: true
  - args: [[1, 1, 1, 1], 10]
    expected: 1
    hidden: true
hints:
  - "The range is [1, max(piles)]; max(piles) is always feasible when h >= len(piles)."
  - "feasible(s) sums (p + s - 1) // s over the piles and compares with h. If feasible, hi = mid; otherwise lo = mid + 1."
```

```exercise
id: split-array-largest-sum
title: Split array to minimise the largest sum
prompt: |
  Split `nums` (positive integers) into exactly `k` non-empty contiguous
  subarrays so that the largest subarray sum is as small as possible, and
  return that sum. `1 <= k <= len(nums)`.

  Binary search the answer between `max(nums)` and `sum(nums)`; the
  predicate is a greedy pass that counts how many pieces a given cap
  needs.
languages: [python, javascript]
entry: split_array
starter:
  python: |
    def split_array(nums, k):
        # your code here
        return 0
  javascript: |
    function split_array(nums, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[7, 2, 5, 10, 8], 2]
    expected: 18
  - args: [[1, 2, 3, 4, 5], 2]
    expected: 9
  - args: [[1, 4, 4], 3]
    expected: 4
    label: k equals length
  - args: [[10], 1]
    expected: 10
    label: single element
  - args: [[1, 1, 1, 1], 4]
    expected: 1
  - args: [[2, 3, 1, 2, 4, 3], 5]
    expected: 4
    hidden: true
  - args: [[1, 2, 3, 4, 5, 6, 7, 8, 9], 3]
    expected: 17
    hidden: true
  - args: [[5, 5, 5, 5], 1]
    expected: 20
    hidden: true
hints:
  - "For a cap, walk the array and start a new piece whenever running + x > cap; count the pieces."
  - "cap is feasible when pieces <= k. Fewer pieces than k is fine because any piece can be split further without raising the maximum."
```

## Senior signals

- You recognise "minimise the maximum" and "smallest `x` such that" as **binary search on the answer** before considering DP.
- You state the **monotonicity argument** in one sentence and refuse to apply the pattern when you cannot.
- You choose `lo` and `hi` from the problem's structure (`max` and `sum`, `1` and `max`) rather than `0` and `10⁹`, and you know an infeasible `hi` produces a silent wrong answer.
- You know the predicate is usually a **greedy** and can argue why greedy computes the true minimum for that cap.
- You handle **maximise-the-minimum** by flipping the rounding of `mid` and can explain why.
- You see the same pattern in **`git bisect`**, capacity planning and threshold tuning, and you check monotonicity of real measurements before trusting it.

## Check yourself

```quiz
- q: >-
    Which of these questions is NOT a valid target for binary search on the answer?
  options: ["Minimum coins needed to make amount x, searched over x", "Smallest ship capacity to deliver packages in d days", "Smallest eating speed that finishes piles in h hours", "Largest minimum distance when placing k cows in n stalls"]
  answer: 0
  explanation: >-
    Coins needed is not monotone in the amount (amount 6 may need one coin, amount 7 three), so the predicate has no F...F T...T shape. The other three each have a threshold that, once satisfied, stays satisfied as it grows (or, for the cows, as it shrinks).
- q: >-
    You set hi = 10⁹ for the Koko problem when the largest pile is 11. The search still returns 4. Why is the tighter hi = max(piles) still preferred?
  options: ["It saves about 26 predicate calls, each O(n)", "Monotonicity only holds for speeds up to max(piles)", "A loose hi can return a speed that is too large", "Each probe costs more when the speed is huge"]
  answer: 0
  explanation: >-
    log₂(10⁹) ≈ 30 probes versus log₂(11) ≈ 4, and each probe is an O(n) pass whatever the speed. Both bounds are correct, since the search returns the first feasible speed; the tighter bound is cheaper and shows you understand the answer's range. Monotonicity is a property of the predicate, not the range, and holds for every speed.
- q: >-
    For the split-array predicate, why does greedy (extend the current piece as far as possible) compute the minimum number of pieces for a given cap?
  options: ["It works because the input array is sorted", "It is only a heuristic; DP gives the exact count", "Moving any earlier cut right never adds an extra piece", "With small k, greedy happens to match the DP"]
  answer: 2
  explanation: >-
    Any solution that cuts earlier can have its cut moved right without exceeding cap, so cutting as late as possible never costs an extra piece. This exchange argument is what makes the predicate exact, for any k, so no DP is needed. Sortedness is irrelevant (the pieces are contiguous); the greedy is linear and correct for any positive array.
- q: >-
    In a maximise-the-minimum search you write lo = mid when feasible and hi = mid - 1 otherwise, with mid = lo + (hi - lo) // 2. What is wrong?
  options: ["The predicate must be inverted to read F...F T...T", "With hi == lo + 1, lo = mid never shrinks the range", "hi = mid - 1 skips a value that could be the answer", "Nothing; this is the standard closed-range form"]
  answer: 1
  explanation: >-
    With mid rounded down and a two-element range, mid == lo, so a feasible mid leaves lo unchanged and the loop may never end. Round up (lo + (hi - lo + 1) // 2) so lo = mid always makes progress. hi = mid - 1 is fine here, because an infeasible mid cannot be the answer.
- q: >-
    The k-th smallest value in an n×n matrix with sorted rows and columns is found by binary searching the value range with count(x) = number of entries <= x. mid is usually not an entry of the matrix. Why is the final answer still an actual entry?
  options: ["It is not; a final scan must snap it to an entry", "count(x) only increases when x reaches an entry", "Each probe rounds mid to the nearest entry", "The staircase walk only ever visits matrix entries"]
  answer: 1
  explanation: >-
    count is a step function that increases only when x passes an entry. The first x at which it reaches k is therefore exactly the value of some entry, so no rounding or post-processing is needed. The staircase walk visiting entries is how count is computed, not why the result lands on one.
```
