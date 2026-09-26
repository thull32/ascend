---
slug: cyclic-sort
title: "Cyclic sort: when the values are their own indices"
description: Place every value at the index it names in one linear pass and O(1) space, then read missing and duplicate numbers straight off the array.
minutes: 28
difficulty: medium
tags: [pattern:cyclic-sort, arrays, in-place, missing-number, duplicates]
problems: [missing-number, first-missing-positive, find-duplicate-number]
---
You are handed an array of `n` integers and told that every value lies in `1..n`. One number is missing, or one is duplicated, or the interviewer wants the smallest positive integer that does not appear. The obvious answers are a hash set (`O(n)` extra space) or a sort (`O(n log n)` time). Then comes the follow-up that this lesson exists for: "Can you do it in `O(n)` time and `O(1)` extra space?"

The trick is that the constraint on the values is not a detail; it is the algorithm. If every value is between `1` and `n`, then every value names a valid index (`value - 1`), and the array can be used as its own hash table. Put each value where it belongs, and anything that ends up in the wrong place is the answer.

## The signal

Cyclic sort is one of the easiest patterns to spot because the problem statement has to hand you the constraint explicitly. Look for:

- **Values bounded by the length.** "Each `nums[i]` is in the range `[1, n]`", "`[0, n]`", or "`[1, n-1]` where `n = len(nums)`". This is the whole signal. The phrasing may be indirect ("`n + 1` integers, each between 1 and `n`"), but there is always a line tying the value range to the array size.
- **A question about membership of the index range.** Which number is missing, which is duplicated, what is the smallest missing positive, which numbers appear twice, which pair is corrupted. Anything that asks "does value `v` appear?" for `v` in `1..n`.
- **The space constraint.** "Without extra space", "in place", "constant extra memory", or the follow-up "can you avoid the hash set?"

What rules it out:

- **Values not bounded by `n`.** If the values can be anything (`-10⁹..10⁹`), there is no index for them to go to. Use a hash set, or sort.
- **The input must not be mutated.** Cyclic sort rearranges the array. If the problem forbids modification (as [Find the Duplicate Number](/practice/find-duplicate-number) does in its strictest form), you need a non-destructive method: Floyd's cycle detection from [Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers), or binary search on the value range.
- **A single missing number with no duplicates.** The XOR trick or the Gauss sum formula gives you `O(n)` time and `O(1)` space without touching the array. Cyclic sort still works, but a senior candidate names the simpler tool.

The nearest confusable pattern is **counting sort** from [Non-comparison sorts](/learn/algorithms/sorting-searching/non-comparison-sorts-and-lower-bounds). Both exploit "index equals value". Counting sort allocates a separate count array; cyclic sort uses the input itself. If you are allowed `O(n)` extra space, counting is simpler. If you are not, cyclic sort is the only linear option.

```viz
{"type": "array", "algorithm": "counting-sort", "values": [3, 1, 4, 1, 2], "title": "Index equals value", "caption": "Counting sort builds a separate count array indexed by value. Cyclic sort applies the same index-equals-value idea but stores each value in the input array itself, so no extra array is needed. The animation shows the mapping from value to slot; it does not show the in-place swaps."}
```

## The template

The loop walks an index `i` from left to right. At each position it looks at the value `v = nums[i]` and asks: is `v` sitting at its home index `v - 1`? If not, swap `v` into its home and look again at whatever landed at `i`. If yes (either `i` is already the home, or the home already holds a copy of `v`), advance.

```python
def cyclic_sort(nums: list[int]) -> None:
    """Place each value v in 1..n at index v - 1. Values outside 1..n stay where they fall."""
    n = len(nums)
    i = 0
    while i < n:
        v = nums[i]
        j = v - 1                       # home index for v
        if 1 <= v <= n and nums[j] != v:
            nums[i], nums[j] = nums[j], nums[i]   # place v; re-examine nums[i]
        else:
            i += 1
```

