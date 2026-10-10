---
slug: sorting-based-patterns
title: "Sorting-based patterns: pay O(n log n) once, then sweep"
description: When one sort call turns a quadratic pairing problem into a linear sweep, how to choose the key (or prove a comparator) so the greedy step is forced, what Timsort, key caching and V8's typed-array sort actually cost, and when a heap, counting or quickselect beats the sort.
minutes: 45
difficulty: medium
tags: [sorting, comparator, greedy-sweep, quickselect, pattern:sorting]
problems: [three-sum, merge-intervals, meeting-rooms, kth-largest-array, hand-of-straights, k-closest-points, group-anagrams, top-k-frequent]
---
A problem asks you to relate elements to each other: which pairs sum to zero, which meetings collide, which cards form consecutive runs, which strings are rearrangements of one another. The naive version compares every element with every other, `O(n²)`: for `n = 10⁵` that is 5 × 10⁹ comparisons, minutes in CPython. Almost all of those comparisons are wasted, because the elements that matter to a given element are the ones *near it* in some ordering, and you do not know that ordering yet.

Sorting buys the ordering. After one `O(n log n)` sort by the right key, "the nearest element by that key" is an array neighbour, "all elements with the same key" form a contiguous run, and "the smallest remaining element" is wherever the sweep pointer stands. Sorting a million random integers takes about 145 ms in CPython 3.14 and 34 ms in Node 24 with a typed array on the machine this lesson was measured on, so for `n = 10⁵` the sort is a few milliseconds and the sweep after it is linear.

Every sorting-based pattern is the same three steps: choose the key, sort, sweep once. The skill is choosing the key so the sweep becomes forced, proving it when the key is really a comparator, and knowing when a heap, a counting array or quickselect answers the same question cheaper. The algorithms themselves are in [Comparison sorts](/learn/algorithms/sorting-searching/comparison-sorts) and [Non-comparison sorts and lower bounds](/learn/algorithms/sorting-searching/non-comparison-sorts-and-lower-bounds); this lesson is about recognising the pattern and executing it.

## The signal

- **A relation that depends on order**: "pairs that sum to", "closest pair", "minimum difference", "consecutive", "overlapping", "conflicting". Sorting puts related elements next to each other.
- **"Group" or "same as"** under a canonical form: anagrams (sorted letters or letter counts), rotations, equivalent intervals.
- **"k-th largest", "top k", "median"**: sorting answers it; the decision is whether a heap or quickselect answers it cheaper.
- **A greedy that needs "the smallest remaining", "the earliest ending", "the tallest first"**: [Hand of Straights](/practice/hand-of-straights), [Meeting Rooms](/practice/meeting-rooms), [Merge Intervals](/practice/merge-intervals). The greedy is correct only because the sweep visits elements in key order.
- **Output order is free, or you may carry indices along.** If the answer must name original positions, sort `(value, index)` pairs or sort indices.

### Keys the statement hides

| Statement | Key | Why it works |
|---|---|---|
| "Arrange the numbers to form the largest number" | Comparator `a + b > b + a` on strings | Equivalent to comparing `a / (10^len(a) − 1)`, so it is a genuine order (proof below) |
| "Can the cards be split into runs of `w` consecutive values?" | Value, over distinct values | The smallest remaining card is forced to start a run |
| "Assign workers to tasks to maximise completed tasks" | Sort both lists, match greedily | Pairing the weakest sufficient worker with each task is an exchange argument |
| "Reconstruct a queue from `(height, taller-in-front)`" | `(−height, k)`, then insert at index `k` | Taller people are placed first, so later inserts do not disturb their counts |
| "Minimum arrows / non-overlapping intervals" | End, not start | The earliest end leaves the most room; see [intervals](/learn/interview-patterns/array-patterns/intervals) |
| "Group anagrams" | Sorted letters or a 26-count tuple | Anagrams are exactly the strings with equal multisets of letters |

### Near misses

