---
slug: two-pointers
title: "Two pointers: ruling out pairs a whole row at a time"
description: When two indices walking towards or alongside each other replace a nested loop, how to prove they never skip the answer, and Three Sum, Container With Most Water and Trapping Rain Water traced step by step.
minutes: 50
difficulty: medium
tags: [two-pointers, arrays, sorted-input, in-place, pattern:two-pointers]
problems: [valid-palindrome, two-sum-sorted, three-sum, container-with-most-water, trapping-rain-water, remove-duplicates-sorted, move-zeroes, sort-colors]
---
You need a pair of elements with some property (they sum to a target, they bound the most water, they mirror each other), and the obvious code is a nested loop that checks every pair. That is `O(n²)`, and for `n = 10⁵` it is 5 billion checks: at the roughly 10⁷ simple loop iterations per second that CPython manages (the figure depends on the machine and the interpreter version), that is about eight minutes for one test case. The interviewer knows you can write the nested loop. The question is whether you can see the structure that lets you skip almost all of it.

Two pointers is that structure. When the input has an order, either because it is sorted or because some quantity changes monotonically as you walk in from the ends, one comparison tells you that an entire row of the pair table cannot contain the answer. You discard the row by moving one pointer, and after at most `n` moves you are done. The pattern is not "use two variables"; it is "each step eliminates many candidates, and I can say which ones and why".

## The signal

Reach for two pointers when you read any of these in the statement:

- **The array is sorted, or you are allowed to sort it**, and you want pairs or triples with a condition on their sum, difference or product. Sortedness is what makes "move the left pointer" a safe decision.
- **"In place" or "O(1) extra space"** on an array you are compacting, partitioning or reordering. That is the same-direction form: one pointer reads, one writes.
- **Palindromes**, or anything phrased as "compare the front to the back".
- **A value that depends on both ends** where the weaker end is the only one worth moving (the container problem, the rain-water problem).
- **Two sorted sequences** that you need to merge, intersect or compare (`is s a subsequence of t?`).

The near-misses matter as much as the signals. Each row below looks like two pointers on a first read and is not:

| Statement says | Pattern | Why |
|---|---|---|
| "Return the **indices** of the two numbers" in an unsorted array | [Hash map](/learn/interview-patterns/sequence-patterns/hash-map-patterns) | Sorting destroys the indices; a value → index map finds the complement in one pass |
| "Longest **substring/subarray** such that…" | [Sliding window](/learn/interview-patterns/array-patterns/sliding-window) | The answer is the segment *between* the indices and needs a running summary of it |
| "Subarray with sum `k`" and values may be negative | [Prefix sum](/learn/interview-patterns/array-patterns/prefix-sum) | Removing an element can raise the sum; no pointer move is provably safe |
| "Count pairs with `nums[i] + nums[j] == k`" **with multiplicity**, unsorted | Hash map of counts | Two pointers finds *whether* a pair exists; counting equal values needs the frequency of `k − v` |
| "Kth smallest pair distance" or "pairs with difference ≤ d" for a **threshold you must find** | [Binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer) | Two pointers is the inner *counting* step; the outer search over the threshold is the pattern |
| Anything on a **linked list** with "middle", "cycle", "nth from end" | [Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) | No random access, so the pointers move by speed, not by value comparison |

The test for the sliding-window confusion: if you care about the elements *at* the two indices, it is two pointers; if you care about everything *between* them, it is a window.

## The template

There are two shapes. Opposite ends: pointers start at both boundaries and move towards each other. Same direction: a read pointer scans and a write pointer trails it.

```python
def pair_with_sum(nums, target):
    """nums is sorted ascending. Return indices of a pair summing to target."""
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        if s < target:
            lo += 1          # nums[lo] is too small for every remaining hi
        else:
            hi -= 1          # nums[hi] is too large for every remaining lo
    return []

def compact(nums, keep):
    """Keep elements satisfying keep(x), in order, in place. Return new length."""
    write = 0
    for read in range(len(nums)):
        if keep(nums[read]):
            nums[write] = nums[read]
            write += 1
    return write
```

```javascript
function pairWithSum(nums, target) {
  let lo = 0, hi = nums.length - 1;
  while (lo < hi) {
    const s = nums[lo] + nums[hi];
    if (s === target) return [lo, hi];
    if (s < target) lo++;   // nums[lo] too small for every remaining hi
    else hi--;              // nums[hi] too large for every remaining lo
  }
  return [];
}

function compact(nums, keep) {
  let write = 0;
  for (let read = 0; read < nums.length; read++) {
    if (keep(nums[read])) nums[write++] = nums[read];
  }
  return write;
}
```

The invariant for the opposite-ends form is the thing to say out loud:

