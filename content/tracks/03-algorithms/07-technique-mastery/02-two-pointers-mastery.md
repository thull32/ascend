---
slug: two-pointers-mastery
title: "Two-pointer mastery: the pair-table proof, three pointers and what sorting buys"
description: Prove that two pointers never skip the answer by picturing the table of all pairs, bound the running time with a potential argument, extend the idea to three pointers and several arrays, and know exactly when sorting beats a hash map.
minutes: 42
difficulty: hard
tags: [two-pointers, invariants, proofs, sorted-array, three-pointers, partition]
problems: [two-sum-sorted, three-sum, container-with-most-water, trapping-rain-water, valid-palindrome, remove-duplicates-sorted, move-zeroes, sort-colors, two-sum]
---
You write the opposite-ends loop for "find a pair in a sorted array that sums to the target", and the interviewer asks: "when you move `lo` forward, how do you know you haven't skipped the pair?" The usual reply is "because the array is sorted". That names the precondition but proves nothing. The follow-ups come next: why does Container With Most Water work when nothing is sorted, why is the loop linear, and why would you ever sort when a hash map is `O(n)`?

The [two-pointers pattern lesson](/learn/interview-patterns/array-patterns/two-pointers) taught the moves. This lesson teaches the argument behind them. It uses one picture, the table of all pairs, which explains every opposite-ends algorithm. It uses one technique, a potential function, which proves every pointer loop linear. On top of those it covers the invariants that make same-direction and three-pointer code correct, and the trade-off table that tells you when sorting plus pointers beats hashing.

## The pair table: what one comparison rules out

Take the sorted array `a = [1, 3, 4, 6, 8, 11]` and target 10. Picture the 6 × 6 table whose cell `(i, j)`, for `i < j`, holds `a[i] + a[j]`. Because `a` is sorted, values increase to the right along each row and downward along each column. The pointers start at the top-right corner, `lo = 0`, `hi = 5`.

| step | `lo` | `hi` | `a[lo] + a[hi]` | what the comparison rules out |
|---|---|---|---|---|
| 1 | 0 | 5 | 1 + 11 = 12 > 10 | column 5: every `(i, 5)` with `i ≥ lo` has sum ≥ 12 |
| 2 | 0 | 4 | 1 + 8 = 9 < 10 | row 0: every `(0, j)` with `j ≤ hi` has sum ≤ 9 |
| 3 | 1 | 4 | 3 + 8 = 11 > 10 | column 4 |
| 4 | 1 | 3 | 3 + 6 = 9 < 10 | row 1 |
| 5 | 2 | 3 | 4 + 6 = 10 | found |