```javascript
function cyclicSort(nums) {
  const n = nums.length;
  let i = 0;
  while (i < n) {
    const v = nums[i];
    const j = v - 1;                    // home index for v
    if (v >= 1 && v <= n && nums[j] !== v) {
      [nums[i], nums[j]] = [nums[j], nums[i]];
    } else {
      i += 1;
    }
  }
}
```

The invariant: **every index left of `i` holds either its correct value or a value that has no home** (out of range, or a duplicate whose home is already occupied). Once the loop ends, a second pass reads the answer off the array: the first index `k` with `nums[k] != k + 1` tells you that `k + 1` is missing, and the value sitting there is either a duplicate or an out-of-range intruder.

The guard `nums[j] != v` does two jobs. When `j == i` it is the "already home" check. When `nums[j]` holds a second copy of `v`, it prevents the swap that would exchange two equal values forever. Drop it and `[1, 1]` loops until the process is killed.

### Why it is O(n) despite the nested loop

The `while` has no inner `for`, but the "re-examine `nums[i]`" step means one index can be visited many times. The bound comes from counting swaps, not iterations. Every swap moves one value into its home index, and a value that reaches its home is never moved again (the guard prevents it). There are at most `n` homes, so there are at most `n` swaps. Every non-swap iteration advances `i`, of which there are exactly `n`. Total iterations `≤ 2n`. This is the same accounting argument as in [Amortised analysis](/learn/foundations/complexity/amortized-analysis): the expensive iterations are paid for by the permanent progress they make.

## Worked problems

### Missing Number

Given `n` distinct integers taken from `0..n`, find the one that is absent. [Missing Number](/practice/missing-number).

Here the values are `0..n`, so value `v` lives at index `v`, and the value `n` has no home (there are only indices `0..n-1`). The template adjusts: skip `v == n`, and swap everything else to index `v`.

Trace on `[3, 0, 1]` (`n = 3`):

| step | i | v = nums[i] | action | array after |
|---|---|---|---|---|
| 1 | 0 | 3 | `v == n`, no home; advance | `[3, 0, 1]` |
| 2 | 1 | 0 | home is index 0, holds 3; swap | `[0, 3, 1]` |
| 3 | 1 | 3 | no home; advance | `[0, 3, 1]` |
| 4 | 2 | 1 | home is index 1, holds 3; swap | `[0, 1, 3]` |
| 5 | 2 | 3 | no home; advance | `[0, 1, 3]` |

Scan: index 0 holds 0, index 1 holds 1, index 2 holds 3, not 2. The missing number is 2. If every index had held its own value, the answer would be `n`.

Two alternatives you should be able to write in one line each, because the interviewer will ask whether cyclic sort is overkill here:

- **Gauss sum.** The sum of `0..n` is `n(n+1)/2`; subtract the array sum. For `[3, 0, 1]`: `6 - 4 = 2`. Watch for overflow in fixed-width languages when `n` is around `10⁵` and you sum squares; for plain sums with `n ≤ 10⁵` a 64-bit integer is fine.
- **XOR.** XOR all values in `0..n` together with all array values. Every present number appears twice and cancels; the missing one survives. No overflow risk, no division.

```viz
{"type": "bits", "algorithm": "single-number", "values": [3, 0, 1, 0, 1, 2, 3], "title": "XOR cancellation for Missing Number", "caption": "The array [3, 0, 1] concatenated with the full range 0..3. Every value that appears twice XORs to zero; the survivor, 2, is the missing number. The animation shows the cancellation, not the cyclic swaps."}
```

Both alternatives are `O(n)` time and `O(1)` space and do not mutate the input. Cyclic sort earns its place only when the follow-up is "now find *all* missing numbers" or "now there may be duplicates", where the sum and XOR tricks stop working.

### First Missing Positive

