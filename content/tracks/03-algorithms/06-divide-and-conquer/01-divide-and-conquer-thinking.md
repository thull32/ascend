---
slug: divide-and-conquer-thinking
title: "Divide and conquer: the recurrence is the algorithm"
description: How to read a recurrence off recursive code, solve it with the recursion tree and the master theorem, and see why a one-line change to merge sort's combine step counts inversions for free.
minutes: 50
difficulty: medium
tags: [divide-and-conquer, recurrence, master-theorem, merge-sort, inversions, recursion-tree]
problems: [median-two-sorted, maximum-subarray]
---
Two engineers each write a recursive function that splits an array in half, recurses on both halves and combines the results. One function runs in a few milliseconds on a million elements; the other takes minutes. The code looks nearly identical. The difference is entirely in the combine step: one merges in a single pass, the other does something quadratic, and neither engineer noticed because they never wrote down the recurrence.

Divide and conquer is a three-step pattern: split the input into smaller instances of the same problem, solve them recursively, and combine the answers. The pattern is easy. The engineering is in the recurrence that describes its cost, because the recurrence tells you, before you run anything, whether the recursion is buying you something or merely rearranging the same work. This lesson makes the recurrence the object you reason about, then uses merge sort and inversion counting to show how a tiny change in the combine step produces a new algorithm at no extra cost.

## Reading the recurrence off the code

A recurrence has three parts that map directly onto code:

```python
def solve(items):
    if len(items) <= 1:                 # base case: O(1)
        return base(items)
    mid = len(items) // 2
    left = solve(items[:mid])           # a = 2 subproblems ...
    right = solve(items[mid:])          # ... each of size n / b with b = 2
    return combine(left, right)         # f(n): the cost of splitting and combining
```

That structure is $T(n) = a \cdot T(n/b) + f(n)$: `a` recursive calls, each on an input `b` times smaller, plus `f(n)` of non-recursive work at this level. For merge sort, `a = 2`, `b = 2` and the merge is linear, so $T(n) = 2T(n/2) + O(n)$. For binary search, `a = 1` (only one half is searched), `b = 2`, `f(n) = O(1)`. Karatsuba multiplication, in the [next lesson](/learn/algorithms/divide-and-conquer/classic-divide-and-conquer), has `a = 3`, `b = 2`, `f(n) = O(n)`. Writing the three numbers down is the whole skill; the rest is a lookup.

One trap: Python's `items[:mid]` copies the slice, so the split itself costs `O(n)` even when the algorithm's logic is `O(1)`. That does not change merge sort's complexity because the merge was already linear, but it turns binary search's $T(n) = T(n/2) + O(1)$ into $T(n) = T(n/2) + O(n) = O(n)$, silently. Pass indices, not slices, when `f(n)` matters.

## The recursion tree

Unroll the recurrence into a tree: the root does `f(n)` work, its `a` children each do `f(n/b)`, their `a²` grandchildren each do `f(n/b²)`, and so on down `log_b n` levels to the leaves. The total cost is the sum over levels.

```viz
{"type": "recursion", "algorithm": "merge-sort-tree", "values": [38, 27, 43, 3, 9, 82, 10, 5],
 "title": "Merge sort's recursion tree: every level merges n elements in total"}
```

For merge sort, level `k` has `2^k` nodes each merging `n / 2^k` elements, so every level does exactly `n` work, and there are `log₂ n + 1` levels: $O(n \log n)$. On the eight values in the visualisation:

| Level | Nodes | Elements per node | Merge work per node | Work at this level |
|---|---|---|---|---|
| 0 | 1 | 8 | 8 | 8 |
| 1 | 2 | 4 | 4 | 8 |
| 2 | 4 | 2 | 2 | 8 |
| 3 (leaves) | 8 | 1 | 0, base case | 0 |

Three merging levels of 8 element moves each: 24 = `8 × log₂ 8`. Double `n` and you add one level of `n` work, which is what "`n log n`" means operationally. The tree makes the answer visible without algebra, and it also shows the three regimes the master theorem formalises:

- If work per level **shrinks** going down (the root dominates), the total is `Θ(f(n))`.
- If work per level is **constant** (every level equal), the total is `f(n)` times the number of levels: `Θ(f(n) log n)`.
- If work per level **grows** going down (the leaves dominate), the total is the number of leaves, `a^(log_b n) = n^(log_b a)`.

## The master theorem, applied

Compare `f(n)` to the leaf count $n^{\log_b a}$. Call that exponent `c = log_b a`.

| Case | Condition | Result | Example |
|---|---|---|---|
| 1: leaves dominate | $f(n) = O(n^{c - \varepsilon})$ | $\Theta(n^{c})$ | Karatsuba: $3T(n/2) + O(n)$, $c = \log_2 3 \approx 1.585$, so $\Theta(n^{1.585})$ |
| 2: balanced | $f(n) = \Theta(n^{c})$ | $\Theta(n^{c} \log n)$ | Merge sort: $2T(n/2) + O(n)$, $c = 1$, so $\Theta(n \log n)$ |
| 3: root dominates | $f(n) = \Omega(n^{c + \varepsilon})$ and regularity | $\Theta(f(n))$ | $2T(n/2) + O(n^2)$: $\Theta(n^2)$ |

Some worked lookups you should be able to do in your head:

- Binary search, $T(n) = T(n/2) + O(1)$: `a = 1, b = 2, c = 0`; `f(n) = Θ(n⁰)` is case 2: $\Theta(\log n)$.
- Naive divide-and-conquer multiplication, $T(n) = 4T(n/2) + O(n)$: `c = 2`, `f(n) = O(n)` is below `n²` (case 1): $\Theta(n^2)$. Four subproblems bought nothing over the schoolbook method; three subproblems (Karatsuba) is where the gain appears.
- Strassen, $T(n) = 7T(n/2) + O(n^2)$: `c = log₂ 7 ≈ 2.807`, `f(n) = n²` is below (case 1): $\Theta(n^{2.807})$.
- A "divide and conquer" with quadratic combine, $T(n) = 2T(n/2) + O(n^2)$: `c = 1`, `f` is above (case 3): $\Theta(n^2)$. The recursion is decoration; a plain nested loop would be the same complexity and simpler.
- The awkward one, $T(n) = 2T(n/2) + O(n \log n)$: `f(n) = n log n` is not polynomially larger than `n¹`, so the basic theorem does not apply. The extended form (with a `log^k` term) gives $\Theta(n \log^2 n)$, and the recursion tree confirms it: level `k` does roughly `n log(n / 2^k)` work, summing to about `n log² n / 2`.

The theorem does not cover unequal splits (`T(n) = T(n/3) + T(2n/3) + n`, which is still `Θ(n log n)` by the tree, with `log_{3/2} n` levels) or splits that shrink by subtraction (`T(n) = T(n − 1) + n`, which is `Θ(n²)` and a sign that the "recursion" is a loop). When in doubt, draw the tree; the master theorem is a shortcut for the common cases, not the theory.

## Merge sort, and a combine step that does more

Merge sort's combine is the merge: two sorted halves, one pass, one output.

```python
def merge_sort(a):
    if len(a) <= 1:
        return a
    mid = len(a) // 2
    left, right = merge_sort(a[:mid]), merge_sort(a[mid:])
    out, i, j = [], 0, 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:          # <= keeps the sort stable
            out.append(left[i]); i += 1
        else:
            out.append(right[j]); j += 1
    out.extend(left[i:]); out.extend(right[j:])
    return out
```

```viz
{"type": "array", "algorithm": "merge-sort", "values": [38, 27, 43, 3, 9, 82, 10, 5],
 "title": "Merge sort on eight values"}
```

Now ask a different question of the same code: how many pairs `(i, j)` with `i < j` have `a[i] > a[j]`? These are **inversions**, the standard measure of how unsorted an array is (a sorted array has 0, a reversed one has `n(n−1)/2`, and it is the number of adjacent swaps bubble sort would make). The brute force is `O(n²)`.

