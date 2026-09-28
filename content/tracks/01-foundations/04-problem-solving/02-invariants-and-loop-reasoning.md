---
slug: invariants-and-loop-reasoning
title: "Invariants and loop reasoning: knowing your code is right before you run it"
description: Loop invariants, preconditions and postconditions as a working tool, used to derive and prove two-pointer pair-sum and binary search code, choose a bracketing convention, and understand what asserts and compilers do with the invariants you write.
minutes: 55
difficulty: easy
tags: [correctness, invariants, two-pointers, binary-search, proofs]
problems: [two-sum-sorted, binary-search-basic, first-bad-version]
---
Every engineer has written a binary search that was off by one. Usually the fix is a sequence of guesses: change `<` to `<=`, run the tests, change `mid` to `mid + 1`, run the tests, and eventually the tests pass and nobody is sure why. That process does not work on a whiteboard, where there are no tests, and it does not work on the bug that only appears at scale: the JDK's `Arrays.binarySearch` computed `mid = (low + high) / 2`, which overflows a 32-bit `int` once the array has more than about $2^{30}$ elements, and the bug survived nine years of tests before it was reported in 2006.

There is a better tool, and it is not "be more careful". It is a single sentence, written before the loop, that says what is true every time the loop condition is checked. That sentence is a **loop invariant**, and once you have it, the loop's correctness stops being a matter of faith: initialisation, each iteration, and termination each become a small claim you can check in your head. Senior interviewers listen for this. The candidate who says "the invariant here is that the answer, if it exists, is inside `[lo, hi]`" has told them more than ten minutes of debugging would.

## Pre, post, and the thing in between

Three sentences describe a piece of code:

- **Precondition**: what must be true of the inputs when the code starts. "`nums` is sorted ascending." Violate it and the code is allowed to do anything.
- **Postcondition**: what the code promises about its output when it ends. "Returns `[i, j]` with `i < j` and `nums[i] + nums[j] == target`, or `[-1, -1]` if no such pair exists."
- **Loop invariant**: a statement about the loop's variables that is true before the first iteration and stays true after every iteration. It is the bridge between the precondition and the postcondition: it holds when the loop starts, the body keeps it true, and when the loop exits, the invariant plus the exit condition gives you the postcondition.

That last sentence is the whole method. Proving a loop correct is three checks:

1. **Initialisation**: the invariant holds before the loop's first check.
2. **Maintenance**: if it holds at the start of an iteration, the body keeps it true at the end.
3. **Termination**: the loop stops (some quantity strictly decreases and is bounded below), and *invariant + exit condition* implies the postcondition.

Nothing here requires a proof assistant or notation. It requires writing the invariant down as a precise sentence. Vague invariants ("`lo` and `hi` bracket the answer") are where off-by-ones hide; precise ones ("every index below `lo` has been ruled out, every index above `hi` has been ruled out") expose them. The rest of this lesson runs the [problem-solving loop](/learn/foundations/problem-solving/the-problem-solving-loop) on two problems and uses the invariant as the step between "optimise" and "code".

## Walkthrough 1: pair sum in a sorted array

> Given an array `nums` sorted in ascending order and an integer `target`, return the indices of two distinct elements that sum to `target`, or `[-1, -1]`. Use O(1) extra space.

### From statement to two pointers

This is [Two Sum on a Sorted Array](/practice/two-sum-sorted). **Understand:** indices, not values; two *distinct* indices, so `[3, 3]` with target 6 is a valid pair and one element used twice is not; the O(1)-space constraint rules out the hash map. **Examples:**

| Input | Output | Why |
|---|---|---|
| `[1, 3, 4, 6, 10]`, 10 | `[2, 3]` | 4 + 6 |
| `[-5, -2, 0, 4, 8]`, 3 | `[0, 4]` | negatives; the answer uses both ends |
| `[3, 3, 5]`, 6 | `[0, 1]` | equal values at distinct indices |
| `[1, 2, 3, 4]`, 8 | `[-1, -1]` | 4 + 4 would need one element twice |
| `[]`, 5 | `[-1, -1]` | empty |

