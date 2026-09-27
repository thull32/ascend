---
slug: sliding-window-mastery
title: "Sliding window mastery: monotone predicates, counting windows and the at-most-k trick"
description: Prove when a window is allowed to slide and why it runs in O(n), count every valid subarray instead of finding one, reduce exactly-k to two at-most-k passes, and handle aggregates like max and gcd that cannot be subtracted.
minutes: 45
difficulty: hard
tags: [sliding-window, two-pointers, counting, at-most-k, monotonic-deque, amortised-analysis]
problems: [longest-substring-no-repeat, longest-repeating-replacement, permutation-in-string, minimum-window-substring, sliding-window-maximum, max-consecutive-ones-iii, subarray-sum-equals-k]
---
Count the contiguous subarrays of `[1, 2, 1, 2, 3]` that contain exactly two distinct values. You know the sliding-window template: grow on the right, shrink on the left while the window is invalid, record. Try it here and it breaks at once. At `right = 3` the window `[1, 2, 1, 2]` has two distinct values, and so do `[2, 1, 2]` and `[1, 2]`, but `[2]` does not. The valid start positions for this right end are indices 0, 1 and 2, not "everything from some `left` up to `right`". Should the window shrink? Shrinking loses valid subarrays; not shrinking means `right - left + 1` counts invalid ones. There is no correct place for `left` to stand.

The [sliding-window pattern lesson](/learn/interview-patterns/array-patterns/sliding-window) gave you the template. This lesson gives you the theorem behind it. The theorem is what lets you see in ten seconds that the template fails on "exactly two distinct", and it hands you the two-line fix that makes it work anyway. It also covers the proof that the nested loop is linear, the three ways that proof quietly breaks, and what to do when the thing you are tracking (a maximum, a gcd) cannot be subtracted when an element leaves.

## When a window may slide

Write `valid(l, r)` for "the subarray `nums[l..r]` satisfies the property". The template is correct exactly when validity is **closed under shrinking**: if `[l, r]` is valid, every subarray inside it is valid too. Call such a property *hereditary*.

Heredity buys two facts. Fix a right end `r` and let `L(r)` be the smallest `l` with `[l, r]` valid.

1. **The valid starts form a suffix.** Every `l` in `[L(r), r]` is valid, because `[l, r]` sits inside `[L(r), r]`.
2. **`L(r)` never decreases.** `[L(r+1), r+1]` is valid, so its sub-window `[L(r+1), r]` is valid, so `L(r) <= L(r+1)`.

Fact 2 is the whole algorithm. Because the best left end for `r + 1` is never to the left of the best left end for `r`, the left pointer never has to move backwards, and "advance `left` until the window is valid" computes `L(r)` for every `r` in one sweep. Fact 1 is what makes counting possible, as you will see shortly.

Watch `L(r)` march forward for "no repeated value", the most familiar hereditary property:

```viz
{"type": "array", "algorithm": "sliding-window-longest-unique", "values": [3, 1, 4, 1, 5, 9, 2, 6, 5, 3], "title": "L(r) only moves right", "caption": "For each right end the left end jumps to just past the previous copy of the new value. It never moves back, which is exactly the heredity theorem."}
```

Here is the test to run in your head, on some common properties:

| Property of the window | Closed under shrinking? | Why |
|---|---|---|
| Sum ≤ S, all values ≥ 0 | Yes | Removing a non-negative element cannot raise the sum |
| Sum ≤ S, negatives allowed | **No** | `[5, -5]` sums to 0; its sub-window `[5]` sums to 5 |
| At most `k` distinct values | Yes | Removing elements cannot add new values |
| At most `k` zeros ([Max Consecutive Ones III](/practice/max-consecutive-ones-iii)) | Yes | Same reason |
| `max - min ≤ limit` | Yes | A sub-window's max is no larger and its min no smaller |
| Product < K, all values ≥ 1 | Yes | Dividing by a value ≥ 1 cannot raise the product |
| Exactly `k` distinct values | **No** | `[1, 2]` has two; `[2]` has one |
| Sum ≥ S, all values ≥ 0 | No, but closed under **growing** | Adding a non-negative element cannot drop the sum |
| Contains every character of `t` ([Minimum Window Substring](/practice/minimum-window-substring)) | No, but closed under growing | Adding characters cannot lose coverage |

