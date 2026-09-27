---
slug: sorting-based-patterns
title: "Sorting-based patterns: pay O(n log n) once, then sweep"
description: When one sort call turns a quadratic pairing problem into a linear sweep, how to choose the sort key so the greedy step becomes forced, and when sorting is the wrong tool next to a heap, counting or quickselect.
minutes: 33
difficulty: medium
tags: [sorting, comparator, greedy-sweep, quickselect, pattern:sorting]
problems: [three-sum, merge-intervals, meeting-rooms, kth-largest-array, hand-of-straights, k-closest-points, group-anagrams]
---
A problem asks you to relate elements to each other: which pairs sum to zero, which meetings collide, which cards form consecutive runs, which strings are rearrangements of one another. The naive version compares every element to every other and costs `O(n²)`. The problem is not that the comparisons are slow; it is that almost all of them are wasted, because the elements that matter to a given element are the ones *near it* in some ordering, and you do not know that ordering yet.

Sorting is how you buy that ordering. After one `O(n log n)` sort by the right key, "the nearest element by that key" is a neighbour in the array, "all elements with the same key" form a contiguous run, and "the smallest remaining element" is whatever the sweep pointer is standing on. Every sorting-based pattern is the same three-step shape: choose the key, sort, sweep once. The skill is choosing the key so the sweep becomes trivial, and knowing when a heap, a counting array or quickselect does the same job cheaper. This lesson assumes the mechanics from [Comparison sorts](/learn/algorithms/sorting-searching/comparison-sorts) and [Non-comparison sorts and lower bounds](/learn/algorithms/sorting-searching/non-comparison-sorts-and-lower-bounds).

## The signal

The phrases that point at a sort:

- **A relation between elements that depends on their order.** "Pairs that sum to", "closest pair", "minimum difference", "consecutive", "overlapping", "conflicting". Sorting puts related elements next to each other.
- **"Group" or "same as".** [Group Anagrams](/practice/group-anagrams) groups strings by a canonical form, and the canonical form of an anagram is its sorted characters.
- **"k-th largest / smallest", "top k".** Sorting answers this in `O(n log n)`; the decision is whether a heap or quickselect beats it (below).
- **A greedy that needs "the smallest remaining" or "the earliest ending".** [Hand of Straights](/practice/hand-of-straights), [Meeting Rooms](/practice/meeting-rooms), [Merge Intervals](/practice/merge-intervals). The greedy is only correct because the sweep visits elements in key order.
- **Output order does not matter, or you are allowed to carry indices along.** If the answer must refer to original positions ([Two Sum](/practice/two-sum) wants indices), sorting destroys them unless you sort `(value, index)` pairs.

What rules sorting out, or at least demotes it:

- **An explicit `O(n)` requirement.** Then the answer is a hash map (membership, grouping by exact key) or a counting array (small integer key range). Sorting to get `O(n log n)` when the interviewer said linear is a mark against you.
- **Streaming or unbounded input.** You cannot sort what has not arrived. A heap of size `k` handles "top k so far".
- **Only `k` of the `n` elements matter and `k` is small.** A full sort does `n log n` work to answer a `k`-sized question; a heap does `n log k`, quickselect does `n` on average.
- **The relation is not captured by any single key.** "Which pairs of points are within distance `d` in 2D" has no one-dimensional ordering that puts all close pairs adjacent; that is a grid or a k-d tree.

The nearest confusable neighbour is the hash map. Both make "find the related element" cheap. The hash map does it in `O(1)` per lookup with `O(n)` extra memory and needs an *exact* key; the sort does it with `O(1)` extra memory (in place) and supports *nearest* and *range* relations. Pick by what relation you need and by whether memory or time is the constraint the interviewer set.

## The template

The generic shape, with the three decisions marked:

```python
def sort_then_sweep(items, key):
    items = sorted(items, key=key)          # 1. the key is the design decision
    out = []
    i = 0
    while i < len(items):
        # 2. items[i] is the smallest unprocessed element by key;
        #    items[i-1] and items[i+1] are its nearest neighbours by key;
        #    a run of equal keys is contiguous starting at i
        j = i
        while j < len(items) and key(items[j]) == key(items[i]):
            j += 1                          # 3. consume the run [i, j)
        out.append(items[i:j])
        i = j
    return out
```

```javascript
function sortThenSweep(items, key) {
  const sorted = [...items].sort((a, b) => key(a) - key(b)); // numeric keys
  const out = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && key(sorted[j]) === key(sorted[i])) j++;
    out.push(sorted.slice(i, j));
    i = j;
  }
  return out;
}
```

