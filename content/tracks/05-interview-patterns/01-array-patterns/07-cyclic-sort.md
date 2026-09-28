---
slug: cyclic-sort
title: "Cyclic sort: when the values are their own indices"
description: Recognise the bounded-range signal, place every value at the index it names in one linear pass and O(1) space, avoid the one-line swap that corrupts the array, and know when XOR, a sum or Floyd's cycle detection is the better answer.
minutes: 50
difficulty: medium
tags: [pattern:cyclic-sort, arrays, in-place, missing-number, duplicates]
problems: [missing-number, first-missing-positive, find-duplicate-number]
---
You are handed an array of `n` integers and told that every value lies in `1..n`. One number is missing, or one is duplicated, or the interviewer wants the smallest positive integer that does not appear. The obvious answers are a hash set, which for 10⁶ integers is a 33.5 MB table in CPython on top of the 8.4 MB list, or a sort at `O(n log n)`. Then comes the follow-up this lesson exists for: "Can you do it in `O(n)` time and `O(1)` extra space?"

The constraint on the values is not a detail; it is the algorithm. If every value lies in `1..n`, every value names a valid index (`value − 1`), and the array can serve as its own hash table: slot `v − 1` answers "is `v` present?". Put each value into its slot, and whatever is out of place afterwards is the answer. The pattern is not "a sort"; it is "a bounded value range lets the positions act as a presence table without allocating one".

Execution is where this pattern costs rounds. A swap written on one line in Python silently loses a value and then loops forever. A guard compared against the wrong thing hangs on the first duplicate. And the most famous problem in the family, Find the Duplicate Number, forbids the mutation cyclic sort depends on. This lesson makes each of those decisions explicit, traces three problems, and measures what the `O(n)` actually costs against the arithmetic alternatives.

## The signal

Cyclic sort applies when all three of these hold:

1. **The values are bounded by the length**, and the statement says so in a constraint line: "each `nums[i]` is in `[1, n]`", "`[0, n]`", "`n + 1` integers, each between 1 and `n`". This is the whole signal; without it there is nowhere for a value to go.
2. **The question is about membership of that range**: which value is missing, which is duplicated, the smallest missing positive, every missing value, the corrupted pair.
3. **Extra space is forbidden and mutation is allowed**: "`O(1)` extra space", "in place", and nothing says the input must stay unchanged. If mutation is forbidden, the pattern flips to arithmetic (sum, XOR) or to Floyd's cycle detection.

### Ranges the statement hides

| Statement | The hidden range |
|---|---|
| "Smallest positive integer not in the array", values arbitrary | The answer lies in `1..n+1`, so only values in `1..n` matter; the rest are placeholders |
| "Which sequence numbers are missing from this batch", IDs from `base` to `base + n` | Subtract `base`; the offsets are the index range |
| "One value was overwritten by a copy of another; find both" | Values `1..n` with one collision; one scan returns the duplicate and the missing value |
| "Is this array a permutation of `1..n`?" | Place, then check that every slot holds its own value |
| "`n` people hold seat numbers `1..n`; who is in the wrong seat?" | Seat numbers are values, seats are indices |

### Near misses

| Statement | Needs instead | Why |
|---|---|---|
| "Find the duplicate; do not modify the array" ([Find the Duplicate Number](/practice/find-duplicate-number)) | Floyd's cycle detection on `i → nums[i]`, or binary search on the value range | Cyclic sort mutates |
| "Find the single missing number in `0..n`", values distinct ([Missing Number](/practice/missing-number)) | XOR, or an incremental sum | One unknown needs one equation; no mutation and fewer lines |
| "Every value appears twice except one", values arbitrary | XOR of everything ([bit tricks](/learn/algorithms/technique-mastery/bit-tricks-in-algorithms)) | Values are not bounded by `n`; pairs cancel |
| "Find the missing value", values up to 10⁹ and `n = 10⁵` | Hash set, or sort | Value 10⁹ has no slot in an array of 10⁵ |
| "Longest consecutive sequence" | Hash set with run-start detection ([hash map patterns](/learn/interview-patterns/sequence-patterns/hash-map-patterns)) | Values unbounded; the question is about runs, not about `1..n` |
| "Count each value in `0..k`", `O(k)` space allowed | A counting array ([non-comparison sorts](/learn/algorithms/sorting-searching/non-comparison-sorts-and-lower-bounds)) | Same index-equals-value idea, simpler when a second array is allowed |

## Four decisions before you type

Decide these out loud before writing the loop. The first one is where most bugs start.

