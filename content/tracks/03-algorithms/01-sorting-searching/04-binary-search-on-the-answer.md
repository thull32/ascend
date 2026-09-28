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

## Why the template is correct

The loop maintains an invariant, the same kind of statement that made plain binary search derivable rather than memorised ([invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning)):

> every `x < lo` has `feasible(x) == False`, and `feasible(hi) == True`.

It holds before the loop only if the caller chose `hi` feasible; that is where the "know `hi` is feasible" requirement comes from, and it is not decorative. Each iteration preserves it: if `feasible(mid)` is true, `hi = mid` keeps the second half of the invariant directly; if it is false, monotonicity says every `x <= mid` is also false (a true value below `mid` would force `mid` to be true), so `lo = mid + 1` keeps the first half. When the loop exits, `lo == hi`, everything below `lo` is infeasible and `lo` itself is feasible, so `lo` is the smallest feasible value.

Termination is the same argument as before: `lo <= mid < hi`, so `hi = mid` and `lo = mid + 1` both strictly shrink `hi - lo`. Note what the proof used and what it did not. It used monotonicity in exactly one place, the `lo = mid + 1` step. It never used the predicate being cheap, exact, or integer-valued. That is why the same proof carries over to real-valued answers and to predicates that are load tests.

If `hi` is *not* feasible the invariant is false from the start, and the loop still terminates, returning `hi` itself with no error. That is the one silent failure of this template, and the failure-modes section below shows what it looks like.

## Koko eating bananas

Piles `[3, 6, 7, 11]`, `h = 8` hours. At speed `s` Koko spends `ceil(p / s)` hours on pile `p` and cannot carry leftover speed to the next pile.

- **Range.** Speed 1 is the smallest conceivable. Speed `max(piles) = 11` finishes each pile in one hour, so it is feasible whenever `h >= len(piles)` (the problem guarantees that).
- **Predicate.** `hours(s) = sum(ceil(p / s)) <= h`.
- **Monotone, precisely.** For any pile `p`, `s < s'` implies `ceil(p / s) >= ceil(p / s')`, because dividing by a larger number gives a smaller quotient and the ceiling is non-decreasing. Summing over piles, `hours(s) >= hours(s')`, so `hours(s) <= h` implies `hours(s') <= h`.

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

| iteration | lo | hi | mid | hours per pile at `mid` | total | decision |
|---|---|---|---|---|---|---|
| 1 | 1 | 11 | 6 | 1, 1, 2, 2 | 6 ≤ 8 | feasible → `hi = 6` |
| 2 | 1 | 6 | 3 | 1, 2, 3, 4 | 10 > 8 | infeasible → `lo = 4` |
| 3 | 4 | 6 | 5 | 1, 2, 2, 3 | 8 ≤ 8 | feasible → `hi = 5` |
| 4 | 4 | 5 | 4 | 1, 2, 2, 3 | 8 ≤ 8 | feasible → `hi = 4` |
| exit | 4 | 4 | | | | return 4 |

Four predicate calls instead of eleven. Speed 3 was the last infeasible probe and speed 4 the first feasible one; the invariant guarantees no speed between them was skipped because there is none.

The `(p + s - 1) // s` is integer ceiling division. Writing `math.ceil(p / s)` works for these sizes but converts to a float; with values near 2⁵³ that rounds. Use the integer form.

## Split array largest sum

`nums = [7, 2, 5, 10, 8]`, `k = 2`. Split into `k` contiguous non-empty subarrays and minimise the largest subarray sum. This is a [dynamic programming](/learn/algorithms/dynamic-programming/interval-and-tree-dp) problem in $O(k n^2)$; it is also binary search on the answer in $O(n \log(\text{sum}))$, which is both faster and shorter.

- **Range.** `lo = max(nums)` (no piece can be smaller than its largest element) and `hi = sum(nums)` (one piece, always feasible).
- **Predicate.** `feasible(cap)`: greedily walk the array, starting a new piece whenever adding the next element would push the current piece over `cap`; count pieces; feasible if `pieces <= k`.
- **Monotone, precisely.** Any split whose pieces all sum to at most `cap` is also a split whose pieces all sum to at most `cap + 1`, so the minimum number of pieces needed is non-increasing in `cap`.

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

