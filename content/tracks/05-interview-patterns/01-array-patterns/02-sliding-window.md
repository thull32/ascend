---
slug: sliding-window
title: "Sliding window: the contiguous segment that never rescans"
description: How to recognise a sliding window (including the ones a statement hides), make the four decisions that decide the round, and execute Longest Substring Without Repeats, Longest Repeating Replacement, Permutation in String and Minimum Window Substring with full traces.
minutes: 50
difficulty: medium
tags: [sliding-window, subarray, substring, frequency-map, pattern:sliding-window]
problems: [best-time-to-buy-sell, longest-substring-no-repeat, longest-repeating-replacement, permutation-in-string, minimum-window-substring, sliding-window-maximum, max-consecutive-ones-iii]
---
The statement says "longest substring such that…", "smallest subarray with…", or "does any window of size `k` satisfy…". Enumerating every `(start, end)` pair and checking the segment is `O(n²)` segments at up to `O(n)` each. Even the improved version that extends from each start with a running state is `O(n²)`: at `n = 10⁵` that is 5 × 10⁹ steps, minutes in CPython. The window version of Longest Substring Without Repeating Characters processes a million characters in 83 ms in CPython 3.14 with a `dict`, and in 3 ms in Node 24 with a typed array, on the machine this lesson was written on (the measurements are below).

The window works because extending a segment by one element leaves almost everything you knew about it still true. You keep one window, move each edge forward only, and update a summary of its contents as one element enters and another leaves. Every element enters once and leaves at most once, so the pass is linear however the edges move. The pattern is not "two indices"; it is "a summary of the segment between them that updates in `O(1)` per element, plus a reason the left edge never has to move back".

Recognising "substring" is the easy part. Candidates lose this round in the four decisions that follow it: which of three window shapes the question is, what state to keep, how to test validity in `O(1)`, and on which line to record the answer. The theory underneath (why `left` never moves back, counting windows, the at-most-`k` reduction, aggregates you cannot subtract) is in [Sliding-window mastery](/learn/algorithms/technique-mastery/sliding-window-mastery); this lesson assumes it and concentrates on execution.

## The signal

A statement selects the window when all three of these hold:

1. **The answer is a contiguous segment**: "subarray", "substring", "consecutive", "window", "a period of days". Subsequences, subsets and pairs are out.
2. **It asks for an extreme or a count of segments**: longest, shortest, the best over every window of size `k`, or how many segments qualify.
3. **Validity is monotone in the window.** Ask two questions. If I drop an element from an end of a valid window, is it still valid? A yes selects the *longest* (or *count*) shape. If I add an element to a valid window, is it still valid? A yes selects the *shortest* shape. Two noes mean it is not a window problem, however much the wording says "subarray". The proof that a yes makes `left` monotone is the heredity argument in the mastery lesson.

Fixed width is the special case where the statement hands you the width: "every window of size `k`", "`k` consecutive days", "each 5-minute bucket".

### Windows the statement does not name

The most valuable recognitions are the ones where the word "window" never appears:

| Statement | The hidden window |
|---|---|
| "Take exactly `k` cards from either end of the row; maximise their total" | The cards you *leave* are a contiguous middle block of `n − k`; minimise its sum with a fixed window |
| "Fewest swaps to group all the 1s together" | A fixed window whose width is the number of 1s; the answer is the fewest 0s any such window holds |
| "Flip at most `k` zeros to get the longest run of 1s" ([Max Consecutive Ones III](/practice/max-consecutive-ones-iii)) | Longest window whose zero count is at most `k`; you never flip anything |
| The same question on a **circular** array | Slide over indices `0 … n + w − 2` and read `nums[i % n]`; never concatenate the array |
| "Longest period with at most `k` failed requests", over timestamped events | Longest window over events sorted by time; eviction is by time (`ts[left] ≤ now − W`), not by count |
| "The `k` elements closest to `x` in a sorted array" | A fixed window of width `k` whose left edge you binary-search |

### Near misses

Each of these reads like a window and is not one, or is one only with extra machinery:

| Statement | Needs instead | Why |
|---|---|---|
| "Count subarrays with sum exactly `k`", values may be negative | [Prefix sums + hash map](/learn/interview-patterns/array-patterns/prefix-sum) | Dropping a negative raises the sum; neither question gets a yes |
| "Longest subarray with sum exactly `k`", all values positive | A window for sum ≤ `k` that records only when the sum equals `k` | Looks like prefix sums, but with positives the only start that can hit `k` is the smallest valid one |
| "Maximum-sum subarray", any length | [Kadane](/learn/interview-patterns/array-patterns/kadane-and-subarrays) | There is no predicate to shrink on; you optimise a value |
| "Maximum of every window of size `k`" | Window + [monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque) | Max has no inverse, so one number cannot survive the eviction of the max |
| "Median of every window of size `k`" ([Sliding Window Median](/practice/sliding-window-median)) | Window + two heaps with lazy deletion | The order statistic needs `O(log k)` state per step |
| "Shortest subarray with sum ≥ `k`", negatives allowed | Monotonic deque over prefix sums | Adding a negative can break validity, so the shortest shape is unsound |
| "Subarrays with exactly `k` distinct values" | `atMost(k) − atMost(k − 1)` | "Exactly" survives neither dropping nor adding |
| "Longest palindromic substring" | Expand around centres | A sub-window of a palindrome need not be one |
| "Two indices whose values sum to a target" | [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) or a hash map | You care about the elements *at* the indices, not the segment between them |