| Problem | Home of value `v` | Values with no home | Swap when | What the final scan reads |
|---|---|---|---|---|
| [Missing Number](/practice/missing-number), `0..n` | index `v` | `v == n` | `v < n and nums[v] != v` | first `k` with `nums[k] != k`, else `n` |
| [First Missing Positive](/practice/first-missing-positive) | index `v − 1` | `v ≤ 0` or `v > n` | `1 ≤ v ≤ n and nums[v − 1] != v` | first `k` with `nums[k] != k + 1`, else `n + 1` |
| All missing in `1..n`, duplicates allowed | index `v − 1` | extra copies | `nums[v − 1] != v` | every `k + 1` with `nums[k] != k + 1` |
| Corrupted pair | index `v − 1` | the second copy | `nums[v − 1] != v` | the one misplaced `k`: duplicate `nums[k]`, missing `k + 1` |
| Find the Duplicate, mutation allowed | index `v − 1` | the extra copy | `nums[v − 1] != v` | the value at the first misplaced index |

Write the home mapping (`v` or `v − 1`) on the board first. An off-by-one there produces answers that are wrong by one on some inputs and index errors on others.

Before those four, one routing question decides whether you place anything at all. Is mutation allowed? If not, you are choosing between arithmetic (one unknown) and Floyd or a bitset (a duplicate, or many unknowns). If it is, count the unknowns: one missing value in a distinct range is XOR, because it is shorter, faster and leaves the input alone; several unknowns, or duplicates mixed with gaps, is cyclic sort. Asking "may I modify the input?" in the first minute is itself a signal the interviewer is listening for, because the answer changes the algorithm.

## The template

Walk `i` from left to right. Look at `v = nums[i]`. If `v` has a home and the home does not already hold `v`, swap `v` into it and look again at whatever landed at `i`. Otherwise advance.

```python
def cyclic_sort(nums):
    """Place each v in 1..n at index v - 1. Values with no home stay where they fall."""
    n = len(nums)
    i = 0
    while i < n:
        v = nums[i]
        j = v - 1                              # home index, computed BEFORE the swap
        if 1 <= v <= n and nums[j] != v:       # has a home, and the home lacks v
            nums[i], nums[j] = nums[j], nums[i]  # v is now home; re-examine index i
        else:
            i += 1                             # home, homeless, or a duplicate


def missing_values(nums):
    """Every value in 1..n absent from nums (duplicates allowed). Mutates nums."""
    cyclic_sort(nums)
    return [k + 1 for k, v in enumerate(nums) if v != k + 1]
```

```javascript
function cyclicSort(nums) {
  const n = nums.length;
  let i = 0;
  while (i < n) {
    const v = nums[i];
    const j = v - 1;                           // home index, computed before the swap
    if (v >= 1 && v <= n && nums[j] !== v) {
      nums[i] = nums[j];                       // two plain assignments: no hidden order
      nums[j] = v;
    } else {
      i++;
    }
  }
}

function missingValues(nums) {
  cyclicSort(nums);
  const out = [];
  for (let k = 0; k < nums.length; k++) if (nums[k] !== k + 1) out.push(k + 1);
  return out;
}
```

The guard `nums[j] != v` does two jobs. When `j == i` it is the "already home" test. When `nums[j]` holds another copy of `v`, it stops a swap that would exchange two equal values forever: without it, `[1, 1]` never terminates.

The invariant, in two parts. **First**, swaps never change the multiset of values. **Second**, every index left of `i` holds its own value (`k + 1`) or a value that cannot go home, because it is out of range or its home already holds a copy; an index left of `i` changes only by receiving its own value, after which it never changes again. At the end every index satisfies the second clause, which gives the read-off lemma: **`k + 1` is present if and only if `nums[k] == k + 1`**. If `k + 1` sat anywhere else it would be homeless, which means its home `k` already holds it.

**Why `O(n)`, despite re-examining index `i`:** count swaps, not visits. Every swap puts one value into its home, where the guard keeps it forever, so there are at most `n` swaps. Every non-swap iteration advances `i`, so there are exactly `n` of those. The loop runs at most `2n` times. On a shuffled 10⁶-element input the measured counts were 999,989 swaps and 1,999,989 iterations. This is the aggregate argument from [amortised analysis](/learn/foundations/complexity/amortized-analysis), with "values not yet home" as the potential that each swap lowers.

```viz
{"type": "array", "algorithm": "counting-sort", "values": [3, 1, 4, 1, 2], "title": "Index equals value", "caption": "Counting sort builds a separate count array indexed by value. Cyclic sort applies the same index-equals-value idea but stores each value in the input array itself, so no extra array is needed. The animation shows the mapping from value to slot; it does not show the in-place swaps."}
```

