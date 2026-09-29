---
slug: in-place-techniques
title: In-place techniques
description: The two-pointer, swap-partition (Lomuto, Hoare, Dutch national flag) and reversal tricks that answer "can you do it in O(1) extra space?", each traced step by step with the invariant that makes it correct, and what a swap actually costs.
minutes: 45
difficulty: medium
tags: [arrays, two-pointers, in-place, partition, dutch-national-flag, invariants, quicksort]
problems: [move-zeroes, sort-colors, remove-duplicates-sorted, rotate-image]
---
The interviewer nods at your O(n) solution and says "good; now do it without allocating a second array." Most O(n)-space array solutions become O(1)-space with one of three moves: two pointers that read and write at different speeds, swaps that partition the array into regions, or reversals composed to produce a permutation. Each has an invariant, a small statement about what is true between iterations, and the invariant is what lets you write the loop without guessing.

In-place matters beyond interviews. Sorting 8 GB of records on a 12 GB machine, compacting a buffer in a network stack, and rearranging a 25 MB 4K frame in a video pipeline all rule out "copy to a new array". The techniques are the same at every scale, and so are the hazards: a half-finished in-place operation is visible to anyone else holding the array.

## Same-direction two pointers: read and write

The pattern: a `read` index scans every element; a `write` index marks the boundary of the output built so far. Elements you keep are copied (or swapped) to `write`, which then advances. Elements you discard are skipped.

**Invariant:** `a[0..write−1]` is exactly the answer for the prefix `a[0..read−1]`, and `write ≤ read`, so writing never overwrites something you have not read.

Move all zeroes to the end, keeping the order of the others:

```python
def move_zeroes(a):
    write = 0
    for read in range(len(a)):
        if a[read] != 0:
            a[write], a[read] = a[read], a[write]
            write += 1
    return a
```

Trace `a = [0, 1, 0, 3, 12]`:

| read | a[read] | action | array | write |
|---|---|---|---|---|
| 0 | 0 | skip | `[0, 1, 0, 3, 12]` | 0 |
| 1 | 1 | swap(0, 1) | `[1, 0, 0, 3, 12]` | 1 |
| 2 | 0 | skip | `[1, 0, 0, 3, 12]` | 1 |
| 3 | 3 | swap(1, 3) | `[1, 3, 0, 0, 12]` | 2 |
| 4 | 12 | swap(2, 4) | `[1, 3, 12, 0, 0]` | 3 |

Swapping rather than overwriting keeps the zeroes alive so that the array ends in the right state without a second "fill the tail with zeroes" pass. Overwriting (`a[write] = a[read]`) plus a tail fill is equally valid and does fewer writes when most elements are kept: one store per kept element instead of three.

```viz
{"type": "array", "algorithm": "move-zeroes", "values": [0, 1, 0, 3, 12], "title": "Read/write pointers: stable compaction"}
```

The same skeleton solves "remove duplicates from a sorted array" (keep `a[read]` when it differs from `a[write−1]`), "remove all occurrences of `x`", and "compact a buffer". Rust's `Vec::retain` and Go's `slices.DeleteFunc` are this loop in the standard library. The stability property, that kept elements retain their relative order, comes for free because `read` visits them in order and `write` places them in order.

## Opposite-direction two pointers

Start `lo = 0`, `hi = n − 1`, and move them toward each other. Which one moves is decided by a comparison, and the invariant says something about the elements outside `[lo, hi]`.

**Reverse in place:** swap `a[lo]` and `a[hi]`, move both. Invariant: elements outside `[lo, hi]` are already in their final position. Terminates when `lo >= hi`; `⌊n/2⌋` swaps.

**Two-sum on a sorted array:** if `a[lo] + a[hi] < target`, no pair using `a[lo]` can reach the target with any element at or below `hi`, so `lo += 1`; if greater, `hi −= 1`. Invariant: the answer pair, if it exists, has both indices in `[lo, hi]`. This is why the technique needs sorted input: the comparison must tell you which pointer is *useless* to keep. The invariant argument is spelled out in [Invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning).

**Palindrome check with skips:** compare `a[lo]` and `a[hi]`, skipping non-alphanumeric characters. [Valid Palindrome](/practice/valid-palindrome).

