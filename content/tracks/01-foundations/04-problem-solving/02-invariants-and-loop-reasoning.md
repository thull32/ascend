---
slug: invariants-and-loop-reasoning
title: "Invariants and loop reasoning: knowing your code is right before you run it"
description: Loop invariants, preconditions and postconditions as a working tool, used to prove two-pointer pair-sum and binary search correct and to find the off-by-one before the test suite does.
minutes: 45
difficulty: easy
tags: [correctness, invariants, two-pointers, binary-search, proofs]
problems: [two-sum-sorted, binary-search-basic, first-bad-version]
---
Every engineer has written a binary search that was off by one. Usually the fix is a sequence of guesses: change `<` to `<=`, run the tests, change `mid` to `mid + 1`, run the tests, and eventually the tests pass and nobody is sure why. That is not a process that works on a whiteboard, where there are no tests, or in a production incident, where the bug only appears at `n = 2³¹ − 1`.

There is a better tool, and it is not "be more careful". It is a single sentence, written before the loop, that says what is true every time the loop condition is checked. That sentence is a **loop invariant**, and once you have it, the loop's correctness stops being a matter of faith: initialisation, each iteration, and termination each become a small claim you can check in your head. Senior interviewers listen for this. The candidate who says "the invariant here is that the answer, if it exists, is inside `[lo, hi]`" has told them more than ten minutes of debugging would.

## Pre, post, and the thing in between

Three sentences describe a piece of code:

- **Precondition**: what must be true of the inputs when the code starts. "`nums` is sorted ascending." Violate it and the code is allowed to do anything.
- **Postcondition**: what the code promises about its output when it ends. "Returns `[i, j]` with `i < j` and `nums[i] + nums[j] == target`, or `[-1, -1]` if no such pair exists."
- **Loop invariant**: a statement about the loop's variables that is true before the first iteration and stays true after every iteration. It is the bridge between the precondition and the postcondition: it holds when the loop starts, the loop body keeps it true, and when the loop exits, the invariant plus the exit condition gives you the postcondition.

That last sentence is the whole method. Proving a loop correct is three checks:

1. **Initialisation**: the invariant holds before the loop's first check.
2. **Maintenance**: if it holds at the start of an iteration, the body keeps it true at the end.
3. **Termination**: the loop stops (some quantity strictly decreases and is bounded), and *invariant + exit condition* implies the postcondition.

Nothing here requires a proof assistant or notation. It requires writing the invariant down as a precise sentence. Vague invariants ("`lo` and `hi` bracket the answer") are where off-by-ones hide; precise ones ("every index below `lo` has been ruled out, every index above `hi` has been ruled out") expose them.

## Worked proof 1: pair sum in a sorted array

> Given an array `nums` sorted in ascending order and an integer `target`, return the indices of two distinct elements that sum to `target`, or `[-1, -1]`.

The classic solution puts one pointer at each end and moves them inwards.

```python
def pair_sum_sorted(nums: list[int], target: int) -> list[int]:
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        s = nums[lo] + nums[hi]
        if s == target:
            return [lo, hi]
        if s < target:
            lo += 1
        else:
            hi -= 1
    return [-1, -1]
```

Ask a mid-level engineer why this is correct and the answer is typically "because it's sorted, so you move the pointer that helps". That is the right intuition, but it is not an argument, and it does not tell you whether `lo < hi` or `lo <= hi` is the right condition. Here is the argument.

**Invariant.** *If any valid pair exists, then some valid pair `(i, j)` satisfies `lo ≤ i < j ≤ hi`.* In other words, the pointers never discard an index that could still be part of an answer.

**Initialisation.** `lo = 0`, `hi = n − 1`. Every index is inside `[lo, hi]`, so any valid pair is inside. Trivially true.

**Maintenance.** Suppose the invariant holds at the top of an iteration and `nums[lo] + nums[hi] < target`. The body does `lo += 1`, discarding index `lo`. Could `lo` be part of a valid pair? Its partner `j` would need `nums[lo] + nums[j] == target`, and `j ≤ hi` by the invariant. But the array is sorted, so `nums[j] ≤ nums[hi]`, which gives `nums[lo] + nums[j] ≤ nums[lo] + nums[hi] < target`. No partner within range works, so index `lo` cannot be in any valid pair inside `[lo, hi]`, and discarding it keeps the invariant true. The `s > target` case is symmetric: `nums[hi]` plus anything at or above `lo` is at least `nums[lo] + nums[hi] > target`. The `s == target` case returns, and the returned pair is valid by direct check.