## The swap you must not write on one line

This line looks like the template with `j` inlined. It is wrong in Python and in JavaScript:

```python
nums[i], nums[nums[i] - 1] = nums[nums[i] - 1], nums[i]
```

Python evaluates the right-hand side first, then assigns the targets **left to right**, evaluating each target's index expression only when it reaches it. So `nums[i]` is overwritten first, and the second target's index `nums[i] − 1` is computed from the *new* value. Trace the first iteration on `[3, 1, 2]` with `i = 0`:

| step | what happens | array |
|---|---|---|
| 1 | right-hand side: `(nums[2], nums[0])` = `(2, 3)` | `[3, 1, 2]` |
| 2 | first target `nums[0] = 2` | `[2, 1, 2]` |
| 3 | second target index: `nums[0] − 1` = **1**, not 2 | |
| 4 | `nums[1] = 3` | `[2, 3, 2]` |

The value 1 has been destroyed and 2 duplicated. The loop then alternates between `[2, 3, 2]` and `[3, 3, 2]` forever, because each wrong swap recreates the state the other one started from. JavaScript's destructuring swap `[nums[i], nums[nums[i] - 1]] = [nums[nums[i] - 1], nums[i]]` evaluates its targets in the same order and produced the identical `[2, 3, 2]` in Node 24.

The fix is the template: compute `j = nums[i] − 1` on its own line, then swap `nums[i]` and `nums[j]`. Reversing the targets (`nums[nums[i] − 1], nums[i] = nums[i], nums[nums[i] − 1]`) also happens to work, because the index is computed before `nums[i]` changes, but it is correct by accident of ordering and the next reader will "tidy" it back.

## Worked problems

### Missing Number

[Missing Number](/practice/missing-number): `n` distinct integers from `0..n`; return the absent one. Home of `v` is index `v`, and `n` has no home.

```python
def missing_number_cyclic(nums):
    n, i = len(nums), 0
    while i < n:
        v = nums[i]
        if v < n and nums[v] != v:
            nums[i], nums[v] = nums[v], v
        else:
            i += 1
    for k, v in enumerate(nums):
        if v != k:
            return k
    return n
```

Trace on `[3, 0, 1]` (`n = 3`):

| step | `i` | `v = nums[i]` | action | array after |
|---|---|---|---|---|
| 1 | 0 | 3 | `v == n`, no home; advance | `[3, 0, 1]` |
| 2 | 1 | 0 | home 0 holds 3; swap | `[0, 3, 1]` |
| 3 | 1 | 3 | no home; advance | `[0, 3, 1]` |
| 4 | 2 | 1 | home 1 holds 3; swap | `[0, 1, 3]` |
| 5 | 2 | 3 | no home; advance | `[0, 1, 3]` |

Scan: index 2 holds 3, not 2, so the answer is 2. Had every index held its own value, the answer would be `n`.

With one unknown and distinct values, arithmetic is the better answer and a senior offers it first. XOR every index `0..n` with every value; each present number appears twice and cancels, and the missing one survives:

```python
def missing_number_xor(nums):
    x = len(nums)                  # contributes n, the index that has no slot
    for i, v in enumerate(nums):
        x ^= i ^ v
    return x
```

```viz
{"type": "bits", "algorithm": "single-number", "values": [3, 0, 1, 0, 1, 2, 3], "title": "XOR cancellation for Missing Number", "caption": "The array [3, 0, 1] concatenated with the full range 0..3. Every value that appears twice XORs to zero; the survivor, 2, is the missing number. The animation shows the cancellation, not the cyclic swaps."}
```

Cyclic sort earns its place when the follow-up is "now find *all* missing numbers" or "now there are duplicates", where one equation no longer determines the answer.

### Two missing values, without mutation

The [Missing Number](/practice/missing-number) follow-up: now two values are missing from `0..n+1`. One XOR yields `x ^ y`, which is not enough. But `x ≠ y`, so `x ^ y` has at least one set bit, and `x` and `y` differ in it. Split every range value and every array value by that bit and XOR each group separately: pairs still cancel inside each group, and each group keeps exactly one missing value.

```python
def two_missing(nums):
    m = len(nums) + 2                    # size of the range 0..n+1
    x = 0
    for v in range(m):
        x ^= v
    for v in nums:
        x ^= v                           # x is now a ^ b
    low = x & -x                         # lowest set bit: a and b differ here
    a = 0
    for v in range(m):
        if v & low:
            a ^= v
    for v in nums:
        if v & low:
            a ^= v
    return sorted([a, x ^ a])
```