## Four decisions before you type

Say these four out loud before writing a line; they are the plan the interviewer is listening for.

| Problem | Shape | State | `O(1)` validity test | Record the answer |
|---|---|---|---|---|
| [Longest Substring Without Repeats](/practice/longest-substring-no-repeat) | longest | count per character | `counts[s[right]] ≤ 1` (only the admitted character can break it) | after the shrink |
| [Longest Repeating Replacement](/practice/longest-repeating-replacement) | longest | counts + `max_freq` | `length − max_freq ≤ k` | after the shrink |
| [Max Consecutive Ones III](/practice/max-consecutive-ones-iii) | longest | zeros in window | `zeros ≤ k` | after the shrink |
| [Permutation in String](/practice/permutation-in-string) | fixed, width `len(s1)` | counts + `matches` | `matches == 26` | after the eviction |
| [Minimum Window Substring](/practice/minimum-window-substring) | shortest | `need` map + `missing` | `missing == 0` | inside the shrink, before each eviction |
| [Sliding Window Maximum](/practice/sliding-window-maximum) | fixed, width `k` | deque of indices, values decreasing | none; it is an aggregate | front of the deque once `right ≥ k − 1` |
| [Best Time to Buy and Sell Stock](/practice/best-time-to-buy-sell) | degenerate: `left` jumps to each new minimum | minimum price so far | none | every step |

The state column follows from the alphabet. For a fixed small alphabet (26 letters, 128 ASCII codes) use an array indexed by character code. For arbitrary keys use a hash map and delete keys whose count reaches zero, so the map's size *is* the distinct count. For max or min use a deque; for a median use two heaps. The validity column is where the `O(n)` claim lives or dies: if checking validity scans the state, the pass is `O(n × σ)`, as the mastery lesson measures.

The record column has one rule per shape. Longest and count record after the shrink, when the window is valid and as long as it can be. Shortest records inside the shrink loop before each eviction, because the eviction may make the window invalid. Fixed records once the window has reached full width.

## The template

Three runnable shapes. Learn the skeleton once (admit on the right, repair on the left, record); only the three lines of state change.

```python
def longest_at_most_k_distinct(s, k):
    """Longest substring with at most k distinct characters."""
    counts = {}                                # char -> count inside s[left..right]
    left = best = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1     # 1. admit s[right]
        while len(counts) > k:                 # 2. shrink while invalid
            out = s[left]
            counts[out] -= 1
            if counts[out] == 0:
                del counts[out]                #    so len(counts) is the distinct count
            left += 1
        best = max(best, right - left + 1)     # 3. record: the window is valid
    return best


def shortest_sum_at_least(nums, target):
    """Shortest subarray with sum >= target; nums are non-negative. 0 if none."""
    total = left = 0
    best = len(nums) + 1                       # sentinel longer than any window
    for right, x in enumerate(nums):
        total += x                             # 1. admit
        while left <= right and total >= target:
            best = min(best, right - left + 1) # 2. record BEFORE evicting
            total -= nums[left]
            left += 1
    return 0 if best > len(nums) else best


def max_sum_fixed(nums, k):
    """Largest sum of any k consecutive elements, 1 <= k <= len(nums)."""
    window = sum(nums[:k])
    best = window
    for right in range(k, len(nums)):
        window += nums[right] - nums[right - k]  # one in, one out
        best = max(best, window)
    return best
```