The last two rows are the mirror image. If validity survives *growing* the window, then for each `r` the valid starts form a prefix `[0, R(r)]` and `R(r)` never decreases, by the same argument turned around. That gives the "shortest window" template: shrink *while the window is still valid*, and record inside the loop before each eviction. Longest-window and shortest-window problems are one theorem viewed from two sides.

In an interview, ask two questions: "if I drop an element from either end of a valid window, is it still valid?" and "if I add one, is it still valid?" A yes to the first means the longest/count template. A yes to the second means the shortest template. If both answers are no, stop reaching for a window: you need [prefix sums and a hash map](/learn/algorithms/technique-mastery/prefix-sums-and-hashing-tricks), a deque over prefix sums, or DP.

## Why it is O(n), and when it quietly is not

The standard objection is "there is a `while` loop inside a `for` loop, so it is `O(n²)`". The answer is an amortised argument. Every iteration of either loop increases `left` or `right` by one. Neither pointer ever decreases and each is bounded by `n`, so the total number of iterations across the whole run is at most `2n`. A single inner `while` may run for many steps, but those steps are paid for by increments of `left` that can never happen again. This is the aggregate method from [amortised analysis](/learn/foundations/complexity/amortized-analysis) with the potential `left + right ≤ 2n`.

The argument assumes that each admit, each evict and each validity check is `O(1)`. Three habits break that assumption without changing how the code looks:

1. **Checking validity by scanning the state.** `sum(1 for c in counts.values() if c > 0) > k`, or comparing two 26-entry arrays at every step, costs `O(σ)` per step for an alphabet of size `σ`. The loop is `O(nσ)`. For 26 lowercase letters you can say "26 is a constant" and move on, but for arbitrary integers it is quadratic. The fix is a counter updated only on the `0 → 1` and `1 → 0` transitions of each count, or deleting zero-count keys so `len(counts)` is the number of distinct values.
2. **An aggregate with no inverse.** Sum has subtraction. Maximum, minimum, gcd and bitwise OR do not: when the current maximum leaves the window, nothing in a single number tells you the new one. The last section below covers the fix.
3. **Materialising the window.** `s[l:r+1]` or `tuple(nums[l:r+1])` inside the loop copies up to `n` elements per step. Keep indices and slice once at the end.

## Fixed windows are the easy special case

A window of fixed size `k` needs no shrink condition: after admitting `nums[r]`, evict `nums[r - k]` once `r >= k`. Every element is admitted once and evicted once.

```viz
{"type": "array", "algorithm": "sliding-window-max-sum", "values": [2, 1, 5, 1, 3, 2, 7, 1], "k": 3, "title": "Fixed window of size 3", "caption": "Each slide adds one element and subtracts one. Eight elements, eight updates, regardless of k."}
```

The one fixed-window idea worth carrying into the hard problems is the **match counter**. In [Permutation in String](/practice/permutation-in-string) you need to know whether the window's letter counts equal the pattern's. Comparing the two 26-entry arrays each step is the `O(σ)` check from above. Instead, keep `matches`, the number of letters whose window count equals the pattern count. Admitting a letter changes one count, so `matches` changes by at most one: it goes up if the count just became equal, and down if it was equal and no longer is. The window is a permutation exactly when `matches == 26`. The same idea, "maintain how many constraints are currently satisfied", is the `missing` counter in Minimum Window Substring.

## Counting windows: add r − L(r) + 1