Trace on `[0, 1, 3, 5]` (range `0..5`, missing 2 and 4). `x = 2 ^ 4 = 0b110`, so `low = 0b010`:

| source | values with bit `0b010` set | values with it clear |
|---|---|---|
| range `0..5` | 2, 3 | 0, 1, 4, 5 |
| array | 3 | 0, 1, 5 |
| XOR of the group | 2 ^ 3 ^ 3 = **2** | 0 ^ 1 ^ 4 ^ 5 ^ 0 ^ 1 ^ 5 = **4** |

Result `[2, 4]`, in `O(n)` time, `O(1)` space and no writes. Beyond two unknowns this trick does not extend cleanly, and cyclic sort (if you may mutate) or power sums (if you may not) take over.

### First Missing Positive

[First Missing Positive](/practice/first-missing-positive): any integers; return the smallest positive integer that is absent. The answer is always in `1..n+1` (if all of `1..n` are present it is `n + 1`), so values outside `1..n` are irrelevant and serve as placeholders. This is the problem where cyclic sort is the intended solution.

```python
def first_missing_positive(nums):
    cyclic_sort(nums)
    for k, v in enumerate(nums):
        if v != k + 1:
            return k + 1
    return len(nums) + 1
```

Trace on `[3, 4, -1, 1]` (`n = 4`):

| step | `i` | `v` | home `j = v − 1` | `nums[j]` | action | array after |
|---|---|---|---|---|---|---|
| 1 | 0 | 3 | 2 | −1 | swap | `[-1, 4, 3, 1]` |
| 2 | 0 | −1 | out of range | | advance | `[-1, 4, 3, 1]` |
| 3 | 1 | 4 | 3 | 1 | swap | `[-1, 1, 3, 4]` |
| 4 | 1 | 1 | 0 | −1 | swap | `[1, -1, 3, 4]` |
| 5 | 1 | −1 | out of range | | advance | `[1, -1, 3, 4]` |
| 6 | 2 | 3 | 2 | 3 (itself) | advance | `[1, -1, 3, 4]` |
| 7 | 3 | 4 | 3 | 4 (itself) | advance | `[1, -1, 3, 4]` |

Scan: index 1 holds −1 rather than 2, so the answer is 2. The −1 was evicted from index 2 in step 1 and drifted to index 1, where it marks the one slot that nothing could fill. Three swaps on four elements, within the bound.

### Find the Duplicate Number

[Find the Duplicate Number](/practice/find-duplicate-number): `n + 1` integers in `1..n`, one value repeated (possibly many times). The statement forbids modifying the array, so cyclic sort is out, and the pattern changes to cycle detection.

Read the array as a function `f(i) = nums[i]` on indices `0..n`. Every value is in `1..n`, so nothing maps to index 0, and following `0 → f(0) → f(f(0)) → …` walks a path that must eventually repeat, since there are only `n + 1` indices. The first repeated index on that path is a node with two incoming edges, meaning two indices hold the same value: the duplicate. Floyd's tortoise and hare finds that entry point in `O(n)` time and `O(1)` space ([cycle detection](/learn/data-structures/linked-lists/cycle-detection) has the proof that the second phase meets at the entry).

```python
def find_duplicate(nums):
    slow = fast = 0
    while True:                                  # phase 1: meet inside the cycle
        slow = nums[slow]
        fast = nums[nums[fast]]
        if slow == fast:
            break
    p = 0
    while p != slow:                             # phase 2: meet at the cycle entry
        p, slow = nums[p], nums[slow]
    return p
```

Trace on `[1, 3, 4, 2, 2]`. The path from index 0 is `0 → 1 → 3 → 2 → 4 → 2 → 4 …`, with the cycle `2 → 4 → 2` entered at 2.

| phase | step | `slow` (or `p`) | `fast` (or `slow`) | equal? |
|---|---|---|---|---|
| 1 | 1 | 1 | 3 | no |
| 1 | 2 | 3 | 4 | no |
| 1 | 3 | 2 | 4 | no |
| 1 | 4 | 4 | 4 | yes |
| 2 | 1 | 1 | 2 | no |
| 2 | 2 | 3 | 4 | no |
| 2 | 3 | 2 | 2 | yes, return 2 |

```viz
{"type": "linked-list", "algorithm": "cycle-detect", "values": [0, 1, 3, 2, 4], "cycleAt": 3, "title": "Find the Duplicate as a linked list", "caption": "Nodes are indices of [1, 3, 4, 2, 2] visited from index 0; the tail (index 4) points back to index 2. The cycle entry, 2, is the duplicated value."}
```