Watch the merge. When `right[j]` is copied out before `left[i]`, it is because `left[i] > right[j]`. But every element still remaining in `left`, from index `i` onward, is also greater than `right[j]` (the left half is sorted), and every one of those elements came *before* `right[j]` in the original array. So that single step has found `len(left) − i` inversions at once.

```python
def count_inversions(a):
    def sort_count(a):
        if len(a) <= 1:
            return a, 0
        mid = len(a) // 2
        left, inv_l = sort_count(a[:mid])
        right, inv_r = sort_count(a[mid:])
        out, i, j, inv = [], 0, 0, inv_l + inv_r
        while i < len(left) and j < len(right):
            if left[i] <= right[j]:
                out.append(left[i]); i += 1
            else:
                out.append(right[j]); j += 1
                inv += len(left) - i         # every remaining left element beats right[j]
        out.extend(left[i:]); out.extend(right[j:])
        return out, inv
    return sort_count(a)[1]
```

Trace `[2, 4, 1, 3, 5]`. Split into `[2, 4]` and `[1, 3, 5]`; each sorts with 0 inversions internally (`[2, 4]` is sorted; `[1, 3, 5]` too). Merge: compare 2 and 1, take 1, and `len(left) − i = 2 − 0 = 2` inversions (2 > 1 and 4 > 1). Compare 2 and 3, take 2. Compare 4 and 3, take 3, plus `2 − 1 = 1` inversion (4 > 3). Then 4, then 5. Total 3: the pairs (2,1), (4,1), (4,3). The count was free: the merge already did the comparisons; we only had to notice what a comparison implied.

### The eight values, every merge

Now the eight values from the visualisation, `[38, 27, 43, 3, 9, 82, 10, 5]`, every merge from the leaves up. Each row is one merge: the sorted halves, the order in which elements are taken, and the count added whenever a right element is taken (`len(left) − i`, the number of left elements still waiting).

| Level | Left | Right | Takes (count added) | Inversions in this merge | Total for this node |
|---|---|---|---|---|---|
| 2 | `[38]` | `[27]` | 27 (+1), then 38 | 1 | 1 |
| 2 | `[43]` | `[3]` | 3 (+1), then 43 | 1 | 1 |
| 2 | `[9]` | `[82]` | 9, then 82 | 0 | 0 |
| 2 | `[10]` | `[5]` | 5 (+1), then 10 | 1 | 1 |
| 1 | `[27, 38]` | `[3, 43]` | 3 (+2), 27, 38, then 43 | 2 | 1 + 1 + 2 = 4 |
| 1 | `[9, 82]` | `[5, 10]` | 5 (+2), 9, 10 (+1), then 82 | 3 | 0 + 1 + 3 = 4 |
| 0 | `[3, 27, 38, 43]` | `[5, 9, 10, 82]` | 3, 5 (+3), 9 (+3), 10 (+3), 27, 38, 43, then 82 | 9 | 4 + 4 + 9 = 17 |

Seventeen inversions, and a brute-force double loop over the 28 pairs agrees. Look at the root merge: taking 5 costs three at once because 27, 38 and 43 are all still in the left half, all larger than 5, and all preceded it in the input. Nine crossing pairs were counted with eight comparisons.

The recurrence is unchanged, $2T(n/2) + O(n)$, so inversion counting is $O(n \log n)$. This is the pattern to internalise: **divide and conquer gives you a place, the combine step, where the two halves meet, and any question about pairs that straddle the split can often be answered there in linear time**. Counting pairs with sum below a threshold, counting "important reverse pairs" (`a[i] > 2·a[j]`), and computing the closest pair of points all use the same move.

## When the split is not in the middle

Divide and conquer does not require equal halves, but the recurrence punishes unequal ones. Quicksort with a good pivot is $2T(n/2) + O(n)$; with the worst pivot it is $T(n − 1) + O(n) = O(n^2)$. Quickselect (from the [order statistics lesson](/learn/algorithms/sorting-searching/selection-and-order-statistics)) recurses into only one side, $T(n/2) + O(n)$, which is case 3: $\Theta(n)$, and that single-sided recursion is the reason it beats sorting. [Median of Two Sorted Arrays](/practice/median-two-sorted) is the same single-sided idea applied to two arrays at once: each step discards a constant fraction of the search space, so $T(n) = T(n/2) + O(1) = O(\log n)$.