**Termination.** Each iteration that does not return shrinks `hi − lo` by exactly 1, and the loop stops when `hi − lo ≤ 0`. So it runs at most `n − 1` iterations. When it exits with `lo >= hi`, the range `[lo, hi]` contains fewer than two distinct indices, so no pair `(i, j)` with `lo ≤ i < j ≤ hi` exists. The invariant then says no valid pair exists at all, and `[-1, -1]` is the correct postcondition.

That last step answers the loop-condition question. The condition is `lo < hi` because a pair needs two distinct indices; `lo <= hi` would compare `nums[lo]` with itself, which is exactly the "use the same element twice" bug from [Two Sum](/practice/two-sum).

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 2, 4, 7, 11, 15], "target": 15, "title": "Two pointers on a sorted array", "caption": "Every move discards an index that provably cannot be in any remaining valid pair."}
```

Trace it by hand: `lo=0, hi=5`, `1+15=16 > 15`, `hi=4`. `1+11=12 < 15`, `lo=1`. `2+11=13 < 15`, `lo=2`. `4+11=15`, return `[2, 4]`. Three discards, each justified by the sortedness argument.

## Worked proof 2: binary search for the first true

Most binary search bugs come from searching for a *value* when the problem is really about a *boundary*. The cleanest form of binary search takes a predicate that is `false` for a prefix of the indices and `true` for the rest, and finds where the switch happens. "First bad version", "first element ≥ x", "smallest capacity that ships in time" are all this problem. See [Binary search](/learn/algorithms/sorting-searching/binary-search) for the value-search variants; they all reduce to this one.

> Given a boolean array `flags` of the form `[false, ..., false, true, ..., true]` (possibly all false or all true), return the index of the first `true`, or `len(flags)` if there is none.

```python
def first_true(flags: list[bool]) -> int:
    lo, hi = 0, len(flags)          # note: hi is len, not len - 1
    while lo < hi:
        mid = lo + (hi - lo) // 2
        if flags[mid]:
            hi = mid                # mid could be the answer; keep it
        else:
            lo = mid + 1            # mid is false; answer is strictly after
    return lo
```

**Invariant.** *Every index `< lo` is false, and every index `≥ hi` is true.* The unknown region is exactly `[lo, hi)`, a half-open interval.

**Initialisation.** `lo = 0`: there are no indices below 0, so "all false" holds vacuously. `hi = n`: there are no indices at or above `n`, so "all true" holds vacuously. This is why `hi` starts at `n` and not `n − 1`: the invariant needs `hi` to be the first index *known* to be true, and before looking at anything, the only such index is the imaginary one past the end. That choice is also what makes "no true at all" return `n` for free.

**Maintenance.** If `flags[mid]` is true, then by the monotone shape every index from `mid` onward is true, so setting `hi = mid` keeps "everything ≥ hi is true". If `flags[mid]` is false, every index up to `mid` is false, so `lo = mid + 1` keeps "everything < lo is false". Note the asymmetry: `hi = mid` keeps `mid` because it might be the answer; `lo = mid + 1` excludes `mid` because it is definitely not.

**Termination.** With `lo < hi`, `mid = lo + (hi - lo) // 2` satisfies `lo ≤ mid < hi`. Then `hi = mid` strictly decreases `hi`, and `lo = mid + 1` strictly increases `lo`. The width `hi − lo` shrinks every iteration and is at least 0, so the loop ends. At exit `lo == hi`: everything below `lo` is false, everything at or above `lo` is true, so `lo` is exactly the first true index. Postcondition met, including the all-false case where `lo` climbs to `n`.

That termination argument is also where the infinite-loop bug lives. If you write `mid = (lo + hi + 1) // 2` or use `lo = mid` in the false branch, there is a state (`hi = lo + 1`) where the range does not shrink and the loop spins forever. Checking "does the range strictly shrink in every branch?" takes ten seconds and catches it.

```viz
{"type": "array", "algorithm": "binary-search-first-true", "values": [0, 0, 0, 1, 1, 1], "title": "Binary search for the first true", "caption": "The half-open range [lo, hi) is the unknown region; it halves every step and the answer is lo at exit."}
```

## Invariants as a design tool, not just a proof tool

The proofs above were written after the code. In practice the invariant comes first and generates the code.

