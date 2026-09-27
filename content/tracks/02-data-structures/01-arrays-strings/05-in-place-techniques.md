---
slug: in-place-techniques
title: In-place techniques
description: The two-pointer, swap-partition and reversal tricks that answer "can you do it in O(1) extra space?", with the invariants that make them correct.
minutes: 40
difficulty: medium
tags: [arrays, two-pointers, in-place, partition, dutch-national-flag, invariants]
problems: [move-zeroes, sort-colors, remove-duplicates-sorted, rotate-image]
---
The interviewer nods at your O(n) solution and says "good; now do it without allocating a second array." Most O(n)-space array solutions become O(1)-space with one of three moves: two pointers that read and write at different speeds, swaps that partition the array into regions, or reversals composed to produce a permutation. Each has an invariant, a small statement about what is true between iterations, and the invariant is what lets you write the loop without guessing.

In-place matters beyond interviews. Sorting 8 GB of records on a 16 GB machine, compacting a buffer in a network stack, and rearranging a 4K frame in a video pipeline all rule out "copy to a new array". The techniques are the same at every scale.

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

Swapping rather than overwriting keeps the zeroes alive so that the array ends in the right state without a second "fill the tail with zeroes" pass. Overwriting (`a[write] = a[read]`) plus a tail fill is equally valid and does fewer writes when most elements are kept.

```viz
{"type": "array", "algorithm": "move-zeroes", "values": [0, 1, 0, 3, 12], "title": "Read/write pointers: stable compaction"}
```

The same skeleton solves "remove duplicates from a sorted array" (keep `a[read]` when it differs from `a[write−1]`), "remove all occurrences of `x`", and "compact a buffer". The stability property, that kept elements retain their relative order, comes for free because `read` visits them in order and `write` places them in order.

## Opposite-direction two pointers

Start `lo = 0`, `hi = n − 1`, and move them toward each other. Which one moves is decided by a comparison, and the invariant says something about the elements outside `[lo, hi]`.

**Reverse in place:** swap `a[lo]` and `a[hi]`, move both. Invariant: elements outside `[lo, hi]` are already in their final position. Terminates when `lo >= hi`; O(n/2) swaps.

**Two-sum on a sorted array:** if `a[lo] + a[hi] < target`, no pair using `a[lo]` can reach the target with any element at or below `hi`, so `lo += 1`; if greater, `hi −= 1`. Invariant: the answer pair, if it exists, has both indices in `[lo, hi]`. This is why the technique needs sorted input: the comparison must tell you which pointer is *useless* to keep. The invariant argument is spelled out in [Invariants and loop reasoning](/learn/foundations/problem-solving/invariants-and-loop-reasoning).

**Palindrome check with skips:** compare `a[lo]` and `a[hi]`, skipping non-alphanumeric characters. [Valid Palindrome](/practice/valid-palindrome).

**Container with most water and trapping rain water** use the same shape with a different comparison. The [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) pattern lesson catalogues them.

```viz
{"type": "array", "algorithm": "two-pointers-sum", "values": [1, 2, 4, 7, 11, 15], "target": 15, "title": "Opposite-end pointers on a sorted array"}
```

## Swap-based partitioning

Partitioning rearranges an array so that everything satisfying a predicate comes before everything that does not. It is the heart of quicksort and quickselect, and it is the natural in-place answer to any "separate the elements into groups" question.

### Two-way partition (Lomuto)

`write` marks the end of the "satisfies predicate" region; `read` scans. When `a[read]` satisfies the predicate, swap it into position `write` and advance `write`. This is the move-zeroes loop with a general predicate. It is simple and stable *for the kept region* (the discarded region gets scrambled). Quicksort's Lomuto scheme uses "less than pivot" as the predicate.

### Hoare-style partition

Two pointers from opposite ends: `lo` advances while `a[lo]` satisfies the predicate, `hi` retreats while `a[hi]` does not, then they swap and continue until they cross. Fewer swaps on average than Lomuto (each swap fixes two elements), but neither region keeps its order. This is what most production quicksorts use, with tweaks.