That table is the proof. The invariant is: *every pair with `i < lo` or `j > hi` has been ruled out; the remaining candidates are the triangle `lo ≤ i < j ≤ hi`.* A sum that is too large means the larger partner `a[hi]` is too large even with the smallest remaining partner, so its whole column goes. A sum that is too small means `a[lo]` is too small even with the largest remaining partner, so its whole row goes. Neither move can discard the answer, and each shrinks the candidate triangle by one row or column, so after at most `n - 1` steps the triangle is empty or the pair is found.

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 3, 4, 6, 8, 11], "target": 10, "title": "Each move deletes a row or a column of the pair table", "caption": "Too big: the right element cannot pair with anything remaining, so hi moves. Too small: the left element cannot, so lo moves."}
```

The walk has a name outside interviews: **saddleback search**. It finds a value in a matrix whose rows and columns are both sorted, starting from the top-right corner, in `O(rows + cols)`. The pair table is such a matrix. If you can say "each comparison eliminates a whole row or column of the pair table", you have answered the interviewer's question completely.

## Correctness without sorting: Container With Most Water

The pair-table argument does not actually need sorted values. It needs some reason why one comparison makes a whole row or column hopeless. In [Container With Most Water](/practice/container-with-most-water), `area(i, j) = (j - i) · min(h[i], h[j])`. Suppose `h[lo] <= h[hi]`. For any `j` strictly between them:

$$\text{area}(lo, j) = (j - lo)\cdot\min(h[lo], h[j]) \le (j - lo)\cdot h[lo] < (hi - lo)\cdot h[lo] = \text{area}(lo, hi)$$

Every remaining pair that uses `lo` is strictly worse than the pair you just measured, so row `lo` is dominated and `lo` moves. The monotone quantity is the *width*, which only shrinks as you move inwards, and the shorter wall caps the height. On `h = [1, 8, 6, 2, 5, 4, 8, 3, 7]` the first cell `(0, 8)` has area `8 · 1 = 8`. Every other container using wall 0 is narrower and still capped at height 1, so dropping wall 0 loses nothing. This is also why moving the *taller* wall is wrong: the shorter wall still caps every remaining pair that uses it, so moving the taller one throws away candidates without proving they are worse.

[Trapping Rain Water](/practice/trapping-rain-water)'s two-pointer version uses the same kind of dominance. Keep `left_max` and `right_max`, each including the height under its own pointer. If `left_max <= right_max`, the water above `lo` is exactly `left_max - h[lo]`: the right side is guaranteed to have a wall at least `right_max` tall, so the left maximum is the binding one. You can settle `lo` now and move it. The comparison decides which side has enough information to be finished.

## Proving O(n): pick a potential

For any pointer loop, find a non-negative integer quantity `Φ`, at most `O(n)` at the start, that **strictly decreases on every iteration of every loop**, including the inner "skip duplicates" loops. The loop then runs at most `Φ₀` times.

| Algorithm | Potential Φ | Why it drops every iteration |
|---|---|---|
| Opposite ends | `hi - lo` | Every branch moves one pointer inwards |
| Read/write compaction | `n - read` | `read` advances every iteration; `write` never passes it |
| Dutch national flag | `hi - mid + 1` | Every branch increments `mid` or decrements `hi` |
| Merge two sorted arrays | `(m - i) + (n - j)` | Every iteration consumes one element |
| 3Sum, per anchor | `hi - lo` | Opposite ends inside; `n` anchors give `O(n²)` |

The discipline catches a real class of bug: the iteration that moves nothing. In the Dutch flag, swapping with `hi` does not advance `mid`, but it decrements `hi`, so `Φ` still drops. A version that swaps and forgets to move either pointer spins forever on `[2, 2]`. A duplicate skip written `while a[lo] == a[lo + 1]` moves `lo`, so it counts towards `Φ`, but without `lo < hi` in its condition it runs off the end of the array. When you write a pointer loop, name `Φ` for every branch. It takes ten seconds.

## Same-direction pointers: the prefix invariant

Read/write loops have a different invariant: *`a[0:write]` is the correct output for the input `a[0:read]`*. Every correctness question becomes "does this step preserve that?"

Take "remove duplicates from a sorted array, keeping at most `k` copies of each value". Keep `a[read]` if `write < k` or `a[read] != a[write - k]`. The comparison is against the *output*, not the input. The output is sorted, so if the element `k` places back in the output equals `a[read]`, then the last `k` outputs all equal `a[read]`, and keeping it would make `k + 1` copies. Comparing with `a[read - k]` looks at the input instead, which may already have been overwritten (every position below `write` has been) and which cannot tell you how many copies you kept.

Trace `a = [1, 1, 1, 2, 2, 2, 3]` with `k = 2`:

| `read` | `a[read]` | `write` | `a[write - 2]` | keep? | output `a[0:write]` after |
|---|---|---|---|---|---|
| 0 | 1 | 0 | none | yes, `write < 2` | `[1]` |
| 1 | 1 | 1 | none | yes, `write < 2` | `[1, 1]` |
| 2 | 1 | 2 | 1 | no | `[1, 1]` |
| 3 | 2 | 2 | 1 | yes | `[1, 1, 2]` |
| 4 | 2 | 3 | 1 | yes | `[1, 1, 2, 2]` |
| 5 | 2 | 4 | 2 | no | `[1, 1, 2, 2]` |
| 6 | 3 | 4 | 2 | yes | `[1, 1, 2, 2, 3]` |

The function returns `write = 5`. With `k = 1` it is [Remove Duplicates from Sorted Array](/practice/remove-duplicates-sorted). With "keep if non-zero" it is [Move Zeroes](/practice/move-zeroes), followed by a pass that zero-fills the tail.

**Merging in place from the back.** To merge sorted `b` into sorted `a`, where `a` has `len(b)` spare slots at the end, write from the back. Let `i` and `j` be the last unread indices of `a` and `b`. The write position is `w = i + j + 1`, so `w - i = j + 1 >= 1` while `b` has elements left: the writer is always strictly ahead of the unread part of `a` and never overwrites data you still need. Once `b` is exhausted, the rest of `a` is already in place. Writing from the front fails because the output would land on unread elements of `a`. "Which end do I write from?" is always answered by checking where the unread data lives.

## Three pointers

### Three regions: the Dutch national flag

Sorting `0`s, `1`s and `2`s in one pass keeps four regions with this invariant: `a[0:lo]` are 0s, `a[lo:mid]` are 1s, `a[mid:hi+1]` are unknown, `a[hi+1:]` are 2s. Loop while `mid <= hi`:

- `a[mid] == 0`: swap with `a[lo]`, then `lo += 1` and `mid += 1`. The element arriving from `lo` is a 1 (or `lo == mid` and it is the 0 you just placed), so it is known.
- `a[mid] == 1`: `mid += 1`.
- `a[mid] == 2`: swap with `a[hi]`, then `hi -= 1`, and **do not** advance `mid`, because the element arriving from `hi` has not been examined.

```viz
{"type": "array", "algorithm": "dutch-flag", "values": [2, 0, 2, 1, 1, 0, 1, 2], "title": "Three pointers, four regions", "caption": "The unknown region [mid, hi] shrinks by one on every step, which is the potential argument in motion."}
```

The asymmetry between the two swaps is the whole bug surface, and the invariant explains it. Each swap brings an element into position `mid`. Anything coming from the left side of `mid` has already been examined. Anything coming from `hi` has not.

### An anchor plus a pair: 3Sum and triangle counting

Fix one index and run opposite-end pointers over the rest: `O(n²)` for [3Sum](/practice/three-sum). Is that optimal? Nobody knows an algorithm for 3SUM that runs in `O(n^(2-ε))` for any fixed `ε > 0`. The best known improvements shave only logarithmic factors, and a whole family of computational-geometry problems is called "3SUM-hard" because they inherit that barrier. So `O(n²)` is the expected answer, and you can say why you are not looking for better.

The anchor-plus-pair shape also **counts**. Counting triangles means choosing three sticks with `a + b > c` for the largest side `c`. Sort, then fix the largest side at index `k` and search `lo < hi < k`. If `a[lo] + a[hi] > a[k]`, then every `i` from `lo` to `hi - 1` also works with `hi`, because those values are at least `a[lo]`. That is a whole row of the pair table certified *valid* at once, so add `hi - lo` and move `hi`. Otherwise `a[lo]` is too small for every remaining partner, so move `lo`.

Trace `[2, 2, 3, 4]`:

| largest `a[k]` | `lo`, `hi` | `a[lo] + a[hi]` | action | count |
|---|---|---|---|---|
| 4 | 0, 2 | 2 + 3 = 5 > 4 | add `2 - 0 = 2`, `hi = 1` | 2 |
| 4 | 0, 1 | 2 + 2 = 4, not > 4 | `lo = 1`, stop | 2 |
| 3 | 0, 1 | 2 + 2 = 4 > 3 | add `1 - 0 = 1`, `hi = 0`, stop | 3 |

Three triangles: `(2, 3, 4)` twice (one per 2) and `(2, 2, 3)`. The pair table works both ways: a comparison can rule a row out, or it can certify a whole row in.

### Pointers into several arrays

With two sorted arrays, give each its own pointer and advance the one that is "behind". Merging, intersecting and "is `s` a subsequence of `t`" all have this shape. The proof takes one line per problem. For "the closest pair with one element from each array": if `a[i] < b[j]`, then every later `b[j'] >= b[j] > a[i]`, so `|a[i] - b[j']| >= |a[i] - b[j]|`. `a[i]` has already met its best remaining partner and can be discarded. With `k` arrays, "advance the one that is behind" needs a heap to find the smallest current element, which is [Smallest Range Covering K Lists](/practice/smallest-range-k-lists).

## What sorting buys, and what it costs

Sorting buys an order in which one comparison tells you which way to move. It costs `O(n log n)` time, loses the original indices, and mutates the input unless you copy it first. The alternative for pair problems is a hash map, and the two tools answer different questions:

| Question | Hash map | Sort + two pointers |
|---|---|---|
| Pair with sum exactly `t`, return original indices | `O(n)`, natural | `O(n log n)`, must carry indices through the sort |
| Pair with sum *closest* to `t` | No help: a map has no notion of "near" | `O(n log n)` |
| Count pairs with sum `< t` | No help without an ordered structure | `O(n log n)`, add a row length per step |
| All unique triples summing to 0 | `O(n²)`, deduplication is painful | `O(n²)`, duplicates skip cleanly |
| Extra space | `O(n)` | `O(1)` beyond the sort |
| Data arrives as a stream | Works | Needs all the data first |

The rule of thumb: **equality goes to a hash map; order goes to sorting.** A hash map answers "is this exact value present?" and knows nothing about neighbouring values. "Less than", "closest", "within a range" and "count how many" all need order. This is why [Two Sum](/practice/two-sum) on unsorted input with indices is a hash-map problem, while [Two Sum II](/practice/two-sum-sorted) with sorted input is a pointer problem that needs no extra space.

One language trap: JavaScript's default `sort()` compares elements as **strings**, so `[10, 9, 1].sort()` gives `[1, 10, 9]`. Always pass `(x, y) => x - y`. Python's `sort` is Timsort, which is `O(n)` on already-sorted runs and uses up to `O(n)` auxiliary memory. If the interviewer asks for `O(1)` space, mention that the sort itself may not be.

## When two pointers are the wrong tool

- **Exact equality on unsorted data with indices required:** hash map.
- **Subarray sums with negative numbers:** neither pointers nor windows. Use [prefix sums and hashing](/learn/algorithms/technique-mastery/prefix-sums-and-hashing-tricks).
- **An objective that is not monotone along a pointer.** "Maximum product of two elements" with negatives is solved by sorting, but the answer is one of two candidates (the two largest, or the two most negative), not a pointer walk.
- **k-Sum for larger `k`:** anchors plus pointers give `O(n^(k-1))`. Hashing all pair sums gives `O(n^(k/2))`, which is [meet in the middle](/learn/algorithms/technique-mastery/meet-in-the-middle-and-randomisation).

## Exercises

```exercise
id: triangle-count
title: Count triangles
prompt: |
  `nums` holds stick lengths (non-negative integers). Return the number of
  index triples `i < j < k` whose three sticks can form a triangle with
  positive area, meaning the two shorter sides sum to strictly more than
  the longest.

  Sort, fix the largest side, and use two pointers below it. When
  `nums[lo] + nums[hi] > nums[k]`, every index from `lo` to `hi - 1` also
  works with `hi`. Aim for O(n^2).