> Every pair that uses an index below `lo` or above `hi` has been ruled out. If a matching pair exists, both of its indices lie in `[lo, hi]`.

It holds trivially at the start (`[0, n−1]` is everything). Each branch preserves it: when `s < target`, `nums[hi]` is the largest value still in play, so `nums[lo] + nums[j] ≤ nums[lo] + nums[hi] < target` for every remaining `j`, and index `lo` cannot be in any answer; you drop it and every pair it belongs to in one step. The symmetric argument covers `hi` when `s > target`. **Termination:** `hi − lo` is a non-negative integer that decreases by exactly 1 on every non-returning iteration, so the loop runs at most `n − 1` times. When it exits with `lo == hi`, every index has been ruled out, and returning "no pair" is correct. Watch the pointers eliminate pairs on a real input:

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 2, 3, 4, 6, 8, 11, 15], "target": 10, "title": "Eliminating pairs from both ends", "caption": "Target 10. A sum that is too small rules out every pair using lo, so lo moves up; a sum that is too big rules out every pair using hi, so hi moves down."}
```

The same-direction form has a different invariant:

> `nums[0..write)` holds exactly the kept elements seen so far, in their original order, and `write ≤ read` always.

The second clause is what makes overwriting safe: you never clobber an element you have not read yet, because the write index can only fall behind the read index. Here it is partitioning three values in one pass, the Dutch national flag from [Sort Colors](/practice/sort-colors):

```viz
{"type": "array", "algorithm": "dutch-flag", "values": [2, 0, 2, 1, 1, 0, 0, 2, 1], "title": "Sort Colors in one pass", "caption": "[0, lo) holds 0s, [lo, mid) 1s and (hi, n) 2s; the unknown region [mid, hi] shrinks by one every step. A value swapped in from hi has not been examined, so mid waits."}
```

Both forms are developed further, with their correctness arguments, in [Two-pointers mastery](/learn/algorithms/technique-mastery/two-pointers-mastery) and [Invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning). This lesson is about recognising them under pressure and executing without a bug.

## Worked problems

### Three Sum

[Three Sum](/practice/three-sum): return every unique triple of values in an unsorted array that sums to zero.

The key insight: sort, fix the smallest element `nums[i]`, and the problem collapses to "find pairs summing to `-nums[i]` in the sorted suffix", which is the template. Uniqueness is the part that costs people the round: you skip repeated values at all three positions, and you have to skip them at the right moment.

```python
def three_sum(nums):
    nums.sort()
    out = []
    for i in range(len(nums) - 2):
        if i > 0 and nums[i] == nums[i - 1]:
            continue                                   # same anchor as last time
        lo, hi = i + 1, len(nums) - 1
        while lo < hi:
            s = nums[i] + nums[lo] + nums[hi]
            if s < 0:
                lo += 1
            elif s > 0:
                hi -= 1
            else:
                out.append([nums[i], nums[lo], nums[hi]])
                lo += 1
                hi -= 1
                while lo < hi and nums[lo] == nums[lo - 1]:
                    lo += 1                            # skip duplicate second values
                while lo < hi and nums[hi] == nums[hi + 1]:
                    hi -= 1                            # skip duplicate third values
    return out