The maximum subarray problem shows divide and conquer as an *honest but beaten* solution. Split in the middle; the best subarray is entirely left, entirely right, or crosses the midpoint. The crossing case is found in `O(n)` by extending left and right from the middle, so $T(n) = 2T(n/2) + O(n) = O(n \log n)$. That is a fine answer, and Kadane's algorithm (from the [sequence DP lesson](/learn/algorithms/dynamic-programming/sequence-dp)) does it in `O(n)` with one pass. A senior engineer knows both, presents the linear one, and can explain why the divide-and-conquer version is the one that generalises to segment trees (the `O(n log n)` structure is exactly the per-node "best crossing" data a segment tree stores).

## The habit

Before you write a recursive function, write its recurrence in the margin. After you write it, check two things: that the split really shrinks the input by a constant factor (not by one), and that the combine step's cost is what you claimed (slices, list concatenations and hidden `in` checks on lists all cost `O(n)`). If the recurrence lands in case 3, ask whether the recursion is doing anything a loop would not. If it lands in case 2 with a linear combine, look for pair-questions you can answer in the merge for free.

## Under the hood

**`sorted` is a merge sort you cannot beat from Python.** CPython's `list.sort` is Timsort: it scans for already-ordered *runs* (reversing descending ones), extends short runs to a minimum length of 32–64 with insertion sort, and merges runs with the same two-pointer merge as this lesson, in C, with a "galloping" mode that skips ahead by binary search when one side keeps winning. The temporary buffer is at most `n / 2` elements, half of what a naive merge allocates. Two consequences for your code. A hand-written merge sort in Python pays interpreter overhead on every comparison and append: on 200,000 random integers it took 176 ms against 22 ms for `sorted` on this machine, about 8× slower (the ratio depends on the machine and the key type; take it as an order of magnitude). And an already-sorted input is one run, so `sorted` finishes in `O(n)`, 1.6 ms for the same 200,000 elements, while your merge sort still does every level. The [comparison sorts lesson](/learn/algorithms/sorting-searching/comparison-sorts) has the rest of Timsort; the point here is that when you need the *sort*, call the library, and when you need the *combine step* (inversions, crossing pairs) you write the merge yourself and accept the constant factor.

**Recursion and the call stack.** A Python call costs tens of nanoseconds on CPython 3.11 and later (about 50 ns for a trivial recursive call on 3.14 when this lesson was checked) and a few hundred bytes of frame. Merge sort's depth is `⌈log₂ n⌉`, 20 for a million elements, nowhere near the default recursion limit of 1,000; only the `T(n − 1)` shape or a badly unbalanced split gets you there. CPython does no tail-call elimination, so the "convert to iteration" advice in the [recursion lesson](/learn/algorithms/recursion-backtracking/recursion-design) is about depth, not speed, for balanced recursions. JavaScript engines behave the same way (ES2015's proper tail calls shipped in Safari's JavaScriptCore, while [V8 implemented them but did not ship them](https://v8.dev/blog/modern-javascript); stack limits are around ten thousand frames).

**Slices allocate.** `a[:mid]` copies `mid` pointers: 0.6 ms for 500,000 elements here, and that copy happens at every level of the recursion. For merge sort the copies double `f(n)` from `n` to about `2n`, which is invisible in the asymptotics and a measurable constant. For a slice-based binary search on a million elements the copies are the entire cost: 1.6 ms per search against 0.8 µs with indices, a factor of two thousand, because `T(n) = T(n/2) + O(n)` is `O(n)` and `T(n/2) + O(1)` is `O(log n)`.

## Quantified costs