**Container with most water and trapping rain water** use the same shape with a different comparison. The [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) pattern lesson and [Two pointers mastery](/learn/algorithms/technique-mastery/two-pointers-mastery) catalogue them.

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 2, 4, 7, 11, 15], "target": 15, "title": "Opposite-end pointers on a sorted array"}
```

## Swap-based partitioning

Partitioning rearranges an array so that everything satisfying a predicate comes before everything that does not. It is the heart of quicksort and quickselect ([Selection and order statistics](/learn/algorithms/sorting-searching/selection-and-order-statistics)), and it is the natural in-place answer to any "separate the elements into groups" question.

### Hand trace: Lomuto partition

`write` marks the end of the "less than pivot" region; `j` scans; the pivot sits at the end until the final swap. This is the move-zeroes loop with a general predicate. On `[3, 8, 2, 5, 1, 4]` with pivot `4`:

| j | a[j] | a[j] < 4? | action | array after | write |
|---|---|---|---|---|---|
| 0 | 3 | yes | swap(0, 0) | `[3, 8, 2, 5, 1, 4]` | 1 |
| 1 | 8 | no | none | `[3, 8, 2, 5, 1, 4]` | 1 |
| 2 | 2 | yes | swap(1, 2) | `[3, 2, 8, 5, 1, 4]` | 2 |
| 3 | 5 | no | none | `[3, 2, 8, 5, 1, 4]` | 2 |
| 4 | 1 | yes | swap(2, 4) | `[3, 2, 1, 5, 8, 4]` | 3 |
| end | | | swap(3, 5): pivot into place | `[3, 2, 1, 4, 8, 5]` | pivot at 3 |

Invariant: `a[0..write−1] < pivot`, `a[write..j−1] ≥ pivot`, `a[j..n−2]` unexamined. The kept region stays in its original order (3, 2, 1 arrived in scan order); the discarded region is scrambled (8, 5 became 8, 5 here, but not in general). Up to `n − 1` swaps on adversarial input, and every element equal to the pivot lands on the "not less" side, which is why Lomuto degrades to O(n²) on arrays of one repeated value.

## Hand trace: Hoare partition

Two pointers from opposite ends: `i` advances while `a[i] < pivot`, `j` retreats while `a[j] > pivot`, then they swap and continue until they cross. With pivot value `3` (the first element) on the same input:

| step | `i` stops at | `j` stops at | action | array after |
|---|---|---|---|---|
| 1 | 0 (`3`, not < 3) | 4 (`1`, not > 3) | swap(0, 4) | `[1, 8, 2, 5, 3, 4]` |
| 2 | 1 (`8`) | 2 (`2`) | swap(1, 2) | `[1, 2, 8, 5, 3, 4]` |
| 3 | 2 (`8`) | 1 (`2`) | crossed: return 1 | left `[1, 2]`, right `[8, 5, 3, 4]` |

Each swap fixes two misplaced elements, so Hoare does at most `n/2` swaps against Lomuto's `n − 1`, and elements equal to the pivot stop both pointers, so equal keys split evenly instead of piling on one side. The price: neither region keeps its order, and the return value is a split point (`1` here), not the pivot's final index; the pivot `3` ended up on the right. Getting the `≤` versus `<` and the return value wrong is how most hand-written Hoare partitions loop forever on an interview whiteboard, which is why [Comparison sorts](/learn/algorithms/sorting-searching/comparison-sorts) traces it again in the quicksort context.

## Three-way partition: the Dutch national flag

Sort an array whose values are only 0, 1 and 2 in one pass. Three regions and three pointers:

- `a[0..lo−1]` are 0s
- `a[lo..mid−1]` are 1s
- `a[mid..hi]` are unknown
- `a[hi+1..n−1]` are 2s

**Invariant:** those four statements. The loop processes `a[mid]`:

```python
def sort_colors(a):
    lo, mid, hi = 0, 0, len(a) - 1
    while mid <= hi:
        if a[mid] == 0:
            a[lo], a[mid] = a[mid], a[lo]
            lo += 1; mid += 1
        elif a[mid] == 1:
            mid += 1
        else:                       # 2
            a[mid], a[hi] = a[hi], a[mid]
            hi -= 1                 # do NOT advance mid: the swapped-in value is unknown
    return a