```

Trace on `[-1, 0, 1, 2, -1, -4]`, which sorts to `[-4, -1, -1, 0, 1, 2]`:

| `i` (value) | `lo` (value) | `hi` (value) | sum | action |
|---|---|---|---|---|
| 0 (−4) | 1 (−1) | 5 (2) | −3 | too small, `lo++` |
| 0 (−4) | 2 (−1) | 5 (2) | −3 | `lo++` |
| 0 (−4) | 3 (0) | 5 (2) | −2 | `lo++` |
| 0 (−4) | 4 (1) | 5 (2) | −1 | `lo++` → `lo == hi`, inner loop ends |
| 1 (−1) | 2 (−1) | 5 (2) | 0 | record `[-1, -1, 2]`; `lo=3`, `hi=4`; no duplicates to skip |
| 1 (−1) | 3 (0) | 4 (1) | 0 | record `[-1, 0, 1]`; `lo=4`, `hi=3`, inner loop ends |
| 2 (−1) | | | | `nums[2] == nums[1]`, skip anchor |
| 3 (0) | 4 (1) | 5 (2) | 3 | too big, `hi--` → loop ends |

Result: `[[-1, -1, 2], [-1, 0, 1]]`. Note the anchor at `i = 1` produced a triple with a second `-1` at `lo = 2`. That is allowed: the anchor-skip guard is `nums[i] == nums[i-1]`, which compares to the *previous anchor*, not to the next element. If you write the guard as `nums[i] == nums[i+1]` you throw away `[-1, -1, 2]`.

Time `O(n²)`: `n` anchors, each with an `O(n)` two-pointer sweep. Sorting is `O(n log n)` and disappears under the square. Space is `O(1)` beyond the output, if you count the sort as in place.

### Container With Most Water

[Container With Most Water](/practice/container-with-most-water): given vertical line heights, choose two lines so that the water held between them, `min(h[l], h[r]) × (r - l)`, is maximal.

The insight is a single sentence you should say before writing any code: *moving the taller line can never help*. If `h[l] ≤ h[r]`, every container `(l, r')` with `r' < r` is narrower and its height is still capped at `h[l]`, so it holds no more than the current one. Index `l` is finished. One comparison has eliminated `r - l - 1` candidate pairs, which is exactly the two-pointer move.

```python
def max_area(h):
    lo, hi, best = 0, len(h) - 1, 0
    while lo < hi:
        best = max(best, min(h[lo], h[hi]) * (hi - lo))
        if h[lo] < h[hi]:
            lo += 1
        else:
            hi -= 1
    return best
```

Trace on `[1, 8, 6, 2, 5, 4, 8, 3, 7]`:

| `lo` (h) | `hi` (h) | width | area | best | move |
|---|---|---|---|---|---|
| 0 (1) | 8 (7) | 8 | 8 | 8 | `h[lo] < h[hi]`, `lo++` |
| 1 (8) | 8 (7) | 7 | 49 | 49 | `hi--` |
| 1 (8) | 7 (3) | 6 | 18 | 49 | `hi--` |
| 1 (8) | 6 (8) | 5 | 40 | 49 | equal, `hi--` |
| 1 (8) | 5 (4) | 4 | 16 | 49 | `hi--` |
| 1 (8) | 4 (5) | 3 | 15 | 49 | `hi--` |
| 1 (8) | 3 (2) | 2 | 4 | 49 | `hi--` |
| 1 (8) | 2 (6) | 1 | 6 | 49 | `hi--` → loop ends |

The answer is 49, from lines 1 and 8. The pointer at index 1 never moves after the second step because it is taller than everything on the right; that is the algorithm proving, one step at a time, that nothing pairs better with a shorter partner.

Time `O(n)`, space `O(1)`. When the heights are equal, either move is safe; pick one convention and do not special-case it.

### Trapping Rain Water

[Trapping Rain Water](/practice/trapping-rain-water): given bar heights, compute how much water sits on top of the bars after rain.

The one-line physics: water above position `i` is `min(maxLeft(i), maxRight(i)) - h[i]`, where `maxLeft` is the tallest bar at or before `i` and `maxRight` the tallest at or after. The `O(n)` extra-space solution precomputes both arrays. The two-pointer solution notices you do not need both exactly. Keep running maxima `lmax` and `rmax` from each end. If `lmax ≤ rmax`, then the true right maximum for the *next* left position is at least `rmax ≥ lmax`, so `min(maxLeft, maxRight)` at that position is exactly the updated `lmax` and you can settle it now. Otherwise settle the right side.

```python
def trap(h):
    if len(h) < 3:
        return 0
    lo, hi = 0, len(h) - 1
    lmax, rmax, water = h[lo], h[hi], 0
    while lo < hi:
        if lmax <= rmax:
            lo += 1
            lmax = max(lmax, h[lo])
            water += lmax - h[lo]
        else:
            hi -= 1
            rmax = max(rmax, h[hi])
            water += rmax - h[hi]
    return water
```

Trace on `[2, 0, 1, 0, 3, 0, 1]`:

| `lo` | `hi` | `lmax` | `rmax` | branch | settled position (h) | added | water |
|---|---|---|---|---|---|---|---|
| 0 | 6 | 2 | 1 | `lmax > rmax` | 5 (0) | 1 − 0 = 1 | 1 |
| 0 | 5 | 2 | 1 | `lmax > rmax` | 4 (3) | 3 − 3 = 0 | 1 |
| 0 | 4 | 2 | 3 | `lmax ≤ rmax` | 1 (0) | 2 − 0 = 2 | 3 |
| 1 | 4 | 2 | 3 | `lmax ≤ rmax` | 2 (1) | 2 − 1 = 1 | 4 |
| 2 | 4 | 2 | 3 | `lmax ≤ rmax` | 3 (0) | 2 − 0 = 2 | 6 |
| 3 | 4 | 2 | 3 | `lmax ≤ rmax` | 4 (3) | 3 − 3 = 0 | 6 |

Loop ends with `lo == hi == 4`. Total 6, which you can confirm by hand: 2 units over index 1, 1 over index 2, 2 over index 3, 1 over index 5.

Notice how the pointers alternate. The right side got settled first because its running maximum was the weaker wall; once the bar of height 3 was found, the left side became the weaker wall and every left position was settled against it. Time `O(n)`, space `O(1)`, versus `O(n)` space for the two-array version. Interviewers usually accept the two-array version and then ask for this one.

### Remove Duplicates, at most k copies

[Remove Duplicates from Sorted Array](/practice/remove-duplicates-sorted) is the same-direction form, and its generalisation ("keep at most `k` copies of each value") is the version interviewers use to check you understand *why* the compaction works rather than having memorised it.

```python
def keep_at_most_k(nums, k):
    write = 0
    for read in range(len(nums)):
        if write < k or nums[read] != nums[write - k]:
            nums[write] = nums[read]
            write += 1
    return write
```

Why `nums[write - k]` is the right thing to compare against: the kept prefix is sorted (it is a subsequence of a sorted array), so if `nums[read] == nums[write - k]` then every kept element between `write − k` and `write − 1` is squeezed between two equal values and is that value too. Keeping `nums[read]` would make `k + 1` copies. Trace with `k = 1` on `[1, 1, 2, 2, 2, 3, 4, 4]`:

| `read` (value) | `write` | compare `nums[write − 1]` | keep? | array prefix after |
|---|---|---|---|---|
| 0 (1) | 0 | `write < 1` | yes | `[1]`, `write = 1` |
| 1 (1) | 1 | 1 == 1 | no | `[1]` |
| 2 (2) | 1 | 2 ≠ 1 | yes | `[1, 2]`, `write = 2` |
| 3 (2) | 2 | 2 == 2 | no | |
| 4 (2) | 2 | 2 == 2 | no | |
| 5 (3) | 2 | 3 ≠ 2 | yes | `[1, 2, 3]`, `write = 3` |
| 6 (4) | 3 | 4 ≠ 3 | yes | `[1, 2, 3, 4]`, `write = 4` |
| 7 (4) | 4 | 4 == 4 | no | |

Return 4. With `k = 2` the same input keeps `[1, 1, 2, 2, 3, 4, 4]` and returns 7. `write` is both the count of kept elements and the index of the next free slot, so it is the return value under either reading; returning `write + 1` or `write − 1` is a bug you can rule out by that sentence alone.

```viz
{"type": "array", "algorithm": "remove-duplicates", "values": [1, 1, 2, 2, 2, 3, 4, 4], "title": "Read/write compaction with k = 1", "caption": "write never overtakes read, so each overwrite lands on a slot that has already been read."}
```

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| **Count** pairs with sum below target | When `nums[lo] + nums[hi] < target`, add `hi − lo` (every `j` in `(lo, hi]` works with `lo`) and advance `lo`; you count a whole row instead of discarding it | `O(n)` after sort |
| **Closest** rather than exact (Three Sum Closest) | Track the smallest `abs(sum − target)`; never return early. Pointer moves are unchanged because the direction argument is about ordering, not equality | `O(n²)` |
| **k-Sum** | Peel one anchor per recursion level until two remain, then two-pointer; duplicate skipping at every level | `O(n^(k−1))` |
| **Keep at most k copies** | `keep` when `write < k or nums[read] != nums[write − k]` | `O(n)`, `O(1)` space |
| **Two arrays**: merge, intersect, "is `s` a subsequence of `t`" | One pointer per array. Merge: advance the smaller. Intersect: advance the smaller, or **both** on equality. Subsequence: advance `t` always, `s` on match | `O(n + m)` |
| **Three-way partition** (Dutch flag) | Three indices `lo`, `mid`, `hi`; after swapping `mid` with `hi`, do **not** advance `mid`, because the swapped-in element is unread | `O(n)`, `O(1)` space |
| **Palindrome with one deletion allowed** | On the first mismatch, check whether `s[lo+1..hi]` or `s[lo..hi−1]` is a palindrome; one extra linear pass at most | `O(n)` |
| **Linked list** | Pointers move by speed rather than by comparison | [Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) |

## Complexity, derived

The opposite-ends loop has a potential function: `hi − lo` starts at `n − 1`, decreases by exactly 1 per iteration, and the loop stops at 0. That gives at most `n − 1` iterations, each doing a constant amount of work, so `O(n)`. The same-direction form is `O(n)` because `read` visits each index once and `write` never exceeds it.

For Three Sum, anchor `i` runs a sweep over the `n − i − 1` elements after it, which takes at most `n − i − 2` pointer moves, so the total is $\sum_{i=0}^{n-3}(n-i-2) = \frac{(n-1)(n-2)}{2} \approx n^2/2$ inner steps. The sort adds `n log₂ n`, which is smaller than `n²/2` once `n > 4`. Put numbers on it: the problem's usual constraint is `n ≤ 3,000`, so about 4.5 × 10⁶ inner steps, which CPython finishes in well under a second. For `n = 10⁵` the nested-loop version needs 5 × 10⁹ steps (minutes in CPython, seconds in Rust or Go); the two-pointer version needs 10⁵ steps plus one sort, which is milliseconds in any language.

Compare the alternatives for "find a pair with a given sum":

| Approach | Time | Extra space | Keeps original indices | Mutates input | Handles duplicate values |
|---|---|---|---|---|---|
| Nested loop | `O(n²)` | `O(1)` | yes | no | yes |
| Hash map of value → index | `O(n)` | `O(n)` | yes | no | needs care (`k − v == v`) |
| Sort + two pointers | `O(n log n)` | `O(1)` if sorted in place | no | yes (or copy) | yes, by skipping |
| Sort + binary search per element | `O(n log n)` | `O(1)` | no | yes | yes |

The hash map wins on time when indices matter; two pointers wins on space and when the input is already sorted, and it is the only one of the four that extends to Three Sum without an extra factor of `n` in memory.

## Under the hood

### The sort underneath

**CPython.** `list.sort()` is Timsort, stable since it shipped in 2.3. With `key=`, the key is computed once per element and stored in a parallel array, so `key=lambda p: p[0]` on `(value, index)` pairs costs `n` calls, not `n log n`; stability then guarantees that equal values keep their index order, which is how the "sort `(value, index)` pairs" trick returns the smaller index first. Since CPython 3.7, `list.sort` first checks whether every element has the same type and, if so, selects a specialised comparison (`unsafe_long_compare` for `int`s that each fit in one machine word, a Latin-1 fast path for ASCII strings, a float path, and a tuple path that specialises on the first element). The change that introduced it ([bpo-28685](https://github.com/python/cpython/issues/72871)) reported common cases 40–75% faster; a list mixing `int` and `float` falls back to the generic rich comparison.

**V8.** `Array.prototype.sort` in V8 has been TimSort, and therefore stable, since [V8 7.0 (Chrome 70, 2018)](https://v8.dev/blog/array-sort); before that it was an unstable quicksort that fell back to insertion sort for arrays shorter than 10 elements. The default comparator converts elements to strings, so `[10, 9, 1].sort()` returns `[1, 10, 9]`. Always pass `(a, b) => a - b` for numbers.

### What a pointer read costs

A CPython list stores 8-byte pointers; each `int` is a separate object (28 bytes for values below 2³⁰; the values −5 to 256 are pre-allocated singletons). So `nums[lo] + nums[hi]` follows two pointers and allocates a new `int` object when the result is outside that small-int cache. A two-pointer sweep over 10⁵ elements is on the order of 10 ms in CPython, an estimate that depends on the interpreter version and machine. V8 stores an array of small integers as `PACKED_SMI_ELEMENTS`, the integers inline in the backing store (31-bit values under pointer compression on 64-bit builds), so the same walk is a contiguous scan with no allocation, typically an order of magnitude faster. Push a `1.5` into that array and V8 transitions it to `PACKED_DOUBLE_ELEMENTS`; push `undefined` or a string and it becomes `PACKED_ELEMENTS`, permanently for that array. Writing past the end (`arr[100] = x` on a length-10 array) makes it `HOLEY_*`, and every subsequent read checks for holes.

**Strings.** Python and JavaScript strings are immutable, so the compaction form cannot run on them directly. For palindrome checks you do not need to write, so index the string directly; CPython caches one-character Latin-1 strings, so `s[i]` on ASCII text returns a shared object rather than allocating. For problems that genuinely write, `list(s)` costs `n` pointers (800 KB for a 10⁵-character string) plus `"".join` at the end.

**At scale.** The two-array merge is the merge phase of a sort-merge join in a relational engine ([SQL and query plans](/learn/databases/relational-fundamentals/sql-and-query-plans)) and the compaction step that merges sorted runs in an LSM tree; the read/write compaction is what C++'s `std::unique` and Rust's `Vec::dedup` do.

## Failure modes

**An element is paired with itself.** *Symptom:* `pair_with_sum([1, 3, 6], 6)` returns `[1, 1]` instead of `[]`; any test whose target is twice a single element and has no genuine pair fails. *Diagnosis:* the loop condition is `lo <= hi`; on the final iteration `lo == hi` and the sum is `2 × nums[lo]`. *Fix:* `while lo < hi`. In the counting variant the same bug adds `hi − lo == 0`, so it is silent there and loud here.

**Three Sum returns duplicate triples, or the "3,000 zeros" test times out.** *Symptom:* `[-1, 0, 1]` appears twice for `[-1, 0, 1, 2, -1, -4]`; on an all-zero input the result list grows to about `n²/4` identical triples (2.25 million for `n = 3,000`) before a `set` at the end collapses them, and memory follows. *Diagnosis:* no duplicate skip after recording a match, or a skip placed before the check (which throws away valid triples), or dedup by `set(tuple(t))` instead of by construction. *Fix:* after recording, advance both pointers and then skip while `nums[lo] == nums[lo − 1]` and `nums[hi] == nums[hi + 1]`, with `lo < hi` in both conditions; skip anchors by comparing to the previous anchor.

**Index error inside the skip loop.** *Symptom:* Python raises `IndexError` on `[0, 0, 0]`; JavaScript silently stops because `nums[lo + 1]` is `undefined` and never equals anything, so the bug hides until a Python port. *Diagnosis:* `while nums[lo] == nums[lo + 1]` has no bound. *Fix:* every skip loop is `while lo < hi and …`.

**Sorted, then returned the wrong indices.** *Symptom:* the sample passes (the sample happens to be sorted), the hidden tests fail. *Diagnosis:* the returned positions refer to the sorted copy. *Fix:* recognise unsorted-with-indices as the hash-map version; if you must sort, sort `(value, index)` pairs.

**A reconciliation job pegs a core at 100% and never finishes.** *Symptom:* a nightly job that merges two sorted exports (say, a billing feed against a ledger) hangs; a thread dump shows the merge loop with both indices unchanged. *Diagnosis:* the equal-keys branch advanced neither pointer, or an intersection advanced only one and matched the same record repeatedly. *Fix:* every branch advances at least one pointer, and the equality branch does what the operation needs: merge advances either, intersection and difference advance both.

**Moved the taller line.** *Symptom:* Container With Most Water returns 8 instead of 49 on the sample: the height-1 line at index 0 is never retired, so every area is capped at 1. *Diagnosis:* the branch moves the pointer at the taller line, which can only shrink the width without lifting the cap. *Fix:* move the shorter line; on a tie either move is safe.

## Interviewer follow-ups

**"The array is not sorted and I need the original indices, in O(n)."** Model answer: a hash map from value to index; for each element look up `target − value` before inserting the element itself, which handles `target = 2 × value` correctly. Common wrong answer: sort `(value, index)` pairs and run two pointers, which works but costs `O(n log n)` and more code for no benefit.

**"Now count the pairs with sum strictly less than the target."** Model answer: when `nums[lo] + nums[hi] < target`, all of `(lo, lo+1) … (lo, hi)` qualify, so add `hi − lo` and advance `lo`; otherwise retreat `hi`. Still `O(n)`. Common wrong answer: adding 1 per iteration, which counts at most `n` pairs when the answer can be `n²/2`.

**"Extend it to 4-Sum. What is the complexity for general k?"** Model answer: recurse, fixing one anchor per level and skipping duplicate anchors at every level; the bottom level is the two-pointer sweep, so `O(n^(k−1))` after one sort. Common wrong answer: `O(n^k)` nested loops, or the right bound with a `set` for deduplication, which hides the duplicate logic the interviewer wanted to see.

**"Trapping rain water on a 2D grid."** Model answer: the pattern changes. Water at a cell is bounded by the lowest wall on any path to the border, so start a min-heap with the border cells, pop the lowest, and for each unvisited neighbour add `max(level − h, 0)` and push it with height `max(level, h)`; `O(mn log(mn))`. Common wrong answer: run the 1D two-pointer solution per row and per column and add them, which double counts and ignores diagonal escape paths.

**"n is 10⁶ for Three Sum. Now what?"** Model answer: `n²/2 = 5 × 10¹¹` steps is out of reach in any language, and the best known algorithms only shave logarithmic factors off `n²` ([Grønlund and Pettie, 2014](https://arxiv.org/abs/1404.0799), who refuted the older conjecture that 3SUM needs `Ω(n²)`); the modern 3SUM conjecture says no `O(n^(2−ε))` algorithm exists. So ask what else is constrained: if values are bounded by `V`, a count array and a convolution give `O(V log V)`; if only existence matters and you can accept randomness, hashing helps the constant but not the exponent. Common wrong answer: "use a hash set to get O(n)", which is still `O(n²)` because every anchor pair needs a lookup.

## What mid-level engineers get wrong

- **Treating "two pointers" as one trick.** They apply the opposite-ends loop to a compaction problem or vice versa. Consequence: an invariant that does not match the code, and a bug they cannot reason about.
- **Skipping duplicates before checking the sum**, or comparing the anchor to the *next* element. Consequence: valid triples such as `[-1, -1, 2]` disappear, on exactly the inputs the hidden tests use.
- **Deduplicating with a set at the end.** Consequence: `O(n)` extra memory and, on degenerate inputs, about `n²/4` intermediate results; the interviewer reads it as not understanding the pointer moves.
- **`hi = len(nums) − 1` on an empty array with no guard.** Consequence: the `while lo < hi` check happens to save them, but they cannot say so, which is what the interviewer is probing.
- **Advancing `mid` after the swap with `hi` in the Dutch flag.** Consequence: an unread element is skipped and a 2 can land before a 1.
- **Reaching for two pointers when the statement asks for original indices.** Consequence: a correct-looking solution that fails every unsorted test.

## Exercises

```exercise
id: count-pairs-below-target
title: Count pairs with sum below a target
prompt: |
  Given an unsorted array of integers `nums` and an integer `target`, return
  the number of index pairs `(i, j)` with `i < j` and `nums[i] + nums[j] < target`.

  Sort first, then use opposite-end pointers so the count runs in
  O(n log n) with no nested loop. Values may be negative or repeated.
languages: [python, javascript]
entry: count_pairs_below
starter:
  python: |
    def count_pairs_below(nums, target):
        # your code here
        return 0
  javascript: |
    function count_pairs_below(nums, target) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 2, 3, 4], 5]
    expected: 2
  - args: [[5, 1, 3, 2], 6]
    expected: 3
  - args: [[], 1]
    expected: 0
    label: empty input
  - args: [[7], 10]
    expected: 0
    label: single element has no pairs
  - args: [[-2, -1, 0, 3], 0]
    expected: 3
    label: negatives
  - args: [[2, 2, 2, 2], 5]
    expected: 6
    hidden: true
    label: all duplicates count as distinct index pairs
  - args: [[1, 1, 1, 1], 2]
    expected: 0
    hidden: true
    label: strictly below, not at