languages: [python, javascript]
entry: triangle_count
starter:
  python: |
    def triangle_count(nums):
        # your code here
        return 0
  javascript: |
    function triangle_count(nums) {
      // remember: sort numerically with (a, b) => a - b
      return 0;
    }
tests:
  - args: [[2, 2, 3, 4]]
    expected: 3
  - args: [[4, 2, 3, 4]]
    expected: 4
  - args: [[]]
    expected: 0
    label: empty input
  - args: [[0, 0, 0]]
    expected: 0
    label: zero-length sides have no area
  - args: [[1, 2, 3]]
    expected: 0
    label: degenerate, 1 + 2 is not more than 3
  - args: [[2, 3, 4, 5, 6]]
    expected: 7
    hidden: true
  - args: [[3, 3, 3, 3]]
    expected: 4
    hidden: true
  - args: [[10, 9, 1, 100, 2]]
    expected: 1
    hidden: true
    label: fails if sorted as strings
hints:
  - "After sorting, loop k from len(nums) - 1 down to 2 with lo = 0 and hi = k - 1."
  - "If nums[lo] + nums[hi] > nums[k], add hi - lo and decrement hi; otherwise increment lo."
```

```exercise
id: min-difference-two-arrays
title: Smallest difference across two arrays
prompt: |
  Given two non-empty integer arrays `a` and `b` (unsorted, values may be
  negative or repeated), return the smallest value of `|x - y|` over all
  `x` in `a` and `y` in `b`.

  Sort both, then walk one pointer through each. Advance the pointer at
  the smaller value: that element has already met its best remaining
  partner. Aim for O(n log n + m log m).