```javascript
function longestAtMostKDistinct(s, k) {
  const counts = new Map();
  let left = 0, best = 0;
  for (let right = 0; right < s.length; right++) {
    counts.set(s[right], (counts.get(s[right]) ?? 0) + 1);   // admit
    while (counts.size > k) {                                 // shrink while invalid
      const out = s[left++];
      const c = counts.get(out) - 1;
      if (c === 0) counts.delete(out); else counts.set(out, c);
    }
    best = Math.max(best, right - left + 1);                  // record
  }
  return best;
}

function shortestSumAtLeast(nums, target) {
  let total = 0, left = 0, best = nums.length + 1;
  for (let right = 0; right < nums.length; right++) {
    total += nums[right];
    while (left <= right && total >= target) {
      best = Math.min(best, right - left + 1);                // record before evicting
      total -= nums[left++];
    }
  }
  return best > nums.length ? 0 : best;
}

function maxSumFixed(nums, k) {
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

The non-obvious lines. `del counts[out]` makes `len(counts) > k` an `O(1)` test; without it the map keeps zero entries and its size means nothing. The `left <= right` guard in the shortest shape makes the empty window a legal stopping point: with `target ≤ 0` every window is valid, and without the guard the loop evicts past `right`. The sentinel `len(nums) + 1` avoids `float("inf")`, which would turn an integer function into one that can return a float.

The invariants to say out loud. **Longest:** after step 2, `s[left..right]` is the longest valid window ending at `right`, because the shrink stops at the first valid start and every earlier start was invalid. **Shortest:** after the loop, the window is invalid or empty, and every valid window ending at `right` that starts at or after the old `left` was recorded before its first element left. **Fixed:** after each slide, `window` equals the sum of exactly the `k` elements ending at `right`.

```viz
{"type": "array", "algorithm": "sliding-window-longest-unique", "values": [1, 2, 3, 1, 2, 4, 3, 5]}
```

The fixed-width form replaces the shrink loop with exactly one eviction per step:

```viz
{"type": "array", "algorithm": "sliding-window-max-sum", "values": [2, 1, 5, 1, 3, 2, 7, 1], "k": 3}
```

## Worked problems

### Longest Substring Without Repeating Characters

[Longest Substring Without Repeating Characters](/practice/longest-substring-no-repeat). Decisions: longest; counts; only the admitted character can create a repeat, so the test is `counts[ch] > 1`; record after the shrink.

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

| `right` | char | counts after admit | shrink | window | `best` |
|---|---|---|---|---|---|
| 0 | a | a:1 | none | `a` | 1 |
| 1 | b | a:1 b:1 | none | `ab` | 2 |
| 2 | c | a:1 b:1 c:1 | none | `abc` | 3 |
| 3 | a | a:2 | drop `s[0]`=a, `left=1` | `bca` | 3 |
| 4 | b | b:2 | drop `s[1]`=b, `left=2` | `cab` | 3 |
| 5 | c | c:2 | drop `s[2]`=c, `left=3` | `abc` | 3 |
| 6 | b | b:2 | drop a (`left=4`), drop b (`left=5`) | `cb` | 3 |
| 7 | b | b:2 | drop c (`left=6`), drop b (`left=7`) | `b` | 3 |

Answer 3. At `right = 6` the first eviction removed an `a` that was not the offender, which is why the shrink is a `while`.

The faster variant stores the last index of each character and jumps `left` past the previous copy in one step. It has one trap, and interviewers pick the input that springs it:

```python
def length_of_longest_substring_jump(s):
    last = {}                                  # char -> index of its latest occurrence
    left = best = 0
    for right, ch in enumerate(s):
        if last.get(ch, -1) >= left:           # the previous copy is inside the window
            left = last[ch] + 1
        last[ch] = right
        best = max(best, right - left + 1)
    return best
```

Trace on `"abba"`, with and without the `>= left` guard:

| `right` | char | `last[ch]` before | `left` with guard | `left` without guard | `best` with / without |
|---|---|---|---|---|---|
| 0 | a | none | 0 | 0 | 1 / 1 |
| 1 | b | none | 0 | 0 | 2 / 2 |
| 2 | b | 1 | 2 | 2 | 2 / 2 |
| 3 | a | 0 | 2 (0 < 2, stays) | **1** | 2 / **3** |

The stale index 0 for `a` points outside the window. Without the guard, `left` moves *backwards* to 1 and the window `bba` is reported as valid. The guard (equivalently `left = max(left, last[ch] + 1)`) keeps `left` monotone, which is the property the whole pattern rests on.

### Longest Repeating Character Replacement

[Longest Repeating Character Replacement](/practice/longest-repeating-replacement). Decisions: longest; counts plus `max_freq`; valid when `length − max_freq ≤ k` (the non-majority characters are the ones you repaint); record after the shrink.

```python
def character_replacement(s, k):
    counts = {}
    left = best = max_freq = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1
        max_freq = max(max_freq, counts[ch])   # never decreased; see below
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

Answer 4. At `right = 4`, after the eviction, the window `ABAB` has a true maximum count of 2, so it is really invalid, yet the code holds it at length 4. That is safe because `best` can only grow when a window longer than any before becomes valid, which needs a genuinely new `max_freq`. The full two-case proof is in the mastery lesson. If you cannot reproduce it under pressure, recompute the true maximum over 26 counts on each shrink and say "26 is a constant"; the honest version is `O(26n)` and nobody fails you for it.

### Permutation in String

[Permutation in String](/practice/permutation-in-string): does `s2` contain a substring that is a permutation of `s1`? Decisions: fixed width `len(s1)`; counts for both strings; a `matches` counter that holds how many of the 26 letters have equal counts in the window and in `s1`; record (here, return) after the eviction.

