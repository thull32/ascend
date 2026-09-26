---
slug: sliding-window
title: "Sliding window: the contiguous segment that never rescans"
description: How a window that grows on the right and shrinks on the left finds the longest, shortest or best contiguous segment in O(n), with Longest Substring Without Repeats, Longest Repeating Replacement and Minimum Window Substring traced step by step.
minutes: 33
difficulty: medium
tags: [sliding-window, subarray, substring, frequency-map, pattern:sliding-window]
problems: [best-time-to-buy-sell, longest-substring-no-repeat, longest-repeating-replacement, permutation-in-string, minimum-window-substring, sliding-window-maximum, max-consecutive-ones-iii]
---
The statement says "longest substring such that…", "smallest subarray with…", or "does any window of size `k` satisfy…". The naive answer enumerates every `(start, end)` pair and checks the segment between them: `O(n²)` pairs, each checked in `O(n)`, which is cubic. Even the improved `O(n²)` version, where you extend from each start and maintain a running state, is too slow for `n = 10⁵`.

A sliding window turns this into a single pass by exploiting one fact: when you extend a segment to the right, most of the work you did for the previous segment is still valid. Instead of restarting at every start index, you keep one window and move its two edges forward only. Every element enters the window once and leaves it once, so the total work is `O(n)` no matter how the edges move. The pattern is not "two indices"; it is "a state that can be updated incrementally as one element enters and one leaves".

## The signal

The words that select this pattern:

- **"Contiguous"**, **"subarray"** or **"substring"**. Windows are segments; the pattern does not apply to subsequences, where elements can be skipped.
- **"Longest"**, **"shortest"** or **"minimum length"** segment satisfying a constraint, or **"count the segments"** that do.
- **"At most `k`"** distinct characters, zeros, replacements, or a budget you spend as the window grows.
- **"Every window of size `k`"**, an explicit fixed width.
- A constraint that is **monotone**: adding an element can only make it harder to satisfy, removing one can only make it easier (or the reverse). Distinct-count, sum of non-negatives, and frequency limits are all monotone.

What rules it out:

- **Sums with negative numbers.** Extending a window can make the sum go either way, so "shrink when the sum is too big" is no longer correct. That is a [prefix-sum](/learn/interview-patterns/array-patterns/prefix-sum) problem with a hash map.
- **Subsequences** ("longest increasing subsequence", "distinct subsequences"). Those are dynamic programming.
- **A per-window maximum or minimum**, as in [Sliding Window Maximum](/practice/sliding-window-maximum). The window still slides, but the state cannot be updated in `O(1)` with a counter; you need a monotonic deque. The window is the easy part; the deque is the lesson at [Monotonic stack pattern](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern).

The nearest confusable pattern is [two pointers](/learn/interview-patterns/array-patterns/two-pointers). Both use a left and a right index. The test: two pointers cares about the elements *at* the indices (a pair that sums to the target); a sliding window cares about the *segment between* them and carries a summary of it.

## The template

Three shapes, one skeleton. The skeleton: extend by one on the right, update the state, fix the window by advancing the left edge until the state is acceptable, then record.

```python
def longest_valid(s):
    """Longest window satisfying valid(state). Adding hurts, removing helps."""
    counts = {}
    left = best = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1          # 1. admit s[right]
        while not valid(counts):                    # 2. shrink until valid
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)          # 3. [left, right] is valid
    return best


def shortest_valid(s):
    """Shortest window satisfying valid(state). Adding helps, removing hurts."""
    counts = {}
    left, best = 0, float("inf")
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        while valid(counts):                        # while valid, try to shrink
            best = min(best, right - left + 1)      # record before removing
            counts[s[left]] -= 1
            left += 1
    return 0 if best == float("inf") else best


def fixed_window(nums, k):
    """Best over every window of exactly k elements."""
    window = sum(nums[:k])
    best = window
    for right in range(k, len(nums)):
        window += nums[right] - nums[right - k]     # one in, one out
        best = max(best, window)
    return best
```