| Statement | Needs instead | Why |
|---|---|---|
| "Return the **indices** of two numbers that sum to `t`" | [Hash map](/learn/interview-patterns/sequence-patterns/hash-map-patterns) | Sorting scrambles indices; a map is `O(n)` |
| "Group by exact key", `O(n)` required | Hash map | Grouping needs equality, not order |
| "Sort integers in `[0, 100]`" or "top `k` frequent" | Counting or bucket sort, `O(n + range)` | Small key range needs no comparisons ([Top K Frequent](/practice/top-k-frequent)) |
| "Top `k` of a stream" or `k ≪ n` | Size-`k` heap, `O(n log k)` | You cannot sort what has not arrived |
| "`k`-th largest", whole array in memory | Quickselect, `O(n)` average | One order statistic, not all of them |
| "All pairs of 2D points within distance `d`" | Grid buckets or a k-d tree | No single key puts all close pairs adjacent |
| "Is the array a permutation of `1..n`?" | [Cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort) or a seen-array | Values index their own slots, `O(n)` |

## Three decisions before you type

| Problem | Key | Tool | Sweep body |
|---|---|---|---|
| [3Sum](/practice/three-sum) | value | full sort | anchor + two pointers, skip duplicates |
| [Meeting Rooms](/practice/meeting-rooms) | start | full sort | compare each start with the previous end |
| [Merge Intervals](/practice/merge-intervals) | start | full sort | extend or emit the current interval |
| [Hand of Straights](/practice/hand-of-straights) | value over distinct values | sort `Counter` keys | smallest remaining starts `count` runs |
| [Kth Largest](/practice/kth-largest-array) | value | quickselect (or a size-`k` heap) | none: partition until the pivot lands at `n − k` |
| [K Closest Points](/practice/k-closest-points) | `x² + y²` (no square root) | quickselect or a size-`k` max-heap | take the first `k` |
| [Group Anagrams](/practice/group-anagrams) | canonical form per word | hash map of keys | none: append to the key's group |
| [Top K Frequent](/practice/top-k-frequent) | frequency | bucket by count, `0..n` | walk buckets from the top |

The **key** decides what "adjacent" means. The **tool** is a full sort only when you need the whole order; one order statistic is quickselect, a stream is a heap, a small integer range is counting. The **sweep body** should be forced by the order: if you cannot say what the element at the pointer must do, the greedy is probably wrong.

## The template

```python
def sort_then_sweep(items, key):
    items = sorted(items, key=key)          # 1. the key is the design decision
    groups = []
    i = 0
    while i < len(items):
        # 2. items[i] is the smallest unprocessed element by key;
        #    its nearest neighbours by key are items[i-1] and items[i+1];
        #    a run of equal keys is contiguous starting at i
        j = i
        while j < len(items) and key(items[j]) == key(items[i]):
            j += 1                          # 3. consume the run [i, j)
        groups.append(items[i:j])
        i = j
    return groups
```

```javascript
function sortThenSweep(items, key) {
  const sorted = [...items].sort((a, b) => key(a) - key(b)); // numeric keys; never the default
  const groups = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && key(sorted[j]) === key(sorted[i])) j++;
    groups.push(sorted.slice(i, j));
    i = j;
  }
  return groups;
}
```

The invariant after the sort: for any `i < j`, `key(items[i]) ≤ key(items[j])`. Everything the sweep does follows from it: the nearest element by key is an array neighbour, equal keys are contiguous, and the smallest element not yet consumed is at the pointer, which is what makes a greedy choice forced rather than plausible.

Composite keys are where most of the design happens. Intervals by start, longest first on ties: Python `key=lambda iv: (iv[0], -iv[1])`, JavaScript `(a, b) => a[0] - b[0] || b[1] - a[1]`. Frequency descending then value ascending: `key=lambda x: (-count[x], x)`. Indices instead of values when positions matter: `order = sorted(range(n), key=nums.__getitem__)`. Both languages sort stably (CPython always, V8 since 7.0 in 2018), so two stable passes, secondary key first, give the same composite order; below you will see that on large inputs the two-pass version is also faster.

```viz
{"type": "array", "algorithm": "quick-sort", "values": [7, 2, 9, 4, 1, 8, 3], "title": "Quicksort on seven values", "caption": "Lomuto partition, last element as pivot. Each partition puts its pivot in its final place; quickselect is the same partition, recursing only into the side that holds the index it wants."}
```

```viz
{"type": "array", "algorithm": "counting-sort", "values": [3, 1, 4, 1, 5, 9, 2, 6, 5, 3], "title": "Counting sort: count, prefix, place", "caption": "Keys in a small range: count them, turn the counts into starting positions with a running total, then place each element. No comparisons, and placing in input order keeps it stable."}
```