Fact 1 says the valid starts for right end `r` are exactly `L(r), L(r) + 1, …, r`. That is `r - L(r) + 1` valid subarrays ending at `r`. Every subarray has exactly one right end, so summing this over all `r` counts every valid subarray exactly once. You get the count in the same `O(n)` pass that would have found the longest.

Count the subarrays of `[10, 5, 2, 6]` with product strictly below 100:

| `r` | `nums[r]` | product after admit | shrink | `left` | new windows ending at `r` | running total |
|---|---|---|---|---|---|---|
| 0 | 10 | 10 | none | 0 | `[10]` → 1 | 1 |
| 1 | 5 | 50 | none | 0 | `[5]`, `[10,5]` → 2 | 3 |
| 2 | 2 | 100 | evict 10, product 10 | 1 | `[2]`, `[5,2]` → 2 | 5 |
| 3 | 6 | 60 | none | 1 | `[6]`, `[2,6]`, `[5,2,6]` → 3 | 8 |

There are 10 subarrays in total, and exactly two fail (`[10, 5, 2]` at 100 and the whole array at 600), so 8 is right.

```python
def count_product_below(nums, k):
    """nums are positive integers. Count subarrays with product < k."""
    if k <= 1:
        return 0                          # no product of positive integers is < 1
    prod, left, total = 1, 0, 0
    for right, x in enumerate(nums):
        prod *= x
        while prod >= k:                  # terminates: an empty window has product 1 < k
            prod //= nums[left]
            left += 1
        total += right - left + 1         # may be 0 if nums[right] >= k alone
    return total
```

The `k <= 1` guard is not decoration. Without it, the shrink loop empties the window, finds `1 >= k` still true, and keeps evicting past `right`: depending on the language you get an index error, a product that silently becomes 0 or `NaN`, or a negative count. Any time a single element can be invalid on its own, check that your shrink loop stops at the empty window.

For properties closed under growing, count with the mirror formula (for each `r`, the valid starts are `0..R(r)`, so add `R(r) + 1`), or by complement: windows with "at least `k`" equal all `n(n + 1) / 2` windows minus those with "at most `k - 1`".

## The at-most-k trick

Now the opening problem. "Exactly `k` distinct" is not hereditary, but "at most `k` distinct" is. The windows with at most `k` distinct values split into two disjoint groups: those with exactly `k`, and those with at most `k - 1`. So

$$\text{exactly}(k) = \text{atMost}(k) - \text{atMost}(k - 1)$$

and each term is one hereditary counting pass. Trace both passes on `[1, 2, 1, 2, 3]` with `k = 2`:

| `r` | `nums[r]` | atMost(2): `left` | windows | atMost(1): `left` | windows |
|---|---|---|---|---|---|
| 0 | 1 | 0 | 1 | 0 | 1 |
| 1 | 2 | 0 | 2 | 1 | 1 |
| 2 | 1 | 0 | 3 | 2 | 1 |
| 3 | 2 | 0 | 4 | 3 | 1 |
| 4 | 3 | 3 | 2 | 4 | 1 |
| total | | | **12** | | **5** |

At `r = 4` the at-most-2 pass admits 3 and has three distinct values. It evicts index 0 (a 1, but another 1 remains), then index 1 (a 2, another remains), then index 2 (the last 1), and stops at `left = 3` with `{2, 3}`. The answer is `12 - 5 = 7`. Listing them confirms it: `[1,2]` twice, `[2,1]`, `[2,3]`, `[1,2,1]`, `[2,1,2]` and `[1,2,1,2]`.

```python
def at_most(nums, k):
    counts, left, total = {}, 0, 0
    for right, x in enumerate(nums):
        counts[x] = counts.get(x, 0) + 1
        while len(counts) > k:            # len is O(1) because zero counts are deleted
            y = nums[left]
            counts[y] -= 1
            if counts[y] == 0:
                del counts[y]
            left += 1
        total += right - left + 1
    return total

def exactly(nums, k):
    return at_most(nums, k) - at_most(nums, k - 1)
```