```javascript
function longestValid(s) {
  const counts = new Map();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    counts.set(s[right], (counts.get(s[right]) ?? 0) + 1);   // admit
    while (!valid(counts)) {                                  // shrink
      counts.set(s[left], counts.get(s[left]) - 1);
      left++;
    }
    best = Math.max(best, right - left + 1);                  // record
  }
  return best;
}

function shortestValid(s) {
  const counts = new Map();
  let left = 0, best = Infinity;
  for (let right = 0; right < s.length; right++) {
    counts.set(s[right], (counts.get(s[right]) ?? 0) + 1);
    while (valid(counts)) {
      best = Math.min(best, right - left + 1);
      counts.set(s[left], counts.get(s[left]) - 1);
      left++;
    }
  }
  return best === Infinity ? 0 : best;
}

function fixedWindow(nums, k) {
  let window = 0;
  for (let i = 0; i < k; i++) window += nums[i];
  let best = window;
  for (let right = k; right < nums.length; right++) {
    window += nums[right] - nums[right - k];
    best = Math.max(best, window);
  }
  return best;
}
```

The invariant for the longest form: *after step 3, `[left, right]` is the longest valid window that ends at `right`*. It holds because the shrink loop stops at the first `left` that makes the window valid, and by monotonicity every smaller `left` would be invalid. Since every valid window ends somewhere, taking the max over all `right` covers every candidate. For the shortest form, the invariant is the mirror: after the loop, `[left, right]` is invalid and `left - 1` was the last valid start, so the shortest window ending at `right` has already been recorded.

Why `O(n)` when there is a nested `while`? `left` only increases and is bounded by `n`, so the inner loop executes at most `n` times *in total* across the whole run. The nested loop is an amortised argument, not a quadratic one; say that in the interview.

```viz
{"type": "array", "algorithm": "sliding-window-longest-unique", "values": [1, 2, 3, 1, 2, 4, 3, 5]}
```

The fixed-width form is the same idea with the shrink loop replaced by exactly one removal per step:

```viz
{"type": "array", "algorithm": "sliding-window-max-sum", "values": [2, 1, 5, 1, 3, 2, 7, 1], "k": 3}
```

The general technique, including the at-most-`k` trick and windows over counts, is developed in [Sliding-window mastery](/learn/algorithms/technique-mastery/sliding-window-mastery). Here the focus is recognition and execution.

## Worked problems

### Longest Substring Without Repeating Characters

[Longest Substring Without Repeating Characters](/practice/longest-substring-no-repeat): return the length of the longest substring with all distinct characters.

The state is a character-count map, and the window is valid when no count exceeds 1. Because you only ever break validity by admitting `s[right]`, the shrink condition simplifies to `while counts[s[right]] > 1`.

```python
def length_of_longest_substring(s):
    counts = {}
    left = best = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        while counts[ch] > 1:
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
```

Trace on `"abcabcbb"`:

| `right` | char | after admit | shrink | window | `best` |
|---|---|---|---|---|---|
| 0 | a | a:1 | none | `a` | 1 |
| 1 | b | a:1 b:1 | none | `ab` | 2 |
| 2 | c | a:1 b:1 c:1 | none | `abc` | 3 |
| 3 | a | a:2 | drop `s[0]`=a, `left=1` | `bca` | 3 |
| 4 | b | b:2 | drop `s[1]`=b, `left=2` | `cab` | 3 |
| 5 | c | c:2 | drop `s[2]`=c, `left=3` | `abc` | 3 |
| 6 | b | b:2 | drop a (`left=4`), drop b (`left=5`) | `cb` | 3 |
| 7 | b | b:2 | drop c (`left=6`), drop b (`left=7`) | `b` | 3 |

Answer 3. At `right = 6` the shrink loop ran twice: the first drop removed an `a` that was not the offender, and the window stayed invalid until the earlier `b` left. That is why the shrink is a `while`, not an `if`.

Time `O(n)`; space `O(min(n, alphabet))`. A common optimisation stores the last index of each character and jumps `left` directly to `last[ch] + 1`, but it needs a `max(left, ...)` guard so `left` never moves backwards. The count version is harder to get wrong under pressure.

### Longest Repeating Character Replacement

[Longest Repeating Character Replacement](/practice/longest-repeating-replacement): you may change at most `k` characters; return the longest substring you can make uniform.