hints:
  - "After sorting, if nums[lo] + nums[hi] < target then nums[lo] pairs with every index in (lo, hi], so add hi - lo and advance lo."
  - "If the sum is not below target, hi cannot pair with lo or anything to its right, so move hi left."
  - "Stop when lo >= hi; each step retires one index so the loop is O(n)."
```

```exercise
id: intersect-sorted-arrays
title: Intersect two sorted arrays with multiplicity
prompt: |
  `a` and `b` are sorted ascending and may contain repeated values. Return
  the sorted list of values that appear in both, where each value appears
  as many times as it appears in both arrays (the minimum of its two
  counts). For example `[1, 2, 2, 3]` and `[2, 2, 4]` give `[2, 2]`.

  Use one pointer per array and no hash map, so the pass is O(len(a) + len(b)).
  Decide what happens on a tie before you write the loop.
languages: [python, javascript]
entry: intersect_sorted
starter:
  python: |
    def intersect_sorted(a, b):
        # your code here
        return []
  javascript: |
    function intersect_sorted(a, b) {
      // your code here
      return [];
    }
tests:
  - args: [[1, 2, 2, 3], [2, 2, 4]]
    expected: [2, 2]
  - args: [[1, 1, 1], [1, 1]]
    expected: [1, 1]
    label: multiplicity is the minimum count
  - args: [[1, 3, 5], [2, 4, 6]]
    expected: []
    label: no overlap
  - args: [[], [1, 2]]
    expected: []
    label: empty input
  - args: [[-3, -1, 0, 0, 7], [-1, 0, 0, 0, 8]]
    expected: [-1, 0, 0]
    hidden: true
  - args: [[2, 2, 2], [2]]
    expected: [2]
    hidden: true
    label: one side runs out first
  - args: [[1, 2, 3, 4, 5], [5]]
    expected: [5]
    hidden: true
    label: match at the very end