## Worked problems

### Hand of Straights

[Hand of Straights](/practice/hand-of-straights): can the cards be split into groups of `w` consecutive values? The smallest remaining card has no smaller card to precede it, so it **must start a group**. That is a forced choice, so the greedy is exact: any valid grouping has the smallest card starting some group, and consuming `[min, min + w)` now never removes an option.

```python
from collections import Counter

def is_n_straight_hand(hand: list[int], w: int) -> bool:
    if len(hand) % w:
        return False
    count = Counter(hand)
    for x in sorted(count):                 # smallest remaining first, NOT insertion order
        c = count[x]
        if c == 0:
            continue
        for d in range(w):                  # c runs must start here
            if count[x + d] < c:
                return False
            count[x + d] -= c
    return True
```

Trace `hand = [1, 2, 3, 6, 2, 3, 4, 7, 8]`, `w = 3`; sorted distinct keys `[1, 2, 3, 4, 6, 7, 8]`:

| Key | Count now | Action | Counts after |
|---|---|---|---|
| 1 | 1 | one run at 1: take 1, 2, 3 | `{2:1, 3:1, 4:1, 6:1, 7:1, 8:1}` |
| 2 | 1 | one run at 2: take 2, 3, 4 | `{6:1, 7:1, 8:1}` |
| 3, 4 | 0 | skip | |
| 6 | 1 | one run at 6: take 6, 7, 8 | all zero |
| 7, 8 | 0 | skip | return `true` |

The inner loop looks like `O(n · w)`, but each iteration with `c > 0` retires `c · w` cards and there are only `n`, so it is `O(n)` in total; the sort of distinct keys makes it `O(n log n)`. Iterating `count` without `sorted` visits keys in *insertion* order (dicts preserve it since Python 3.7), which passes on sorted samples and fails on `[3, 2, 1]`.

### Kth Largest Element in an Array

[Kth Largest Element in an Array](/practice/kth-largest-array). Three correct answers, and the round is about choosing:

| Approach | Time | Space | Notes |
|---|---|---|---|
| Sort, return `nums[n − k]` | `O(n log n)` | `O(1)` in place | Two lines; the interviewer asks for better |
| Min-heap of size `k` | `O(n log k)` | `O(k)` | Works on a stream; wins when `k ≪ n` |
| Quickselect | `O(n)` average, `O(n²)` worst | `O(1)` | Mutates input; randomise the pivot |

```python
import random

def find_kth_largest(nums: list[int], k: int) -> int:
    t = len(nums) - k                          # target index in ascending order
    lo, hi = 0, len(nums) - 1
    while True:
        p = random.randint(lo, hi)
        nums[p], nums[hi] = nums[hi], nums[p]  # random pivot to the end
        pivot, i = nums[hi], lo
        for j in range(lo, hi):
            if nums[j] < pivot:
                nums[i], nums[j] = nums[j], nums[i]
                i += 1
        nums[i], nums[hi] = nums[hi], nums[i]  # pivot lands at its final index i
        if i == t:
            return nums[i]
        if i < t:
            lo = i + 1
        else:
            hi = i - 1
```

Trace on `[3, 2, 1, 5, 6, 4]`, `k = 2`, target index `t = 4`, with the pivot taken as the last element for readability:

| Range | Pivot | Partition | Array after | Pivot at | Decision |
|---|---|---|---|---|---|
| `[0, 5]` | 4 | 3, 2, 1 are `< 4` and stay; 5, 6 are not; pivot swaps into index 3 | `[3, 2, 1, 4, 6, 5]` | 3 | `3 < 4`: `lo = 4` |
| `[4, 5]` | 5 | 6 is not `< 5`; pivot swaps into index 4 | `[3, 2, 1, 4, 5, 6]` | 4 | `4 == t`: return 5 |

The random pivot is load-bearing. With the last element as pivot on an already sorted array, every partition removes one element: on 20,000 sorted integers, the fixed-pivot version made 1.5 × 10⁸ comparisons and took 4.6 s in CPython; the random-pivot version made 71,000 and took 2 ms. Sorted inputs are exactly what test suites send. [K Closest Points](/practice/k-closest-points) is the same decision on the key `x² + y²`.

### Meeting Rooms