`at_most(nums, 0)` is correctly 0: the shrink loop empties the window after every admit. The same subtraction solves "exactly `k` odd numbers" (count odds instead of distinct values), "binary subarrays with sum exactly `S`" (0/1 values, so the sum is hereditary under at-most), and "exactly `k` zeros". It does **not** solve "sum exactly `S` with negatives", because "sum at most `S`" is not hereditary there. That one needs the prefix-sum and hash-map method, as in [Subarray Sum Equals K](/practice/subarray-sum-equals-k).

There is a one-pass form. Keep two left pointers in lockstep: `far` is `L(r)` for at most `k`, `near` is `L(r)` for at most `k - 1`. The windows ending at `r` with exactly `k` distinct are the starts in `[far, near)`, so add `near - far`. It needs two count maps and is easier to get subtly wrong. Mention that it exists, and write the two-pass version unless you are asked for one pass.

## Shrink discipline: `while`, `if`, and the window that never shrinks

`while` is the default shrink. A single admit can make the window invalid by more than one eviction's worth: in the at-most-2 trace, one admit at `r = 4` forced three evictions.

[Longest Repeating Character Replacement](/practice/longest-repeating-replacement) is the famous exception. A window is valid when `length - maxFreq <= k`, meaning you can repaint every character that isn't the most common one. The accepted solution uses `if` rather than `while`, slides the window without ever shrinking it, and never decreases `best_freq`, the largest single-letter count seen so far, even when that letter has left the window. Candidates memorise this and cannot defend it. Here is the defence.

The window's length `w` is always the best answer found so far. At each new `r` the answer can grow by at most one, because a valid window of length `w + 2` ending at `r` would contain a valid window of length `w + 1` ending at `r - 1`, and `w` was already the best up to `r - 1`. So the only question at each step is whether some valid window of length `w + 1` now exists.

- **If the check `w + 1 - best_freq <= k` passes:** `best_freq` was reached inside some earlier window no longer than `w + 1`. Stretch that window to length `w + 1` inside `s[0..r]`. It still holds at least `best_freq` copies of that letter, so it has at most `w + 1 - best_freq <= k` other letters, and it is valid. Growing is justified even when the *current* window is not that valid window.
- **If the check fails:** the only new candidate of length `w + 1` is the current window. Its true maximum count is at most `best_freq`, because every count in it was at most `best_freq` when it was last raised and has only fallen since. So it is invalid, and sliding at length `w` is correct.

At the end, `w` is the answer, whether or not the final window is itself valid. That is two sentences in an interview, and they are the difference between "I remember this trick" and "I can prove this trick". If you cannot produce the argument under pressure, write the honest `while` version with a real maximum. With 26 letters, recomputing the maximum costs `O(26)`, and you should say so.

Where to record also follows from the theorem. For longest and count, record after the shrink, when the window is valid. For shortest, record inside the shrink loop, before each eviction, because that is when the window is valid and as small as it will get.

## Aggregates you cannot subtract

"Longest subarray where `max - min <= limit`" is hereditary, so the pointers move correctly. The trouble is the state. When the current maximum is evicted, you need the next maximum, and a running number cannot give it to you.

**Max and min: the monotonic deque.** Keep a deque of indices whose values are decreasing. Before appending `r`, pop from the back every index whose value is `<= nums[r]`. Those values can never be the window maximum again, because `nums[r]` is at least as large and will stay in the window longer. The front is the maximum. When `left` passes the front index, pop it from the front. Each index is pushed once and popped at most once, so the amortised cost is `O(1)`. For `max - min`, keep a decreasing deque for the maximum and an increasing one for the minimum. The full mechanism is in [the monotonic deque lesson](/learn/data-structures/stacks-queues/monotonic-deque).

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [1, 3, -1, -3, 5, 3, 6, 7], "k": 3, "title": "Window maximum without subtraction", "caption": "Dominated values are evicted from the back; expired indices from the front. The front is always the window maximum."}
```

**Any associative operation: the two-stack queue.** gcd, bitwise AND and OR, and matrix products have no inverse and no monotone shortcut. A queue built from two stacks handles all of them. Each stack entry stores its value together with the aggregate of itself and everything beneath it in that stack, so the top entry of each stack holds that whole stack's aggregate. The window aggregate is `op(front_top_aggregate, back_top_aggregate)`, oldest values first. Pushing onto the back is `O(1)`. Popping from the front is `O(1)`, except when the front stack is empty, in which case you move the whole back stack across and recompute the aggregates on the way. Each element crosses once, so pops are amortised `O(1)`.

```python
from math import gcd