```python
def check_inclusion(s1, s2):
    m = len(s1)
    if m > len(s2):
        return False
    need, have = [0] * 26, [0] * 26
    for c in s1:
        need[ord(c) - 97] += 1
    matches = sum(need[i] == have[i] for i in range(26))
    for right, c in enumerate(s2):
        i = ord(c) - 97
        have[i] += 1
        if have[i] == need[i]:
            matches += 1                        # this letter just became equal
        elif have[i] == need[i] + 1:
            matches -= 1                        # it was equal, now one too many
        if right >= m:                          # evict the element leaving the window
            j = ord(s2[right - m]) - 97
            have[j] -= 1
            if have[j] == need[j]:
                matches += 1
            elif have[j] == need[j] - 1:
                matches -= 1
        if matches == 26:
            return True
    return False
```

Each admit or evict changes one count by one, so `matches` changes by at most one, and the equality test is `O(1)` instead of a 26-entry comparison. Trace on `s1 = "ab"`, `s2 = "eidbaooo"`. Before the loop 24 letters already match (both counts 0); `a` and `b` do not.

| `right` | admit | effect | evict | effect | window | `matches` |
|---|---|---|---|---|---|---|
| 0 | e | e: 0 → 1, was equal | — | — | `e` | 23 |
| 1 | i | i: 0 → 1, was equal | — | — | `ei` | 22 |
| 2 | d | d: 0 → 1, was equal | e | e: 1 → 0, now equal | `id` | 22 |
| 3 | b | b: 0 → 1, now equal | i | i: 1 → 0, now equal | `db` | 24 |
| 4 | a | a: 0 → 1, now equal | d | d: 1 → 0, now equal | `ba` | **26**, return true |

The string visualiser runs the same fixed-window count on an anagram search:

```viz
{"type": "string", "algorithm": "anagram-window", "text": "cbaebabacd", "pattern": "abc"}
```

### Minimum Window Substring

[Minimum Window Substring](/practice/minimum-window-substring): the shortest substring of `s` containing every character of `t` with multiplicity. Decisions: shortest; a `need` map plus an integer `missing`; valid when `missing == 0`; record inside the shrink, before the eviction.

```python
def min_window(s, t):
    need = {}
    for ch in t:
        need[ch] = need.get(ch, 0) + 1
    missing = len(t)
    left, best = 0, (0, 0)                      # best window as (start, end exclusive)
    for right, ch in enumerate(s):
        if need.get(ch, 0) > 0:
            missing -= 1                        # this char was still owed
        need[ch] = need.get(ch, 0) - 1          # surplus chars go negative
        while missing == 0:
            if best == (0, 0) or right + 1 - left < best[1] - best[0]:
                best = (left, right + 1)        # record before evicting
            need[s[left]] += 1
            if need[s[left]] > 0:               # we just lost a required char
                missing += 1
            left += 1
    return s[best[0]:best[1]]
```

Characters not in `t`, and surplus copies of those that are, go negative in `need`; `missing` changes only when a count crosses zero from the positive side. Trace on `s = "BAXCBA"`, `t = "ABC"`:

| `right` | char | `missing` after admit | shrink steps | window after | `best` |
|---|---|---|---|---|---|
| 0 | B | 2 | — | `B` | — |
| 1 | A | 1 | — | `BA` | — |
| 2 | X | 1 (X not needed) | — | `BAX` | — |
| 3 | C | 0 | record `BAXC`; drop B → `missing=1`, `left=1` | `AXC` | `BAXC` |
| 4 | B | 0 | `AXCB` not shorter; drop A → `missing=1`, `left=2` | `XCB` | `BAXC` |
| 5 | A | 0 | `XCBA` not shorter; drop X → still 0, `left=3`; record `CBA`; drop C → `missing=1`, `left=4` | `BA` | `CBA` |

Answer `"CBA"`. In the last row the shrink ran twice because dropping `X` kept the window valid, and the second iteration found the minimum; an `if` there returns `"BAXC"`, and recording after the eviction returns the invalid `"BA"`. Time `O(|s| + |t|)`.