The invariant after the sort: for any `i < j`, `key(items[i]) <= key(items[j])`. Everything the sweep does follows from it. The nearest element by key to `items[i]` is `items[i-1]` or `items[i+1]`; equal keys are contiguous; and the smallest element you have not yet consumed is at the sweep pointer, which is what makes greedy choices *forced* rather than merely plausible.

Composite keys are where most of the design happens. Sort intervals by start and, for equal starts, by longest first: Python `key=lambda iv: (iv[0], -iv[1])`; JavaScript `(a, b) => a[0] - b[0] || b[1] - a[1]`. Sort by frequency descending then value ascending: `key=lambda x: (-count[x], x)`. Sort indices instead of values when you must remember positions: `order = sorted(range(n), key=lambda i: nums[i])`.

Both languages give you a stable sort (Python's Timsort always; V8 since 2018), so sorting by a secondary key first and then by the primary key is another way to get a composite order, and the one you need when the primary sort is a library call you cannot pass a tuple to.

Watch a comparison sort do its `n log n` work, then a counting sort do the same job in `O(n + range)` when the keys are small integers. The second one is the template's escape hatch.

```viz
{"type": "array", "algorithm": "quick-sort", "values": [7, 2, 9, 4, 1, 8, 3]}
```

```viz
{"type": "array", "algorithm": "counting-sort", "values": [3, 1, 4, 1, 5, 9, 2, 6, 5, 3], "caption": "Keys in a small range: count them, then emit. No comparisons, and it is stable if you emit by prefix counts."}
```

## Worked problems

### Hand of Straights

[Hand of Straights](/practice/hand-of-straights): given cards with integer values and a group size `w`, decide whether the cards can be split into groups where each group is `w` consecutive values.

The key insight is that the smallest remaining card has no smaller card to precede it, so it **must be the start of a group**. That choice is forced, which makes the greedy correct by a one-line exchange argument: any valid grouping has the smallest card starting some group, so consuming `[min, min + w)` now never removes an option. To make "smallest remaining" cheap, count the cards and sweep the distinct values in sorted order.

Trace `hand = [1, 2, 3, 6, 2, 3, 4, 7, 8]`, `w = 3`. `len(hand) = 9` is divisible by 3, so continue. Counts: `{1:1, 2:2, 3:2, 4:1, 6:1, 7:1, 8:1}`; sorted distinct keys `[1, 2, 3, 4, 6, 7, 8]`.

| Key | Count now | Action | Counts after |
|---|---|---|---|
| 1 | 1 | start 1 group at 1: take one each of 1, 2, 3 | `{1:0, 2:1, 3:1, 4:1, 6:1, 7:1, 8:1}` |
| 2 | 1 | start 1 group at 2: take 2, 3, 4 | `{2:0, 3:0, 4:0, 6:1, 7:1, 8:1}` |
| 3 | 0 | skip | |
| 4 | 0 | skip | |
| 6 | 1 | start 1 group at 6: take 6, 7, 8 | all zero |
| 7, 8 | 0 | skip | |

Every count hits zero: `true`. If at any step a needed value `x + d` has fewer copies than the count of `x`, return `false` immediately.

```python
from collections import Counter

def is_n_straight_hand(hand: list[int], w: int) -> bool:
    if len(hand) % w:
        return False
    count = Counter(hand)
    for x in sorted(count):                 # smallest remaining first
        c = count[x]
        if c == 0:
            continue
        for d in range(w):                  # a run must start here, c times
            if count[x + d] < c:
                return False
            count[x + d] -= c
    return True
```

Sorting the distinct keys costs `O(n log n)`. The inner loop looks like `O(n · w)` but each iteration with `c > 0` retires `c · w` cards and there are only `n` cards, so it is `O(n)` total. Overall `O(n log n)`, space `O(n)` for the counter.

A version without the sort exists: for each card, walk down to the start of its run (`while count[x-1] > 0: x -= 1`) and then consume forward. It is `O(n · w)` in the worst case and harder to argue; the sorted sweep is the one to write under pressure.

### Kth Largest Element in an Array

[Kth Largest Element in an Array](/practice/kth-largest-array): return the `k`-th largest value (not distinct) in an unsorted array.

This is the problem where the pattern's decision table lives. Three correct answers:

| Approach | Time | Space | Notes |
|---|---|---|---|
| Sort, return `nums[n - k]` | `O(n log n)` | `O(1)` in place | Two lines; correct; the interviewer will ask for better |
| Min-heap of size `k` | `O(n log k)` | `O(k)` | Works on a stream; wins when `k ≪ n` |
| Quickselect | `O(n)` average, `O(n²)` worst | `O(1)` | Mutates input; randomise the pivot |

Say all three, then write the one the constraints favour. With the whole array in memory and `k` arbitrary, quickselect is the expected answer; see [Selection and order statistics](/learn/algorithms/sorting-searching/selection-and-order-statistics) for the median-of-medians guarantee.

Trace quickselect on `nums = [3, 2, 1, 5, 6, 4]`, `k = 2`. The `k`-th largest sits at index `t = n - k = 4` in ascending order. Lomuto partition with the last element as pivot: `i` marks the boundary of "less than pivot"; each `j` that is smaller swaps into position `i`.

| Range | Pivot | Partition steps | Array after | Pivot lands at | Decision |
|---|---|---|---|---|---|
| `[0, 5]` | 4 | 3, 2, 1 are `< 4` and stay in place (`i` advances to 3); 5, 6 are not; swap pivot into index 3 | `[3, 2, 1, 4, 6, 5]` | 3 | `3 < 4`, recurse right: `lo = 4` |
| `[4, 5]` | 5 | 6 is not `< 5`; swap pivot into index 4 | `[3, 2, 1, 4, 5, 6]` | 4 | `4 == t`, answer `nums[4] = 5` |

Two partitions, six element comparisons in the first and one in the second, against the twelve or so a full sort would spend.

```python
import random

def find_kth_largest(nums: list[int], k: int) -> int:
    t = len(nums) - k
    lo, hi = 0, len(nums) - 1
    while True:
        p = random.randint(lo, hi)
        nums[p], nums[hi] = nums[hi], nums[p]      # random pivot to the end
        pivot, i = nums[hi], lo
        for j in range(lo, hi):
            if nums[j] < pivot:
                nums[i], nums[j] = nums[j], nums[i]
                i += 1
        nums[i], nums[hi] = nums[hi], nums[i]
        if i == t:
            return nums[i]
        if i < t:
            lo = i + 1
        else:
            hi = i - 1
```

The random pivot is not decoration. With a fixed pivot (last element), a sorted or reverse-sorted input degrades to `O(n²)`, and sorted inputs are exactly what test suites and adversaries send. The same trade-off drives [K Closest Points to Origin](/practice/k-closest-points): quickselect on squared distance for `O(n)`, or a max-heap of size `k` when the points stream in.

### Meeting Rooms

[Meeting Rooms](/practice/meeting-rooms): given meeting intervals `[start, end)`, can one person attend all of them?

Naively compare every pair for overlap: `O(n²)`. The insight is that **after sorting by start, any overlap shows up between adjacent intervals**. Proof in one line: if interval `i` overlaps some later `j` with `j > i + 1`, then `start[i+1] <= start[j] < end[i]`, so `i` also overlaps `i + 1`. Checking adjacent pairs is therefore sufficient.

Trace `[[7, 10], [2, 4], [12, 15], [4, 7]]`. Sorted by start: `[[2, 4], [4, 7], [7, 10], [12, 15]]`.

| Previous | Current | `current.start < previous.end`? | Result |
|---|---|---|---|
| `[2, 4]` | `[4, 7]` | `4 < 4`: no | continue |
| `[4, 7]` | `[7, 10]` | `7 < 7`: no | continue |
| `[7, 10]` | `[12, 15]` | `12 < 10`: no | continue, return `true` |

Contrast `[[0, 30], [5, 10], [15, 20]]`: sorted order is unchanged, and the first comparison `5 < 30` is an overlap, so return `false` on the first step.

```python
def can_attend_all(intervals: list[list[int]]) -> bool:
    intervals.sort(key=lambda iv: iv[0])
    for prev, cur in zip(intervals, intervals[1:]):
        if cur[0] < prev[1]:
            return False
    return True
```

`O(n log n)` for the sort, `O(n)` for the sweep. Whether `[2, 4]` and `[4, 7]` collide depends on whether the end is inclusive; the trace treats ends as exclusive, and you should ask before assuming. The whole interval family, including [Merge Intervals](/practice/merge-intervals), is the same sort-then-sweep with a different sweep body, and has its own lesson next.

## Variations

**Sort by a derived key.** [Group Anagrams](/practice/group-anagrams) sorts each word's characters to make a canonical key (`"eat"`, `"tea"`, `"ate"` all become `"aet"`), then groups by that key in a hash map. That is `O(L log L)` per word; a 26-slot count tuple is an `O(L)` key with the same grouping and is the follow-up answer. Sorting appears at two levels here, and the second one is optional.

**Sort, then two pointers.** [3Sum](/practice/three-sum) sorts so that for each fixed `a`, the pair `b + c = -a` can be found with pointers converging from both ends, and duplicates can be skipped by comparing to the previous value. The sort is what makes both the pointer movement and the deduplication correct; without it, neither works.

**Sort indices, not values.** When the output must refer to original positions, sort `range(n)` by `nums[i]` (or sort `(value, index)` pairs). The sweep runs over the permutation and reads values through it. Same cost, and it is the standard way to avoid "I lost the indices".

**Counting instead of comparing.** Keys that are small integers (colours 0–2, letters, ages, frequencies bounded by `n`) are sorted in `O(n + range)` by counting. [Top K Frequent Elements](/practice/top-k-frequent) is bucket sort by frequency; the buckets are indexed 0..n, so no comparisons happen.

**Partial sort.** When you need the `k` smallest in order, `heapq.nsmallest(k, items)` is `O(n log k)` and quickselect followed by sorting the `k`-prefix is `O(n + k log k)`. A full sort is only right when `k` is close to `n` or when the interviewer prefers the two-line version and says so.

**Sorting the wrong thing on purpose.** Sometimes you sort a *copy* to compute a target order and then walk the original to answer "how many elements are out of place" or "the shortest unsorted subarray". The sorted copy is a reference, not the answer.

## Pitfalls

- **JavaScript's default comparator.** `[10, 9, 1].sort()` gives `[1, 10, 9]` because it converts to strings. Always pass `(a, b) => a - b` for numbers. Also never return a boolean from a comparator (`a > b`); the sort contract wants negative, zero or positive, and a boolean comparator gives engine-dependent garbage.
- **Sorting when the problem needs indices.** [Two Sum](/practice/two-sum) returns indices; sorting scrambles them and candidates return the sorted positions. Sort pairs or indices, or use the hash map the problem actually wants.
- **Assuming stability you do not have.** Python and modern V8 are stable; C's `qsort`, Go's `sort.Slice` and Java's `Arrays.sort` on primitives are not. If the second-key trick matters, use the stable variant explicitly (`sort.SliceStable`) or put both keys in the comparator.
- **Mutating an input the interviewer wanted intact.** `nums.sort()` in Python and `arr.sort()` in JavaScript are in place. Use `sorted(nums)` / `[...arr].sort(...)` when the caller may still need the original, and say which you chose.
- **Sorting under an `O(n)` constraint.** If the statement says linear time, the sort is the wrong answer even if it passes. Look for the counting or hashing version.
- **A greedy that is not forced.** The hand-of-straights greedy works because the smallest remaining card has exactly one legal role. Before you trust "sort then take greedily", say what the smallest element is forced to do and why no other choice can do better. If you cannot, the greedy is probably wrong.
- **Floating-point keys.** `NaN` compares false with everything and can make a comparator inconsistent; distances computed as `sqrt` lose precision for ties. Compare squared distances, and filter or handle `NaN` before sorting.
- **Sorting a huge list to answer a small question.** `n = 10⁷` with `k = 10` is a heap or quickselect problem; the sort is a 10x slowdown and an interviewer at the senior bar will ask why you did the extra work.

## Exercise

```exercise
id: minimum-difference-pairs
title: Pairs with the minimum absolute difference
prompt: |
  Given an array of at least two distinct integers, return every pair `[a, b]`
  with `a < b` whose difference `b - a` equals the smallest absolute
  difference between any two elements of the array. Return the pairs in
  ascending order of `a`.

  Aim for O(n log n): sort once, then a single sweep over adjacent elements.
languages: [python, javascript]
entry: min_diff_pairs
starter:
  python: |
    def min_diff_pairs(nums):
        # sort, find the smallest adjacent gap, then collect the pairs with that gap
        return []
  javascript: |
    function min_diff_pairs(nums) {
      // sort numerically, find the smallest adjacent gap, then collect the pairs with that gap
      return [];
    }
tests:
  - args: [[4, 2, 1, 3]]
    expected: [[1, 2], [2, 3], [3, 4]]
  - args: [[1, 3, 6, 10, 15]]
    expected: [[1, 3]]
  - args: [[3, 8, -10, 23, 19, -4, -14, 27]]
    expected: [[-14, -10], [19, 23], [23, 27]]
    label: negatives and several pairs
  - args: [[1, 100]]
    expected: [[1, 100]]
    label: only one pair exists
  - args: [[7, 1, 4]]
    expected: [[1, 4], [4, 7]]
    hidden: true
  - args: [[40, 11, 26, 27, -20]]
    expected: [[26, 27]]
    hidden: true
hints:
  - "After sorting, the closest element to nums[i] by value is nums[i-1] or nums[i+1], so only adjacent gaps can be the minimum."
  - "Two passes: one to find the minimum adjacent gap, one to collect every adjacent pair that has it. Or one pass that resets the result list when a smaller gap appears."
  - "In JavaScript, sort with (a, b) => a - b; the default sort compares as strings."
```

## Senior signals

- You say **which key you are sorting by and why** before you sort, and the key is the design: `(start, -end)`, `(-frequency, value)`, sorted characters, squared distance.
- You state the invariant the sort buys ("nearest by key is a neighbour", "equal keys are contiguous", "the sweep pointer is the smallest remaining") and derive the sweep from it, rather than sorting on reflex and then improvising.
- You justify a greedy on sorted data with a **forced-choice or exchange argument**, and you can name an input where a plausible-looking greedy fails.
- You compare **sort vs heap vs quickselect vs counting** for top-`k` in terms of `n`, `k`, streaming and memory, and you pick with a sentence, not a shrug.
- You know your language's sort: stability, in place or copy, comparator contract, and the JavaScript string-comparison trap.
- You notice when a sort is doing `O(n log n)` work for an `O(n)` question and switch to hashing or counting.

## Check yourself

```quiz
- q: >-
    What does `[10, 9, 1].sort()` return in JavaScript?
  options: ["A TypeError", "[10, 9, 1]", "[1, 10, 9]", "[1, 9, 10]"]
  answer: 2
  explanation: >-
    The default comparator converts elements to strings and compares lexicographically, so "10" sorts before "9". Pass `(a, b) => a - b` for numeric order. No error is thrown, which is why this bug survives into production.
- q: >-
    You need the 100th largest value from a stream of a billion readings that does not fit in memory. Which approach?
  options: ["Quickselect over the readings for rank 100", "Sort all readings, then index 100 from the end", "Counting sort on the readings, then scan down", "A size-100 min-heap that evicts its minimum"]
  answer: 3
  explanation: >-
    A size-k min-heap uses O(k) memory and O(log k) per reading, and works without seeing the whole input. Sorting and quickselect both need all readings in memory; counting sort needs a small bounded key range, which sensor readings rarely have.
- q: >-
    In Hand of Straights, why is it correct to always start a group at the smallest remaining card?
  options: ["It is a heuristic that usually works but can fail on some inputs", "Because each group must be in sorted order internally", "Because decrementing counts is cheapest when done in sorted order", "Because no smaller card can precede it, so it must start a group"]
  answer: 3
  explanation: >-
    The smallest remaining card cannot be the second or later element of any run (that would need a smaller card), so in every valid grouping it starts a run. Consuming that run now therefore never eliminates a solution. Cost is not the argument, and the greedy is exact, not heuristic.
- q: >-
    After sorting meetings by start time, why is it enough to compare each meeting only with its immediate predecessor?
  options: ["Because any overlap with a later meeting implies one with the next", "Because overlap is transitive, so conflicts chain through neighbours", "Because after sorting, only adjacent intervals are able to overlap", "Because sorting by start removes the intervals that would overlap"]
  answer: 0
  explanation: >-
    Non-adjacent overlaps exist, but each implies an adjacent overlap: start[i+1] <= start[j] < end[i], because the next meeting starts no later than the later one and before the first one ends. So a scan of adjacent pairs cannot miss a conflict. The sort does not remove anything, and overlap is not transitive in general.
- q: >-
    For Group Anagrams, compare the sorted-string key with a 26-letter count key.
  options: ["The count key breaks on words that contain repeated letters", "Both group correctly; the count key drops the sort's log factor", "Both cost O(L) per word, because the alphabet has a fixed size", "The count key only works if the word list is sorted first"]
  answer: 1
  explanation: >-
    Two words are anagrams exactly when their letter counts match, so a count tuple is a correct key and it is linear in the word length. Sorting characters is also correct but costs O(L log L) per word; a fixed alphabet does not remove that log factor. Repeated letters are handled naturally by counts, and no pre-sorting is needed.
- q: >-
    You want records ordered by department, and within each department by salary descending, using two separate calls to a stable sort. In which order do you make the calls?
  options: ["Two stable sorts cannot produce a composite order", "Sort by department first, then by salary descending", "Sort by salary descending first, then by department", "Either order gives the same final result here"]
  answer: 2
  explanation: >-
    A stable sort preserves the existing relative order among equal keys. Sorting by the secondary key (salary) first and then by the primary key (department) keeps the salary order within each department. The reverse order would scramble salaries within departments. Both keys in one comparator is the other correct option.
```