```

Trace `a = [2, 0, 2, 1, 1, 0]`:

| step | array | lo | mid | hi | a[mid] | action |
|---|---|---|---|---|---|---|
| 1 | `[2, 0, 2, 1, 1, 0]` | 0 | 0 | 5 | 2 | swap(0,5), hi→4 |
| 2 | `[0, 0, 2, 1, 1, 2]` | 0 | 0 | 4 | 0 | swap(0,0), lo→1, mid→1 |
| 3 | `[0, 0, 2, 1, 1, 2]` | 1 | 1 | 4 | 0 | swap(1,1), lo→2, mid→2 |
| 4 | `[0, 0, 2, 1, 1, 2]` | 2 | 2 | 4 | 2 | swap(2,4), hi→3 |
| 5 | `[0, 0, 1, 1, 2, 2]` | 2 | 2 | 3 | 1 | mid→3 |
| 6 | `[0, 0, 1, 1, 2, 2]` | 2 | 3 | 3 | 1 | mid→4 |
| 7 | `mid > hi`: stop | | | | | |

The subtle line is the `2` case: after swapping with `a[hi]` you do not advance `mid`, because the element that arrived from the right has not been examined. Advancing `mid` there is the single most common bug in this algorithm; it produces wrong output only for some inputs (step 1 above would have skipped the `0` that arrived at index 0), which is why you trace it by hand before you run it. Why is advancing `mid` safe in the `0` case? Because `a[lo]` is either `mid` itself (when `lo == mid`) or a known `1`, so the element that arrives at `mid` has already been classified. Every element is examined at most once and every step moves `mid` up or `hi` down, so the loop is O(n) with at most `n` swaps.

```viz
{"type": "array", "algorithm": "dutch-flag", "values": [2, 0, 2, 1, 1, 0], "title": "Dutch national flag: three regions, one pass"}
```

Three-way partitioning is how quicksort handles many equal keys efficiently (the Bentley–McIlroy "fat partition", and the equal-element handling in pdqsort), and it is the answer to "group an array into negative, zero and positive" and "partition by key into three buckets" in O(n) time and O(1) space.

## Reversal tricks

A reversal is an in-place, O(n), O(1)-space primitive, and compositions of reversals produce useful permutations.

### Hand trace: rotate right by `k` with three reversals

Reverse the whole array, then reverse the first `k` elements, then reverse the rest. For `[1, 2, 3, 4, 5]`, `k = 2`:

| phase | swap (lo, hi) | array after |
|---|---|---|
| reverse all `[0, 4]` | (0, 4) | `[5, 2, 3, 4, 1]` |
| reverse all `[0, 4]` | (1, 3) | `[5, 4, 3, 2, 1]` |
| reverse first `k` `[0, 1]` | (0, 1) | `[4, 5, 3, 2, 1]` |
| reverse the rest `[2, 4]` | (2, 4) | `[4, 5, 1, 2, 3]` |

Four swaps, twelve element moves at three per swap; in general `n/2 + k/2 + (n − k)/2 ≈ n` swaps, about `3n` moves, all in sequential order. Why it works: reversing everything puts the last `k` elements at the front, backwards; the two partial reversals restore each block's internal order. Take `k mod n` first, or `k = 7` on 5 elements indexes off the end. Rotating left by `k` is rotating right by `n − k`.

The alternative, **cycle-leader** rotation, moves each element directly to `(i + k) mod n`, carrying the displaced element along, and follows `gcd(n, k)` cycles. On `[1, 2, 3, 4, 5, 6]` with `k = 2`, `gcd(6, 2) = 2`, so two cycles: `0 → 2 → 4 → 0` places 1, 3, 5, then `1 → 3 → 5 → 1` places 2, 4, 6, giving `[5, 6, 1, 2, 3, 4]` in exactly `n = 6` moves. A third of the moves of the reversal method, but each move jumps `k` elements, so for a large `k` on a large array every move is a cache miss while the reversals stream through memory with the prefetcher's help. Rust's `slice::rotate_left` (1.98) picks per call: if the shorter side fits a 256-byte stack buffer it copies that side out, `memmove`s the rest and copies it back; for fewer than 24 elements, or elements larger than four words, it runs the `gcd` cycle algorithm, where the jumps are cheap; otherwise it repeatedly swaps blocks of `min(left, right)` elements, which stays sequential.

```viz
{"type": "array", "algorithm": "rotate", "values": [1, 2, 3, 4, 5, 6, 7], "k": 3, "title": "Rotate by three reversals"}
```

**Reverse words in a sentence stored as a character array:** reverse the entire array (words are now in the right order but each is spelled backwards), then reverse each word. In-place, O(n).

**Next permutation:** find the rightmost `i` with `a[i] < a[i+1]`, swap `a[i]` with the smallest element to its right that is larger, then reverse the suffix after `i`. The reversal turns a descending suffix into ascending, which is the smallest arrangement.

**Matrix rotation** is transpose plus row reversal, from [Two-dimensional arrays](/learn/data-structures/arrays-strings/two-dimensional-arrays).

## Under the hood: what a swap and a reverse cost

**A swap is two loads and two stores.** In C, Rust and Go the compiler emits exactly that; Rust's `slice::swap` adds two bounds checks unless the indices are provably in range. In CPython, `a[i], a[j] = a[j], a[i]` compiles to two subscript loads (`BINARY_SUBSCR` in 3.11–3.13, `BINARY_OP` with the `[]` operand in 3.14), a `SWAP`, and two `STORE_SUBSCR`, each subscript a full method dispatch with reference-count traffic: measured on CPython 3.14.7, a two-pointer reverse of a million-element list takes about 48 ms, while `list.reverse()` (a C loop swapping pointers) takes 0.22 ms, 220× faster. `a[::-1]` allocates a reversed copy in about 4 ms, and `a[:] = a[::-1]` is in place in name only: it builds the 8 MB copy and then copies it back, 11 ms and O(n) temporary memory. When the interviewer asks for O(1) space in Python, the two-pointer loop is the honest answer and `list.reverse()` is what you would ship.

**The XOR swap is a trap.** `a[i] ^= a[j]; a[j] ^= a[i]; a[i] ^= a[j]` avoids a temporary and, when `i == j`, zeroes the element: the first XOR makes it 0 and the rest keep it 0. Modern compilers already keep the temporary in a register, so the trick saves nothing and adds a bug that fires exactly when a partition swaps an element with itself, which Lomuto does on every kept element.

**Production sorts are partition algorithms with guard rails.** Go's `sort.Slice` (pdqsort since 1.19) and `slices.Sort` (1.21+), Rust's `sort_unstable` (pdqsort until 1.80, its successor ipnsort since 1.81) and libstdc++'s `std::sort` (introsort) share the shape: Hoare-style partitioning, insertion sort below a small cutoff (12 elements in Go, 16 in libstdc++, 24 in the original pdqsort), and a fallback to heapsort when recursion gets too deep, all in place with O(log n) stack. pdqsort adds a path that sweeps a run of keys equal to the pivot in one partition. Stable sorts are not in place: Python's `list.sort` and Java's `Arrays.sort(Object[])` are Timsort and need up to `n/2` references of temporary space, and Rust's stable `sort` (driftsort) allocates up to `n/2` of the elements themselves, so stably sorting 8 GB of inline records needs about 12 GB. Java sorts primitive arrays with a dual-pivot quicksort, where stability means nothing.

## Costs and hazards of in-place

In-place is not free, and a senior answer says so:

- **You mutate the caller's data.** A function that sorts its argument in place surprises anyone who still needs the original. Name it unambiguously (`sort` vs `sorted`, `reverse` vs `reversed`), document it, and never do it to a slice you do not own. Go's `append` and Python's default-argument lists are both famous for this class of bug.
- **Stability is usually lost.** Swap-based partitions scramble within regions. If the interviewer's follow-up is "keep the original order of the equal elements", the read/write scheme (stable) is the answer, not Hoare or the Dutch flag.
- **Strings are immutable in Python, Java, JavaScript and Go.** "In place" on a string means `list(s)` (or a `bytearray`) and `"".join` at the end, which is O(n) extra space anyway. Say so and move on; the interviewer wants the technique, not a fight with the runtime.
- **Concurrent readers see intermediate states.** An in-place rotation of a shared buffer exposes a half-rotated array to another thread, and there is no moment during the three reversals when the array is either the old or the new order. Copy-on-write, double buffering or a lock is the production answer; [Races, mutexes and invariants](/learn/systems/concurrency/races-mutexes-and-invariants) has the mechanics.
- **Fewer allocations, not always faster.** For small `n` the copying version is often faster (a simpler loop, no swaps, the allocation is a few hundred nanoseconds) and the in-place version wins when `n` is large, memory is constrained or allocation is expensive (real-time, embedded).

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A three-way partition is correct on most inputs and wrong when a 0 sits at the far right | `mid` advanced after the swap with `hi`, skipping the unexamined element | Retreat `hi` only; trace the case where the swapped-in value is 0 |
| Rotation throws an index error, or silently rotates by the wrong amount, for `k ≥ n` | `k` was never reduced modulo `n` | `k %= n` first; treat `k == 0` as a no-op |
| A caller's list is `None` after "sorting" it | `x = x.sort()` in Python: `sort` mutates and returns `None` | `x.sort()` alone, or `x = sorted(x)` for a copy |
| A reader thread sees a buffer that is neither the old nor the new order | An in-place rotation or partition ran on a shared array without exclusion | Double-buffer and swap a pointer, or hold a lock for the whole operation |
| An element becomes 0 during a partition, once in a million runs | XOR swap with `i == j` | Use a temporary or the language's swap |
| Equal records come out reordered after "an in-place cleanup" | A swap partition was used where the requirement was a stable filter | Read/write compaction, which is stable by construction |

## Trade-offs: which in-place move to use

| Technique | Stable | Swaps (worst) | Passes | Extra space | Groups | Use when |
|---|---|---|---|---|---|---|
| Read/write compaction | yes | `n` (or `n` stores if overwriting) | 1 | O(1) | 2 | Order of kept elements matters |
| Lomuto partition | kept side only | `n − 1` | 1 | O(1) | 2 | Simplicity; quickselect on a whiteboard |
| Hoare partition | no | `n/2` | 1 | O(1) | 2 | Fewest swaps; production quicksort |
| Dutch national flag | no | `n` | 1 | O(1) | 3 | Three classes in one pass |
| Three reversals | n/a | ≈ `n` | 3 | O(1) | n/a | Rotation with sequential access |
| Cycle-leader | n/a | `n` moves | 1 | O(1) | n/a | Minimum moves; poor locality for large `k` |
| Copy to a new array | yes | 0 | 1 | O(n) | any | Small `n`, or the caller needs the original |

## Interviewer follow-ups

**"Your partition is Lomuto. What happens on an array of all equal values?"** Model answer: every element compares "not less", so the partition puts everything on one side and quicksort recurses on `n − 1`, O(n²); Hoare splits equal keys evenly, and a three-way (Dutch flag) partition finishes the equal run in one pass, which is what pdqsort does. Common wrong answer: "duplicates do not affect quicksort".

**"Can you rotate with fewer element moves than three reversals?"** Model answer: yes, cycle-leader does `n` moves against about `3n`, but each move jumps `k` slots and misses cache on large inputs, while reversals stream; Rust's `rotate_left` keeps the cycle algorithm for short slices and large elements and otherwise uses a buffered `memmove` or sequential block swaps for that reason. Common wrong answer: "no, rotation needs at least `3n` moves".

**"Do this in place in Python."** Model answer: `list` yes, with two pointers; `str` no, because strings are immutable, so convert to a list, work in place, and join, which is O(n) space you must acknowledge. Common wrong answer: `s[::-1]` presented as in place.

**"Another thread reads this buffer. Is your in-place rotation safe?"** Model answer: no; there is no instant during the three reversals when the buffer is a valid old or new order, so readers must be excluded (a lock) or given a different buffer (double buffering, copy-on-write). Common wrong answer: "each swap is atomic, so readers only see valid states".

## What mid-level engineers get wrong

- **Advancing `mid` after swapping with `hi`.** Consequence: correct on the example, wrong on the hidden test with a 0 at the end.
- **Skipping `k mod n`.** Consequence: an index error, or a rotation by the wrong amount, on the input the interviewer adds last.
- **Calling `s[::-1]` or `a[:] = a[::-1]` "in place".** Consequence: an O(n) allocation the interviewer asked you to avoid, and a wrong claim about the runtime.
- **Reaching for Hoare when order matters.** Consequence: a stable filter becomes unstable and the bug appears as "equal records shuffled" weeks later.
- **Writing the XOR swap to look clever.** Consequence: a zeroed element the first time a partition swaps an index with itself.

## Exercises

```exercise
id: move-zeroes
title: Move zeroes to the end
prompt: |
  Move every `0` in `nums` to the end while keeping the relative order of
  the non-zero elements, in place with O(1) extra space, and return the
  array. Use a read pointer and a write pointer.