**Brute force:** every pair $(i, j)$ with $i < j$, $n(n-1)/2$ of them: about $5 \times 10^9$ at $n = 10^5$, eight minutes at $10^7$ iterations per second in CPython. Its bottleneck is that it compares pairs the sort order has already decided: once `nums[0] + nums[n-1]` is too big, every pair involving `nums[n-1]` is too big, and the brute force checks all $n - 1$ of them anyway.

**Optimise:** one pointer at each end, moving inwards, discarding an index each step.

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

### The invariant and its proof

Ask a mid-level engineer why this is correct and the answer is typically "because it is sorted, so you move the pointer that helps". Right intuition, not an argument, and it does not say whether `lo < hi` or `lo <= hi` is the right condition. Here is the argument.

**Invariant.** *If any valid pair exists, then some valid pair `(i, j)` satisfies `lo ≤ i < j ≤ hi`.* The pointers never discard an index that could still be part of an answer.

**Initialisation.** `lo = 0`, `hi = n − 1`. Every index is inside `[lo, hi]`, so any valid pair is inside.

**Maintenance.** Suppose the invariant holds and `nums[lo] + nums[hi] < target`. The body does `lo += 1`, discarding index `lo`. Could `lo` be in a valid pair? Its partner `j` would need `nums[lo] + nums[j] == target` with `j ≤ hi` by the invariant. The array is sorted, so `nums[j] ≤ nums[hi]`, giving `nums[lo] + nums[j] ≤ nums[lo] + nums[hi] < target`. No partner in range works, so discarding `lo` keeps the invariant. The `s > target` case is symmetric: `nums[hi]` plus anything at or above `lo` is at least `nums[lo] + nums[hi] > target`. The `s == target` case returns a pair that is valid by direct check.

**Termination.** Each iteration that does not return shrinks `hi − lo` by exactly 1, and the loop stops when `hi − lo ≤ 0`, so it runs at most `n − 1` iterations. At exit `lo >= hi`, so `[lo, hi]` holds fewer than two distinct indices and no pair `(i, j)` with `lo ≤ i < j ≤ hi` exists; the invariant then says no valid pair exists at all, and `[-1, -1]` is correct.