**Why the greedy computes the true minimum number of pieces.** Fix `cap`. Suppose an optimal split uses `p*` pieces and the greedy uses `p` pieces. Compare their first cut positions: the greedy's first piece is the *longest* prefix that fits under `cap`, so the optimal split's first cut is at or before the greedy's. Move the optimal split's first cut right to the greedy's position: the first piece still fits (it is the greedy's piece), and the second piece only lost elements, so it still fits. Repeat for each cut in turn; each move keeps the split valid and never increases the piece count. After all moves the split *is* the greedy split, with at most `p*` pieces, so `p <= p*`. This is an exchange argument of the same form as the ones in [greedy proofs](/learn/algorithms/greedy/greedy-and-exchange-arguments), and it is why "minimum pieces `<= k`" is the right test. Fewer than `k` pieces is fine, because any piece can be split further without raising the maximum.

| iteration | lo | hi | mid | greedy pieces at `mid` | count | decision |
|---|---|---|---|---|---|---|
| 1 | 10 | 32 | 21 | `[7,2,5]=14`, `[10,8]=18` | 2 ≤ 2 | `hi = 21` |
| 2 | 10 | 21 | 15 | `[7,2,5]`, `[10]`, `[8]` | 3 > 2 | `lo = 16` |
| 3 | 16 | 21 | 18 | `[7,2,5]`, `[10,8]` | 2 ≤ 2 | `hi = 18` |
| 4 | 16 | 18 | 17 | `[7,2,5]`, `[10]`, `[8]` | 3 > 2 | `lo = 18` |
| exit | 18 | 18 | | | | return 18 |

## Ship capacity: the boundary trace

Weights `[1, 2, …, 10]`, `d = 5` days, packages shipped in order, one ship of fixed capacity. This is the previous problem with `k = d`, word for word: `lo = max = 10`, `hi = sum = 55`, the same greedy. Recognising that two differently worded problems have the same predicate is the skill being tested. Here is the whole search, with the day count the greedy produces at every probe:

| iteration | lo | hi | mid | greedy loads at capacity `mid` | days | decision |
|---|---|---|---|---|---|---|
| 1 | 10 | 55 | 32 | `[1..7]=28`, `[8,9,10]=27` | 2 ≤ 5 | `hi = 32` |
| 2 | 10 | 32 | 21 | `[1..6]=21`, `[7,8]=15`, `[9,10]=19` | 3 ≤ 5 | `hi = 21` |
| 3 | 10 | 21 | 15 | `[1..5]=15`, `[6,7]=13`, `[8]`, `[9]`, `[10]` | 5 ≤ 5 | `hi = 15` |
| 4 | 10 | 15 | 12 | `[1..4]=10`, `[5,6]=11`, `[7]`, `[8]`, `[9]`, `[10]` | 6 > 5 | `lo = 13` |
| 5 | 13 | 15 | 14 | `[1..4]=10`, `[5,6]=11`, `[7]`, `[8]`, `[9]`, `[10]` | 6 > 5 | `lo = 15` |
| exit | 15 | 15 | | | | return 15 |

Five probes for a range of 46 values (`ceil(log₂ 46) = 6` is the worst case). Look at iterations 4 and 5: capacities 12 and 14 both need six days, and capacity 13 would too, because the packages 7, 8, 9, 10 each need their own day at any capacity below 15 and `[1..6] = 21` cannot join them. The boundary sits exactly where `[6, 7] = 13` and `[1..5] = 15` both fit: capacity 15 is the first value at which the first five days can absorb everything before the 8. The search never evaluated 13, and did not need to: the invariant says every value below `lo = 15` is infeasible because a feasible 13 would have made 14 feasible.

### The lower bound is part of the predicate's correctness

Why `lo = max(nums)` and not `lo = 1`? Not for speed. Look at what the greedy does with `cap = 7` on `[7, 2, 5, 10, 8]`: it produces the pieces `[7]`, `[2, 5]`, `[10]`, `[8]`, four pieces, and the `10` sits alone in a "piece" whose sum exceeds the cap. The greedy never checks that a single element fits; it only starts a new piece when the *running* sum would overflow. With `k = 5` the predicate therefore reports capacity 7 as feasible (4 ≤ 5), and the search returns **7**, when the true answer is 10 (five pieces, the largest being `[10]`). Measured with the code above: `lo = 1` returns 7; `lo = max(nums)` returns 10.