If mutation were allowed, cyclic sort answers it too: after placing, the value at the first misplaced index is the duplicate. On `[1, 3, 4, 2, 2]` the placed array is `[1, 2, 3, 4, 2]` and index 4 holds 2. The problem's own follow-up asks for an `O(n log n)`, `O(1)`-space method without the linked-list view: [binary search on the answer](/learn/algorithms/sorting-searching/binary-search-on-the-answer) over values, where `count(v ≤ mid) > mid` means the duplicate is at most `mid`.

## Variants

| Variant | What changes | Cost |
|---|---|---|
| All missing values | Scan collects every `k + 1` with `nums[k] != k + 1` | `O(n)`, `O(1)` beyond output |
| All duplicates | Scan collects the *values* at misplaced indices; a value seen three times appears twice | `O(n)` |
| Corrupted pair | One misplaced index `k`: duplicate `nums[k]`, missing `k + 1` | `O(n)` |
| Range `0..n` | Home of `v` is index `v`; `v == n` has no home | `O(n)` |
| Range `base..base+n` | Map `v → v − base` first | `O(n)` |
| Sign marking instead of swapping | For each `|v|`, negate `nums[|v| − 1]` if positive; a positive slot `k` means `k + 1` is missing; restore signs afterwards | `O(n)`, reversible, needs values ≥ 1 |
| Add-`n` marking | `nums[(v − 1) % n] += n`; slot `k` then holds `k + 1`'s count as `nums[k] // n` | `O(n)`; values grow to about `n²`, watch fixed-width overflow |
| Read-only, one duplicate | Floyd on `i → nums[i]` | `O(n)`, `O(1)` |
| Two missing values | Sum and sum of squares give `x + y` and `x² + y²`; or split by a set bit of the XOR | `O(n)`, `O(1)` |
| Values on a stream | XOR accumulator for one missing value; a bitset for anything more | `O(1)` or `n` bits |

## Complexity, derived

The placement loop is at most `2n` iterations: at most `n` swaps (each lowers the number of values not at home, which starts at most at `n` and never rises), plus exactly `n` advances of `i`. The scan is `n` more. Total `O(n)` time. Space is `O(1)` because the only state is `i`, `v` and `j`. Recursion for the "re-examine" step would still be `O(n)` time but `O(n)` stack, which breaks the space claim.

| Approach | Time | Extra space | Mutates input | Answers "all missing / all duplicates" | Works with unbounded values |
|---|---|---|---|---|---|
| Hash set | `O(n)` | `O(n)`: 33.5 MB per 10⁶ ints in CPython | no | yes | yes |
| Sort + scan | `O(n log n)` | `O(1)` in place | yes (or copy) | yes | yes |
| Sum or XOR | `O(n)` | `O(1)` | no | no, one unknown only | no |
| Cyclic sort | `O(n)` | `O(1)` | yes | yes | no |
| Sign marking | `O(n)` | `O(1)` | yes, restorable | yes | no |
| Floyd | `O(n)` | `O(1)` | no | no, exactly one duplicate | no |
| Binary search on value + count | `O(n log n)` | `O(1)` | no | no, one duplicate | no |

## Under the hood

### What the O(n) costs, measured

All five ways of finding one missing number in a shuffled `0..10⁶`, best of several runs on an AMD Ryzen 9 9950X3D, CPython 3.14 and Node 24 (scripts `cs_bench.py`, `cs_bench.mjs`):

| Approach | CPython 3.14 | Node 24 |
|---|---|---|
| `n(n+1)/2 − sum(nums)` | 14.6 ms | 0.5 ms |
| XOR in a loop | 76 ms (`functools.reduce(xor, …)`: 46 ms) | 0.3 ms |
| Hash set, then probe `0..n` | 61 ms, plus 33.5 MB | 52 ms |
| Sort, then scan | 175 ms | 45 ms (`Int32Array`), 163 ms (`Array` with comparator) |
| Cyclic sort, then scan | 153 ms | 13 ms |

In CPython the builtin `sum` wins because its loop runs in C, with a fast path that accumulates small ints in a machine word, while the cyclic sort pays the interpreter for about `2n` iterations. In Node every approach is compiled, and the difference is the **memory access pattern**. The XOR and sum loops read the array front to back, so each 64-byte cache line serves several consecutive elements and the hardware prefetcher fetches the next lines before they are needed. Every swap in cyclic sort jumps to an unpredictable index, so most of the million swaps touch a line the prefetcher did not predict. The array is a few megabytes: bigger than this CPU's 1 MB per-core L2 but inside its L3, so each of those accesses costs an L3 round trip of tens of cycles rather than a trip to DRAM. Both are `O(n)` with `O(1)` space; the measured gap is about 40×, and it widens once the array outgrows the last-level cache. The interview consequence: when one unknown suffices, the arithmetic answer is not only shorter, it is faster by a constant that matters.