[Meeting Rooms](/practice/meeting-rooms): can one person attend every meeting? After sorting by start, **any overlap shows up between adjacent intervals**: if interval `i` overlaps some later `j > i + 1`, then `start[i+1] ≤ start[j] < end[i]`, so `i` also overlaps `i + 1`.

```python
def can_attend_all(intervals: list[list[int]]) -> bool:
    intervals.sort(key=lambda iv: iv[0])
    for prev, cur in zip(intervals, intervals[1:]):
        if cur[0] < prev[1]:                   # ends are exclusive: [2, 4] and [4, 7] do not clash
            return False
    return True
```

Trace `[[7, 10], [2, 4], [12, 15], [4, 7]]`, sorted to `[[2, 4], [4, 7], [7, 10], [12, 15]]`:

| Previous | Current | `current.start < previous.end`? | Result |
|---|---|---|---|
| `[2, 4]` | `[4, 7]` | `4 < 4`: no | continue |
| `[4, 7]` | `[7, 10]` | `7 < 7`: no | continue |
| `[7, 10]` | `[12, 15]` | `12 < 10`: no | return `true` |

Ask whether ends are inclusive before coding; it flips the comparison from `<` to `≤`.

### Group Anagrams

[Group Anagrams](/practice/group-anagrams): group the words that are rearrangements of each other. The sort is inside the key: two words are anagrams exactly when their sorted letters match. A 26-count tuple is the linear-time key.

```python
from collections import defaultdict

def group_anagrams(words):
    groups = defaultdict(list)
    for w in words:
        counts = [0] * 26
        for ch in w:
            counts[ord(ch) - 97] += 1
        groups[tuple(counts)].append(w)        # a list cannot be a dict key; a tuple can
    return list(groups.values())
```

Trace on `["eat", "tea", "tan", "ate", "nat", "bat"]`, showing only non-zero counts:

| Word | Count key | Group after |
|---|---|---|
| eat | a1 e1 t1 | `[eat]` |
| tea | a1 e1 t1 | `[eat, tea]` |
| tan | a1 n1 t1 | `[tan]` |
| ate | a1 e1 t1 | `[eat, tea, ate]` |
| nat | a1 n1 t1 | `[tan, nat]` |
| bat | a1 b1 t1 | `[bat]` |

Three groups. The count key is `O(L)` per word against `O(L log L)` for `"".join(sorted(w))`, but asymptotics lose to constant factors on short words in CPython (measured below), which is a trade-off worth saying out loud.

### When the order is a comparator: Largest Number

"Arrange non-negative integers to form the largest number" has no obvious key. The comparator is: put `a` before `b` when the string `a + b` is larger than `b + a`. For `[3, 30, 34, 5, 9]`: `"9" + "5" > "5" + "9"`, `"34" + "3" = "343" > "334"`, and `"3" + "30" = "330" > "303"`, so the order is `9, 5, 34, 3, 30` and the answer is `"9534330"`.

A comparator is only safe if it is a strict weak order: transitive, and consistent on ties. Here is the one-line proof that makes it a real order. Writing `|a|` for the digit count, `a + b > b + a` means `a · 10^|b| + b > b · 10^|a| + a`, which rearranges to `a / (10^|a| − 1) > b / (10^|b| − 1)`. Each side depends on one number only, so the comparator is "sort by this fraction", which is transitive. It also gives you a key and removes the comparator: `key=lambda s: Fraction(int(s), 10**len(s) - 1)`, descending. The remaining edge is all zeros: `[0, 0]` must return `"0"`, not `"00"`.

## Variants

| Variant | What changes | Cost |
|---|---|---|
| Sort, then two pointers | 3Sum, pair counts; the sort makes pointer moves and duplicate skips correct | `O(n²)` for 3Sum |
| Sort indices, not values | `sorted(range(n), key=nums.__getitem__)`; answers refer to positions | `O(n log n)` |
| Derived key inside a hash map | Group Anagrams; no global order needed | `O(n · L)` |
| Counting or bucket sort | Small integer keys, frequencies bounded by `n` | `O(n + range)` |
| Partial order: `k` smallest in order | `heapq.nsmallest(k, …)`, or quickselect then sort the prefix | `O(n log k)`, `O(n + k log k)` |
| Comparator-defined order | Prove transitivity, then `cmp_to_key` or a derived key | `n log n` comparator calls |
| Sort a copy as a reference | "Shortest unsorted subarray", "minimum swaps" | `O(n log n)` |
| Too big for memory | External sort: sorted runs on disk, then [k-way merge](/learn/interview-patterns/sequence-patterns/k-way-merge) | `O(n log n)` with sequential I/O |