hints:
  - "While both pointers are in range: if a[i] < b[j] advance i; if a[i] > b[j] advance j."
  - "On a tie record the value and advance both pointers, otherwise the same element is matched twice."
  - "Every branch moves at least one pointer, which is what bounds the loop by len(a) + len(b)."
```

## Senior signals

- You say the **elimination argument** before you write the loop: "if the sum is too small, `lo` cannot pair with anything remaining because `hi` is the largest remaining value", and you name the potential function (`hi − lo`) that bounds the iterations.
- You separate the **opposite-ends** and **read/write** forms and know each one's invariant, rather than treating "two pointers" as a single trick.
- You recognise the **sorted-versus-indices** trade-off instantly: sorted input or free to sort means two pointers; original indices required means a hash map.
- You handle **duplicates by design** (skip after match, compare to previous anchor, `lo < hi` in every skip) instead of deduplicating with a set at the end, and you can say why the set is `O(n)` extra memory and hides the bug.
- You know the container proof and can give the **rain-water argument** in one sentence: the side with the smaller running maximum is fully determined, so settle it.
- You know what the sort underneath costs and does: Timsort, stable, keys computed once, type-specialised compares in CPython, `(a, b) => a - b` in JavaScript because the default comparator stringifies.
- You know which follow-ups **change the pattern**: 2D rain water is a heap flood, `n = 10⁶` Three Sum is a conversation about constraints rather than a faster loop.

## Check yourself

```quiz
- q: >-
    In the opposite-ends template on a sorted array, the current pair sums to less than the target. Which candidates does moving lo right eliminate, and why is that safe?
  options: ["Every pair (i, hi) with i from lo up, because nums[lo] is the smallest partner hi has left", "Every pair (lo, j) with j up to hi, because nums[hi] is the largest partner lo has left", "None for certain, because moving lo is a guess that the loop may need to revisit later", "Only the pair (lo, hi), because lo's other partners have not been compared with it yet"]
  answer: 1
  explanation: >-
    Sortedness bounds every remaining partner of lo by nums[hi]. If even nums[lo] + nums[hi] is too small, no remaining partner works, so index lo and all its pairs are retired in one move. Retiring every (i, hi) is the mirror argument, which justifies moving hi when the sum is too large.
