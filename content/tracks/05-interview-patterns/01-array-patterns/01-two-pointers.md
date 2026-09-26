---
slug: two-pointers
title: "Two pointers: ruling out pairs a whole row at a time"
description: When two indices walking towards or alongside each other replace a nested loop, how to prove they never skip the answer, and Three Sum, Container With Most Water and Trapping Rain Water traced step by step.
minutes: 32
difficulty: medium
tags: [two-pointers, arrays, sorted-input, in-place, pattern:two-pointers]
problems: [valid-palindrome, two-sum-sorted, three-sum, container-with-most-water, trapping-rain-water, remove-duplicates-sorted, move-zeroes, sort-colors]
---
You need a pair of elements with some property (they sum to a target, they bound the most water, they mirror each other), and the obvious code is a nested loop that checks every pair. That is `O(n²)`, and for `n = 10⁵` it is 5 billion checks. The interviewer knows you can write the nested loop. The question is whether you can see the structure that lets you skip almost all of it.

Two pointers is that structure. When the input has an order, either because it is sorted or because some quantity changes monotonically as you walk in from the ends, one comparison tells you that an entire row of the pair table cannot contain the answer. You discard the row by moving one pointer, and after at most `n` moves you are done. The pattern is not "use two variables"; it is "each step eliminates many candidates, and I can say which ones and why".

## The signal

Reach for two pointers when you read any of these in the statement:

- **The array is sorted, or you are allowed to sort it**, and you want pairs or triples with a condition on their sum, difference or product. Sortedness is what makes "move the left pointer" a safe decision.
- **"In place" or "O(1) extra space"** on an array you are compacting, partitioning or reordering. That is the same-direction form: one pointer reads, one writes.
- **Palindromes**, or anything phrased as "compare the front to the back".
- **A value that depends on both ends** where the weaker end is the only one worth moving (the container problem, the rain-water problem).
- **Two sorted sequences** that you need to merge, intersect or compare (`is s a subsequence of t?`).

What rules it out:

- The array is unsorted and the answer needs **original indices**. Sorting destroys them. That is a hash-map problem ([Two Sum](/practice/two-sum) versus [Two Sum Sorted](/practice/two-sum-sorted)); see [Hash-map patterns](/learn/interview-patterns/sequence-patterns/hash-map-patterns).
- The condition is about a **contiguous segment** between the pointers (longest substring with…, minimum window…). Both pointers move the same way but the *segment* is what matters. That is a [sliding window](/learn/interview-patterns/array-patterns/sliding-window), which has a different invariant.
- You need **all pairs counted with multiplicity** in an unsorted array. Frequency counting with a hash map is simpler.

The nearest confusable pattern is the sliding window. The test: if you care about the elements *at* the two indices, it is two pointers; if you care about everything *between* them, it is a window.

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

The invariant for the opposite-ends form is the thing to say out loud: *every pair using an index left of `lo` or right of `hi` has already been ruled out*. Why is moving `lo` safe when the sum is too small? Because `nums[hi]` is the largest value still in play, so `nums[lo] + nums[j] ≤ nums[lo] + nums[hi] < target` for every remaining `j`. Index `lo` cannot be in any answer; you drop it and every pair it belongs to in one step. The symmetric argument covers `hi`. Each step retires one index, so the loop runs at most `n - 1` times: `O(n)` after the sort.