languages: [python, javascript]
entry: move_zeroes
starter:
  python: |
    def move_zeroes(nums):
        # your code here
        return nums
  javascript: |
    function move_zeroes(nums) {
      // your code here
      return nums;
    }
tests:
  - args: [[0, 1, 0, 3, 12]]
    expected: [1, 3, 12, 0, 0]
  - args: [[0]]
    expected: [0]
    label: single zero
  - args: [[]]
    expected: []
    label: empty array
  - args: [[1, 2, 3]]
    expected: [1, 2, 3]
    label: nothing to move
  - args: [[0, 0, 1]]
    expected: [1, 0, 0]
    hidden: true
  - args: [[4, 0, 5, 0, 0, 6]]
    expected: [4, 5, 6, 0, 0, 0]
    hidden: true
hints:
  - "`write` marks where the next non-zero goes; when `nums[read]` is non-zero, swap it into `write` and advance `write`."
  - "Never advance `write` past `read`; the invariant `write <= read` is what makes the swap safe."
```

```exercise
id: sort-colors
title: Dutch national flag
prompt: |
  `nums` contains only the values 0, 1 and 2. Sort it in place in a single
  pass using three pointers (`lo`, `mid`, `hi`) and O(1) extra space, and
  return the array. Do not call the built-in sort and do not count and
  overwrite (that is two passes).