[Sliding Window Maximum](/practice/sliding-window-maximum) completes the problem list. The window is fixed and trivial; the state is a deque of indices with decreasing values, and the mechanics belong to the [monotonic stack pattern](/learn/interview-patterns/sequence-patterns/monotonic-stack-pattern):

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [1, 3, -1, -3, 5, 3, 6, 7], "k": 3, "title": "Fixed window, deque state", "caption": "Indices whose values can never be the maximum again leave from the back; indices that slid out of the window leave from the front."}
```

## Variants

| Variant | What changes in the template | Cost |
|---|---|---|
| Longest valid | Shrink while invalid; record after the shrink | `O(n)` |
| Shortest valid | Shrink while valid; record before each eviction; empty window is a legal stop | `O(n)` |
| Fixed width `k` | Evict `nums[right − k]` once `right ≥ k`; record once `right ≥ k − 1` | `O(n)` |
| Count valid subarrays | Add `right − left + 1` after the shrink | `O(n)` |
| Exactly `k` | `atMost(k) − atMost(k − 1)`, two passes | `O(n)` |
| Budget ("at most `k` zeros, replacements, failures") | State is the amount spent; valid while spent ≤ `k` | `O(n)` |
| Last-index jump | `left = max(left, last[ch] + 1)` replaces the inner loop | `O(n)`, no inner loop |
| Window max or min | Monotonic deque of indices | amortised `O(1)` per step |
| Window median or k-th | Two heaps with lazy deletion, or a sorted list | `O(n log k)` |
| Time-based window | Evict while `ts[left] ≤ now − W`; events must arrive in time order | `O(n)` over events |
| Circular | Iterate `i` from 0 to `n + w − 2`, read `nums[i % n]` | `O(n + w)` |
| Non-shrinking (replacement problem) | `if` instead of `while`; the window length is the answer | `O(n)`, needs its proof |

## Complexity, derived

Let `P = left + right`. Every iteration of the outer loop increases `right` by one, every iteration of the inner loop increases `left` by one, neither ever decreases, and each is at most `n`. So `P` rises by one per iteration of either loop and never exceeds `2n`: the two loops together run at most `2n` times. Multiply by the cost of one admit, evict and validity test. With a count map, a counter such as `missing`, or an array indexed by character, that is `O(1)` and the pass is `O(n)`. With a monotonic deque it is amortised `O(1)`, still `O(n)`. With heaps for a median it is `O(log k)`, so `O(n log k)`. Space is the state: `O(σ)` for an alphabet of size `σ`, `O(k)` for a deque or heaps.

Put numbers on the alternatives for `n = 10⁵`: the window is 2 × 10⁵ pointer moves; extend-from-every-start is up to 5 × 10⁹; the triple loop with an `O(n)` check is on the order of 10¹⁴ and never finishes.

| Approach | Time | Extra space | Negatives | Answers | Runs on a stream |
|---|---|---|---|---|---|
| Enumerate every segment, incremental state | `O(n²)` | `O(σ)` | yes | anything | no |
| Sliding window | `O(n)` | `O(σ)` or `O(k)` | only if the predicate ignores sign | longest, shortest, count | yes, holding the window's elements |
| Prefix sums + hash map | `O(n)` | `O(n)` | yes | count, longest with exact sum | yes, holding every prefix seen |
| Monotonic deque over prefix sums | `O(n)` | `O(n)` | yes | shortest with sum ≥ `k` | yes |

The window wins on space and on streams; prefix sums win the moment the predicate stops being monotone.

## Under the hood

### Which state container, measured

The template leaves one real choice: how to store the counts. Here is Longest Substring Without Repeats on one million random lowercase letters, best of five runs, CPython 3.14 and Node 24 on an AMD Ryzen 9 9950X3D:

| Implementation | CPython 3.14 | Node 24 |
|---|---|---|
| Count map (`dict` / `Map`), shrink loop | 83 ns/char | 36 ns/char |
| Plain object as the map | — | 25 ns/char |
| `collections.Counter` | 122 ns/char | — |
| Array of 128 counts indexed by character code | 77 ns/char | 2.9 ns/char (`Int32Array` + `charCodeAt`) |
| Last-index jump, no inner loop | 42 ns/char (`dict`) | 1.7 ns/char (`Int32Array`) |

Three things explain the table. In CPython almost all of the cost is interpreter dispatch, so the array barely beats the dict: `ord(ch)` costs about what the hash lookup saves. `Counter` is slower because the interpreter's specialised dict-subscript path (CPython 3.11 and later) requires an exact `dict`, and `Counter` is a subclass, so every `counts[ch]` takes the generic path. In V8 the picture flips: `s[right]` yields a one-character string and every `Map` operation is a hash-table probe keyed on it, while `charCodeAt` returns a small integer that the optimising compiler keeps in a register and uses as a bounds-checked offset into a typed array, twelve times faster. You can see the CPython side with `dis.get_instructions(f, adaptive=True)` after a warm-up: the `dict` version shows `BINARY_OP_SUBSCR_DICT` and `STORE_SUBSCR_DICT`, the `Counter` version stays on generic `BINARY_OP` and `STORE_SUBSCR`. The last-index version wins in both runtimes because it does one lookup and one store per character and has no inner loop.

The interview consequence: in JavaScript on a known alphabet, an `Int32Array(128)` is the idiomatic choice, not a micro-optimisation. In Python, write whichever you can type without bugs.

### JavaScript strings are UTF-16 code units

`s[i]` and `s.length` in JavaScript count UTF-16 code units. Characters outside the Basic Multilingual Plane, including every emoji, take two: a high surrogate and a low surrogate. `"😀😃".length` is 4, and both emoji start with the same high surrogate `0xD83D`. The count-map solution above returns 3 on that string in Node, a "substring without repeats" that splits a character in half; the right answer is 2. Iterating code points (`for (const ch of s)` or `[...s]`) fixes it, at the cost of an `O(n)` array. CPython does not have this problem: since PEP 393 (Python 3.3) a `str` stores fixed-width code points (1, 2 or 4 bytes each, chosen per string), so `s[i]` is an `O(1)` code point. Rust's `&str` is UTF-8 and cannot be indexed by character at all, which forces you to decide.

### Floating-point windows drift

The fixed-window update `window += x_in − x_out` is exact for integers and not for floats. On ordinary data the drift is negligible: after 10⁶ slides of a 1,000-wide window over uniform values in `[0, 1000)`, the running sum differed from an exactly rounded recomputation (`math.fsum`) by 6 × 10⁻¹⁴ relative. The danger is one large value passing through. While it sits in the window, every small value added beside it is rounded to the large value's precision, and that rounding error stays behind after it leaves. A 60-wide window over values between 0.05 and 0.5, with one spike, measured:

| Spike value | True sum after the spike leaves | Running sum | Error |
|---|---|---|---|
| 10⁶ | 16.042 | 16.042 | 6 × 10⁻¹⁰ |
| 10¹² | 16.042 | 16.0419 | 1.4 × 10⁻⁴ |
| 10¹⁵ | 16.042 | 16.114 | 0.072 |
| 10¹⁶ | 16.042 | 18.239 | 2.2 |

The error scales with the spike's unit in the last place (about 2 at 10¹⁶), not with the number of slides. Fixes, in order of preference: keep integers (cents, microseconds); recompute the sum from scratch every `k` slides, which costs `O(k)` every `k` steps and so amortised `O(1)`; or maintain the window with a structure that does not subtract, such as the two-stack queue in the mastery lesson.

### At scale

The same mechanism runs in production far from interviews. A sliding-window rate limiter keeps a window of timestamps per key and evicts by time ([rate limiting algorithms](/learn/networking/network-algorithms/rate-limiting-algorithms)). TCP's send window is a window over the byte stream: its left edge advances when bytes are acknowledged and its width is capped by the receiver's advertised window ([TCP deep dive](/learn/networking/fundamentals/tcp-deep-dive)). Stream processors such as Flink implement overlapping "sliding" windows by assigning each event to `size / slide` separate windows, each with its own state ([Flink's window docs](https://nightlies.apache.org/flink/flink-docs-stable/docs/dev/datastream/operators/windows/)), so a 10-minute window sliding every 10 seconds keeps 60 live accumulators per key where a tumbling window keeps one; the interview window's single incremental accumulator is the alternative when the aggregate has an inverse ([stream processing model](/learn/big-data/streaming/stream-processing-model)).

## Failure modes

**A rolling total on a dashboard stays wrong after an outlier.** *Symptom:* a 60-sample rolling sum of request latency reads about 2 ms too high for the rest of the day after one corrupt sample of 10¹⁶. *Diagnosis:* a float window maintained by add-and-subtract; the rounding error from the spike's time in the window never leaves (table above). *Fix:* integer units, or recompute from the buffer every `k` slides.

**The last-index version returns a window that contains a repeat.** *Symptom:* `"abba"` returns 3; random tests pass. *Diagnosis:* `left = last[ch] + 1` without checking that `last[ch]` is inside the window, so `left` moves backwards. *Fix:* `left = max(left, last[ch] + 1)`, and assert `left` never decreases while debugging.

**Correct on the sample, wrong on hidden tests, no exception.** *Symptom:* a sum-based window fails only on some inputs. *Diagnosis:* the array has negative numbers, so neither of the two monotonicity questions has a yes. *Fix:* prefix sums with a hash map for exact sums, a deque over prefix sums for "shortest with sum ≥ `k`".

**The shortest window is too long, or invalid.** *Symptom:* Minimum Window Substring returns `"BAXC"` or `"BA"` on `"BAXCBA"`. *Diagnosis:* the shrink is an `if` (too long), or the record happens after the eviction (invalid). *Fix:* `while` valid, record first, then evict.

**Wrong answers only on user-generated text.** *Symptom:* a JavaScript "distinct characters" window passes every ASCII test and fails on names and messages with emoji. *Diagnosis:* indexing by UTF-16 code unit splits surrogate pairs. *Fix:* iterate code points, or decide explicitly that the service counts code units and document it.

**A long-running per-user window map grows without bound.** *Symptom:* memory climbs for days in a service that tracks "distinct items in the last `k` events" per user. *Diagnosis:* counts are decremented to zero but the keys are never deleted, so the map holds every item ever seen, and any `len`-based distinct count is also wrong. *Fix:* delete on zero; the mastery lesson measures the difference at about 100 bytes per stale entry.

## Interviewer follow-ups

**"Now the input is a stream you cannot replay."** Model answer: a fixed window needs a ring buffer of exactly `k` elements, because you must know what leaves. A variable window must hold its current elements, `O(window)` memory, which can be `O(n)`; if that is unacceptable, bound the window by time or count and say the answer is now approximate beyond that bound. Common wrong answer: "only the count map", forgetting that eviction needs to know which element is leaving.

**"Now values can be negative."** Model answer: run the two questions again. Anything whose predicate ignores sign ("at most `k` distinct", "at most `k` zeros") survives unchanged. Sum-based windows lose monotonicity: exact sums move to prefix sums with a hash map, "shortest with sum ≥ `k`" moves to a monotonic deque over prefix sums. Common wrong answer: "negatives break sliding windows" as a blanket rule, which throws away the windows that still work.

**"Now `k` is 10⁹."** Model answer: `k` never enters the complexity of a variable window, so nothing changes, but read the edges: a fixed window with `k > n` has no full window (return the agreed sentinel), "at most `k` distinct" with `k` at least the alphabet size is the whole array, and in JavaScript sums above 2⁵³ (for example 10⁵ values near 10¹¹) stop being exact integers, so use `BigInt` or say the bound. Common wrong answer: allocating an array of size `k`.

**"Return every starting index, not just whether one exists."** Model answer: Permutation in String becomes Find All Anagrams: append `right − m + 1` whenever `matches == 26` instead of returning; still `O(n)`. Common wrong answer: sorting each window, `O(n · m log m)`.

**"Make it correct for any Unicode text."** Model answer: iterate code points in JavaScript, and ask whether "character" means code point or user-perceived grapheme (a flag emoji is two code points); graphemes need `Intl.Segmenter` and change the unit of the window, not the algorithm. Common wrong answer: "Python handles Unicode", which is true for code points and false for graphemes.

## What mid-level engineers get wrong

- **Starting to type before choosing the shape.** They write the longest template for a shortest question, then patch the record line twice. Consequence: an off-by-one they cannot explain.
- **Using the jump optimisation without the `max` guard.** Consequence: `left` moves backwards on inputs like `"abba"`, and the answer includes a repeat.
- **Scanning the state to test validity.** Consequence: `O(nσ)`, quadratic with integer keys, and a claimed `O(n)` that the interviewer can refute.
- **Missing the hidden window.** "Take `k` from the ends" gets a greedy that takes the larger end each time. On `[1, 79, 80, 1, 1, 1, 200, 1]` with `k = 3`, breaking the first tie to the left, it takes 1, 79 and 80 for 160; the answer is 202 (1, 200 and 1 from the right), which the complement window finds directly.
- **Updating state on admit but not on evict**, or the reverse. Consequence: counts drift and the window's validity test lies. Every mutation comes in a pair.
- **Treating a float window as exact.** Consequence: a rolling metric that is wrong for as long as the process lives.

## Exercises

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

```exercise
id: max-score-from-ends
title: Take k cards from the ends
prompt: |
  A row of cards has point values `cards`. You take exactly `k` cards, each
  time from the left end or the right end of what remains. Return the
  largest total you can collect. `0 <= k <= len(cards)`.

  Nothing in the statement says "window". Find it: the cards you do not
  take are always a contiguous block. Aim for O(n) time and O(1) extra space.