- **Comparisons.** Merge sort makes at most `n⌈log₂ n⌉` comparisons: about `2 × 10⁷` for `n = 10⁶`, and the merges move the same number of elements. Timsort on random data is within a small factor of that; on sorted data it is `n − 1`.
- **Depth.** `⌈log₂ n⌉` frames: 20 for `10⁶`, 30 for `10⁹`. A quicksort that always picks the smallest element as pivot has depth `n`.
- **Slices.** Copying `n` pointers costs roughly `1.2 ns` per element at these sizes, so the slice overhead of merge sort on `10⁶` elements is about `20 levels × 10⁶ × 1.2 ns ≈ 25 ms`, a fraction of the interpreter cost of the comparisons.
- **Inversion counts.** The maximum is `n(n − 1)/2`: `2,147,450,880` at `n = 65,536` and `2,147,516,416` at `n = 65,537`, on either side of `2³¹ − 1`. A 32-bit counter wraps at 65,537 elements; a 64-bit counter is safe past `n = 4 × 10⁹`; JavaScript's doubles are exact to `2⁵³`, which covers `n` up to about `1.3 × 10⁸`.
- **Memory.** The recursive version allocates `O(n)` at each level and frees it on return, `O(n log n)` allocations in total but `O(n)` live at any moment. An in-place merge exists but is far slower; a single reusable buffer of size `n` is the usual production compromise.

## Choosing an inversion counter

| Method | Time | Extra memory | Handles a stream (values arrive one at a time)? | Handles updates to the array? | Lines of code |
|---|---|---|---|---|---|
| Double loop | `O(n²)` | `O(1)` | yes | recount | 3 |
| Merge sort | `O(n log n)` | `O(n)` | no, needs the whole array | recount | 15 |
| Fenwick tree over compressed values | `O(n log n)` | `O(n)` | yes: count how many earlier values exceed each new one | yes, with point updates | 25 plus coordinate compression |
| Balanced BST / order-statistic tree | `O(n log n)` | `O(n)` | yes | yes | 60+ |

Merge sort wins when the array is given up front and nothing changes. The [Fenwick tree](/learn/advanced-data-structures/range-queries/fenwick-trees) wins when elements arrive as a stream or the array is edited between queries: insert each value's rank, and the number of earlier elements greater than it is a prefix-sum query.

## Failure modes

**Symptom: a "binary search" runs in milliseconds on a million elements instead of microseconds.** Diagnosis: it recurses on `a[:mid]` and `a[mid + 1:]`, so each level copies half the array and the recurrence becomes `T(n/2) + O(n) = O(n)`. Fix: pass `lo` and `hi` indices; the measured difference is 1.6 ms against 0.8 µs.

**Symptom: `RecursionError` (Python) or a stack overflow on input around a thousand elements.** Diagnosis: the "divide" step shrinks the input by one, `T(n − 1) + f(n)`, which is a loop wearing recursion's clothes: depth `n`, and `Θ(n²)` if `f` is linear. Fix: write the loop; keep recursion for splits by a constant factor, where the depth is `log n`.

**Symptom: a divide-and-conquer function is `O(n²)` although the recurrence "was" `2T(n/2) + O(n)`.** Diagnosis: the combine step hides a linear operation inside an apparently constant one: `x in some_list`, `left + right` list concatenation inside a loop, `list.insert(0, x)`, or `str += piece`. Each is `O(n)` and turns `f(n)` quadratic. Fix: audit every operation in the combine step for its real cost, and prefer sets, `deque.appendleft` or `''.join` at the end.

**Symptom: the inversion count is right on random data and wrong when the array has duplicates.** Diagnosis: the merge takes from the right on ties (`<` instead of `<=`), so equal elements are counted as inversions. On `[2, 2, 1]` the strict comparison gives 2 and the wrong one gives 3. Fix: `left[i] <= right[j]` takes the left element on ties; this also keeps the sort stable.

**Symptom: a negative inversion count in Java or C, or a count that is far too small.** Diagnosis: 32-bit accumulator; `n(n − 1)/2` passes `2³¹` at `n = 65,537`. Fix: a 64-bit counter, and a test with a reversed array of 100,000 elements.