Given an unsorted array of any integers (negatives, zeros, huge values), return the smallest positive integer that is absent. [First Missing Positive](/practice/first-missing-positive).

The key insight is that the answer is always in `1..n+1`. If all of `1..n` are present, the answer is `n + 1`; otherwise one of `1..n` is missing. So every value outside `1..n` is irrelevant and can sit anywhere. The template's range check handles them: they are never swapped *into* a home, though they may be swapped *out* of one.

Trace on `[3, 4, -1, 1]` (`n = 4`):

| step | i | v | home j = v - 1 | nums[j] | action | array after |
|---|---|---|---|---|---|---|
| 1 | 0 | 3 | 2 | -1 | swap | `[-1, 4, 3, 1]` |
| 2 | 0 | -1 | out of range | | advance | `[-1, 4, 3, 1]` |
| 3 | 1 | 4 | 3 | 1 | swap | `[-1, 1, 3, 4]` |
| 4 | 1 | 1 | 0 | -1 | swap | `[1, -1, 3, 4]` |
| 5 | 1 | -1 | out of range | | advance | `[1, -1, 3, 4]` |
| 6 | 2 | 3 | 2 | 3 (itself) | advance | `[1, -1, 3, 4]` |
| 7 | 3 | 4 | 3 | 4 (itself) | advance | `[1, -1, 3, 4]` |

Scan: index 0 holds 1, index 1 holds -1 rather than 2. Answer: 2.

Notice step 1: the value 3 went home and evicted -1, which drifted to index 0 and then stayed. Out-of-range values act as placeholders for the missing homes. Five swaps or fewer on four elements; the bound holds.

Complexity `O(n)` time, `O(1)` extra space. This is the problem where cyclic sort is the *intended* solution. A hash set is `O(n)` space and the interviewer will say so.

### Find the Duplicate Number

Given `n + 1` integers each in `1..n`, exactly one value is repeated (possibly more than twice). Return it. [Find the Duplicate Number](/practice/find-duplicate-number).

There are `n + 1` slots and only `n` distinct homes, so after cyclic sort some slot holds a value that could not go home because its home is already occupied by a copy. That value is the duplicate.

Trace on `[1, 3, 4, 2, 2]` (length 5, values in `1..4`):

| step | i | v | home j = v - 1 | nums[j] | action | array after |
|---|---|---|---|---|---|---|
| 1 | 0 | 1 | 0 | 1 (itself) | advance | `[1, 3, 4, 2, 2]` |
| 2 | 1 | 3 | 2 | 4 | swap | `[1, 4, 3, 2, 2]` |
| 3 | 1 | 4 | 3 | 2 | swap | `[1, 2, 3, 4, 2]` |
| 4 | 1 | 2 | 1 | 2 (itself) | advance | `[1, 2, 3, 4, 2]` |
| 5 | 2 | 3 | 2 | itself | advance | |
| 6 | 3 | 4 | 3 | itself | advance | |
| 7 | 4 | 2 | 1 | 2 (a copy, guard fires) | advance | `[1, 2, 3, 4, 2]` |

Scan: index 4 holds 2 rather than 5, and 5 is not even a legal value. The duplicate is 2. In general, the first index `k` with `nums[k] != k + 1` holds the duplicate.

Now the honest part. The classic statement of this problem adds "you must not modify the array and must use `O(1)` space", and cyclic sort violates the first clause. The non-destructive answer treats `nums` as a function `i → nums[i]` and runs Floyd's tortoise and hare on it: because there are `n + 1` indices mapping into `n` values, the functional graph has a cycle, and the cycle entry is the duplicate. That lives in [Fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers). Know both and say which constraint chooses between them: mutation allowed, cyclic sort is simpler to write correctly; mutation forbidden, Floyd's.

Complexity `O(n)` time, `O(1)` space for both approaches.

## Variations

**All missing numbers.** After sorting, collect every `k + 1` where `nums[k] != k + 1` rather than stopping at the first. Same template, different scan. This is exactly where the sum and XOR tricks stop working, because they only recover a single unknown.