languages: [python, javascript]
entry: max_score_from_ends
starter:
  python: |
    def max_score_from_ends(cards, k):
        # your code here
        return 0
  javascript: |
    function max_score_from_ends(cards, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2, 3, 4, 5, 6, 1], 3]
    expected: 12
  - args: [[2, 2, 2], 2]
    expected: 4
  - args: [[9, 7, 7, 9, 7, 7, 9], 7]
    expected: 55
    label: take every card
  - args: [[5, 3, 8], 0]
    expected: 0
    label: take nothing
  - args: [[], 0]
    expected: 0
    label: empty row
  - args: [[1, 79, 80, 1, 1, 1, 200, 1], 3]
    expected: 202
    hidden: true
  - args: [[1, 1000, 1], 1]
    expected: 1
    hidden: true
    label: the best card is unreachable
  - args: [[100, 40, 17, 9, 73, 75], 3]
    expected: 248
    hidden: true
hints:
  - "Taking i cards from the left and k - i from the right leaves cards[i : i + n - k] behind, a contiguous block of width n - k."
  - "Maximising what you take is minimising the sum of that block: total - (minimum sum of any window of width n - k)."
  - "When n - k is 0 the block is empty and the answer is the total; guard that case before sliding."
```

## Senior signals

- You state the **four decisions** (shape, state, `O(1)` validity test, record line) before typing, and each one follows from the problem rather than from memory.
- You run the **two monotonicity questions** ("still valid if I drop an end? if I add one?") and route to prefix sums, a deque or the at-most trick when both answers are no.
- You find **hidden windows**: the complement block in "take `k` from the ends", the width-equals-count window in "group the 1s", time-based eviction over sorted events.
- You pick the **state container on evidence**: an `Int32Array(128)` in JavaScript is ten times faster than a `Map` on a known alphabet, and in CPython it barely matters.
- You keep **`left` monotone** in every variant, including the last-index jump, and you can show the input that breaks the unguarded version.
- You know the **non-algorithmic failure modes**: float drift in add-and-subtract windows, UTF-16 surrogates in JavaScript, zero-count keys that leak memory in long-running services.

## Check yourself

```quiz
- q: >-
    You must take exactly k cards from the two ends of a row to maximise their total. Which window solves it in O(n)?
  options: ["A variable window that grows while its sum stays below the best total seen", "None; choosing between the two ends needs a DP over cards taken per side", "A window of width n - k, minimising the sum of the cards left behind", "A window of width k over the row, maximising the sum of the cards inside it"]
  answer: 2
  explanation: >-
    Whatever split you choose, the untaken cards form one contiguous block of width n - k, so the best take is the total minus the lightest such block. A width-k window over the row describes contiguous cards, but the taken cards wrap around the ends and are not contiguous. A DP over cards taken from each side is correct but slower and unnecessary, and there is no monotone predicate for a variable window to shrink on.