**Symptom: quicksort-style code is fast on random input and times out on sorted or nearly sorted input.** Diagnosis: the split is not balanced; with a first-element pivot the recurrence becomes `T(n − 1) + O(n)`. Fix: random or median-of-three pivots, or use the library sort, which detects sorted runs and finishes in linear time.

## Interviewer follow-ups

**"Count the pairs `i < j` with `a[i] > 2·a[j]` instead."** Model answer: same merge sort, but the counting can no longer ride on the merge comparison because the condition is not the sort order. Before merging, run a separate two-pointer pass over the two sorted halves (for each left element advance a right pointer while `left[i] > 2·right[j]`), which is `O(n)` per level, then merge as usual; still `O(n log n)`. Common wrong answer: changing the merge condition to `left[i] <= 2·right[j]`, which breaks the sort and therefore every later merge.

**"The array is updated between queries."** Model answer: merge sort recounts from scratch at `O(n log n)` per query. Keep a Fenwick tree over the compressed values: each update adjusts the count in `O(log n)` by querying how many elements on each side would form inversions with the old and new values. Common wrong answer: rerunning merge sort after every update.

**"Write merge sort without recursion."** Model answer: bottom-up merging with a width that doubles each pass (1, 2, 4, …), merging adjacent blocks of that width; `⌈log₂ n⌉` passes over the array, one reusable buffer, no stack. Common wrong answer: simulating the recursion with an explicit stack, which works but keeps the allocation pattern of the recursive version.

**"The data is 100 GB and the machine has 8 GB of RAM."** Model answer: external merge sort. Sort 4 GB chunks in memory with the library sort, write each as a sorted run, then do a k-way merge of the runs with a heap, reading sequentially; the [k-way merge lesson](/learn/data-structures/heaps/top-k-and-k-way-merge) has the heap. Inversion counting survives this: count within each run during the in-memory sort and count crossing pairs during the k-way merge with per-run "how many unread elements are larger" bookkeeping. Common wrong answer: quicksort with random access on disk.

**"Why is the median-of-two-sorted-arrays recurrence `T(n/2) + O(1)` and not `2T(n/2)`?"** Model answer: each step compares two candidate medians and discards a constant fraction of *one* array without recursing into the other; only one subproblem survives, so the leaves do not multiply and the cost is the depth, `O(log n)`. Common wrong answer: "because the arrays are sorted", which is the precondition, not the recurrence.

## What mid-level engineers get wrong

- **Not writing the recurrence.** They cannot tell four subproblems of half size (`n²`) from three (`n^1.585`) or two (`n log n`) by looking at the code, so they cannot predict which refactor will pay.
- **Slicing in the recursive call.** Correct, and `O(n)` where `O(log n)` was intended; the bug is invisible in tests on small inputs.
- **Treating `T(n − 1) + O(n)` as divide and conquer.** It is a quadratic loop with a stack overflow attached.
- **Ignoring the combine step's real cost.** A list `in`, a concatenation or an `insert(0, …)` makes `f(n)` linear per element and the algorithm quadratic.
- **Counting ties as inversions.** `<` instead of `<=` in the merge; wrong counts on any input with duplicates and an unstable sort as a bonus.
- **Storing the count in a 32-bit integer.** Wraps at 65,537 elements.
- **Reimplementing sorting.** Hand-written merge sort is an order of magnitude slower than Timsort in Python and does not detect sorted runs; write the merge only when you need the combine step for something the library cannot give you.

## Exercises