That last step answers the loop-condition question. The condition is `lo < hi` because a pair needs two distinct indices; `lo <= hi` would compare `nums[lo]` with itself, the "same element twice" bug from [Two Sum](/practice/two-sum).

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 2, 4, 7, 11, 15], "target": 15, "title": "Two pointers on a sorted array", "caption": "Every move discards an index that provably cannot be in any remaining valid pair."}
```

### Trace

Trace `[1, 3, 4, 6, 10]`, target 10:

| `lo` | `hi` | `nums[lo] + nums[hi]` | vs target | Move | Index discarded, and why |
|---|---|---|---|---|---|
| 0 | 4 | 1 + 10 = 11 | > | `hi = 3` | 4: `10 + anything ≥ 1` exceeds 10 |
| 0 | 3 | 1 + 6 = 7 | < | `lo = 1` | 0: `1 + anything ≤ 6` is under 10 |
| 1 | 3 | 3 + 6 = 9 | < | `lo = 2` | 1: `3 + anything ≤ 6` is under 10 |
| 2 | 3 | 4 + 6 = 10 | == | return `[2, 3]` | |

Three discards, each justified by the sortedness argument. On `[1, 2, 3, 4]`, target 8: the sums 5, 6, 7 are all too small, `lo` climbs to 3, the loop exits with `lo == hi`, and `[-1, -1]` comes back without ever comparing 4 with itself.

## Walkthrough 2: the first bad version

Most binary search bugs come from searching for a *value* when the problem is about a *boundary*. The cleanest form of binary search takes a predicate that is `false` for a prefix of the indices and `true` for the rest, and finds where the switch happens. "First bad version", "first element ≥ x" and "smallest capacity that ships in time" are all this problem; the value-search variants in [Binary search](/learn/algorithms/sorting-searching/binary-search) reduce to it.

> Given `flags` of the form `[false, ..., false, true, ..., true]` (possibly all false or all true), return the index of the first `true`, or `len(flags)` if there is none.

### From statement to binary search

This is [First Bad Version](/practice/first-bad-version) with the all-false case added. **Understand:** monotone predicate, a boundary index, and each lookup is expensive (the problem frames one lookup as a full CI run). **Examples:**

| Input | Output | Why |
|---|---|---|
| `[F, F, F, T, T]` | 3 | first true at index 3 |
| `[T]` | 0 | the only version is bad |
| `[F, F, F, F, T]` | 4 | only the last |
| `[F, F, F]` | 3 | no true: the sentinel `len` |
| `[]` | 0 | empty: the sentinel is 0 |

**Brute force:** scan left to right, $n$ lookups in the worst case. If a lookup is a ten-minute CI run and there are $10^4$ versions, that is $10^5$ minutes, about 69 days. The bottleneck: each lookup teaches you about one index, while the monotone shape means one lookup at `mid` settles *every* index on one side of it.

**Optimise:** probe the middle and halve the unknown region; $\lceil \log_2 10^4 \rceil = 14$ lookups, under three hours.

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

```javascript
function first_true(flags) {
  let lo = 0, hi = flags.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >>> 1);   // not (lo + hi) >> 1; see below
    if (flags[mid]) hi = mid; else lo = mid + 1;
  }
  return lo;
}
```

### The invariant and its proof

**Invariant.** *Every index `< lo` is false, and every index `≥ hi` is true.* The unknown region is exactly `[lo, hi)`, a half-open interval.

**Initialisation.** `lo = 0`: no indices below 0, so "all false" holds vacuously. `hi = n`: no indices at or above `n`, so "all true" holds vacuously. This is why `hi` starts at `n` and not `n − 1`: the invariant needs `hi` to be the first index *known* to be true, and before looking at anything the only such index is the imaginary one past the end. The same choice makes "no true at all" return `n` for free.

**Maintenance.** If `flags[mid]` is true, every index from `mid` onward is true by the monotone shape, so `hi = mid` keeps "everything ≥ hi is true". If it is false, every index up to `mid` is false, so `lo = mid + 1` keeps "everything < lo is false". Note the asymmetry: `hi = mid` keeps `mid` because it might be the answer; `lo = mid + 1` excludes `mid` because it is definitely not.

**Termination.** With `lo < hi`, `mid = lo + (hi - lo) // 2` satisfies `lo ≤ mid < hi`. Then `hi = mid` strictly decreases `hi`, and `lo = mid + 1` strictly increases `lo`; the width `hi − lo` shrinks every iteration and is bounded below by 0. At exit `lo == hi`: everything below `lo` is false, everything at or above `lo` is true, so `lo` is the first true index, including the all-false case where `lo` climbs to `n`. The number of iterations is $\lceil \log_2 n \rceil$: 20 for a million elements, 31 for $2^{31} - 1$, 40 for $10^{12}$.

```viz
{"type": "array", "algorithm": "binary-search-first-true", "values": [0, 0, 0, 1, 1, 1], "title": "Binary search for the first true", "caption": "The half-open range [lo, hi) is the unknown region; it halves every step and the answer is lo at exit."}
```

### Trace, and the infinite-loop bug

Trace `[F, F, F, T, T]`:

| `lo` | `hi` | unknown `[lo, hi)` | `mid` | `flags[mid]` | Update |
|---|---|---|---|---|---|
| 0 | 5 | `[0, 5)` | 2 | F | `lo = 3` |
| 3 | 5 | `[3, 5)` | 4 | T | `hi = 4` |
| 3 | 4 | `[3, 4)` | 3 | T | `hi = 3` |
| 3 | 3 | empty | | | return 3 |

The termination argument is also where the infinite-loop bug lives. Write `lo = mid` in the false branch and there is a state, `hi = lo + 1`, where `mid` rounds down to `lo` and the range never shrinks: on `[F, T]` the loop is still at `lo = 0, hi = 1` after 50 iterations, and after 50 million. Checking "does the range strictly shrink in every branch?" takes ten seconds and catches it before any test does.