- q: >-
    The last-index version sets left = last[ch] + 1 whenever ch has been seen before, with no max guard. What does it return for "abba"?
  options: ["2, because b's second copy already pushed left past index 0", "3, because left moves back to 1 when the second a arrives", "4, because the jump version never shrinks the window at all", "2, because the stale index for a is overwritten before it is read"]
  answer: 1
  explanation: >-
    At the second a, last[a] is still 0, which lies before the current left of 2. Without the guard left becomes 1 and the window "bba" is recorded with length 3. The guard left = max(left, last[ch] + 1) keeps left monotone, which is what the pattern depends on. Index 0 is not overwritten until after it is read.
- q: >-
    A service keeps a 60-sample rolling sum of latencies (about 0.1 to 0.5 each) as a float, updating it with window += new - old. After one corrupt sample of 1e16 passes through, the sum stays about 2 too high. What is the cause and the fix?
  options: ["Subtracting the spike overflowed the double's exponent; clamp samples above 1e15 on the way in", "The spike was evicted one slide late by an off-by-one; recheck the right - k eviction index", "Python floats are 32-bit and lose digits; switch the accumulator to a 64-bit float type instead", "Values added beside the spike were rounded to its precision; recompute the sum every k slides"]
  answer: 3
  explanation: >-
    Near 1e16 a double's spacing is 2, so each small sample added while the spike was present was rounded, and that error remains when the spike is subtracted. Recomputing from the buffer every k slides costs amortised O(1); integer units avoid the problem entirely. Nothing overflows at 1e16, the eviction index is not the issue, and Python floats are already 64-bit.