languages: [python, javascript]
entry: sort_colors
starter:
  python: |
    def sort_colors(nums):
        # your code here
        return nums
  javascript: |
    function sort_colors(nums) {
      // your code here
      return nums;
    }
tests:
  - args: [[2, 0, 2, 1, 1, 0]]
    expected: [0, 0, 1, 1, 2, 2]
  - args: [[2, 0, 1]]
    expected: [0, 1, 2]
  - args: [[]]
    expected: []
    label: empty array
  - args: [[1, 1, 1]]
    expected: [1, 1, 1]
    label: all the same
  - args: [[2, 2, 0, 0]]
    expected: [0, 0, 2, 2]
    hidden: true
    label: no ones
  - args: [[1, 0, 2, 1, 0, 2, 1]]
    expected: [0, 0, 1, 1, 1, 2, 2]
    hidden: true
hints:
  - "Loop while `mid <= hi`. On 0: swap with `lo`, advance both. On 1: advance `mid`. On 2: swap with `hi`, retreat `hi` only."
  - "After swapping with `hi`, do not advance `mid`: the element that arrived has not been examined yet."
```

## Senior signals

- You state the invariant before writing the loop ("everything before `write` is the compacted prefix") and use it to justify termination and correctness.
- You can trace Lomuto and Hoare on the same input, say which is stable for which region, why Hoare does at most half the swaps, and why Lomuto is quadratic on equal keys.
- You can trace the Dutch national flag by hand and explain why `mid` does not advance after a swap with `hi` but does after a swap with `lo`.
- You reach for three reversals to rotate, can trace the swaps, take `k mod n` first, and can compare the move count and cache behaviour against cycle-leader.
- You know what a swap costs in your language, that `list.reverse()` is 200× a Python loop, and that `a[:] = a[::-1]` is not in place.
- You call out the hazards: mutating the caller's data, strings being immutable, stable sorts needing `n/2` extra space, concurrent readers seeing partial states.
- You know in-place is about memory and allocation, not speed, and that for small inputs the copying version is often faster.

## Check yourself

```quiz
- q: >-
    In the read/write two-pointer compaction, what guarantees that writing at `write` never destroys an element you have not yet read?
  options: ["The array is sorted, so each kept element only ever moves leftward", "Elements are swapped rather than overwritten, so none is ever lost", "The array has no duplicates, so each slot is written at most once", "The invariant `write <= read`, so every slot written was already read"]
  answer: 3
  explanation: >-
    The write pointer only advances when the read pointer does, so it never overtakes it. Every element at index < read has already been examined, so any slot write touches has been consumed. Swapping vs overwriting changes what happens to discarded elements, not this safety property, and the technique needs neither sorted nor distinct input.