languages: [python, javascript]
entry: min_abs_difference
starter:
  python: |
    def min_abs_difference(a, b):
        # your code here
        return 0
  javascript: |
    function min_abs_difference(a, b) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 3, 15, 11, 2], [23, 127, 235, 19, 8]]
    expected: 3
  - args: [[10, 5, 40], [50, 90, 80]]
    expected: 10
  - args: [[1], [1]]
    expected: 0
    label: single elements, equal
  - args: [[-5, 3], [7, -1]]
    expected: 4
    label: negatives
  - args: [[1, 2, 3], [4, 5, 6]]
    expected: 1
    hidden: true
  - args: [[100], [1, 2, 3, 200]]
    expected: 97
    hidden: true
  - args: [[5, 5, 5], [5]]
    expected: 0
    hidden: true
hints:
  - "Sort copies of both arrays; set i = j = 0 and best to infinity."
  - "Update best with |a[i] - b[j]|; then advance i if a[i] < b[j], else advance j. Stop when either runs out."
```

## Senior signals

- You justify every pointer move with the **pair table**: "this comparison rules out the whole row, or column, because…". You also recognise the walk as saddleback search.
- You prove the loop linear by naming a **potential** that drops on every branch, and you use the same habit to catch branches that move nothing.
- You state the **invariant** for read/write loops ("`a[0:write]` is the output for `a[0:read]`"). From it you derive why the keep-at-most-`k` check compares with `a[write - k]`, and why in-place merges write from the back.
- You explain the Dutch flag's **asymmetric swap** by where the incoming element came from.
- You choose between hashing and sorting with **"equality goes to a hash, order goes to sorting"**, and you mention that 3Sum's `O(n²)` is believed to be essentially optimal.
- You count with pointers by **adding a whole row** (`hi - lo`) when a comparison certifies it, instead of enumerating pairs.

## Check yourself

```quiz
- q: >-
    In pair-sum on a sorted array, a[lo] + a[hi] is less than the target. Why is it safe to discard lo entirely?
  options: ["a[lo] is the smallest remaining value, so it cannot appear in any valid pair", "lo has already been compared once, and each index needs only one comparison", "It is not safe; a larger partner beyond hi could still reach the target", "Even its largest remaining partner, a[hi], gives a sum that is too small"]
  answer: 3
  explanation: >-
    The remaining partners for lo are indices up to hi, and a[hi] is the largest of them. If even that sum is too small, the whole row of the pair table is ruled out. Partners beyond hi are not a way back: their columns were discarded earlier because they were too large even with the smallest remaining partner. Sortedness is the reason a[hi] is the largest remaining partner, but being the smallest value alone does not rule a[lo] out.