**All duplicates.** Collect the *values* `nums[k]` at every index where `nums[k] != k + 1`. Each such value is a duplicate that could not go home. If the same value appears three times, it shows up twice in the scan; deduplicate if the problem wants distinct values.

**Corrupt pair (one duplicate, one missing).** Values `1..n` with one number replaced by a copy of another. After sorting, the single misplaced index `k` gives both answers: `nums[k]` is the duplicate and `k + 1` is the missing number.

**Values in `0..n` instead of `1..n`.** Home for `v` is index `v`, and value `n` has no home. Change the guard to `v < n and nums[v] != v`. The off-by-one here is the most common bug in the pattern; decide on the mapping before writing the swap.

**Smallest missing positive, but the array is huge and read-only.** You cannot cyclic sort. The fallback is binary search on the answer value with a counting pass per probe, `O(n log n)`, or a bitset if `O(n)` bits is acceptable space. Say the trade-off out loud.

## Pitfalls

**The infinite swap.** Guarding with `nums[i] != i + 1` alone (without checking the destination) loops forever on duplicates. On `[1, 1]`: `i = 1`, value 1 is not at index 1, swap with index 0, array unchanged, repeat. The fix is to compare the value with what is *already at its home*: `nums[j] != v`. Trace `[1, 1]` and `[2, 2]` by hand before you run anything.

**Python's tuple-swap evaluation order.** This is wrong:

```python
nums[i], nums[nums[i] - 1] = nums[nums[i] - 1], nums[i]
```

Python evaluates the right-hand side fully, then assigns left to right. `nums[i]` is overwritten first, and the second target `nums[nums[i] - 1]` is then computed with the *new* `nums[i]`, so the value lands at the wrong index. Compute `j = nums[i] - 1` on its own line and swap `nums[i], nums[j]`. JavaScript's destructuring swap has the same hazard if the index expression re-reads the array.

**Forgetting the range check.** [First Missing Positive](/practice/first-missing-positive) contains negatives and values above `n`. Indexing with `v - 1` for `v = -1` gives `nums[-2]`, which in Python silently reads from the end and in JavaScript is `undefined`. Both produce wrong answers rather than crashes, which is worse.

**Mutating an input the caller still needs.** In production code, and in problems that say "do not modify", cyclic sort is disqualified. Either copy the array (which forfeits the space bound) or switch to Floyd's.

**Using recursion for the "re-examine" step.** Some candidates write the swap-and-recheck as a recursive call. It is correct but adds `O(n)` stack depth in the worst case, which contradicts the `O(1)` space claim. Keep the `while` loop.

## Exercise

```exercise
id: all-missing-in-range
title: Find every missing number in 1..n
prompt: |
  Given an array `nums` of length `n` where every value is in the range
  `1..n` (duplicates allowed), return a sorted list of every integer in
  `1..n` that does not appear in `nums`.

  Use O(n) time and O(1) extra space beyond the output list. You may
  modify `nums`.
languages: [python, javascript]
entry: find_missing
starter:
  python: |
    def find_missing(nums):
        # cyclic sort, then scan
        return []
  javascript: |
    function find_missing(nums) {
      // cyclic sort, then scan
      return [];
    }
tests:
  - args: [[4, 3, 2, 7, 8, 2, 3, 1]]
    expected: [5, 6]
  - args: [[1, 1]]
    expected: [2]
    label: duplicate that must not loop forever
  - args: [[1, 2, 3]]
    expected: []
    label: nothing missing
  - args: [[]]
    expected: []
    label: empty input
  - args: [[2, 2, 2, 2]]
    expected: [1, 3, 4]
  - args: [[3, 1, 2, 5, 5]]
    expected: [4]
    hidden: true
  - args: [[1]]
    expected: []
    hidden: true
hints:
  - "Walk i from 0; let j = nums[i] - 1. If nums[j] != nums[i], swap them and stay on i; otherwise advance i."
  - "After the loop, index k holds a value other than k + 1 exactly when k + 1 is missing."
  - "Compute j on its own line before swapping; do not index with nums[i] inside the swap."
```