- q: >-
    In the Dutch national flag algorithm, after swapping a 2 at `mid` with the element at `hi`, why is `mid` not advanced?
  options: ["Advancing would make the loop exceed O(n) on inputs full of 2s", "`mid` only advances on 1s, since 0s and 2s are always swapped", "The element swapped in from `hi` has not been examined yet", "The swapped-in element is always a 1, which the next step skips"]
  answer: 2
  explanation: >-
    The region `a[mid..hi]` is the unknown region. The swap brings an unexamined element, which may itself be a 0 or a 2, into position `mid`; advancing would classify it without looking. `mid` does advance on a 0: the element swapped in from `lo` is a known 1 (or `mid` itself), so advancing is safe there.
- q: >-
    Quicksort with a Lomuto partition is run on an array of one million identical values. What happens, and what fixes it?
  options: ["It runs in O(n log n) as usual, because equal keys never need to move", "It loops forever, because the pointers never cross; add a strict comparison", "It runs in O(n²), because every element lands on one side; use a three-way partition", "It runs in O(n²) because of the final pivot swap; use Hoare, which has no final swap"]
  answer: 2
  explanation: >-
    Every comparison says the element is not less than the pivot, so the partition is n − 1 against 0 and the recursion depth is n. Hoare splits equal keys evenly, and a Dutch-flag style three-way partition finishes an all-equal run in a single pass, which is what production sorts such as pdqsort do. Lomuto terminates; it is slow, not stuck.