A window is valid when `length - maxFrequency ≤ k`: the characters that are not the majority are the ones you would replace. The trap is `maxFrequency`. Recomputing it after every shrink costs `O(alphabet)`; the senior move is to notice you never need to decrease it. `best` can only improve when a window longer than any previous one becomes valid, which requires `maxFrequency` to reach a new high. A stale, too-large `maxFrequency` can only keep the window at a size you already achieved, never let it record a size you have not.

```python
def character_replacement(s, k):
    counts = {}
    left = best = max_freq = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        max_freq = max(max_freq, counts[ch])
        while (right - left + 1) - max_freq > k:
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best
```

Trace on `s = "AABABBA"`, `k = 1`:

| `right` | char | counts | `max_freq` | len − max | shrink | window | `best` |
|---|---|---|---|---|---|---|---|
| 0 | A | A:1 | 1 | 0 | none | `A` | 1 |
| 1 | A | A:2 | 2 | 0 | none | `AA` | 2 |
| 2 | B | A:2 B:1 | 2 | 1 | none | `AAB` | 3 |
| 3 | A | A:3 B:1 | 3 | 1 | none | `AABA` | 4 |
| 4 | B | A:3 B:2 | 3 | 2 > 1 | drop A, `left=1` | `ABAB` | 4 |
| 5 | B | A:2 B:3 | 3 | 2 > 1 | drop A, `left=2` | `BABB` | 4 |
| 6 | A | A:2 B:3 | 3 | 2 > 1 | drop B, `left=3` | `ABBA` | 4 |

Answer 4 (`AABA` with one replacement, or `BABB`). At `right = 4` the window `ABAB` has true max frequency 2, so `len - max` is really 2, and the window is technically invalid. It does not matter: the window is size 4, which `best` already holds. The stale value never produces a *new* best it has not earned.

Time `O(n)`, space `O(alphabet)`. If the interviewer asks why the shrink can be an `if` here rather than a `while`, the answer is that with a non-decreasing `max_freq` the window never needs to shrink by more than one: it grew by one and the threshold did not fall.

### Minimum Window Substring

[Minimum Window Substring](/practice/minimum-window-substring): find the shortest substring of `s` that contains every character of `t` with multiplicity.

This is the shortest-valid shape. The state is a `need` map (how many of each character the window still lacks) and a single integer `missing` (how many characters in total are still lacking). Validity is `missing == 0`, an `O(1)` check, which is the whole reason for keeping `missing` instead of scanning the map.

```python
def min_window(s, t):
    need = {}
    for ch in t:
        need[ch] = need.get(ch, 0) + 1
    missing = len(t)
    left, best = 0, (0, 0)          # best window as (start, end exclusive)
    for right, ch in enumerate(s):
        if need.get(ch, 0) > 0:
            missing -= 1
        need[ch] = need.get(ch, 0) - 1
        while missing == 0:                          # valid: record, then shrink
            if best == (0, 0) or right + 1 - left < best[1] - best[0]:
                best = (left, right + 1)
            need[s[left]] += 1
            if need[s[left]] > 0:                    # we just lost a required char
                missing += 1
            left += 1
    return s[best[0]:best[1]]
```

Characters not in `t` go negative in `need`; that is fine, because `missing` only changes when a count crosses zero from the positive side. Trace on `s = "BAXCBA"`, `t = "ABC"` (`missing` starts at 3):

| `right` | char | `missing` after admit | shrink steps | window after | `best` |
|---|---|---|---|---|---|
| 0 | B | 2 | — | `B` | — |
| 1 | A | 1 | — | `BA` | — |
| 2 | X | 1 (X not needed) | — | `BAX` | — |
| 3 | C | 0 | record `BAXC`; drop B → `missing=1`, `left=1` | `AXC` | `BAXC` |
| 4 | B | 0 | `AXCB` not shorter; drop A → `missing=1`, `left=2` | `XCB` | `BAXC` |
| 5 | A | 0 | `XCBA` not shorter; drop X → still 0, `left=3`; record `CBA`; drop C → `missing=1`, `left=4` | `BA` | `CBA` |

Answer `"CBA"`. The interesting row is the last one: the shrink loop ran twice because dropping `X` did not break validity, and it is that second iteration that found the true minimum. If the shrink were an `if`, you would return `"XCBA"`.