### Overflow: why XOR is the safe arithmetic

In a 32-bit signed integer, `n * (n + 1) / 2` overflows from `n = 46,341`, where the product first exceeds 2³¹ − 1, even though the sum itself still fits until `n = 65,535`. Simulating Java `int` semantics in Python (`cs_ovf.py`), the formula returns the wrong missing number for 58% of the values of `n` between 46,341 and 200,000, and the right one for the rest by coincidence, which is the worst kind of bug to test for. The wrapping *sum* of the array is harmless: two's-complement addition is arithmetic modulo 2³², and the true answer fits, so accumulating `acc += (i + 1) − nums[i]` gives the right result even when intermediate values wrap. It is the division after a wrapped multiplication that breaks. In C, signed overflow is undefined behaviour; in Rust it panics in debug builds and wraps in release. JavaScript numbers are doubles and exact to 2⁵³, so the formula is safe up to `n ≈ 1.3 × 10⁸`; Python integers do not overflow. XOR has no carries, so it has no overflow in any language.

### At scale

"Values are a dense range, find the gaps" is gap detection over sequence numbers: a replica checking which log indices it has not received, or a consumer checking a batch of message IDs from `base` to `base + n`. Production code rarely mutates the batch; it keeps a bitset of `n` bits (125 KB for 10⁶ IDs, against 33.5 MB for a CPython set) and scans it sequentially, which is the non-destructive form of the same presence table.

## Failure modes

**A reconciliation job hangs on its first batch with a repeated ID.** *Symptom:* CPU pinned at 100%, no output; a stack dump shows the placement loop with `i` unchanged. *Diagnosis:* the guard compares `nums[i]` with `i + 1` instead of comparing `v` with `nums[v − 1]`, so two equal values swap with each other forever. *Fix:* `if nums[j] != v`; keep `[1, 1]` and `[2, 2]` in the unit tests.

**A value that exists is reported missing.** *Symptom:* on some inputs the output lists a missing number that is in the input, and a different number appears twice after the loop. *Diagnosis:* the one-line tuple swap; the second target's index is read after the first assignment, destroying a value (the `[3, 1, 2]` trace). *Fix:* compute `j` first.

**Hangs or corrupts only on inputs with negatives or large values.** *Symptom:* First Missing Positive never returns on `[1, −1]` in Python and raises `IndexError` on `[1, 5]`; in JavaScript both return, but the array afterwards holds `undefined` and has grown. *Diagnosis:* no range check. In Python, −1's "home" `nums[−2]` is index 0, so 1 and −1 trade places forever. In JavaScript, `nums[−2] = −1` creates a property named `"-2"` on the array object, and `nums[4] = 5` on a length-2 array extends it with holes. *Fix:* test `1 <= v <= n` before computing the home.

**The missing-number service is wrong only for large batches.** *Symptom:* a Java or C++ component returns garbage for batches above roughly 46,000 IDs and is correct below. *Diagnosis:* `n * (n + 1) / 2` in 32-bit arithmetic. *Fix:* XOR, a 64-bit accumulator, or the incremental difference `(i + 1) − nums[i]`.

**A downstream consumer sees reordered data.** *Symptom:* after a gap check was added, a later stage that assumed arrival order starts failing. *Diagnosis:* the gap check cyclic-sorted a shared buffer in place. *Fix:* use XOR or a bitset for the check, or copy the buffer and accept `O(n)` space.

## Interviewer follow-ups

**"Now the array is read-only."** Model answer: for one missing value, XOR or the incremental sum, `O(n)` and `O(1)`. For one duplicate, Floyd's cycle detection on `i → nums[i]`, or binary search on the value range with a counting pass, `O(n log n)`. For "all missing" or First Missing Positive, the honest answer is `O(n)` *bits*, a bitset of 12.5 KB for `n = 10⁵`, and saying "bits, not integers" is the senior detail. Common wrong answer: copying the array and cyclic-sorting the copy while still claiming `O(1)` space.

**"Now values go up to 10⁹."** Model answer: for missing and duplicate problems over an arbitrary range there is no slot for 10⁹, so use a hash set or a sort. First Missing Positive is unaffected, because the answer is still in `1..n+1` and every value above `n` is already treated as a placeholder. Common wrong answer: "cyclic sort no longer works" said about First Missing Positive.