Two fixes, and you should be able to state both: start the range at `max(nums)`, so the predicate is only ever asked about capacities where every element fits; or make the predicate return `False` as soon as it meets an `x > cap`. The first is cheaper and documents the answer's true range; the second is more robust if someone later changes the range.

## Maximise the minimum: aggressive cows

Stalls at positions `[1, 2, 4, 8, 9]`, three cows; place them to **maximise** the minimum distance between any two. The predicate `can_place(dist)`: walk the sorted stalls, put a cow in the first stall, then in every stall at least `dist` past the previous cow, and check that at least three cows were placed. It is monotone in the *other* direction: if a spacing of `d` is achievable, every spacing `d' < d` is too (the same placement works), so the picture is `T T T F F F` and you want the **last** true.

Two ways to write it. Either search for the first `F` with the template above and return one less, or keep `lo` on the true side with `lo = mid` when feasible, `hi = mid - 1` when not, and round `mid` **up**: `mid = lo + (hi - lo + 1) // 2`.

| iteration | lo | hi | mid (rounded up) | cows placed at | feasible? | decision |
|---|---|---|---|---|---|---|
| 1 | 1 | 8 | 5 | 1, 8 | 2 cows, no | `hi = 4` |
| 2 | 1 | 4 | 3 | 1, 4, 8 | 3 cows, yes | `lo = 3` |
| 3 | 3 | 4 | 4 | 1, 8 | 2 cows, no | `hi = 3` |
| exit | 3 | 3 | | | | return 3 |

Now do iteration 2 with `mid` rounded *down*, `mid = lo + (hi - lo) // 2`, on the range `lo = 3, hi = 4` that iteration 3 starts from: `mid = 3`, feasible, `lo = mid = 3`. Nothing changed. Next iteration, `mid = 3` again. The loop spins forever. The rule from the previous lesson applies unchanged: never assign `mid` back to the side it was computed from without adjusting by one; when the assignment is `lo = mid`, round `mid` up so that `mid > lo` whenever `hi > lo`.

The greedy predicate is exact for the same exchange-argument reason as before: placing each cow at the earliest stall that respects `dist` leaves the most room for the remaining cows, and any valid placement can be shifted left cow by cow into the greedy one without breaking the spacing.

## Real-valued answers: fixed iterations

Some answers are not integers. "Maximum average of a contiguous subarray with length at least `k`" asks for a real number. The predicate `avg_at_least(x)`: does some subarray of length `>= k` have average `>= x`? Subtract `x` from every element; the question becomes "does some subarray of length `>= k` have sum `>= 0`", which a prefix-sum pass answers in $O(n)$ by tracking the minimum prefix at least `k` positions back ([prefix sums](/learn/data-structures/arrays-strings/prefix-sums-and-difference-arrays)). It is monotone (an average `>= x` is also `>= x'` for `x' < x`), so the picture is `T T T F F F` over the reals and you want the boundary.

```python
def max_average(nums, k):
    lo, hi = min(nums), max(nums)
    for _ in range(60):                       # fixed count, not an epsilon test
        mid = (lo + hi) / 2
        if avg_at_least(nums, k, mid):
            lo = mid                          # answer is mid or higher
        else:
            hi = mid
    return lo
```

Why 60 and not `while hi - lo > 1e-9`? After 60 halvings a starting range of 10⁴ is down to `10⁴ / 2⁶⁰ ≈ 10⁻¹⁴`. But doubles near 10⁴ are spaced about `1.8 × 10⁻¹²` apart (one unit in the last place is `2⁻³⁹` at that magnitude), so after roughly 52 halvings (`log₂(10⁴ / 1.8 × 10⁻¹²)`) `mid` evaluates to `lo` or `hi` and the interval stops shrinking. An epsilon of `1e-9` is still met there; an epsilon of `1e-13` never is, and that loop spins. The fixed count terminates whatever the magnitudes, and the iterations after the interval reaches one ULP are harmless no-ops. Rounding direction does not matter for reals; only the exit condition does.

## Searching a value space that is not integers