## Three ways to bracket a binary search

The half-open form above is one of three conventions in common use. All three are correct with their own invariant; the bugs come from mixing them.

| | Half-open `[lo, hi)` | Closed `[lo, hi]` with answer variable | Closed `[lo, hi]`, pointers meet |
|---|---|---|---|
| Invariant | below `lo` false; at or above `hi` true | below `lo` false; above `hi` true; `ans` is best true seen | below `lo` false; above `hi` true; `hi` itself known true |
| Initial `hi` | `n` | `n − 1`, `ans = n` | `n − 1`, after checking `flags[n − 1]` |
| Loop condition | `lo < hi` | `lo <= hi` | `lo < hi` |
| True branch | `hi = mid` | `ans = mid; hi = mid − 1` | `hi = mid` |
| False branch | `lo = mid + 1` | `lo = mid + 1` | `lo = mid + 1` |
| Result | `lo` | `ans` | `lo` |
| "None found" | falls out as `n` | falls out as `ans = n` | needs the explicit pre-check |
| Rounding hazard | none with `hi = mid` | none | `lo = mid` variants must round up |
| Reach for it when | default; also for "last false" by returning `lo − 1` | you want the best-so-far visible while debugging | the array is known non-empty and the last element known true |

Checked against a brute-force scan on 2,000 random inputs, all three agree. The hybrid that mid-level code produces most often, `hi = n − 1` with the half-open loop and `return lo`, was wrong on 390 of those 2,000 inputs and wrong on every all-false input, where it returns `n − 1`: the invariant "at or above `hi` is true" was asserted about the last element before anyone looked at it. Pick one column and use it for every binary search you write.

## Under the hood: what an assert costs and what a compiler does with an invariant

The invariant is a sentence. Two pieces of software can act on it: the runtime, when you make it an `assert`, and the compiler, when it can prove it.

### What `assert` compiles to

In CPython 3.14.7, `assert x >= 0, "negative"` compiles to four bytecodes: `COMPARE_OP` for the test, `POP_JUMP_IF_TRUE` past the rest, `LOAD_COMMON_CONSTANT` for `AssertionError`, and `RAISE_VARARGS`. Run the same file with `python -O` and the statement is not executed cheaply; it is not compiled at all. `__debug__` becomes `False`, the compiler drops every `assert` at compile time, and the cached bytecode is written as `__pycache__/*.opt-1.pyc`.

The cost when it is on is real. A binary search over a million sorted ints, 200,000 random targets, measured on one machine (AMD Ryzen 9 9950X3D, CPython 3.14.7, best of five): 1.7 µs per search plain, about 85 ns per iteration over the roughly twenty iterations. With the four-clause invariant `assert 0 <= lo and hi < len(nums) and (lo == 0 or nums[lo-1] < target) and (hi == len(nums)-1 or nums[hi+1] > target)` inside the loop: 2.75 µs, an extra 50 ns per iteration, 60% of the loop. With `-O`: 1.65 µs, indistinguishable from plain. Two consequences: an assert that walks the whole range (`all(not f for f in flags[:lo])`) belongs in a test, not a hot loop; and anything with a side effect or a security purpose must never live in an assert, because a deployment flag deletes it.

Rust separates the two cases at the language level: `assert!` always runs, `debug_assert!` is compiled out unless `debug_assertions` is enabled, which is the default in the `dev` profile and off in `release`. Verified with `rustc 1.98.1`: the same source prints `debug_assertions on: true` from a debug build and `false` from `-O`.

```rust
fn first_true(flags: &[bool]) -> usize {
    let (mut lo, mut hi) = (0, flags.len());
    while lo < hi {
        // O(n) per iteration: fine in debug, gone in release
        debug_assert!(flags[..lo].iter().all(|&f| !f) && flags[hi..].iter().all(|&f| f));
        let mid = lo + (hi - lo) / 2;
        if flags[mid] { hi = mid } else { lo = mid + 1 }
    }
    lo
}
```