### Three-way partition: the Dutch national flag

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

The subtle line is the `2` case: after swapping with `a[hi]` you do not advance `mid`, because the element that just arrived from the right has not been examined. Advancing `mid` there is the single most common bug in this algorithm, and it silently produces wrong output only for some inputs, which is why you trace it by hand before you run it.

```viz
{"type": "array", "algorithm": "dutch-flag", "values": [2, 0, 2, 1, 1, 0], "title": "Dutch national flag: three regions, one pass"}
```

Three-way partitioning is also how quicksort handles many equal keys efficiently (Bentley–McIlroy "fat partition"), and it is the answer to "group an array into negative, zero and positive" and "partition by key into three buckets" in O(n) time and O(1) space.

## Reversal tricks

A reversal is an in-place, O(n), O(1)-space primitive, and compositions of reversals produce useful permutations.

**Rotate right by `k`:** reverse the whole array, then reverse the first `k` elements, then reverse the rest. For `[1, 2, 3, 4, 5]`, `k = 2`:

```text
reverse all:        [5, 4, 3, 2, 1]
reverse first 2:    [4, 5, 3, 2, 1]
reverse the rest:   [4, 5, 1, 2, 3]
```

Take `k mod n` first, or `k = 7` on 5 elements walks off the end. Rotating left by `k` is rotating right by `n − k`. The alternative, cycle-following with `gcd(n, k)` cycles, does fewer element moves but is much easier to get wrong.

```viz
{"type": "array", "algorithm": "rotate", "values": [1, 2, 3, 4, 5, 6, 7], "k": 3, "title": "Rotate by three reversals"}
```

**Reverse words in a sentence stored as a character array:** reverse the entire array (words are now in the right order but each is spelled backwards), then reverse each word. In-place, O(n).

**Next permutation:** find the rightmost `i` with `a[i] < a[i+1]`, swap `a[i]` with the smallest element to its right that is larger, then reverse the suffix after `i`. The reversal turns a descending suffix into ascending, which is the smallest arrangement.

**Matrix rotation** is transpose plus row reversal, from [Two-dimensional arrays](/learn/data-structures/arrays-strings/two-dimensional-arrays).

## Costs and hazards of in-place

In-place is not free, and a senior answer says so:

- **You mutate the caller's data.** A function that sorts its argument in place surprises anyone who still needs the original. Name it clearly (`sort` vs `sorted`, `reverse` vs `reversed`), document it, and never do it to a slice you do not own. Go's `append` and Python's default-argument lists are both famous for this class of bug.
- **Stability is usually lost.** Swap-based partitions scramble within regions. If the interviewer's follow-up is "keep the original order of the equal elements", the read/write scheme (stable) is the answer, not Hoare or the Dutch flag.
- **Strings are immutable in Python, Java, JavaScript and Go.** "In place" on a string means `list(s)` (or a `bytearray`) and `"".join` at the end, which is O(n) extra space anyway. Say so and move on; the interviewer wants the technique, not a fight with the runtime.
- **Concurrent readers see intermediate states.** An in-place rotation of a shared buffer exposes a half-rotated array to another thread. Copy-on-write, double buffering or a lock is the production answer.
- **Fewer allocations, not always faster.** For small `n` the copying version is often faster in practice (simpler loop, no swaps) and the allocation is negligible. The in-place version wins when `n` is large, memory is constrained or allocation is expensive (real-time, embedded).

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
- You know the difference between the stable read/write scheme and the unstable swap partitions, and you pick based on whether order matters.
- You can trace the Dutch national flag by hand and explain why `mid` does not advance after a swap with `hi`.
- You reach for three reversals to rotate and can explain why `k mod n` comes first.
- You call out the hazards: mutating the caller's data, strings being immutable, concurrent readers seeing partial states.
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