Sometimes the answer is the `k`-th smallest element in an implicit collection rather than a threshold. In [kth-smallest-sorted-matrix](/practice/kth-smallest-sorted-matrix), the rows and columns are sorted, and the predicate `count(x) = number of matrix entries <= x` is monotone in `x` and computable in $O(n)$ with a staircase walk from the bottom-left corner: move up when the entry exceeds `x`, right otherwise, adding the column height each time you move right. Binary search the *value* range `[matrix[0][0], matrix[-1][-1]]` for the smallest `x` with `count(x) >= k`. The result is guaranteed to be an actual matrix entry, because `count` is a step function that only changes at entries: the first `x` at which it reaches `k` is the value of some entry. That is a common interview surprise: the search space is values, `mid` is usually not in the matrix, and the answer still is.

The same shape solves "k-th smallest pair distance" (count pairs with difference `<= d` by two pointers, $O(n)$ per probe) and "k-th smallest in a multiplication table" (count entries `<= x` row by row); the alternative in each is to materialise all `n²` candidates.

## How to spot the pattern

The signals, in decreasing order of reliability:

| Signal in the statement | Reason it points here |
|---|---|
| "minimum ... such that ..." or "maximum ... such that ..." | Optimising a threshold subject to a feasibility condition |
| "minimise the maximum" / "maximise the minimum" | The classic shape; the maximum is the answer being searched |
| The answer is a number in a known range, and checking one candidate is easy | Predicate is cheap, range is bounded, so `log(range)` calls is affordable |
| A greedy or DP feels almost right but the objective is about a threshold | Binary search removes the objective; the predicate is only feasibility |
| Constraints like values up to 10⁹ with `n` up to 10⁵ | `n log(10⁹) ≈ 30n` fits; `n²` does not |

And the disqualifier: if you cannot make the one-sentence monotonicity argument, stop. "Minimum number of coins to make amount `x`" is *not* monotone in `x` (amount 6 needs one 6-coin; amount 7 might need three), so it is DP, not binary search. "Batch size that maximises throughput" is not monotone either: throughput rises with batch size until the batch stops fitting in cache, then falls, and a binary search over a rise-then-fall curve converges to wherever its first probe happened to land.

## Alternatives, compared

| Approach | Time for split-array, `n = 10⁵`, sums to 10⁹ | Needs | Also yields | Code |
|---|---|---|---|---|
| Binary search on the answer | `O(n log S)` ≈ 3 × 10⁶ ops | a monotone feasibility test | the split itself (run the greedy at the answer) | 15 lines |
| Interval DP `dp[k][i]` | `O(k n²)` ≈ 10¹⁰ · `k` | nothing but optimal substructure | the split, via parent pointers | 20 lines |
| Direct greedy on the objective | `O(n log n)` | a provable exchange argument on the *objective* | the split | 10 lines, when it exists (it does not for split-array) |
| Linear scan of the answer range | `O(n · S)` ≈ 10¹⁴ | nothing | the split | 8 lines |

The DP wins only when the objective is not a threshold: "minimise the sum of squares of the piece sums" has no per-piece feasibility test, so the DP is the answer there.

## Under the hood: `git bisect` and production searches

`git bisect` is this lesson's template applied to a commit graph. You mark one commit `bad` and an older one `good`; the candidates are the commits reachable from `bad` but not from `good`. History is a DAG, not a line, so "the middle commit" is not well defined. Git instead computes, for each candidate, how many candidates would remain in the worse of the two outcomes if that commit were tested, and picks the one that minimises it: the commit that most nearly halves the set, counted by ancestry rather than by date. It prints the count: "Bisecting: 1500 revisions left to test after this (roughly 11 steps)", and `roughly 11` is `log₂ 1500` rounded up. Two details matter operationally. `git bisect skip` marks a commit as untestable (it does not build); git then picks a nearby candidate, and if the boundary lands inside a skipped stretch it reports the range rather than a single commit. `git bisect run <script>` automates the loop: the script's exit code is the predicate, 0 for good, 125 for skip, any other value from 1 to 127 for bad. The whole thing assumes monotonicity, which for "does the bug reproduce" means the bug was introduced once and never fixed and reintroduced within the range; when that assumption fails, bisect blames an innocent commit with full confidence.