Take the first-true search. Once you have committed to "everything `< lo` is false, everything `≥ hi` is true", the code writes itself: the loop runs while the unknown region is non-empty (`lo < hi`); you probe the middle; a true probe moves `hi` to it (inclusive, since it might be first); a false probe moves `lo` past it. There are no decisions left to guess at. The two other common bracketing conventions, closed `[lo, hi]` with `while lo <= hi` and the "answer so far" variable, are equally valid but require their own invariants, and mixing conventions within one function is the usual source of the off-by-one.

The same happens with the sorted pair sum. Commit to "no discarded index can be in a remaining valid pair" and the pointer moves are forced.

Using invariants this way has a side effect on how you narrate in an interview. Instead of "let me try `lo <= hi`... hmm, let me try `lo < hi`", you say "the unknown region is `[lo, hi)`, so I loop while it's non-empty". The interviewer hears an engineer who can reason about code, not one who runs it until it works.

## Invariants in everyday code

Not every loop deserves a formal proof, but nearly every non-trivial loop has an invariant, and naming it in a comment is the cheapest documentation you will ever write.

```python
# invariant: total == sum(prices[:i]) and best == max profit using prices[:i]
```

```go
// invariant: buf[:n] holds bytes read so far; buf[n:] is free
```

Other places the idea shows up under different names:

- **Data structure invariants.** A binary heap's invariant is "every parent ≤ its children"; every operation temporarily breaks it and then restores it by sifting. A sorted container's invariant is sortedness. When you debug a corrupted structure, the first question is which operation broke which invariant.
- **Class invariants.** `Account.balance >= 0`, enforced by every method. Violations are usually a missing lock.
- **Distributed invariants.** "Every committed write is on a majority of replicas." Consensus protocols are elaborate maintenance arguments for that one sentence.
- **Assertions.** `assert lo <= hi` is the invariant made executable. In hot loops you strip them in production; in everything else, leave them in.

## Two-pointer and window code in general

The pair-sum proof generalises. Any two-pointer or sliding-window algorithm is correct because of a discard argument: *whenever a pointer moves, the positions it skips over cannot contribute to a better answer.* When you write such an algorithm, state that argument for each pointer move. If you cannot, the algorithm is probably wrong, and the counterexample is usually a case where the skipped position *could* have contributed.

For example, container-with-most-water moves the pointer at the shorter line. Why is that safe? Because keeping the shorter line and moving the other pointer inward can only shrink the width without ever raising the limiting height. State it once and the code needs no debugging.

## Exercises

```exercise
id: pair-sum-sorted
title: Pair sum in a sorted array with two pointers
prompt: |
  `nums` is sorted ascending. Return `[i, j]` with `i < j` and
  `nums[i] + nums[j] == target`, or `[-1, -1]` if no such pair exists.
  Each test has at most one valid pair. Use the two-pointer method and
  make sure your loop condition matches the invariant from the lesson.
languages: [python, javascript]
entry: pair_sum_sorted
starter:
  python: |
    def pair_sum_sorted(nums, target):
        # your code here
        return [-1, -1]
  javascript: |
    function pair_sum_sorted(nums, target) {
      // your code here
      return [-1, -1];
    }
tests:
  - args: [[1, 2, 4, 7, 11, 15], 15]
    expected: [2, 4]
  - args: [[2, 7, 11, 15], 9]
    expected: [0, 1]
  - args: [[1, 3, 5], 100]
    expected: [-1, -1]
    label: no pair
  - args: [[], 5]
    expected: [-1, -1]
    label: empty input
  - args: [[3, 3], 6]
    expected: [0, 1]
    label: equal values at different indices
  - args: [[1, 2, 3, 4], 8]
    expected: [-1, -1]
    label: an element may not pair with itself
  - args: [[-5, -2, 0, 4, 9], 2]
    expected: [1, 3]
    hidden: true
  - args: [[5], 10]
    expected: [-1, -1]
    hidden: true
hints:
  - "Start with `lo = 0` and `hi = len(nums) - 1` and loop while `lo < hi` (two distinct indices are needed)."
  - "If the sum is too small, only `lo += 1` can help; if too large, only `hi -= 1` can."
```