- q: >-
    Your Three Sum solution returns [[-1, 0, 1]] for [-1, 0, 1, 2, -1, -4] but the expected output also contains [-1, -1, 2]. The most likely bug is:
  options: ["Duplicate lo and hi values are skipped after a match is recorded", "The result list is deduplicated through a set of tuples at the end", "The inner loop keeps running while lo <= hi rather than lo < hi", "The anchor skip compares nums[i] with nums[i + 1], not nums[i - 1]"]
  answer: 3
  explanation: >-
    Comparing to the next element skips the first -1 as an anchor, so the triple that needs two -1s is never formed. Comparing to the previous anchor skips only repeated anchors. Skipping lo and hi duplicates after recording a match is the correct placement, not a bug, and a lo <= hi loop adds bad triples rather than losing good ones.
- q: >-
    In Container With Most Water, heights[lo] = 5 and heights[hi] = 9. Why is moving hi never beneficial?
  options: ["It can be; a taller line left of hi might raise the area, so try both moves", "Because every container (lo, r) with r < hi is narrower and still capped at 5", "Because 9 is the tallest line, so no container without it can be taller", "Because width dominates the area, so the widest pair seen so far always wins"]
  answer: 1
  explanation: >-
    Height is the min of the two lines, so with the shorter line fixed at 5 the height cannot rise, and the width only falls. Only moving the shorter line can raise the cap. Nothing says 9 is the global maximum, and trying both moves would make the search exponential.