Capacity planning is the same search with a slower predicate. "Smallest replica count such that p99 latency under load `L` stays below 200 ms" is `first_true` over replica counts, and each probe is a load test: deploy, warm up, hold steady state long enough for a stable p99 (several minutes). From 1 to 256 replicas that is 8 probes, an afternoon; a linear sweep is 256 probes, a month. Three habits separate the senior version: verify `feasible(hi)` first, because an unreachable SLO makes the search return `hi` looking like an answer; repeat each probe and take a majority, because one noisy flip corrupts every later decision; and confirm the curve is monotone, since more replicas stop helping once a shared dependency saturates. [Benchmarking pitfalls](/learn/systems/performance-engineering/benchmarking-pitfalls) covers why single measurements lie.

## Quantified costs

- **Probe count** is `ceil(log₂(hi − lo + 1))`: 4 for Koko's range of 11, 6 for the ship's range of 46, 30 for 10⁹, 60 for 10¹⁸. Tightening `[1, 10⁹]` to `[max, sum]` saves probes and never changes the answer.
- **Total work** with `n = 10⁵` and a linear predicate over a range of 10⁹ is 30 × 10⁵ = 3 × 10⁶ element visits: well under a second in CPython, milliseconds compiled. A linear scan of the answer range is 10¹⁴, which is days.
- **The predicate dominates.** A sort inside it makes the total `O(n log n log R)`; hoist anything that does not depend on `mid` outside the loop.

## Failure modes

**The search returns the upper bound, and it is not an answer.** Symptom: a capacity planner returns "256 replicas" on a service whose SLO no replica count can meet; a scheduler returns `hi` for an infeasible instance and downstream code proceeds. Diagnosis: `feasible(hi)` was never true, so the invariant was false from the start; the loop terminates at `lo == hi == hi` with no signal. Fix: choose `hi` by a construction that is provably feasible (one piece, `max(piles)`), or test `feasible(hi)` up front and return a sentinel when it fails.

**The answer is below the largest element.** Symptom: split-array returns 7 for `[7, 2, 5, 10, 8]` with `k = 5`; the true answer is 10. Diagnosis: `lo = 1`, and the greedy piece counter never checks that a lone element fits under `cap`, so the `10` sits in a piece that violates the cap and the predicate reports feasible. Fix: `lo = max(nums)`, or return `False` from the predicate on any `x > cap`.

**Bisection over a measurement converges to a different answer every run.** Symptom: "optimal batch size" comes out as 64 on Monday and 512 on Tuesday. Diagnosis: the measured predicate is not monotone (throughput versus batch size rises then falls; p99 versus replicas is noisy), so the sequence of probe results is `F T F T` and the search follows whichever flip it hits first. Fix: repeat and majority-vote each probe; for a rise-then-fall curve use a unimodal search (golden section or ternary) or a scan, not bisection.

**Negative sums in Java or Go.** Symptom: the predicate declares huge capacities infeasible, or small ones feasible, only on large inputs. Diagnosis: the running sum of 10⁵ values up to 10⁹ reaches 10¹⁴, past `2³¹ − 1 ≈ 2.1 × 10⁹`, and the `int` accumulator wrapped. Fix: 64-bit accumulators (`long`, `int64`), which hold up to 9.2 × 10¹⁸; Python and JavaScript's `Number` (exact to 2⁵³ ≈ 9 × 10¹⁵) do not have this failure at these sizes.

**A request hangs at 100% CPU.** Symptom: one input never returns; the thread dump shows the search loop. Diagnosis: a maximise-the-minimum search with `lo = mid` and `mid` rounded down, stuck on a two-value range; or a real-valued search with an epsilon smaller than the double spacing at that magnitude. Fix: round `mid` up when the update is `lo = mid`; use a fixed iteration count for reals.

## Interviewer follow-ups

**"You solved split-array in `O(n log S)`. What is the DP, and when would you prefer it?"** Model answer: `dp[j][i]` = minimum largest-piece sum splitting the first `i` elements into `j` pieces, `dp[j][i] = min over t < i of max(dp[j−1][t], sum(t..i))`, `O(k n²)`, or `O(k n log n)` with a binary search inside. Prefer it when the objective is not a threshold, such as minimising the sum of squared piece sums, which has no feasibility reformulation. Common wrong answer: "the DP is more exact; binary search is an approximation", which confuses this exact method with numerical root finding.