- q: >-
    Which in-place technique preserves the relative order of the elements it keeps?
  options: ["Read/write pointer compaction", "Dutch national flag partition", "Hoare partition from opposite ends", "Three-reversal rotation of a subset"]
  answer: 0
  explanation: >-
    The read pointer visits kept elements in order and the write pointer places them in order, so relative order is preserved (stable). Swap-based partitions such as Hoare and the Dutch flag move elements across the array and scramble order within regions.
- q: >-
    Rotating an array of length 5 right by k = 7 with the three-reversal method without reducing k first will:
  options: ["Rotate left by 2 instead, since k exceeds n and the direction flips", "Work correctly, because each reversal wraps indices around the end", "Produce the rotation by 2 anyway, since 7 mod 5 is applied implicitly", "Index past the end when it reverses the first k elements"]
  answer: 3
  explanation: >-
    The method reverses the first k elements, and k = 7 exceeds the length, so it indexes past the end (or, with clamped slices, reverses the wrong ranges). Nothing reduces k for you: take k mod n = 2 first; rotating by n is the identity, so only the remainder matters.
- q: >-
    An interviewer asks you to reverse a Python string in place with O(1) extra space. The best response is:
  options: ["Say it is impossible, since strings are immutable, and stop there", "Note strings are immutable, then reverse a list copy with two pointers", "Use s[::-1], since slicing reverses the string in O(1) extra space", "Reverse it recursively, swapping the first and last characters each call"]
  answer: 1
  explanation: >-
    The technique (two pointers) is what is being tested. Stating the immutability constraint and its consequence, that the O(n) list buffer is unavoidable, shows you understand the runtime. s[::-1] allocates a new string and hides the algorithm, and recursion adds O(n) stack space on top of the copies.
```