**"Now the input is a stream of `n` values from `0..n`."** Model answer: one missing value is an XOR accumulator, `O(1)` memory and one pass. Duplicates on a stream need a bitset of `n + 1` bits. Cyclic sort needs random access to the whole array and does not apply. Common wrong answer: buffering the stream so that cyclic sort can run, which is `O(n)` memory for a problem that needed `O(1)`.

**"Now `k` numbers are missing."** Model answer: with mutation, cyclic sort then scan, `O(n)` for any `k`. Read-only with `k = 2`, the sum and the sum of squares give `x + y` and `x² + y²`, two equations in two unknowns; or XOR everything to get `x ^ y`, pick any set bit, and XOR the two halves separately. For small `k` on a stream, the first `k` power sums (taken modulo a prime to keep them small) determine the missing values through Newton's identities. Common wrong answer: "XOR still works", which recovers only `x ^ y`.

**"`n` is 10⁹."** Model answer: the array alone is 4 GB of 32-bit integers, far bigger than any cache, so each cyclic-sort swap is a main-memory access on the order of 100 ns, putting 10⁹ swaps in the range of minutes, while an XOR pass is a sequential scan limited by memory bandwidth, a fraction of a second at tens of GB/s. For "all missing", a 125 MB bitset scanned sequentially beats both. Common wrong answer: "it is `O(n)` so it scales", ignoring that the constant is the access pattern.

## What mid-level engineers get wrong

- **Inlining the home index into a tuple swap.** Consequence: a value is destroyed and the loop cycles forever on inputs as small as `[3, 1, 2]`.
- **Guarding on `nums[i] != i + 1`.** Consequence: an infinite loop on the first duplicate.
- **Reaching for cyclic sort on Find the Duplicate Number.** Consequence: a solution that violates the problem's "do not modify" clause, which the interviewer stated precisely to exclude it.
- **Using cyclic sort for a single missing value.** Consequence: more code, a mutated input and a 40× slower constant than XOR, for no gain in complexity.
- **Mixing the `0..n` and `1..n` mappings.** Consequence: off-by-one answers on some inputs and index errors on others.
- **Claiming `O(1)` space with a recursive re-examine step.** Consequence: `O(n)` stack depth, and a claim the interviewer can refute.

## Exercises

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

```exercise
id: corrupted-pair
title: Find the duplicated and the missing value
prompt: |
  `nums` should hold each integer from `1` to `n` exactly once
  (`n = len(nums)`), but one value was overwritten with a copy of another.
  Return `[duplicate, missing]`.

  Use O(n) time and O(1) extra space; you may modify `nums`. After placing
  every value at its home, exactly one index is wrong, and it tells you both
  answers.
languages: [python, javascript]
entry: find_corrupted_pair
starter:
  python: |
    def find_corrupted_pair(nums):
        # your code here
        return [0, 0]
  javascript: |
    function find_corrupted_pair(nums) {
      // your code here
      return [0, 0];
    }
tests:
  - args: [[1, 2, 2, 4]]
    expected: [2, 3]
  - args: [[1, 1]]
    expected: [1, 2]
    label: smallest input, missing value is n
  - args: [[2, 2]]
    expected: [2, 1]
    label: missing value is 1
  - args: [[3, 2, 3, 4, 6, 5]]
    expected: [3, 1]
  - args: [[1, 5, 3, 2, 2, 7, 6, 4, 8, 9]]
    expected: [2, 10]
    hidden: true
  - args: [[4, 2, 1, 4]]
    expected: [4, 3]
    hidden: true
  - args: [[5, 3, 1, 4, 3]]
    expected: [3, 2]
    hidden: true
hints:
  - "Place each value v at index v - 1 with the usual guard nums[v - 1] != v, so the extra copy stays homeless instead of looping."
  - "Scan for the one index k with nums[k] != k + 1: the value there is the duplicate and k + 1 is the missing value."
```

## Senior signals

- You spot the pattern from the **constraint line** ("values in `1..n`") and say why it makes the array its own presence table.
- You prove the **`O(n)` bound by counting swaps**: each places a value permanently, so at most `n` swaps plus `n` advances.
- You write the swap with a **precomputed `j`** and can trace why the inline tuple swap destroys a value in Python and JavaScript.
- You pick the **simplest tool for the stated constraints**: XOR for one missing value, Floyd when mutation is forbidden, cyclic sort when there are many unknowns and mutation is allowed.
- You know the **constant factors**: the arithmetic pass is a sequential scan and was 40× faster than cyclic sort's random swaps in Node on 10⁶ elements, and a CPython set costs 33.5 MB where a bitset costs 125 KB.
- You know **overflow** is a property of the formula, not of summing: `n(n+1)/2` breaks in 32-bit from `n = 46,341`, while XOR and the incremental difference never do.