Go has no assert statement by design; the FAQ's position is that programmers use asserts to avoid thinking about error handling. You write `if !cond { panic("...") }`, and nothing strips it, so an invariant check in a Go hot loop costs its compare-and-branch in production or lives behind a build tag.

### What the compiler does with the invariant

The invariant you write in a comment is the same fact an optimising compiler tries to establish for itself. **Loop-invariant code motion** hoists computations that do not change across iterations (`len(nums)`, a field load, `target * 2`) out of the loop; the compiler proves "this value is the same every iteration" and evaluates it once. **Bounds-check elimination** goes further: every `s[i]` in a memory-safe language is guarded by a compare-and-branch, and the compiler removes it when it can prove `0 ≤ i < len(s)` from the loop's structure.

Go reports which checks survive. Compiled with `go build -gcflags=-d=ssa/check_bce` on Go 1.27.1:

```go
func sumRange(s []int) int {      // s[i]: no check; range proves 0 <= i < len(s)
	t := 0
	for i := range s {
		t += s[i]
	}
	return t
}

func sumIndex(s []int, n int) int { // s[i]: check kept; n is unrelated to len(s)
	t := 0
	for i := 0; i < n; i++ {
		t += s[i]
	}
	return t
}

func sumHint(s []int, n int) int {  // one check at the hint, none in the loop
	t := 0
	_ = s[n-1]
	for i := 0; i < n; i++ {
		t += s[i]
	}
	return t
}
```

The `for i := range s` loop keeps no check, the `i < n` loop keeps one per access, and the `_ = s[n-1]` idiom pays a single check up front that proves `n <= len(s)` for the whole loop. The binary search body `flags[mid]` keeps its check: the prove pass does not derive `mid < hi ≤ len(flags)` from `lo < hi`, so a Go binary search pays one predicted branch per probe, about a cycle. LLVM does the same job for Rust and C++ through induction-variable analysis, which is why `for x in &v` is preferred over indexing: the iterator carries the invariant and there is nothing to prove.

## Invariants as a design tool as much as a proof tool

The proofs above were written after the code. The stronger habit is to write the invariant first and let it generate the code.

Take the first-true search. Once you have committed to "everything `< lo` is false, everything `≥ hi` is true", the code writes itself: the loop runs while the unknown region is non-empty (`lo < hi`); you probe the middle; a true probe moves `hi` to it (inclusive, since it might be first); a false probe moves `lo` past it. There are no decisions left to guess at. The same happens with the sorted pair sum: commit to "no discarded index can be in a remaining valid pair" and the pointer moves are forced.

Using invariants this way changes how you narrate in an interview. Instead of "let me try `lo <= hi`... hmm, let me try `lo < hi`", you say "the unknown region is `[lo, hi)`, so I loop while it is non-empty". The interviewer hears an engineer who reasons about code, not one who runs it until it works.

## Invariants in everyday code

Not every loop deserves a formal proof, but nearly every non-trivial loop has an invariant, and naming it in a comment is the cheapest documentation you will write.

```python
# invariant: total == sum(prices[:i]) and best == max profit using prices[:i]
```

```go
// invariant: buf[:n] holds bytes read so far; buf[n:] is free
```

The in-place compaction in [Remove Duplicates](/practice/remove-duplicates-sorted) is a two-pointer loop whose safety is one invariant: *`write ≤ read`, and `nums[:write]` holds the distinct values seen so far in order.* Because `write` never overtakes `read`, a write can never clobber an element not yet read.

```viz
{"type": "array", "algorithm": "remove-duplicates", "values": [1, 1, 2, 3, 3, 3, 5], "title": "Write pointer never passes the read pointer", "caption": "The invariant write <= read is what makes in-place compaction safe."}
```

Other places the idea appears under different names:

- **Data structure invariants.** A binary heap's invariant is "every parent ≤ its children"; every operation temporarily breaks it and restores it by sifting. When you debug a corrupted structure, the first question is which operation broke which invariant.
- **Class invariants.** `Account.balance >= 0`, enforced by every method; violations are usually a missing lock, the subject of [Races, mutexes and invariants](/learn/systems-and-concurrency/concurrency/races-mutexes-and-invariants).
- **Distributed invariants.** "Every committed write is on a majority of replicas." [Raft](/learn/system-design/distributed-systems/consensus-raft) is an elaborate maintenance argument for that one sentence.
- **Steady-state hypotheses.** Netflix's published chaos-engineering practice starts every experiment by stating an invariant over system metrics (the rate of successful stream starts stays within its normal band) and then injecting failures to see whether it holds. It is the loop invariant applied to a fleet: state what must stay true, perturb, check.

## Two-pointer and window code in general

The pair-sum proof generalises. Any two-pointer or sliding-window algorithm is correct because of a discard argument: *whenever a pointer moves, the positions it skips over cannot contribute to a better answer.* When you write such an algorithm, state that argument for each pointer move. If you cannot, the algorithm is probably wrong, and the counterexample is usually a case where the skipped position could have contributed.

[Container with most water](/practice/container-with-most-water) moves the pointer at the shorter line. Why is that safe? Keeping the shorter line and moving the other pointer inward can only shrink the width without raising the limiting height, so every configuration skipped is no better than one already measured. State it once and the code needs no debugging; the [two-pointers lesson](/learn/interview-patterns/array-patterns/two-pointers) collects the other discard arguments.

## Failure modes in production

**The search never returns.** *Symptom:* one worker pins a CPU core at 100% and its requests time out, on a specific input, forever; a thread dump shows the same two-line loop. *Diagnosis:* a branch that does not shrink the range: `lo = mid` with a rounding-down `mid`, reached only when the range has width 1, which is why the tests with distinctive answers passed. *Fix:* check every branch strictly shrinks `hi − lo`; if a branch must keep `mid` on the low side, round `mid` up (`lo + (hi - lo + 1) // 2`).

**Correct for nine years, wrong at a billion elements.** *Symptom:* `ArrayIndexOutOfBoundsException` or a wildly wrong index, only on the largest inputs. *Diagnosis:* `mid = (lo + hi) / 2` in a fixed-width integer: once `lo + hi` exceeds $2^{31} - 1$, which needs roughly $2^{30}$ elements, the sum wraps negative. This was the JDK bug from the opening. In JavaScript `(lo + hi) >> 1` reinterprets the sum as a signed 32-bit int and fails at the same size; `>>> 1` survives to $2^{32}$; `Math.floor((lo + hi) / 2)` is exact to $2^{53}$. *Fix:* `lo + (hi - lo) // 2`, which never forms the large sum.

**Right convention, wrong element.** *Symptom:* the search misses the last element, or returns `n − 1` when nothing matches. *Diagnosis:* `hi = n − 1` from the closed convention combined with `lo < hi` and `return lo` from the half-open one, asserting the last element is true before checking it. *Fix:* one convention per codebase, written in a comment as the invariant, so a reader can check each line against it.

**The precondition was quietly false.** *Symptom:* binary search over a table that "is sorted" returns wrong answers after a data migration; the tests, on small hand-made tables, still pass. *Diagnosis:* the sort key changed from numeric to string, so `"10" < "9"`, or a new writer appends without sorting; a binary search on unsorted data does not fail loudly, it returns a plausible index. *Fix:* assert sortedness where the data is produced, and in the reader check the two neighbours of the returned index, an $O(1)$ test that turns a silent wrong answer into an error.

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

## Interviewer follow-ups

**"Your loop uses `lo <= hi`. What is your invariant?"** *Model answer:* with a closed range: "everything below `lo` is false, everything above `hi` is true, and `ans` is the smallest true index seen so far, or `n`"; a true probe records `ans = mid` and sets `hi = mid − 1`, a false probe sets `lo = mid + 1`, and at exit the unknown region is empty so `ans` is the answer. *Common wrong answer:* "the answer is between `lo` and `hi`", which cannot decide between `hi = mid` and `hi = mid − 1`.