class WindowAggregate:
    """Queue of values supporting O(1) amortised push, pop and aggregate."""
    def __init__(self, op, identity):
        self.op, self.identity = op, identity
        self.front = []                  # (value, aggregate of this value and all below it); top = oldest
        self.back = []                   # (value, aggregate of this value and all below it); top = newest

    def push(self, x):
        agg = self.op(self.back[-1][1], x) if self.back else x
        self.back.append((x, agg))

    def pop(self):
        if not self.front:
            while self.back:             # each element moves across once
                x, _ = self.back.pop()
                agg = self.op(x, self.front[-1][1]) if self.front else x
                self.front.append((x, agg))
        self.front.pop()

    def value(self):
        a = self.front[-1][1] if self.front else self.identity
        b = self.back[-1][1] if self.back else self.identity
        return self.op(a, b)

# Longest subarray with gcd > 1 (hereditary: a sub-window's gcd is a multiple of the window's gcd).
def longest_gcd_above_one(nums):
    w, left, best = WindowAggregate(gcd, 0), 0, 0
    for right, x in enumerate(nums):
        w.push(x)
        while left <= right and w.value() == 1:
            w.pop()
            left += 1
        best = max(best, right - left + 1)
    return best
```

Watch the elements cross from one stack to the other. Each crosses exactly once, which is where the amortised bound comes from:

```viz
{"type": "stack-queue", "algorithm": "queue-via-two-stacks", "operations": [["enqueue", 12], ["enqueue", 18], ["enqueue", 8], ["dequeue"], ["enqueue", 6], ["dequeue"], ["dequeue"], ["dequeue"]], "title": "The two-stack queue behind window aggregates", "caption": "Store an aggregate beside every value and the same moves maintain the gcd, OR or max of the whole queue."}
```

For bitwise OR there is a cheaper special case: keep 32 per-bit counters. Counts can be subtracted, and the OR is "every bit whose counter is positive". Turning a non-invertible aggregate into a vector of invertible ones is worth trying first, because it keeps the state flat.

## When the window is the wrong tool

| Statement | Hereditary? | Tool |
|---|---|---|
| Longest subarray, sum ≤ S, values ≥ 0 | Yes | Window |
| Count subarrays, sum exactly S, negatives allowed | No | Prefix sums + hash map |
| Shortest subarray, sum ≥ S, negatives allowed | No | Monotonic deque over prefix sums |
| Longest subarray with sum divisible by `k` | No | Prefix remainders + first-index map |
| Exactly `k` distinct / odd / zeros | No, but at-most is | At-most trick |
| Longest *subsequence* with a property | Not contiguous | DP or greedy |
| Maximum-sum subarray, any length | Not a predicate | Kadane |

The negatives row is the interview pivot you should see coming: the moment the array can hold negative numbers, "sum" stops being monotone under shrinking, and the window is dead. Say so out loud before switching tools.

## Exercises

```exercise
id: exactly-k-distinct
title: Count subarrays with exactly k distinct values
prompt: |
  Return the number of contiguous subarrays of `nums` that contain exactly
  `k` distinct values. `k >= 1`.

  "Exactly k" is not closed under shrinking, so a single window cannot
  count it directly. Write a helper that counts subarrays with at most `m`
  distinct values (adding `right - left + 1` per right end) and combine
  two calls. Aim for O(n).