## Check yourself

```quiz
- q: >-
    Why is cyclic sort O(n) even though a single index can be examined many times?
  options: ["Each index is examined at most twice, by construction of the guard", "Re-examination happens only on duplicates, which are rare in input", "It is O(n log n), and the log factor is small enough to be ignored", "Each swap puts one value home for good, so swaps are capped at n"]
  answer: 3
  explanation: >-
    The bound counts swaps, not visits. A value that reaches its home is never moved again, so there are at most n swaps, and every non-swap iteration advances i, so there are n of those. An index can be revisited many times, not just twice, but each revisit is paid for by a value placed permanently. Duplicates are not required for revisits; any displaced value causes one.
- q: >-
    A candidate writes nums[i], nums[nums[i] - 1] = nums[nums[i] - 1], nums[i] and runs it on [3, 1, 2] at i = 0. What is the array after that one line?
  options: ["[2, 1, 3], because the tuple swap exchanges index 0 with index 2", "[2, 3, 2], since the second index is read after nums[0] changes", "[3, 1, 2], because Python evaluates both sides before assigning", "[1, 3, 2], because the targets are assigned from right to left"]
  answer: 1
  explanation: >-
    The right-hand side (2, 3) is built first, then targets are assigned left to right: nums[0] becomes 2, and only then is the second target's index computed as nums[0] - 1 = 1, so nums[1] becomes 3. The value 1 is lost. Evaluating the right-hand side first is true but does not protect the index expressions on the left. Compute j before the swap.
- q: >-
    The placement guard is written as while nums[i] != i + 1: swap(nums, i, nums[i] - 1). Which input hangs it?
  options: ["[1, 1], since equal values swap with each other", "[3, 1, 2], since each swap moves a value two slots", "[1, 2, 3], since every value is already at home", "[2, 1], since index 0 is examined a second time"]
  answer: 0
  explanation: >-
    At i = 1 the value 1 is not at index 1, but its home already holds a copy. Swapping two equal values changes nothing, so the condition never becomes false. Compare the value with what is at its home, nums[v - 1] != v, not with the current index. The other inputs terminate normally.
- q: >-
    Find the Duplicate Number forbids modifying the array and requires O(1) space. What is the intended approach?
  options: ["A hash set of values seen so far, stopping at the first repeat", "Cyclic sort on a copy, then read the first misplaced value", "XOR of every value against the range 1..n to cancel pairs", "Floyd's cycle detection on the function from i to nums[i]"]
  answer: 3
  explanation: >-
    With n + 1 indices mapping into 1..n, the path from index 0 must enter a cycle, and the entry is a value held at two indices: the duplicate. Floyd finds it in O(n) time and O(1) space without writing. A copy or a hash set costs O(n) space, and XOR fails when the duplicate appears more than twice or other values are missing.
- q: >-
    First Missing Positive, but now values range up to 10^9 with n = 10^5. What changes?
  options: ["Cyclic sort fails, since 10^9 has no index; use a set", "The swaps overflow, so values must be taken modulo n", "Nothing, since values above n are placeholders already", "The answer may exceed n + 1, so the scan must go further"]
  answer: 2
  explanation: >-
    The answer is always in 1..n+1, so any value above n is irrelevant and the range check already leaves it where it is. The set objection is right for general missing or duplicate problems over an unbounded range, not for this one. Taking values modulo n would invent values that were never present.
- q: >-
    A C++ service computes the missing ID as n * (n + 1) / 2 - sum in 32-bit ints. It is correct in tests and wrong for some batches above about 46,000 IDs. What is the most robust fix?
  options: ["Cast only the final subtraction to 64-bit before returning", "Sort the batch and scan, since sorting cannot overflow either", "Divide n by 2 first, since the division is what overflows", "XOR the indices and values, which has no carries to overflow"]
  answer: 3
  explanation: >-
    The product n * (n + 1) exceeds 2^31 - 1 from n = 46,341, and dividing after a wrapped multiply gives a wrong result. XOR cannot overflow and stays O(n) with O(1) space. Casting after the damage is done does not help, dividing n first breaks when n is odd unless you pick the even factor, and sorting is O(n log n) and mutates the batch.
```