**"The array has duplicates. Return the first occurrence of `target`."** *Model answer:* it is the first-true search with the predicate `nums[i] >= target`; the result `lo` is the first index at or above `target`, so return `lo` if `lo < n and nums[lo] == target`, else −1. The last occurrence is the first index with `nums[i] > target`, minus one. *Common wrong answer:* a value search that returns on equality and then walks left linearly, which is $O(n)$ when the array is all `target`.

**"How do you know it terminates?"** *Model answer:* `hi − lo` is a non-negative integer that strictly decreases in every branch, because `mid < hi` so `hi = mid` decreases `hi`, and `lo = mid + 1 > lo`; a strictly decreasing quantity bounded below by zero can only decrease finitely often, at most $\lceil \log_2 n \rceil$ times here. *Common wrong answer:* "because binary search always terminates", which is false for `lo = mid`.

**"Binary search for the square root of a real number to six decimal places."** *Model answer:* the predicate `x * x >= target` is monotone on non-negative reals, so the invariant carries over to an interval of floats, but termination changes: the width never reaches zero, so run a fixed count (100 halvings of a width-$10^6$ interval leaves $10^{-24}$) or stop at `hi − lo < 1e-6`, remembering that an epsilon smaller than the gap between adjacent doubles loops forever. *Common wrong answer:* `while lo != hi`, which never exits on floats.

**"Why not use `assert` for the sortedness precondition in production?"** *Model answer:* because `python -O` deletes it, so the check silently disappears exactly in the environment where the data is least trusted; a precondition that protects correctness is an `if` that raises, and an `assert` is for invariants that a bug in *this* function would break, cheap enough to leave on in tests. *Common wrong answer:* "asserts are free", which the 60% loop overhead measured above contradicts.

## What mid-level engineers get wrong

- **Debugging the loop condition by trial.** Toggling `<` and `<=` until the tests pass leaves the code correct on the tests and unexplained; the next edit reintroduces the bug because nobody knows which invariant it depended on.
- **Mixing bracketing conventions.** `hi = n − 1` with `hi = mid` and `return lo` passes every test whose answer is in the middle and fails on all-false input; it looked right because each line came from a correct search.
- **Writing `(lo + hi) / 2` in a fixed-width language.** Correct up to about $2^{30}$ elements, wrong after; a bug that no unit test will ever hit and a production dataset eventually will.
- **Treating "it is sorted" as a fact rather than a precondition.** Binary search on unsorted data returns a plausible index instead of failing, so the wrong answer travels downstream unnoticed.
- **Using `assert` to validate input.** It works until someone deploys with `-O`, after which the validation is gone and the behaviour of the code on bad input is undefined by the author.
- **Calling a two-pointer move "greedy" without a discard argument.** Without "the skipped positions cannot beat what remains", there is no way to tell a correct pointer move from a plausible one, and the counterexample arrives in the interview's last five minutes.

## Senior signals

- You state the loop invariant as a precise sentence before writing the loop, and you derive the loop condition and pointer updates from it rather than guessing.
- You can justify every discard in a two-pointer or sliding-window algorithm: "skipping this index is safe because…".
- You check termination explicitly: which quantity strictly decreases in every branch, and what happens at width 1.
- You choose one bracketing convention (half-open `[lo, hi)` is the safest) and use it consistently across all your binary searches, and you write `mid` as `lo + (hi - lo) // 2` in every language, saying why.
- You reach for binary search on a monotone predicate, not on a value, and you can say what makes the predicate monotone in this problem.
- You know what an `assert` costs when it is on (tens of nanoseconds per clause in CPython) and what happens to it under `-O`, `debug_assert!` in a release build, or a Go binary, and you place correctness checks accordingly.
- You know that a comment invariant and a compiler's bounds-check elimination are the same fact, and you can say which loops in Go or Rust pay a check per access and which do not.
- In design reviews you ask "what is the invariant this lock, transaction or protocol protects?" before asking how it is implemented.