- q: >-
    The problem asks for the two indices in an unsorted array whose values sum to a target. A candidate sorts the array and runs two pointers. What is wrong?
  options: ["Two pointers needs non-negative values, and the input may hold negatives", "Nothing; sorting then sweeping two pointers is the optimal approach here", "Sorting loses the original indices; a value-to-index hash map fits better", "Two pointers breaks when the array holds duplicate values that could pair"]
  answer: 2
  explanation: >-
    The returned positions would refer to the sorted array. You would need to carry indices through the sort, at which point a single pass with a value-to-index map is simpler and O(n). Duplicates and negatives are no problem for two pointers; the signal for it is sorted input where values, not positions, are the answer.
- q: >-
    In the O(1)-space Trapping Rain Water solution, lmax = 4 and rmax = 6. Which position can be settled now, and what is its water?
  options: ["The next right position, holding the updated rmax minus its height", "Neither side until the full maxLeft and maxRight arrays are built", "The next left position, holding the updated lmax minus its height", "Either side, since both running maxima bound the water from above"]
  answer: 2
  explanation: >-
    Because lmax <= rmax, the true right-side maximum for the next left position is at least 6, so min(maxLeft, maxRight) there equals the updated lmax. That side is fully determined; the right side is not, because its left wall might still grow.
- q: >-
    You are intersecting two sorted arrays with multiplicity and reach a[i] == b[j] == 2. After recording the 2, which move keeps the counts right?
  options: ["Advance neither and count the run of 2s on each side first", "Advance i only, so b's 2 can still match the next 2 in a", "Advance both pointers, because that 2 in each array has been consumed", "Advance j only, so a's 2 can still match the next 2 in b"]
  answer: 2
  explanation: >-
    Each matched element is used once, so both pointers move; advancing only one side pairs the same element repeatedly and turns [2, 2] against [2] into [2, 2]. Counting the runs gives the same answer with more code, and advancing neither never terminates. The rule that every branch moves at least one pointer is also what bounds the loop by len(a) + len(b).
```