- q: >-
    A JavaScript solution to Longest Substring Without Repeating Characters returns 3 for the two-emoji string "😀😃", where Python returns 2. Why?
  options: ["JS indexes UTF-16 code units, and both emoji share a high surrogate", "V8 normalises emoji to NFD, which splits each into several code points", "Map keys compare by reference, so the two equal halves count as distinct", "Python indexes UTF-8 bytes, which hides one of the repeated byte values"]
  answer: 0
  explanation: >-
    Each emoji is two UTF-16 code units, and both share the high surrogate 0xD83D, so the unit-level window finds three distinct units in a row. Python strings index code points (PEP 393), so the answer is 2. Iterating with for...of or [...s] fixes the JavaScript version. Map compares string keys by value.
- q: >-
    Follow-up: the input to your at-most-k-distinct window is an unbounded event stream that cannot be replayed. What memory does the variable window need?
  options: ["O(1), since the loop reads only the left and right positions", "O(n) for a prefix array, since the stream must be replayed", "The window's events plus the counts, which can reach O(n)", "O(k) for the count map, since eviction only needs the counts"]
  answer: 2
  explanation: >-
    To evict you must know which element is leaving, so the window's elements must be stored, and a long valid window can hold most of the stream. The count map alone cannot tell you what nums[left] was. Bounding the window by time or count caps memory but changes the question, which a senior says explicitly.
- q: >-
    Find the longest subarray with sum exactly k when every value is positive, in O(1) extra space. What works, and why?
  options: ["A window that shrinks only when the sum equals k and records each time", "A window for sum <= k that records only when the sum equals k", "atMost(k) - atMost(k - 1), since exact targets always need two passes", "Prefix sums with a first-index map, since exact sums rule out a window"]
  answer: 1
  explanation: >-
    With positive values the sums of windows ending at right strictly decrease as left advances, so at most one start can hit k, and it can only be the smallest start whose sum is <= k, which the window finds. The prefix-sum map also works but uses O(n) space. The at-most subtraction counts subarrays rather than finding the longest, and shrinking only on equality never repairs an oversized window.
```