Time `O(|s| + |t|)`, space `O(alphabet)`. The "record before removing" ordering inside the shrink loop is load-bearing; the moment you remove `s[left]` the window may no longer be valid.

The remaining problems in this lesson's list are the same skeleton with different state. [Permutation in String](/practice/permutation-in-string) is a fixed window of width `|t|` whose state is a count map compared against `t`'s counts; the string visualiser shows the same mechanism on an anagram search:

```viz
{"type": "string", "algorithm": "anagram-window", "text": "cbaebabacd", "pattern": "abc"}
```

[Max Consecutive Ones III](/practice/max-consecutive-ones-iii) is longest-valid with state "number of zeros in the window" and validity "zeros ≤ k". [Best Time to Buy and Sell Stock](/practice/best-time-to-buy-sell) is the degenerate case: the window's only state is the minimum price seen so far, and the "window" is just everything up to `right`.

## Variations

- **Exactly `k` from at most `k`.** "Subarrays with exactly `k` distinct" is `atMost(k) - atMost(k - 1)`. Exactness is not monotone; at-most is. Reduce to the monotone version twice.
- **Counting windows.** To count all valid subarrays rather than find the longest, add `right - left + 1` at step 3: that is the number of valid windows ending at `right`, one per possible start in `[left, right]`.
- **Window over a fixed alphabet.** With 26 lowercase letters you can compare two length-26 arrays per step and still call it `O(n)`; the `26` is a constant. Say so rather than pretending the comparison is free.
- **Non-shrinking window.** When only the maximum length matters, some solutions (as in the replacement problem) let the window slide without ever shrinking below its best size. It works because the final `right - left` equals the best; it is a neat trick that is hard to explain live, so prefer the explicit `best` variable unless you are asked for it.
- **Negatives break it.** "Subarray with sum `k`" over negative numbers cannot use a window because removing an element can increase the sum. Switch to prefix sums and a hash map; recognising this switch is a common interview pivot.

## Pitfalls

- **Updating the state on admit but not on removal**, or vice versa. Every mutation happens in pairs; if `counts[s[right]] += 1` exists, `counts[s[left]] -= 1` must exist in the shrink loop.
- **`if` instead of `while` for the shrink.** A single admit can invalidate the window in a way that needs several removals (the `right = 6` row in the first trace). The replacement problem is the special case where `if` suffices; do not generalise from it.
- **Recording at the wrong moment.** In longest-valid, record after the shrink. In shortest-valid, record inside the shrink loop *before* removing. Swapping these gives off-by-one answers that pass the sample and fail the hidden tests.
- **Window length off by one.** It is `right - left + 1` with inclusive `right`. Writing `right - left` is the single most common bug in this pattern.
- **Initialising `best` to 0 in the shortest form.** Use infinity (or `n + 1`) and translate at the end, otherwise you can never improve on it.
- **Slicing inside the loop.** `s[left:right+1]` or `nums.slice(left, right + 1)` copies the window; do it once per step and the pass is `O(n²)`. Keep indices and materialise the answer once at the end.
- **Checking validity in `O(k)`** by scanning the whole map. Maintain a counter (`missing`, `distinct`, `zeros`) so the check is `O(1)`.

## Exercise

```exercise
id: longest-subarray-sum-at-most
title: Longest subarray with sum at most a limit
prompt: |
  Given an array of non-negative integers `nums` and an integer `limit`,
  return the length of the longest contiguous subarray whose sum is
  less than or equal to `limit`. Return 0 if no non-empty subarray
  qualifies.

  Use a variable-size window: admit on the right, shrink from the left
  while the sum exceeds `limit`, then record the window length.
languages: [python, javascript]
entry: longest_subarray_at_most
starter:
  python: |
    def longest_subarray_at_most(nums, limit):
        # your code here
        return 0
  javascript: |
    function longest_subarray_at_most(nums, limit) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2, 1, 0, 1, 1, 4], 3]
    expected: 4
  - args: [[3, 1, 2, 1, 3], 4]
    expected: 3
  - args: [[4, 5, 6], 3]
    expected: 0
    label: every element exceeds the limit
  - args: [[], 5]
    expected: 0
    label: empty input
  - args: [[0, 0, 0], 0]
    expected: 3
    label: zeros fit a zero limit
  - args: [[2, 2, 2, 2], 4]
    expected: 2
    hidden: true
  - args: [[1, 1, 1, 1, 1], 10]
    expected: 5
    hidden: true
    label: whole array fits
hints:
  - "Keep a running sum; after adding nums[right], loop while the sum is greater than limit, subtracting nums[left] and advancing left."
  - "After the shrink loop the window [left, right] is valid (possibly empty when left == right + 1); its length is right - left + 1."
  - "Non-negative values are what make shrinking monotone: removing from the left can never increase the sum."
```