languages: [python, javascript]
entry: subarrays_with_k_distinct
starter:
  python: |
    def subarrays_with_k_distinct(nums, k):
        # your code here
        return 0
  javascript: |
    function subarrays_with_k_distinct(nums, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2, 1, 2, 3], 2]
    expected: 7
  - args: [[1, 2, 1, 3, 4], 3]
    expected: 3
  - args: [[1, 1, 1], 1]
    expected: 6
    label: every subarray has one distinct value
  - args: [[], 1]
    expected: 0
    label: empty input
  - args: [[1, 2, 3], 4]
    expected: 0
    label: k larger than the number of distinct values
  - args: [[2, 1, 1, 1, 2], 1]
    expected: 8
    hidden: true
  - args: [[1, 2, 1, 2, 1, 2], 2]
    expected: 15
    hidden: true
  - args: [[1, 2], 1]
    expected: 2
    hidden: true
hints:
  - "at_most(m): grow right, increment counts[x]; while the map has more than m keys, decrement counts[nums[left]], delete it at zero, advance left; add right - left + 1."
  - "The answer is at_most(k) - at_most(k - 1). at_most(0) must return 0."
```

```exercise
id: longest-within-limit
title: Longest subarray with max minus min at most a limit
prompt: |
  Return the length of the longest contiguous subarray of `nums` in which
  the difference between the largest and smallest element is at most
  `limit`. Return 0 for an empty array.

  The property is closed under shrinking, so the window pointers are the
  usual ones. The hard part is knowing the window's max and min after an
  eviction: keep one deque of indices with decreasing values (front is
  the max) and one with increasing values (front is the min). Aim for O(n).
languages: [python, javascript]
entry: longest_within_limit
starter:
  python: |
    from collections import deque

    def longest_within_limit(nums, limit):
        # your code here
        return 0
  javascript: |
    function longest_within_limit(nums, limit) {
      // your code here (an array plus a head index works as a deque)
      return 0;
    }
tests:
  - args: [[8, 2, 4, 7], 4]
    expected: 2
  - args: [[10, 1, 2, 4, 7, 2], 5]
    expected: 4
  - args: [[4, 2, 2, 2, 4, 4, 2, 2], 0]
    expected: 3
    label: limit 0 means all equal
  - args: [[], 3]
    expected: 0
    label: empty input
  - args: [[5], 0]
    expected: 1
  - args: [[1, 5, 6, 7, 8, 10, 6, 5, 6], 4]
    expected: 5
    hidden: true
  - args: [[3, 3, 3, 3], 0]
    expected: 4
    hidden: true
  - args: [[1, 10, 1, 10], 8]
    expected: 1
    hidden: true
hints:
  - "Before appending index r, pop from the back of the max-deque every index whose value is <= nums[r], and from the min-deque every index whose value is >= nums[r]."
  - "While nums[maxdq front] - nums[mindq front] > limit, advance left; pop a deque's front if it equals the old left."
  - "Record right - left + 1 after the shrink."