## Senior signals

- You spot the pattern from the constraint line ("values in `1..n`") before reading the question, and you say why that constraint makes the array its own hash table.
- You can explain the `O(n)` bound by counting swaps, not by hand-waving at "each element moves at most once".
- You know the three ways to solve [Missing Number](/practice/missing-number) (sum, XOR, cyclic sort) and pick the simplest for the stated constraints, then switch to cyclic sort when the follow-up asks for all missing numbers.
- You name the destructive-versus-non-destructive trade-off on [Find the Duplicate Number](/practice/find-duplicate-number) and can produce Floyd's algorithm when mutation is forbidden.
- You write the swap with a precomputed `j` and can say exactly why the inline version is wrong in Python.
- You test `[1, 1]` before anything else, because that is the input that hangs the naive loop.

## Check yourself

```quiz
- q: >-
    Why is cyclic sort O(n) even though one index can be examined many times?
  options: ["Each index is examined at most twice by construction", "Each swap moves one value to its final home, and there are at most n homes, so there are at most n swaps plus n advances", "The inner re-examination only happens on duplicates, which are rare", "It is actually O(n log n) but the log factor is small"]
  answer: 1
  explanation: >-
    The bound counts swaps, not visits. A value that reaches its home is never moved again, so swaps are capped at n; every non-swap iteration advances i, so those are capped at n. An index can be revisited many times, but only at the cost of placing a different value permanently.
- q: >-
    The guard is written as `while nums[i] != i + 1: swap(nums, i, nums[i] - 1)`. On which input does this fail, and how?
  options: ["[1, 2, 3]; it swaps elements that are already in place", "[2, 1]; it terminates one step early", "[1, 1]; it swaps two equal values forever", "[3, 1, 2]; it reads past the end of the array"]
  answer: 2
  explanation: >-
    With duplicates, the value at i is not at its index but its home already holds a copy. Swapping two equal values changes nothing, so the condition never becomes false. The fix compares the value against what is at its home rather than against the current index.
- q: >-
    Which problem statement makes cyclic sort the wrong tool even though the values are in 1..n?
  options: ["Find all numbers that appear twice", "Find the first missing positive in an array that also contains negatives", "Find the duplicate in an array you are not allowed to modify", "Find the single missing number"]
  answer: 2
  explanation: >-
    Cyclic sort rearranges the array. A no-mutation constraint forces a non-destructive approach such as Floyd's cycle detection on the index-to-value function. Negatives are handled by the range check; the single missing number has simpler alternatives but cyclic sort still works.
- q: >-
    The values are in 0..n and the array has length n. Where should value n go during cyclic sort?
  options: ["Index n - 1", "Index 0", "Nowhere; it has no valid home and is skipped", "Index n, after growing the array"]
  answer: 2
  explanation: >-
    With homes at index equals value, the array only has indices 0..n-1, so n has no slot. Skip it. After sorting, the first index whose value does not match is the missing number; if all match, n itself is the answer.
- q: >-
    An interviewer asks for the single missing number in 0..n and forbids extra space. You propose cyclic sort. What is the strongest objection?
  options: ["Cyclic sort is O(n log n) here", "The XOR or Gauss-sum approach does the same job without mutating the input and in fewer lines", "Cyclic sort cannot handle the value n", "Cyclic sort requires the values to be distinct"]
  answer: 1
  explanation: >-
    For a single missing number with no duplicates, XOR over the range and the array cancels every present value and leaves the missing one, in O(n) time, O(1) space, and no mutation. Cyclic sort is correct but heavier; reserve it for the follow-ups that break the arithmetic tricks.
```