```exercise
id: count-inversions
title: Count inversions with merge sort
prompt: |
  Implement `count_inversions(nums)`: the number of index pairs `i < j` with
  `nums[i] > nums[j]` (strictly greater; equal values are not inversions).
  Do it in O(n log n) by counting inside the merge step.
languages: [python, javascript]
entry: count_inversions
starter:
  python: |
    def count_inversions(nums):
        def sort_count(a):
            # return (sorted copy, inversions within a)
            return a, 0
        return sort_count(nums)[1]
  javascript: |
    function count_inversions(nums) {
      function sortCount(a) {
        // return [sorted copy, inversions within a]
        return [a, 0];
      }
      return sortCount(nums)[1];
    }
tests:
  - args: [[2, 4, 1, 3, 5]]
    expected: 3
    label: the trace from the lesson
  - args: [[1, 2, 3]]
    expected: 0
    label: sorted
  - args: [[3, 2, 1]]
    expected: 3
    label: reversed
  - args: [[]]
    expected: 0
  - args: [[1]]
    expected: 0
  - args: [[5, 4, 3, 2, 1]]
    expected: 10
    hidden: true
  - args: [[2, 2, 1]]
    expected: 2
    hidden: true
    label: equal values are not inversions
  - args: [[1, 3, 5, 2, 4, 6]]
    expected: 3
    hidden: true
hints:
  - "When you take `right[j]` because `left[i] > right[j]`, add `len(left) - i` to the count."
  - "Use `<=` when comparing so that equal elements are taken from the left and not counted."
  - "Return both the sorted half and its count from the recursive call; the caller sums the counts."
```

```exercise
id: max-subarray-divide-conquer
title: Maximum subarray by divide and conquer
prompt: |
  Implement `max_subarray_sum(nums)` (non-empty array) using divide and
  conquer: split at the middle, recurse on both halves, and compute the best
  sum that crosses the middle in O(n). Return the maximum subarray sum.
  (Kadane's algorithm is O(n); the point here is to get the crossing case
  right, which is the same computation a segment tree node stores.)
languages: [python, javascript]
entry: max_subarray_sum
starter:
  python: |
    def max_subarray_sum(nums):
        def best(lo, hi):
            # inclusive range; return the best sum within nums[lo..hi]
            return nums[lo]
        return best(0, len(nums) - 1)
  javascript: |
    function max_subarray_sum(nums) {
      function best(lo, hi) {
        // inclusive range; return the best sum within nums[lo..hi]
        return nums[lo];
      }
      return best(0, nums.length - 1);
    }
tests:
  - args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]]
    expected: 6
  - args: [[1]]
    expected: 1
  - args: [[-3, -1, -2]]
    expected: -1
    label: all negative
  - args: [[5, 4, -1, 7, 8]]
    expected: 23
  - args: [[-1, 2, 3, -9, 4]]
    expected: 5
    hidden: true
  - args: [[0, 0, 0]]
    expected: 0
    hidden: true
  - args: [[2, -1, 2, -1, 2]]
    expected: 4
    hidden: true
    label: crossing sum beats both halves
hints:
  - "Base case: a single element is its own best sum (it may be negative)."
  - "Crossing case: scan left from `mid` keeping the best running sum, scan right from `mid + 1` likewise, add the two."
  - "Return `max(best(lo, mid), best(mid + 1, hi), crossing)`."
```

## Senior signals

- You write the recurrence before the code, and you can name `a`, `b` and `f(n)` for any recursive function in the codebase.
- You solve the three master-theorem cases from the recursion tree rather than memorising them, and you know the theorem's gaps (unequal splits, `n − 1` recursion, `n log n` combine).
- You know that slicing in Python or `Array.prototype.slice` in JavaScript adds `O(n)` to `f(n)`, and you pass indices when it matters.
- You look at any linear combine step and ask what pair-question it could answer for free; inversion counting is the canonical example, and you can name its two alternatives (a Fenwick tree for streaming input, external k-way merging for data that does not fit in memory) and when each wins.
- You can explain why four subproblems of half size is no better than the naive quadratic algorithm, and why three is.
- You present the linear algorithm when one exists (Kadane) but can explain why the divide-and-conquer version is the one that generalises (segment trees).
- You know that `sorted` is Timsort doing the same merge in C with run detection, so a hand-written merge sort in Python is an order of magnitude slower and `O(n)` on sorted input is free only with the library.
- You size the count before you type it: `n(n − 1)/2` overflows a 32-bit integer at `n = 65,537`, and you know which languages silently wrap.

## Check yourself