**"Your predicate sorts the input. Does that change the complexity?"** Model answer: per probe `O(n log n)`, total `O(n log n log R)`; but the sort does not depend on `mid`, so hoist it out and the predicate is linear again. Common wrong answer: re-sorting inside every probe and reporting the total as `O(n log n)`.

**"The answer is a real number. How do you know when to stop?"** Model answer: a fixed number of halvings (50–100) chosen so the interval falls below double precision; an epsilon loop can fail to terminate when `hi − lo` is already one ULP and `eps` is smaller. Common wrong answer: `while hi − lo > 1e-9`, with no idea of the magnitude at which that breaks.

**"Find the k-th smallest distance between any two elements of an array."** Model answer: sort once; binary search the distance `d` over `[0, max − min]`; `count(d)` = number of pairs with difference `<= d`, computed by two pointers in `O(n)`; total `O(n log n + n log(max − min))`. Common wrong answer: generate all `n(n−1)/2` distances and select, which is `O(n²)` memory and time.

**"The range is `[1, 10¹⁸]` and each predicate call takes a second. Now what?"** Model answer: 60 probes is a minute, which is fine; if the answer is expected to be small, gallop first (probe 1, 2, 4, 8, … until feasible) to shrink the range to `[x/2, x]`, then bisect, for `2 log₂(answer)` probes instead of 60. Common wrong answer: declaring the problem infeasible, or a linear scan from 1.

## What mid-level engineers get wrong

- **`lo = 0, hi = 10⁹` by reflex.** Consequence: 30 probes where 5 would do, and a predicate that is asked about values where its assumptions (every element fits) are false, producing the 7-instead-of-10 bug.
- **Skipping the monotonicity sentence.** Consequence: binary searching a non-monotone quantity (coins for an amount, throughput against batch size) and trusting a number that means nothing.
- **Writing an optimiser inside the predicate.** The predicate is *feasibility*, not "the best split for this cap"; a DP inside the predicate multiplies the cost by `n` for no gain. Consequence: `O(n² log S)` when `O(n log S)` was available.
- **Mixing the first-true and last-true templates.** `lo = mid` with `mid` rounded down. Consequence: an infinite loop on a two-value range, which random tests rarely hit.
- **Assuming `feasible(hi)`.** Consequence: the search returns `hi` on infeasible instances and downstream code treats a non-answer as an answer.
- **`math.ceil(p / s)` on large integers.** Consequence: a float rounding error at 2⁵³ that flips a boundary probe.

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

- You recognise "minimise the maximum" and "smallest `x` such that" as **binary search on the answer** before considering DP, and you can say which problems (non-threshold objectives) still need the DP.
- You state the **monotonicity argument** in one precise sentence (`feasible(x) ⇒ feasible(x + 1)`, because the same witness works) and refuse to apply the pattern when you cannot.
- You choose `lo` and `hi` from the problem's structure (`max` and `sum`, `1` and `max`) rather than `0` and `10⁹`, you know an infeasible `hi` produces a silent wrong answer, and you know that a `lo` below `max` can make a greedy predicate lie.
- You know the predicate is usually a **greedy** and can give the exchange argument for why it computes the true minimum for that cap.
- You handle **maximise-the-minimum** by rounding `mid` up when the update is `lo = mid`, and you can show the two-value range on which rounding down spins forever.
- You search reals with a **fixed iteration count** and can say at what magnitude an epsilon loop stops terminating.
- You see the same pattern in **`git bisect`** (which halves by ancestor count, not by date) and in capacity planning, and you verify monotonicity of real measurements, repeat noisy probes, and check `feasible(hi)` before trusting a result.

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
- q: >-
    Split-array with lo = 1 instead of lo = max(nums) returns 7 on [7, 2, 5, 10, 8] with k = 5, where the correct answer is 10. What went wrong?
  options: ["The greedy never rejects a lone element larger than the cap", "The search needs at least log₂(sum) probes to be exact", "With k = 5 the monotone shape of the predicate breaks down", "The upper bound sum(nums) was infeasible for this input"]
  answer: 0
  explanation: >-
    At cap 7 the greedy produces [7], [2, 5], [10], [8]: four pieces, one of which is a single element above the cap, and 4 <= 5 makes the predicate report feasible. Starting the range at max(nums), or rejecting any x > cap inside the predicate, removes the lie. The predicate is still monotone, the probe count is not the issue, and sum(nums) is always feasible.
```