## Senior signals

- You name the **monotonicity** that makes the window valid ("adding can only add distinct characters, removing can only remove them") before you write the shrink loop, and you notice when it is absent (negative sums) and pivot to prefix sums.
- You explain the **amortised `O(n)`**: the inner `while` runs at most `n` times in total because `left` never moves backwards.
- You keep validity checks **`O(1)`** with a counter (`missing`, `distinct`) rather than scanning the map, and you can say what the alphabet-sized constant costs when you do not.
- You know the **three shapes** (longest, shortest, fixed) and which one a statement is asking for, including that "record before remove" versus "record after shrink" differs between them.
- You can justify the **stale `max_freq`** trick in one sentence, and you know it is a special case rather than a general licence to replace `while` with `if`.
- You route "maximum in each window" to the **monotonic deque** immediately rather than trying to make a counter work.

## Check yourself

```quiz
- q: >-
    Why is a sliding window O(n) even though it contains a nested while loop?
  options: ["The inner loop runs at most a constant number of times per iteration", "The left index only ever increases and is bounded by n, so the inner loop executes at most n times in total across the whole run", "Hash-map operations are O(1), which cancels the extra loop", "It is not O(n); it is O(n²) in the worst case"]
  answer: 1
  explanation: >-
    This is an amortised argument: each element is removed at most once, so all shrink iterations together cost O(n). The per-iteration count can be large (the first trace shrinks twice in one step), so option 0 is wrong; it is the total that is bounded.
- q: >-
    A candidate solves "longest substring with at most k distinct characters" and is then asked for exactly k. What is the cleanest change?
  options: ["Replace <= k with == k in the shrink condition", "Compute atMost(k) minus atMost(k - 1)", "Add a second window that tracks the k-th character", "Switch to dynamic programming"]
  answer: 1
  explanation: >-
    Exactly-k is not monotone (extending a window can move it into and back out of validity), so the shrink loop breaks. At-most-k is monotone, and the difference of two at-most counts isolates the exact count. Changing the comparison alone produces wrong shrink behaviour.
- q: >-
    In the shortest-window form, where must you record the candidate answer?
  options: ["After the shrink loop finishes", "Inside the shrink loop, before removing s[left]", "Inside the shrink loop, after removing s[left]", "Only when the loop over right finishes"]
  answer: 1
  explanation: >-
    The window is valid at the top of each shrink iteration and may become invalid the moment s[left] leaves. Recording after removal misses the last valid state; recording after the loop records an invalid window.
- q: >-
    "Find the longest subarray whose sum equals k" where the array contains negative numbers. A sliding window fails because:
  options: ["Windows only work on strings", "Removing an element from the left can increase the sum, so shrinking is no longer monotone", "The sum can overflow", "k might be negative"]
  answer: 1
  explanation: >-
    The shrink rule assumes that removing elements moves the state in one direction. With negatives it does not, so the window can skip valid segments. Prefix sums with a hash map from prefix value to first index solve it in O(n).
- q: >-
    In Longest Repeating Character Replacement, max_freq is never decreased when characters leave the window. Why does the answer remain correct?
  options: ["max_freq is always recomputed at the end", "A too-large max_freq can only keep the window at a size that was already recorded as best, never let it record a larger invalid window", "Character counts never decrease either", "It is not correct in general; it only works when k is 0"]
  answer: 1
  explanation: >-
    best only grows when a longer window is valid, and a longer valid window requires a genuinely larger max_freq, which the code would have observed. The stale value can make the current window technically invalid, but its length never exceeds the recorded best.
```