```quiz
- q: >-
    A recursive function makes 4 calls on inputs of size n/2 and does O(n) work to combine. What is its complexity?
  options: ["O(n²)", "O(n log n)", "O(n^1.585)", "O(n)"]
  answer: 0
  explanation: >-
    log₂ 4 = 2, so the leaves contribute n². The combine f(n) = n is polynomially smaller, case 1, so the leaves dominate and the total is Θ(n²). Four half-size subproblems is exactly what naive divide-and-conquer multiplication does, which is why it gains nothing.
- q: >-
    Merge sort implemented with `a[:mid]` slices in Python is still O(n log n), but binary search implemented with slices becomes O(n). Why the difference?
  options: ["Merge sort already does O(n) per call, so the slice is absorbed; binary search did O(1)", "Merge sort splits the slice cost across its two calls, so each call pays only O(n/2)", "Merge sort frees each slice after merging, while binary search keeps every slice alive in memory", "Merge sort slices only at the top level; its deeper calls reuse the same list objects"]
  answer: 0
  explanation: >-
    The recurrence's f(n) term absorbs the slice cost. For merge sort f(n) goes from n to 2n (same class), because the merge was already linear. For binary search it goes from 1 to n, turning T(n) = T(n/2) + O(1) into T(n/2) + O(n) = O(n). Sharing the cost between two calls is not the reason: every call on n elements pays O(n) for its own slices, and that only hurts when f(n) was smaller than O(n).
- q: >-
    During a merge, `left = [2, 4, 7]` and `right = [1, 5, 6]`, and `right[0] = 1` is taken first. How many inversions does that single step account for?
  options: ["0", "1", "2", "3"]
  answer: 3
  explanation: >-
    Every element still remaining in the left half (2, 4, 7) is greater than 1 and preceded it in the original array, so 3 inversions are found at once. That is why the count is len(left) − i, not 1, and why nothing needs to be counted separately at the end.
- q: >-
    Which recurrence does the master theorem NOT directly solve?
  options: ["T(n) = T(n − 1) + n", "T(n) = T(n/2) + 1", "T(n) = 2T(n/2) + n", "T(n) = 7T(n/2) + n²"]
  answer: 0
  explanation: >-
    The theorem needs a split by a constant factor b > 1. Subtracting one is not a divide-and-conquer shape; the recursion tree has n levels of decreasing linear work, summing to Θ(n²), and the 'recursion' is really a loop.
- q: >-
    The divide-and-conquer maximum-subarray algorithm is O(n log n) while Kadane's is O(n). Why is the slower one still worth knowing?
  options: ["Its per-segment summaries are what a segment tree stores, enabling range queries", "Its recursion has better cache locality than Kadane's pass, so it is faster on real hardware", "It handles all-negative arrays, which Kadane's single pass cannot do without a fix", "It uses O(log n) stack space, less than the O(n) table Kadane's algorithm needs"]
  answer: 0
  explanation: >-
    Kadane is a single pass with no structure to reuse. The divide-and-conquer decomposition (best-left, best-right, best-crossing per segment) is precisely the information a segment tree node holds, which lets you answer maximum-subarray queries on arbitrary ranges after point updates in O(log n). Kadane's needs no table (O(1) extra space), handles all-negative input when initialised with the first element, and a single sequential pass is as cache-friendly as code gets.
- q: >-
    A Java port of count_inversions keeps the count in an int and returns a negative number for a reversed array of 100,000 elements. Why, and at what size does the problem start?
  options: ["n(n − 1)/2 exceeds 2³¹ − 1 once n reaches 65,537, so the count wraps; use a long", "Timsort's run detection skipped merges, so counts were lost; disable the fast path", "len(left) − i is negative when the right half is exhausted; clamp it at zero", "The recursion depth of log₂ n overflowed the JVM stack; increase the thread stack size"]
  answer: 0
  explanation: >-
    A reversed array has every pair inverted, n(n − 1)/2 of them, which passes 2,147,483,647 between n = 65,536 and n = 65,537. Java wraps silently; JavaScript stays exact to 2⁵³; Python never overflows. The recursion is only 17 deep, len(left) − i is never negative because the loop stops when the left half is exhausted, and the counting code does not use the library sort.
```