## Complexity, derived

A comparison sort must distinguish `n!` orderings with yes/no answers, so it needs at least `log₂(n!) ≈ n log₂ n − 1.44 n` comparisons in the worst case: about 1.85 × 10⁷ for a million elements. The sweep after it is `O(n)` if each element is consumed once. So the pattern costs `O(n log n)` and the sweep never changes that, unless the sweep itself does more (3Sum's `O(n²)`).

| Tool for "top `k`" | Time | Extra memory | Works on a stream | Output sorted | Mutates input |
|---|---|---|---|---|---|
| Full sort | `O(n log n)` | `O(n)` for a copy | no | yes | only `list.sort` |
| Size-`k` heap | `O(n log k)` | `O(k)` | yes | after `k log k` | no |
| Quickselect | `O(n)` average | `O(1)` | no | no | yes |
| Counting / buckets | `O(n + range)` | `O(range)` | yes, if range is known | yes | no |

## Under the hood

Everything here was measured on CPython 3.14.7 and Node 24.21 on an AMD Ryzen 9 9950X3D, one million integers unless stated, best of several runs.

### Timsort sees presorted data

| Input (10⁶ ints) | CPython `sorted` | Node, `Array` + `(a, b) => a − b` |
|---|---|---|
| random | 145 ms | 141 ms |
| already sorted | 20 ms | 12 ms |
| sorted, then 10 random swaps | 22 ms | 14 ms |
| sorted, then 1,000 random values appended | 22 ms | — |
| reversed | 22 ms | — |

Timsort (CPython's `list.sort`, and V8's `Array.prototype.sort` since 2018) first scans for runs that are already ascending, or strictly descending (which it reverses in place), then merges runs, galloping through long stretches where one run wins every comparison. A sorted list is one run and costs `n − 1` comparisons. Interval lists that arrive nearly ordered (log lines by timestamp, calendar exports) sort several times faster than random data. It is also why "append, then re-sort" costs `O(n)` per insert rather than `O(n log n)`, and why that is still the wrong design for a structure that changes on every request.

### Composite keys: tuples cost memory

Sorting a million `(department, salary)` records by department, then salary descending:

| Method | Time | Peak allocation (tracemalloc) |
|---|---|---|
| `key=lambda r: (r[0], -r[1])` | 708 ms | 120 MB |
| Two stable passes with `itemgetter` keys | 262 ms | 24 MB |
| `key=cmp_to_key(compare)` | 1,871 ms | 72 MB |

`key=` computes each key once and holds all of them in a parallel array for the duration of the sort, so a tuple key allocates a million tuples plus a million negated `int` objects, and every comparison goes through tuple comparison. Two passes with `operator.itemgetter` (a C function) keep keys as the existing `int` objects, and stability makes the result identical. `cmp_to_key` wraps every element in an object whose `__lt__` calls your Python function, about `n log₂ n` Python calls.

### V8: typed arrays sort numbers natively

| Sort (10⁶ random values) | Node 24 |
|---|---|
| `Array`, comparator `(a, b) => a − b` | 141 ms |
| `Array`, default `sort()` (string comparison, wrong order) | 170 ms |
| `Float64Array.from(a).sort()` | 67 ms |
| `Int32Array.from(a).sort()` | 34 ms |

`TypedArray.prototype.sort` with no comparator sorts numerically and never calls back into JavaScript. The plain-array default converts every element to a string: `[10, 9, 1].sort()` is `[1, 10, 9]`. A comparator that returns a boolean, `(a, b) => a > b`, returns `false` (0, "equal") for half the pairs; on 20 random values it left the array unsorted. `toSorted` (ES2023) is the non-mutating copy, at the same cost as copy plus sort.

### Top `k` and the anagram key, measured

| Question | Full sort | Alternative |
|---|---|---|
| Top 10 of 10⁶ | 148 ms | `heapq.nlargest`: 5.7 ms |
| Top 1,000 of 10⁶ | 150 ms | `heapq.nlargest`: 7.5 ms |
| Top 500,000 of 10⁶ | 151 ms | `heapq.nlargest`: 984 ms |
| Anagram key, 5-letter words | `"".join(sorted(w))`: 202 ns | 26-count tuple: 287 ns |
| Anagram key, 200-letter words | 10,154 ns | 3,900 ns |

The heap wins by 26× when `k` is small and loses by 6.5× when `k` is half of `n`, where `n log k` is no longer smaller than `n log n` and the heap's Python-level loop costs more per step than Timsort's C loop. The anagram crossover sits between 5 and 20 letters: `sorted` on a short string runs in C, while the count loop is interpreted bytecode per character.

### At scale

Databases run this lesson's pattern on data that does not fit in memory. When a PostgreSQL sort exceeds `work_mem`, the executor writes sorted runs to temporary files and merges them, and `EXPLAIN ANALYZE` reports `Sort Method: external merge  Disk: …kB` instead of `quicksort  Memory: …kB`; the merge join and `GROUP BY` that follow are sort-then-sweep ([SQL and query plans](/learn/databases/relational-fundamentals/sql-and-query-plans)). Batch pipelines sort by key before grouping for the same reason: the shuffle in a MapReduce job delivers each reducer its keys in sorted order so that "all records with this key" is a contiguous run.

## Failure modes

**A leaderboard endpoint's latency grows with the number of players.** *Symptom:* p99 rises linearly over weeks; profiles show `list.sort` on every score update. *Diagnosis:* "append, then re-sort" is `O(n)` per update thanks to Timsort's run detection (22 ms at 10⁶ entries), which hid the problem at small sizes. *Fix:* a structure that keeps order under updates (a heap for top-`k`, a balanced tree or sorted container for ranks), or batch updates and re-sort once per interval.

**A JavaScript report is sorted differently in production.** *Symptom:* numeric columns come out as `1, 10, 100, 2`, or sometimes unsorted. *Diagnosis:* the default comparator (string order) or a boolean comparator (`a > b`). *Fix:* `(a, b) => a − b`, a typed array's native sort for numbers, and a lint rule against comparators that return booleans.

**A batch job is OOM-killed while sorting.** *Symptom:* a job that sorts a few million records with a tuple key dies in a container with a tight memory limit. *Diagnosis:* the key array: one tuple plus derived objects per record, 120 MB at 10⁶ records in the measurement above, on top of the records themselves. *Fix:* stable multi-pass sorts with `itemgetter`, or precompute a single integer key (`dept * 2**32 + (MAX − salary)`).

**Kth Largest times out on sorted input only.** *Symptom:* random tests pass; a sorted or reverse-sorted hidden test times out. *Diagnosis:* quickselect with a fixed pivot, quadratic on sorted data (4.6 s at 20,000 elements). *Fix:* a random pivot, or introselect (fall back to median-of-medians after too many bad partitions).

**Sorted output that is not sorted.** *Symptom:* `sorted([3, nan, 1, 2])` returns `[3, nan, 1, 2]` in CPython. *Diagnosis:* every comparison with `NaN` is false, so the comparison is not a strict weak order and the runs Timsort detects are meaningless. *Fix:* filter or map `NaN` before sorting (`key=lambda x: (math.isnan(x), x)` puts them last).

## Interviewer follow-ups

**"Now the input is a stream."** Model answer: you cannot sort what has not arrived; top `k` becomes a size-`k` heap, `O(log k)` per item and `O(k)` memory, and "is this stream of meetings conflict-free" works only if meetings arrive sorted by start (otherwise buffer or use an interval tree). If the data is finite but larger than memory, sort chunks to disk and k-way merge them. Common wrong answer: "sort it at the end", which assumes an end and unbounded memory.

**"Now values can be negative."** Model answer: comparison sorts do not care; counting sort needs an offset (`value − min`), and radix sort on two's-complement integers must flip the sign bit or negatives sort after positives. JavaScript's default sort gets even this wrong: `[-1, -2, -10].sort()` gives `[-1, -10, -2]`. Common wrong answer: "negatives break sorting".

**"Now `n` is 10⁹."** Model answer: 10⁹ 8-byte integers are 8 GB, so decide what fits: if the range is small, counting sort in one pass; if only the top `k` is needed, a heap with `O(k)` memory; otherwise an external sort with runs on disk. If `k` is close to `n`, select the `n − k` smallest instead. Common wrong answer: calling `sorted` and hoping.

**"Can you do it in `O(n)`?"** Model answer: only by leaving comparisons: counting or bucket sort for bounded keys (Top K Frequent), hashing for grouping (Group Anagrams with count keys), quickselect for one order statistic on average. The `n log n` lower bound applies to comparison sorting, not to the question. Common wrong answer: "Timsort is `O(n)` on nearly sorted data", which is true for that input and not a worst-case bound.

**"Prove your comparator is valid."** Model answer: show it is a strict weak order, ideally by exhibiting a key it compares, as with `a / (10^|a| − 1)` for Largest Number. Without that, Java's Timsort may throw "Comparison method violates its general contract" and C++'s `std::sort` may read out of bounds. Common wrong answer: "it passed the tests".

## What mid-level engineers get wrong

- **Sorting on reflex, then improvising the sweep.** Consequence: a greedy they cannot justify, and a counterexample from the interviewer.
- **Iterating a `Counter` or dict and assuming sorted order.** Consequence: insertion order, correct on sorted samples only.
- **A full sort for a small `k`.** Consequence: 26× slower than a heap at `k = 10`, and a senior interviewer asks why.
- **A heap for `k ≈ n/2`.** Consequence: 6.5× slower than sorting; the asymptotic argument ran out.
- **Unproven comparators.** Consequence: inconsistent orders, and in Java a runtime exception on some inputs.
- **JavaScript's default sort for numbers.** Consequence: string order with no error.

## Exercises

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

```exercise
id: largest-number
title: Arrange numbers into the largest number
prompt: |
  Given a list of non-negative integers `nums`, arrange them so that their
  decimal representations, concatenated, form the largest possible number.
  Return it as a string. `nums` is non-empty.

  No single numeric key orders the values: 3 must come before 30 but after 34.
  Sort the strings with the comparator "a before b when a + b > b + a"
  (in Python, functools.cmp_to_key), and handle the input that is all zeros.
languages: [python, javascript]
entry: largest_number
starter:
  python: |
    from functools import cmp_to_key

    def largest_number(nums):
        # your code here
        return ""
  javascript: |
    function largest_number(nums) {
      // your code here
      return "";
    }
tests:
  - args: [[10, 2]]
    expected: "210"
  - args: [[3, 30, 34, 5, 9]]
    expected: "9534330"
  - args: [[0, 0]]
    expected: "0"
    label: all zeros collapse to one zero
  - args: [[1]]
    expected: "1"
    label: single element
  - args: [[8308, 8308, 830]]
    expected: "83088308830"
  - args: [[432, 43243]]
    expected: "43243432"
    hidden: true
  - args: [[0, 9, 0]]
    expected: "900"
    hidden: true
  - args: [[121, 12]]
    expected: "12121"
    hidden: true
hints:
  - "Convert to strings first. For two strings a and b, compare a + b with b + a; whichever concatenation is larger decides the order."
  - "The comparator is transitive: a + b > b + a exactly when a / (10^len(a) - 1) > b / (10^len(b) - 1), so sorting with it is safe."
  - "If the first string after sorting is \"0\", every string is \"0\"; return \"0\"."
```

## Senior signals

- You say **which key you are sorting by and why** before you sort; the key is the design: `(start, −end)`, `(−frequency, value)`, a count tuple, squared distance.
- You state the invariant the sort buys ("nearest by key is a neighbour", "equal keys are contiguous", "the pointer is the smallest remaining") and derive the sweep from it.
- You justify a greedy on sorted data with a **forced choice or exchange argument**, and you prove a comparator is an order before trusting it.
- You choose **sort, heap, quickselect or counting** from `n`, `k`, streaming and memory, and you can quote where each crossover sits.
- You know what the runtime does: Timsort's run detection makes presorted input cheap, `key=` holds one key per element in memory, typed arrays sort numbers natively in V8, and the default JavaScript sort compares strings.
- You randomise quickselect's pivot and can say what a fixed pivot costs on sorted input.

## Check yourself

```quiz
- q: >-
    You sort a million (department, salary) records by department, then salary descending. Measured, key=lambda r: (r[0], -r[1]) takes 708 ms and 120 MB; two stable passes with itemgetter take 262 ms and 24 MB. Why is the two-pass version cheaper?
  options: ["It needs fewer comparisons, since each pass compares a single integer", "It builds no tuples or negated ints, and its key is a C function", "itemgetter caches its results across both passes, so keys are reused", "Timsort skips the second pass because the first leaves one sorted run"]
  answer: 1
  explanation: >-
    key= stores one key per element for the whole sort, so a tuple key allocates a tuple and a new negated int per record and pays for tuple comparisons. itemgetter returns the existing int objects without calling Python code. Stability makes the two passes produce the composite order. Each pass still does about n log n comparisons, the second pass is a real sort, and nothing is cached across passes.
- q: >-
    A list of a million integers sorts in 145 ms when random but in 22 ms when it was sorted and then had 10 random pairs swapped. What explains the difference?
  options: ["Timsort finds the long existing runs and merges them with galloping", "The swapped list reuses cached comparison results from its earlier sort", "The specialised int comparison is only enabled for nearly sorted input", "Nearly sorted input keeps the list in L1, which removes all cache misses"]
  answer: 0
  explanation: >-
    Timsort scans for ascending or strictly descending runs, so ten swaps leave about twenty long runs, and merging them costs close to one comparison per element, with galloping skipping stretches where one run wins repeatedly. The type-specialised comparison applies to any all-int list, nothing is cached between sorts, and a million pointers do not fit in L1 either way.
- q: >-
    heapq.nlargest(k, a) on a million values takes 5.7 ms for k = 10 but 984 ms for k = 500,000, while sorted(a) takes about 150 ms either way. Why does the heap lose at large k?
  options: ["heapq falls back to a full sort when k exceeds n / 10, adding the sort to its own cost", "heapq.nlargest compares with __gt__, which is slower than the __lt__ that sorting uses", "A heap of half a million entries no longer fits in cache, while sorting stays in cache", "n log k approaches n log n, and the heap loop pays more per step than Timsort's C loop"]
  answer: 3
  explanation: >-
    With k = n/2, log k is only one less than log n, so the heap saves almost nothing asymptotically, and each heap step involves Python-level work in nlargest plus sift operations, while Timsort runs entirely in C with specialised int comparisons. heapq does not switch to sorting at that size, sorting a million elements does not fit in cache either, and the comparison method is not the cost.
- q: >-
    For Largest Number, why is sorting with the comparator "a before b when a + b > b + a" safe?
  options: ["It compares a / (10^len(a) - 1) with the same quantity for b, a real order", "It orders the strings lexicographically, which is transitive by definition", "Any comparator is safe in Timsort, since it never compares a pair twice", "It is safe only when all numbers have the same count of digits in them"]
  answer: 0
  explanation: >-
    a + b > b + a rearranges to a / (10^|a| - 1) > b / (10^|b| - 1), so the comparator sorts by a per-element value and is transitive; the same value can be used as a key. Plain lexicographic order is wrong: descending, it gives 9, 5, 34, 30, 3, which forms 9534303, smaller than 9534330. Timsort does not protect you from an inconsistent comparator; Java's implementation throws when it detects one.
- q: >-
    In JavaScript, a colleague sorts numbers with arr.sort((a, b) => a > b). What happens?
  options: ["It throws a TypeError, because comparators must return a number type", "It can leave pairs unsorted, since false reads as 0, which means equal", "It sorts by string value, because a boolean result selects the default", "It sorts correctly, because true and false coerce to 1 and 0 as expected"]
  answer: 1
  explanation: >-
    The comparator must return negative, zero or positive. A boolean gives 1 or 0, so whenever a < b it says the two are equal, and the sort is free to leave them in any order; on 20 random values it left the array unsorted. No error is thrown and the default string comparison is not used, which is why the bug reaches production.
- q: >-
    Group Anagrams in CPython: the 26-count key is O(L) and the sorted-letters key is O(L log L), yet for 5-letter words the sorted key was faster (202 ns against 287 ns per word). Why?
  options: ["sorted runs in C on tiny input; the count loop is interpreted per letter", "Tuples of 26 ints hash slowly, since hashing them is O(26 log 26) per key", "Five-letter words fit in a single machine word, so sorted is O(1) there", "The count key collides with other anagram groups and forces extra rehashing"]
  answer: 0
  explanation: >-
    For short strings, the log factor is tiny and sorted plus join execute in C, while building counts executes several bytecodes per character in the interpreter. The count key wins once words are long: 3,900 ns against 10,154 ns at 200 letters. Tuple hashing is linear in the tuple length, no word is sorted in O(1), and count keys do not collide across different multisets.
```