```

## Senior signals

- You state the **heredity condition** ("valid windows are closed under shrinking") and derive from it that `left` never moves back, rather than asserting that "sliding window works here".
- You defend the **`O(n)` bound** with the pointer-increment argument, and you name the three ways it silently fails: `O(σ)` validity checks, aggregates without inverses, and copying the window.
- You count valid subarrays with **`right - left + 1`** and explain why each subarray is counted exactly once.
- You reduce **exactly-k to at-most-k** twice, and you know which "exactly" problems this does not rescue: sums with negatives go to prefix sums and hashing.
- You can prove the **non-shrinking window** in Longest Repeating Character Replacement, or choose the honest `while` version and say why.
- You handle non-invertible aggregates with a **monotonic deque** (max and min) or a **two-stack queue** (any associative operation), and you try per-bit counters first for OR.

## Check yourself

```quiz
- q: >-
    Which property makes the longest-window template (grow right, shrink left while invalid) correct?
  options: ["Each element is admitted and evicted at most once, so the loop runs in O(n)", "Validity survives growing: every window containing a valid one is valid", "Validity survives shrinking: every sub-window of a valid window is valid", "The array is sorted, so the window's sum changes monotonically as it moves"]
  answer: 2
  explanation: >-
    Heredity gives two facts: the valid starts for a right end form a suffix, and the smallest valid start never decreases as the right end advances. Together they mean the left pointer never has to move back. Closure under growing is the mirror property, which justifies the shortest-window template instead; the admit-once argument proves the running time, not correctness; and sortedness is what two pointers need, not windows.
- q: >-
    You need the number of subarrays with sum exactly S in an array that contains negative numbers. What is the right tool?
  options: ["atMost(S) - atMost(S - 1) with a sliding window", "Prefix sums with a hash map of prefix counts", "Sort the array and move two pointers toward sum S", "A sliding window that shrinks while the sum exceeds S"]
  answer: 1
  explanation: >-
    The at-most trick needs the at-most version to be hereditary. With negatives, "sum at most S" is not: dropping a negative element can push the sum over S. Prefix sums turn "range sum equals S" into "two prefixes differ by S", which a hash map counts in O(n). Sorting destroys contiguity.
- q: >-
    A window loop admits each element once and evicts each at most once, but checks validity with sum(1 for c in counts.values() if c > 0) <= k over a map of arbitrary integer keys. What is the running time in the worst case?
  options: ["O(n²)", "O(n)", "O(n·k)", "O(n log n)"]
  answer: 0
  explanation: >-
    The pointer argument only bounds the number of iterations. Each iteration pays for a scan of the map, and because zero-count keys are kept (the check filters c > 0), the map holds every value seen so far, up to n keys, so the total is O(n · d) = O(n²). It is not O(n·k): the window has at most k + 1 distinct values, but the map is not the window. Maintain the distinct count incrementally (or delete zero-count keys and use len) to keep each step O(1).
- q: >-
    In Longest Repeating Character Replacement, the accepted solution never decreases best_freq even after that letter leaves the window. Why is the final answer still correct?
  options: ["It grows only when a valid window of the new length exists, even if not this one", "best_freq is recomputed from the counts once the loop ends, fixing any stale value", "A stale best_freq only makes the check stricter, so it can never over-count", "The window never shrinks, so no letter ever actually leaves it once admitted"]
  answer: 0
  explanation: >-
    The window length tracks the best answer so far and grows by at most one per step. A stale best_freq can only make the check pass when a valid window of length w + 1 exists somewhere in the prefix: best_freq was reached in a window no longer than w + 1, and stretching it to that length keeps it valid. A failed check means the current window, the only new candidate, is truly invalid. Note that a stale, too-high best_freq makes the check more lenient, not stricter; the argument above is what shows the leniency is safe.
- q: >-
    You need the longest subarray whose gcd is greater than 1. The property is closed under shrinking. What is the obstacle, and what fixes it in amortised O(1) per step?
  options: ["gcd is not associative, so a segment tree is needed to combine window ranges", "There is no obstacle; divide the window's gcd by the evicted element's value", "gcd has no inverse when an element leaves; a two-stack queue of running gcds fixes it", "gcd cannot be undone on eviction; a monotonic deque of values keeps it in O(1)"]
  answer: 2
  explanation: >-
    gcd is associative but has no inverse, so the window's gcd cannot be updated on eviction. The two-stack queue stores prefix aggregates in each stack and rebuilds the front stack only when it empties, so each element is moved once, and it handles push, pop and query. A monotonic deque works for max and min because a dominated value can be discarded forever; gcd has no such dominance. A segment tree would work at O(log n) per query, but it is heavier than needed.
```