- q: >-
    In Container With Most Water, h[lo] = 3 and h[hi] = 9. Why move lo rather than hi?
  options: ["The taller wall is more likely to be part of the best container overall", "Moving either pointer works, since both shrink the width by exactly one", "Every other container using hi is narrower, so each one is worse than this", "Every other container using lo is narrower and still capped at height 3"]
  answer: 3
  explanation: >-
    The shorter wall caps the height of every pair it belongs to, and the width only shrinks inwards, so every remaining pair using lo is strictly worse than the current one and row lo is dominated. Containers using hi are narrower too, but their height is min(h[j], 9), which can exceed 3, so moving hi would discard pairs such as (lo + 1, hi) that could be better and are not proven worse.
- q: >-
    In the Dutch national flag loop, after swapping a[mid] with a[hi] because a[mid] was 2, why does mid stay where it is?
  options: ["Not advancing mid is what keeps the potential dropping, so the loop is O(n)", "Keeping mid still stops the 2 just placed at hi from being swapped out again", "The element that arrived from hi is still unexamined and must be classified first", "It should advance; the swapped-in element is always a 1, as in the lo case"]
  answer: 2
  explanation: >-
    Everything left of mid has been examined, and everything right of hi is known to be 2, but the region between them is unknown. The swap brings an unknown element to mid. The lo-side swap is different: the element arriving from lo has already been examined, which is why mid advances there. Progress still happens because hi decreases, so the potential hi - mid + 1 drops; not advancing mid is about correctness, not speed.
- q: >-
    Which question is a better fit for sort plus two pointers than for a hash map?
  options: ["Count the pairs whose sum is strictly less than t", "Group the words that are anagrams of each other", "Return the indices of two values summing exactly to t", "Check whether any value in the array appears twice"]
  answer: 0
  explanation: >-
    A hash map answers exact-membership questions. Counting pairs below a threshold needs order, which two pointers exploit by adding a whole row of valid pairs per step. The other three are equality questions where hashing wins; returning original indices is especially awkward after a sort.
- q: >-
    You keep at most two copies of each value in a sorted array in place. Why does the keep test compare a[read] with a[write - 2] and not a[read - 2]?
  options: ["a[write - 2] stays in cache, so it is faster to read than a[read - 2]", "a[write - 2] is in the output, which records how many copies were kept", "a[read - 2] can be out of bounds, while write - 2 is always a valid index", "The two are always equal, so either comparison gives the same result"]
  answer: 1
  explanation: >-
    The invariant is that a[0:write] is the correct output so far. Because that output is sorted, a[write - 2] == a[read] means the last two kept values already equal a[read]. The input position read - 2 says nothing about what was kept, and it may have been overwritten: on [1, 1, 1, 2, 2, 2, 3] at read = 4, a[2] already holds a 2, so comparing with a[read - 2] would wrongly drop the second 2, while a[write - 2] = 1 keeps it.
```