Watch the pointers eliminate pairs on a real input:

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 2, 3, 4, 6, 8, 11, 15], "target": 10}
```

The same-direction form has a different invariant: *`nums[0..write)` holds exactly the kept elements seen so far, in their original order, and `write ≤ read` always*. The second half matters because it is what makes overwriting safe: you never clobber an element you have not read yet. Here it is partitioning three values in one pass, the Dutch national flag from [Sort Colors](/practice/sort-colors):

```viz
{"type": "array", "algorithm": "dutch-flag", "values": [2, 0, 2, 1, 1, 0, 0, 2, 1]}
```

Both forms are covered in more depth, with their correctness arguments, in [Two-pointers mastery](/learn/algorithms/technique-mastery/two-pointers-mastery) and [Invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning). This lesson is about recognising them under pressure and executing without a bug.

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

The insight is a single sentence you should say before writing any code: *moving the taller line can never help*. If `h[l] ≤ h[r]`, every container `(l, r')` with `r' < r` is narrower and its height is still capped at `h[l]`, so it holds no more than the current one. Index `l` is finished. You have just eliminated `r - l - 1` candidate pairs with one comparison, which is exactly the two-pointer move.

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

## Variations

- **Count instead of find.** "How many pairs sum to less than `target`?" When `nums[lo] + nums[hi] < target`, every `j` in `(lo, hi]` also works with `lo`, so add `hi - lo` to the count and advance `lo`. Still `O(n)`; you count a whole row at once rather than discarding it.
- **Closest rather than exact.** "Three Sum Closest": track the smallest `|sum - target|` and never return early. The pointer moves are unchanged because the direction argument is about ordering, not equality.
- **k-Sum.** Peel one anchor per level of recursion until two remain, then two-pointer. `O(n^(k-1))`, with duplicate-skipping at every level.
- **Same-direction with a bound.** [Remove Duplicates from Sorted Array](/practice/remove-duplicates-sorted) generalises to "allow at most `k` copies": keep `nums[read]` when `write < k or nums[read] != nums[write - k]`.
- **Two arrays.** Merge sorted arrays, intersect sorted arrays, "is `s` a subsequence of `t`": one pointer per array, advance the one that is behind. The invariant is "everything before each pointer has been matched or discarded".
- **Linked lists.** Fast and slow pointers are two pointers on a structure without random access. They get their own lesson: [Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers).

## Pitfalls

- **`while lo <= hi` in the opposite-ends loop.** With `lo == hi` you pair an element with itself. Use `<`.
- **Sorting when indices are the answer.** If you must sort and return indices, sort an array of `(value, index)` pairs or an index array keyed by value. Better: recognise that unsorted-with-indices is the hash-map version.
- **Duplicate skipping at the wrong time.** In Three Sum, skip the anchor by comparing to the *previous* anchor (`i > 0 and nums[i] == nums[i-1]`), and skip `lo`/`hi` duplicates only *after* recording a match. Skipping before the check throws away valid triples.
- **Unbounded duplicate skips.** `while nums[lo] == nums[lo + 1]` walks off the end. Every skip loop needs `lo < hi` in its condition.
- **Moving the taller line** in the container problem. It feels symmetric; it is not. Trace the proof once and it stays with you.
- **Returning `write + 1`** or `write - 1` from the compaction form. `write` is the count of kept elements and the index of the next free slot; both interpretations mean the answer is `write`.
- **Mutating an immutable string.** Python `str` and JavaScript strings cannot be edited in place; convert to a list or array of characters, or use the read-only opposite-ends form (palindrome checks need no writes).
- **Forgetting the `n < 2` case.** `hi = len(nums) - 1` is `-1` on an empty array; the `while lo < hi` guard saves you, but state it rather than rely on it.

## Exercise

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

## Senior signals

- You say the **elimination argument** before you write the loop: "if the sum is too small, `lo` cannot pair with anything remaining because `hi` is the largest remaining value".
- You separate the **opposite-ends** and **read/write** forms and know each one's invariant, rather than treating "two pointers" as a single trick.
- You recognise the **sorted-versus-indices** trade-off instantly: sorted input or free to sort means two pointers; original indices required means a hash map.
- You handle **duplicates by design** (skip after match, compare to previous anchor) instead of deduplicating with a set at the end, and you can say why the set is `O(n)` extra memory and hides the bug.
- You know the container proof and can give the **rain-water argument** in one sentence: the side with the smaller running maximum is fully determined, so settle it.
- You mention that on a sorted array the pattern is `O(1)` extra space, which is the follow-up the interviewer is about to ask.

## Check yourself

```quiz
- q: >-
    In the opposite-ends template on a sorted array, the current pair sums to less than the target. Which candidates does moving lo right eliminate, and why is that safe?
  options: ["Only the pair (lo, hi); the others still need checking", "Every pair (lo, j) with j in (lo, hi]; nums[hi] is the largest remaining value, so nums[lo] cannot reach the target with anything left", "Every pair (i, hi) with i in [lo, hi); nums[lo] is the smallest remaining value", "Nothing is eliminated; the loop simply tries the next index"]
  answer: 1
  explanation: >-
    Sortedness bounds every remaining partner of lo by nums[hi]. If even nums[lo] + nums[hi] is too small, no remaining partner works, so index lo and all its pairs are retired in one move. Option 2 describes the argument for moving hi when the sum is too large.
- q: >-
    Your Three Sum solution returns [[-1, 0, 1]] for [-1, 0, 1, 2, -1, -4] but the expected output also contains [-1, -1, 2]. The most likely bug is:
  options: ["The array was not sorted", "The anchor-skip compares nums[i] to nums[i + 1] instead of nums[i - 1]", "The inner loop uses lo <= hi", "Duplicates are skipped after recording a match"]
  answer: 1
  explanation: >-
    Comparing to the next element skips the first -1 as an anchor, so the triple that needs two -1s is never formed. Comparing to the previous anchor skips only repeated anchors. Skipping after a match (option 3) is the correct placement, not a bug.
- q: >-
    In Container With Most Water, heights[lo] = 5 and heights[hi] = 9. Why is moving hi never beneficial?
  options: ["Because 9 is the global maximum", "Because any container (lo, r) with r < hi is narrower and its height is still capped at 5, so it holds at most the current amount", "Because the area formula only depends on the left line", "It can be beneficial; you should try both moves"]
  answer: 1
  explanation: >-
    Height is min of the two lines, so with the shorter line fixed at 5 the height cannot rise, and the width only falls. Only moving the shorter line can raise the cap. Trying both moves would make the algorithm exponential.
- q: >-
    The problem asks for the two indices in an unsorted array whose values sum to a target. A candidate sorts the array and runs two pointers. What is wrong?
  options: ["Nothing; this is optimal", "Two pointers only works on arrays without duplicates", "Sorting destroys the original indices that the answer requires; a hash map keyed by value solves it in one pass", "Two pointers is O(n log n) but a nested loop is faster on small inputs"]
  answer: 2
  explanation: >-
    The returned positions would refer to the sorted array. You would need to carry indices through the sort, at which point a single pass with a value-to-index map is simpler and O(n). The signal for two pointers is sorted input where values, not positions, are the answer.
- q: >-
    In the O(1)-space Trapping Rain Water solution, lmax = 4 and rmax = 6. Which position can be settled now, and what is its water?
  options: ["The next left position; its water is max(lmax, h) - h after updating lmax", "The next right position; its water is rmax - h", "Either; they are symmetric", "Neither; you need both full max arrays"]
  answer: 0
  explanation: >-
    Because lmax <= rmax, the true right-side maximum for the next left position is at least 6, so min(maxLeft, maxRight) there equals the updated lmax. That side is fully determined; the right side is not, because its left wall might still grow.
```