```exercise
id: first-true
title: Binary search for the first true
prompt: |
  `flags` is a list of 0s and 1s of the form `[0, ..., 0, 1, ..., 1]`
  (all zeros or all ones are possible). Return the index of the first 1,
  or `len(flags)` if there is none. Use O(log n) comparisons and a
  half-open range `[lo, hi)` with `hi` starting at `len(flags)`.
languages: [python, javascript]
entry: first_true
starter:
  python: |
    def first_true(flags):
        # your code here
        return len(flags)
  javascript: |
    function first_true(flags) {
      // your code here
      return flags.length;
    }
tests:
  - args: [[0, 0, 0, 1, 1, 1]]
    expected: 3
  - args: [[1, 1, 1]]
    expected: 0
    label: all true
  - args: [[0, 0, 0]]
    expected: 3
    label: no true, answer is the length
  - args: [[]]
    expected: 0
    label: empty input
  - args: [[0, 1]]
    expected: 1
  - args: [[0, 0, 0, 0, 0, 0, 0, 1]]
    expected: 7
    hidden: true
hints:
  - "Invariant: every index below `lo` is 0, every index at or above `hi` is 1."
  - "If `flags[mid]` is 1 set `hi = mid` (keep it); otherwise set `lo = mid + 1` (exclude it)."
  - "Return `lo` when `lo == hi`."
```

## Senior signals

- You state the loop invariant as a precise sentence before writing the loop, and you derive the loop condition and pointer updates from it rather than guessing.
- You can justify every discard in a two-pointer or sliding-window algorithm: "skipping this index is safe because…".
- You check termination explicitly: which quantity strictly decreases in every branch, and what happens at width 1.
- You choose one bracketing convention (half-open `[lo, hi)` is the safest) and use it consistently across all your binary searches.
- You reach for binary search on a monotone predicate, not on a value, and you can say what makes the predicate monotone in this problem.
- In design reviews you ask "what is the invariant this lock/transaction/protocol protects?" before asking how it is implemented.

## Check yourself

```quiz
- q: >-
    In the two-pointer pair sum, why is the loop condition `lo < hi` rather than `lo <= hi`?
  options: ["Both are correct; it is a style choice", "A valid pair needs two distinct indices, and at lo == hi the range holds only one", "`lo <= hi` would run forever", "`lo < hi` is one iteration faster"]
  answer: 1
  explanation: >-
    The postcondition requires i < j. When lo == hi the loop would compare an element with itself and could wrongly return [k, k]. The invariant plus exit condition lo >= hi is exactly what proves no pair remains.
- q: >-
    For the first-true binary search with the invariant "all indices below lo are false, all at or above hi are true", why does `hi` start at `len(flags)` and not `len(flags) - 1`?
  options: ["To avoid an index-out-of-range error", "Because before any probe the only index known to be true is the imaginary one past the end, and this also makes the all-false case return len(flags)", "Because Python ranges are half-open", "It is arbitrary; either works"]
  answer: 1
  explanation: >-
    Starting hi at len - 1 would assert that the last element is true before checking it, which breaks the invariant when the array is all false. Starting at len keeps the invariant vacuously true and yields the correct sentinel answer.
- q: >-
    You write a binary search with `mid = (lo + hi) // 2` and in one branch set `lo = mid`. What is the most likely consequence?
  options: ["It returns the wrong index by one", "It loops forever when hi == lo + 1, because mid == lo and the range does not shrink", "It raises an index error", "Nothing; this is the standard form"]
  answer: 1
  explanation: >-
    With hi = lo + 1, mid rounds down to lo, so lo = mid leaves the range unchanged. The termination check (does every branch strictly shrink the range?) catches this before any test does. Use lo = mid + 1, or round mid up if the branch must keep mid.
- q: >-
    Which statement is a useful loop invariant for the pair-sum algorithm?
  options: ["lo and hi are valid indices", "nums is sorted", "If a valid pair exists, one lies within [lo, hi]", "nums[lo] + nums[hi] is close to target"]
  answer: 2
  explanation: >-
    An invariant must connect the loop state to the postcondition. "Sorted" is the precondition and "valid indices" is true but proves nothing about the answer. The third option is what lets you conclude, at exit, that no pair exists.
- q: >-
    An interviewer asks why moving the pointer at the shorter line is safe in container-with-most-water. The senior-level answer is:
  options: ["It is the well-known solution", "Because keeping the shorter line, any inward move of the other pointer shrinks the width without raising the limiting height, so those configurations can never beat the current one", "Because the taller line always gives more area", "Because the array is sorted"]
  answer: 1
  explanation: >-
    That is the discard argument: every configuration skipped by the move is provably no better than one already considered. The array is not sorted, and "well known" is not a reason.
```