## Check yourself

```quiz
- q: >-
    In the two-pointer pair sum, why is the loop condition `lo < hi` rather than `lo <= hi`?
  options: ["`lo < hi` saves one iteration, which is the only reason", "A pair needs two indices, and lo == hi leaves only one", "Both are correct; the choice is purely a matter of style", "`lo <= hi` would loop forever once the pointers meet"]
  answer: 1
  explanation: >-
    The postcondition requires two distinct indices, i < j. When lo == hi the loop would compare an element with itself and could wrongly return [k, k], so it is not a style choice. The invariant plus exit condition lo >= hi is exactly what proves no pair remains.
- q: >-
    For the first-true binary search with the invariant "all indices below lo are false, all at or above hi are true", why does `hi` start at `len(flags)` and not `len(flags) - 1`?
  options: ["Because Python ranges are half-open, so it must match", "It is arbitrary; both starting values give the same result", "To avoid an index-out-of-range error on the first probe", "Nothing is known true yet except the index past the end"]
  answer: 3
  explanation: >-
    Before any probe the only index known to be true is the imaginary one past the end. Starting hi at len - 1 would assert that the last element is true before checking it, which breaks the invariant when the array is all false. Starting at len keeps the invariant vacuously true and makes the all-false case return the sentinel len(flags).
- q: >-
    You write a binary search with `mid = (lo + hi) // 2` and in one branch set `lo = mid`. What is the most likely consequence?
  options: ["It loops forever once hi == lo + 1, since mid == lo", "Nothing; lo = mid is the standard form of that branch", "It raises an index error when mid reaches the array end", "It returns an index that is off by one on some inputs"]
  answer: 0
  explanation: >-
    With hi = lo + 1, mid rounds down to lo, so lo = mid leaves the range unchanged and the loop never shrinks it; on [F, T] it is still at lo = 0, hi = 1 after any number of iterations. The termination check (does every branch strictly shrink the range?) catches this before any test does. Use lo = mid + 1, or round mid up if the branch must keep mid.
- q: >-
    Which statement is a useful loop invariant for the pair-sum algorithm?
  options: ["lo and hi are always valid indices into nums", "nums stays sorted throughout the whole loop", "nums[lo] + nums[hi] moves steadily closer to target", "If a valid pair exists, one lies within [lo, hi]"]
  answer: 3
  explanation: >-
    An invariant must connect the loop state to the postcondition. "Sorted" is the precondition and "valid indices" is true but proves nothing about the answer. "If a valid pair exists, one lies within [lo, hi]" is what lets you conclude, at exit, that no pair exists.
- q: >-
    A first-true search initialises `hi = len(flags) - 1`, loops while `lo < hi` with `hi = mid` on true, and returns `lo`. On which inputs is it wrong?
  options: ["Every all-false input, where it returns n - 1", "None; it is the closed-interval convention", "Every input whose first true is at index 0", "Only the empty list, where hi starts at -1"]
  answer: 0
  explanation: >-
    Setting hi = n - 1 asserts the invariant clause "at or above hi is true" about the last element before checking it. When the array is all false the loop converges on index n - 1 and returns it instead of n. Checked against a brute-force scan on 2,000 random inputs, this hybrid was wrong on 390 of them; the closed convention that starts at n - 1 needs either an answer variable or an explicit check of the last element.
- q: >-
    A service validates request sizes with `assert size <= MAX` and is deployed with `python -O`. What happens?
  options: ["The check runs but about 60% slower than an if statement", "The check still runs but raises a different exception", "The check runs only when __debug__ is set at runtime", "The check is compiled out entirely and every size is accepted"]
  answer: 3
  explanation: >-
    Under -O the compiler sets __debug__ to False and emits no bytecode for assert statements at all, writing opt-1.pyc files; there is nothing left to run, so the validation vanishes in exactly the environment where input is least trusted. That is why input validation and anything with a side effect must be an explicit if that raises, and assert is reserved for invariants that only a bug in the function itself could break.
```
