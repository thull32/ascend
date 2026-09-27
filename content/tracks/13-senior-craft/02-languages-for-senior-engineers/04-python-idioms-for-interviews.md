---
slug: python-idioms-for-interviews
title: "Python idioms for interviews: the standard library that writes half the solution"
description: The comprehensions, collections, heapq, bisect and itertools idioms that make Python the densest interview language, with the cost model and gotchas that trip up experienced engineers.
minutes: 50
difficulty: medium
tags: [python, idioms, collections, heapq, bisect, itertools, interviews, languages]
problems: [top-k-frequent, kth-largest-array, time-based-kv, group-anagrams, lru-cache]
---
Two candidates get "return the k most frequent words, ties broken alphabetically". The first writes a dictionary-increment loop, builds a list of tuples, writes a comparator, sorts, and slices: eighteen lines, twelve minutes, one off-by-one in the tie-break. The second writes three lines with `Counter` and `heapq.nsmallest`, then spends the saved nine minutes on the follow-up the interviewer actually cares about: "what if the words arrive as a stream too large for memory?"

Python is the densest mainstream interview language, but only if the standard library is in your fingers. The same density hides costs: `list.pop(0)`, `x in some_list` and string `+=` in a loop are all O(n) operations that look O(1), and a senior interviewer will ask for the complexity of every line you wrote. This lesson is the working set: the cost model, the five modules that carry most solutions, and the gotchas that turn a correct idea into a failing run.

## The cost model of the built-ins

| Operation | Cost | Note |
|---|---|---|
| `list.append(x)`, `list.pop()` | O(1) amortised | Over-allocating dynamic array |
| `list.pop(0)`, `list.insert(0, x)` | O(n) | Shifts every element; use `deque` |
| `x in list`, `list.index(x)` | O(n) | Linear scan; use a `set` for membership |
| `lst[a:b]` | O(b − a) | Slicing copies |
| `list.sort()`, `sorted()` | O(n log n) | Timsort: stable, O(n) on already-sorted input |
| `dict`/`set` get, set, `in`, delete | O(1) average | Hash table; insertion-ordered dicts since 3.7 |
| `deque.append/appendleft/pop/popleft` | O(1) | Indexing into the middle is O(n) |
| `heapq.heappush/heappop` | O(log n) | `heapify` is O(n); `heap[0]` peeks in O(1) |
| `bisect.bisect_left` | O(log n) | But `insort` is O(n) because list insertion shifts |
| `s + t`, `s += t` on strings | O(len(s) + len(t)) | Strings are immutable; build with a list and `"".join` |

Two constant factors belong in the same mental model. **Memory**: every Python `int` is a heap object (28 bytes for ordinary values; -5 to 256 are cached singletons), and a list stores an 8-byte pointer to each. A list of a million distinct integers is about 36 MB, against 4 MB for a Java `int[]`. **Speed**: CPython executes bytecode in an interpreter loop, roughly 10 to 100 times slower than the same loop in Java, Go or Rust. For interview arithmetic, budget around 10^7 simple operations per second: an O(n²) solution at n = 10^4 (10^8 steps) is too slow, and O(n log n) at n = 10^6 is fine. Built-ins written in C (`sum`, `sorted`, `str.join`, the counting loop inside `Counter`) run far faster than the equivalent Python loop, so "push the loop into C" is the first optimisation.

## Comprehensions and generators

A comprehension builds a collection in one expression and runs faster than the equivalent `append` loop:

```python
squares = [x * x for x in nums if x % 2 == 0]
index_of = {v: i for i, v in enumerate(nums)}          # value -> last index
seen = {w.lower() for w in words}
grid = [[0] * cols for _ in range(rows)]                # a fresh list per row
```

A generator expression, written with parentheses, is lazy: it produces values on demand and holds none of them. `sum(x * x for x in range(10**7))` runs in constant memory, while `sum([x * x for x in range(10**7)])` first builds a ten-million-element list (hundreds of megabytes). `any()` and `all()` short-circuit, so `any(len(w) > 20 for w in words)` stops at the first long word.

The rest of the everyday toolkit, all of which you should write without thinking:

```python
for i, (a, b) in enumerate(zip(xs, ys)): ...           # index plus parallel iteration
cols = list(zip(*matrix))                               # transpose
best = max(counts, key=counts.get)                      # key with the largest value
people.sort(key=lambda p: (-p.score, p.name))           # score descending, name ascending
first, *middle, last = values                           # star unpacking
a, b = b, a + b                                         # tuple swap, no temp
for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):       # grid neighbours
    r2, c2 = r + dr, c + dc
    if 0 <= r2 < rows and 0 <= c2 < cols: ...
```

Tuple keys are the multi-criteria sort idiom: tuples compare element by element, and negating a number reverses its order. For strings you cannot negate, sort twice using stability (secondary key first, then primary) or use `heapq`'s key argument as the exercise below does.

## collections: Counter, defaultdict, deque

`Counter` is a dictionary from item to count with arithmetic on top.

```python
from collections import Counter
c = Counter("mississippi")          # Counter({'i': 4, 's': 4, 'p': 2, 'm': 1})
c["z"]                              # 0, and nothing is inserted
c.most_common(2)                    # [('i', 4), ('s', 4)]
Counter("listen") == Counter("silent")   # anagram check in O(n)
(Counter("aab") - Counter("abc"))   # Counter({'a': 1}); subtraction drops counts <= 0
```

`most_common(k)` uses `heapq.nlargest` internally, so it costs O(n log k). Its tie order is **the order in which items were first encountered**, not alphabetical. In the opening problem, `Counter(words).most_common(k)` returns `"the"` before `"is"` if `"the"` appeared first, even though both occur three times and the problem wants `"is"` first. That silent tie-break mismatch is one of the most common wrong answers on frequency problems.

`defaultdict` creates a missing value on first access, which makes grouping and adjacency lists one-liners:

```python
from collections import defaultdict
groups = defaultdict(list)
for word in words:
    groups["".join(sorted(word))].append(word)          # group anagrams by sorted letters

graph = defaultdict(list)
for a, b in edges:
    graph[a].append(b)
    graph[b].append(a)
```

The gotcha: *reading* a missing key inserts it. `if graph[node]:` on a node with no edges adds an empty list, and doing that while iterating over `graph` raises `RuntimeError: dictionary changed size during iteration`. Use `graph.get(node, [])` for reads.

`deque` is the queue. `list.pop(0)` in a BFS can turn O(V + E) into O(V² + E) when the frontier is wide; `deque.popleft()` keeps it linear. `deque(maxlen=k)` keeps the last `k` items, discarding from the other end automatically. For an LRU cache, `OrderedDict` with `move_to_end(key)` and `popitem(last=False)` gives O(1) operations in a dozen lines (see [LRU Cache](/practice/lru-cache)).

## heapq: a min-heap on a plain list

`heapq` implements a binary min-heap as functions over an ordinary list: `heappush`, `heappop`, `heapify` (O(n)), `heappushpop` and `heapreplace` (push and pop in one sift), `nsmallest`/`nlargest`, and `merge` for k sorted iterables.

There is no max-heap class. The portable idiom is to negate numeric keys: push `-x`, pop and negate back. Python 3.14 added public `heappush_max`-style functions, but interview environments often run older versions, so negation is what you should reach for. For compound priorities, push tuples: `(priority, item)`. If two priorities tie, Python compares the items next, and if those are dicts or custom objects you get `TypeError: '<' not supported`. Insert a monotonically increasing counter as a tie-breaker: `(priority, next(counter), item)`.

The top-k pattern keeps a heap of size k whose root is the weakest survivor, so each new element costs O(log k) and the whole pass O(n log k):

```python
import heapq
def k_largest(nums, k):
    heap = []
    for x in nums:
        if len(heap) < k:
            heapq.heappush(heap, x)
        elif x > heap[0]:
            heapq.heapreplace(heap, x)   # pop the smallest survivor, push x
    return sorted(heap, reverse=True)
```

```viz
{"type": "heap", "algorithm": "top-k", "values": [3, 2, 1, 5, 6, 4, 9, 7], "k": 3, "kind": "min",
 "title": "Top-3 largest with a size-3 min-heap",
 "caption": "The root is the smallest of the three best seen so far, so it is the only value a newcomer has to beat. This is what heapq.nlargest and Counter.most_common(k) do internally."}
```

Dijkstra in Python uses the same module with *lazy deletion*: instead of decreasing a key, push a new entry and skip stale ones when popped.

```python
def dijkstra(graph, src):                    # graph: {u: [(v, w), ...]}
    dist = {src: 0}
    heap = [(0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, float("inf")):
            continue                         # stale entry: a shorter path was found later
        for v, w in graph.get(u, []):
            nd = d + w
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(heap, (nd, v))
    return dist
```

The [top-k elements](/learn/interview-patterns/sequence-patterns/top-k-elements) pattern lesson and [Kth Largest Element in an Array](/practice/kth-largest-array) drill this.

## bisect: binary search you do not have to write

`bisect_left(a, x)` returns the first index `i` with `a[i] >= x`; `bisect_right(a, x)` returns the first index with `a[i] > x`. Both assume `a` is sorted and run in O(log n). Everything else follows:

```python
from bisect import bisect_left, bisect_right
a = [1, 3, 3, 3, 7, 9]
bisect_left(a, 3), bisect_right(a, 3)      # (1, 4)
bisect_right(a, 3) - bisect_left(a, 3)     # 3 occurrences of 3
bisect_right(a, 8) - bisect_left(a, 2)     # 4 values in [2, 8]
i = bisect_right(a, 5) - 1                 # index of the largest value <= 5 (here 3, at index 3)
```

```viz
{"type": "array", "algorithm": "binary-search-first-true", "values": [1, 3, 3, 3, 7, 9], "target": 3,
 "title": "bisect_left is 'first index where a[i] >= x'",
 "caption": "The predicate a[i] >= 3 is false, then true, across the sorted array; the search keeps [lo, hi) around the boundary and returns 1. bisect_right is the same search with > instead of >=."}
```

Since Python 3.10, `bisect` accepts `key=`, and it works on any sequence with `len` and indexing, including `range`. That turns "binary search on the answer" into one line: `bisect_left(range(lo, hi), True, key=feasible)` returns the smallest value in `[lo, hi)` for which the monotone predicate `feasible` holds, without materialising the range. The versioned key-value store in [Time Based Key-Value Store](/practice/time-based-kv) is `defaultdict(list)` plus `bisect_right(times, t) - 1`.

The trap is `insort`: finding the position is O(log n) but inserting into a list is O(n), so n insertions cost O(n²). If you need a sorted structure with many inserts, use a heap (if you only need the minimum) or say that you would use a balanced tree or `sortedcontainers` outside the interview.

## itertools and functools

```python
from itertools import accumulate, pairwise, groupby, combinations, permutations, product, chain, islice
prefix = list(accumulate(nums, initial=0))        # prefix[i] = sum(nums[:i]); range sum = prefix[j] - prefix[i]
gaps = [b - a for a, b in pairwise(times)]        # consecutive differences (3.10+)
runs = [(k, len(list(g))) for k, g in groupby("aaabcc")]   # [('a', 3), ('b', 1), ('c', 2)]
pairs = list(combinations(range(4), 2))           # 6 pairs, no repeats
flat = list(chain.from_iterable(list_of_lists))
first_ten = list(islice(generator, 10))
```

`groupby` groups *consecutive* equal keys only; to group all equal keys, sort first (or use a `defaultdict`). A classic combination: in a sorted list of distinct integers, `value - index` is constant along each run of consecutive values, so `groupby(enumerate(days), key=lambda p: p[1] - p[0])` splits `[1, 2, 3, 7, 8]` into `[1, 2, 3]` and `[7, 8]`.

`combinations`, `permutations` and `product` replace hand-written backtracking when you need every candidate and n is small; say the count out loud (`permutations` of 10 items is 3.6 million).

`functools.cache` (or `lru_cache(maxsize=None)`) memoises a recursive function, turning top-down DP into a decorator. The limit is recursion depth: CPython's default limit is 1000 frames, so a memoised recursion over n = 10^5 raises `RecursionError`. Raising the limit with `sys.setrecursionlimit` risks overflowing the underlying C stack and crashing the process; convert to bottom-up iteration instead.

## Gotchas that cost interviews

```python
def add(x, acc=[]):          # the default list is created once, at definition time
    acc.append(x)
    return acc
add(1), add(2)               # ([1, 2], [1, 2]): both calls share one list; use acc=None

grid = [[0] * 3] * 2         # two references to ONE row
grid[0][0] = 1               # [[1, 0, 0], [1, 0, 0]]

fs = [lambda: i for i in range(3)]
[f() for f in fs]            # [2, 2, 2]: closures capture the variable, not its value

-7 // 2, -7 % 2              # (-4, 1): Python floors; C, Java, Go and JavaScript truncate to (-3, -1)
x = int("257"); x is 257     # False: `is` tests identity; only small ints are cached. Use ==
```

Also: `list.sort()` returns `None` (so `x = xs.sort()` loses your data), mutating a list while iterating over it skips elements, `row[:]` is a shallow copy, and integers never overflow in Python, so when the interviewer asks "what changes in Java?", the answer includes 32-bit overflow on sums and products.

## Memory model: reference counting plus a cycle collector

CPython frees most objects the instant their reference count reaches zero, which is why a file opened without `with` is usually closed as soon as the last variable referencing it disappears. Cycles (a node whose child points back to it) never reach zero, so a generational cycle collector runs periodically to find unreachable groups.

```viz
{"type": "memory", "algorithm": "reference-counting",
 "title": "How CPython frees most objects",
 "caption": "Every assignment, argument and container slot adjusts a count; zero frees immediately. The final steps show the cycle that reference counting alone can never free, which is what CPython's separate cycle collector exists for."}
```

The global interpreter lock (GIL) means one thread executes Python bytecode at a time in the default build, so threads help with I/O-bound work but not CPU-bound work; use `multiprocessing` or native extensions for CPU parallelism. Python 3.13 introduced an optional free-threaded build without the GIL, but the default build still has it. The [memory management](/learn/foundations/how-code-runs/memory-management) lesson compares this model with tracing collectors and Rust's ownership.

## Exercises

Each exercise is a few lines in idiomatic Python and noticeably longer in JavaScript, which has no `Counter`, `heapq`, `bisect` or `groupby`. Writing both is the fastest way to learn what the Python standard library is saving you.

```exercise
id: top-k-words
title: Top k words with alphabetical tie-breaks
prompt: |
  Return the `k` most frequent words in `words`, ordered by frequency
  (highest first). Words with equal frequency are ordered alphabetically.
  If there are fewer than `k` distinct words, return all of them.
  Words are lowercase ASCII.

  In Python, use `Counter` and `heapq` (careful: `most_common` breaks ties by
  first appearance, not alphabetically). Aim for O(n log k) after counting.
languages: [python, javascript]
entry: top_k_words
starter:
  python: |
    from collections import Counter
    import heapq

    def top_k_words(words, k):
        # your code here
        return []
  javascript: |
    function top_k_words(words, k) {
      // Count with a Map, then order by (-count, word).
      // Compare strings with < and >, not localeCompare.
      return [];
    }
tests:
  - args: [["the", "day", "is", "sunny", "the", "the", "sunny", "is", "is"], 4]
    expected: ["is", "the", "sunny", "day"]
  - args: [["b", "a", "c", "a", "b"], 2]
    expected: ["a", "b"]
    label: ties break alphabetically, not by first appearance
  - args: [[], 3]
    expected: []
    label: empty input
  - args: [["x"], 5]
    expected: ["x"]
    label: k larger than the number of distinct words
  - args: [["apple", "bob", "apple", "cat", "bob", "apple", "dog", "cat", "bob"], 3]
    expected: ["apple", "bob", "cat"]
    hidden: true
  - args: [["z", "y", "x"], 2]
    expected: ["x", "y"]
    hidden: true
    label: all counts equal
hints:
  - "Count first: `counts = Counter(words)`."
  - "`heapq.nsmallest(k, counts, key=lambda w: (-counts[w], w))` orders by count descending, then word ascending."
  - "In JavaScript, sort the distinct words with `(a, b) => counts.get(b) - counts.get(a) || (a < b ? -1 : 1)`, then slice."
```

```exercise
id: count-in-ranges
title: Count values in ranges with bisect
prompt: |
  `nums` is an unsorted list of integers and `queries` is a list of
  `[lo, hi]` pairs. For each query return how many values `v` in `nums`
  satisfy `lo <= v <= hi`. A query with `lo > hi` has count 0.

  Sort once, then answer each query with two binary searches, for
  O((n + q) log n) overall. In Python, use `bisect_left` and `bisect_right`;
  in JavaScript, write lower and upper bound helpers.
languages: [python, javascript]
entry: count_in_ranges
starter:
  python: |
    from bisect import bisect_left, bisect_right

    def count_in_ranges(nums, queries):
        # your code here
        return []
  javascript: |
    function count_in_ranges(nums, queries) {
      // Sort numerically: nums.slice().sort((a, b) => a - b)
      // lowerBound(a, x): first index with a[i] >= x
      // upperBound(a, x): first index with a[i] > x
      return [];
    }
tests:
  - args: [[5, 1, 9, 3, 7, 3], [[3, 7], [0, 2], [8, 100]]]
    expected: [4, 1, 1]
  - args: [[], [[1, 2]]]
    expected: [0]
    label: empty nums
  - args: [[2, 2, 2, 2], [[2, 2], [1, 1], [3, 3]]]
    expected: [4, 0, 0]
    label: duplicates
  - args: [[-5, 0, 5], [[-10, -1], [-5, 5], [1, 4]]]
    expected: [1, 3, 0]
    label: negatives
  - args: [[1, 2, 3], [[3, 1]]]
    expected: [0]
    hidden: true
    label: lo greater than hi
  - args: [[10, 20, 30, 40, 50], [[15, 45], [10, 10], [50, 60], [0, 9]]]
    expected: [3, 1, 1, 0]
    hidden: true
hints:
  - "Count in [lo, hi] = (number of values <= hi) - (number of values < lo) = bisect_right(s, hi) - bisect_left(s, lo)."
  - "That difference goes negative when lo > hi; clamp with max(0, ...)."
  - "JavaScript's default sort compares as strings; always pass (a, b) => a - b for numbers."
```

```exercise
id: longest-login-streaks
title: Longest login streak per user
prompt: |
  `logins` is a list of `[user, day]` pairs in any order, where `day` is an
  integer and the same pair may appear more than once. Return a dictionary
  (a plain object in JavaScript) mapping each user to the length of their
  longest run of consecutive days. Return an empty dictionary for no logins.

  In Python, use `defaultdict(set)` to collect days per user and
  `itertools.groupby` over the sorted days: along a run of consecutive
  values, `day - index` is constant.
languages: [python, javascript]
entry: longest_streaks
starter:
  python: |
    from collections import defaultdict
    from itertools import groupby

    def longest_streaks(logins):
        # your code here
        return {}
  javascript: |
    function longest_streaks(logins) {
      // Map<user, Set<day>>, then sort each user's days numerically and scan.
      return {};
    }
tests:
  - args: [[["ana", 1], ["ana", 2], ["ana", 3], ["ana", 5], ["bo", 10], ["bo", 12], ["bo", 11]]]
    expected: {"ana": 3, "bo": 3}
  - args: [[]]
    expected: {}
    label: no logins
  - args: [[["cy", 4], ["cy", 4], ["cy", 5]]]
    expected: {"cy": 2}
    label: duplicate days count once
  - args: [[["dee", 7]]]
    expected: {"dee": 1}
    label: single login
  - args: [[["a", 3], ["b", 1], ["a", 1], ["a", 2], ["b", 3], ["a", 10], ["a", 11], ["a", 12], ["a", 13]]]
    expected: {"a": 4, "b": 1}
    hidden: true
  - args: [[["e", -1], ["e", 0], ["e", 1], ["e", 3]]]
    expected: {"e": 3}
    hidden: true
    label: negative days
hints:
  - "Collect days into a set per user first, so duplicates disappear."
  - "For sorted distinct days, `groupby(enumerate(days), key=lambda p: p[1] - p[0])` yields one group per consecutive run."
  - "In JavaScript, walk the sorted days keeping the current run length; reset to 1 whenever days[i] !== days[i - 1] + 1."
```

## Senior signals

- You state the complexity of every built-in you call, including the hidden O(n) ones (`pop(0)`, `in` on a list, `insort`, string `+=`).
- You reach for `Counter`, `defaultdict`, `deque`, `heapq` and `bisect` by reflex, and you know their edges: `most_common` tie order, `defaultdict` inserting on read, `heapq` being min-only, `insort` being linear.
- You use tuple keys with negation for multi-criteria ordering, and a counter tie-breaker when heap payloads are not comparable.
- You avoid deep recursion in Python and convert memoised recursion to iteration when n is large.
- You can translate each idiom to the interviewer's language and name what changes: integer overflow, truncating division, no built-in heap in JavaScript.
- You explain CPython's memory and threading model (refcounting, cycle collector, GIL) when performance comes up, instead of just saying "Python is slow".

## Check yourself

```quiz
- q: >-
    A BFS over a graph with 200,000 nodes uses a list as its queue and `queue.pop(0)`. What is the real cost and fix?
  options: ["O(V log V), because the list is re-sorted on each pop; use heapq", "O(V + E), because pop(0) on a list is amortised O(1) like append", "O(V² + E), because each pop(0) shifts the rest; use collections.deque", "O(E²), because visited checks scan the list; use a set for visited"]
  answer: 2
  explanation: >-
    pop(0) costs time proportional to the queue's current length because a Python list is a contiguous array, so every remaining element shifts left. With a wide frontier (a grid, a star-shaped graph) that becomes quadratic, up to around 10^10 element moves here. collections.deque gives O(1) popleft(); only pops from the end of a list are cheap.
- q: >-
    You return `Counter(words).most_common(k)` for "top k words, ties alphabetical". When is it wrong?
  options: ["Only when k exceeds the number of distinct words in the input", "When two words tie, because ties keep first-appearance order", "Never, because most_common breaks ties alphabetically by default", "Only for non-ASCII words, because they sort by code point"]
  answer: 1
  explanation: >-
    most_common uses heapq.nlargest keyed on the count alone, which keeps ties in first-encountered order. Use a key of (-count, word) with heapq.nsmallest or a sort.
- q: >-
    You push `(priority, task_dict)` tuples onto a heapq heap and it sometimes raises TypeError. Why, and what is the idiomatic fix?
  options: ["The heap loses its invariant on each push; call heapify again after every push", "heapq only compares integers; push the priority alone and look up the task", "On a priority tie Python compares the dicts; add a counter as the second item", "Tuples are immutable, so heapq cannot sift them in place; push lists instead"]
  answer: 2
  explanation: >-
    Tuple comparison falls through to the next element on a tie, and dicts do not support <. A monotonically increasing counter from itertools.count() as the second element guarantees the comparison is decided before reaching the payload, and it also keeps FIFO order among equal priorities. heapq works on any comparable items and moves references, so immutability is irrelevant.
- q: >-
    `s` is sorted. Which expression counts the values in the inclusive range [lo, hi], assuming lo <= hi?
  options: ["bisect_right(s, hi) - bisect_right(s, lo)", "bisect_right(s, hi) - bisect_left(s, lo)", "bisect_left(s, hi) - bisect_right(s, lo) + 1", "bisect_left(s, hi) - bisect_left(s, lo)"]
  answer: 1
  explanation: >-
    bisect_right(s, hi) counts values <= hi and bisect_left(s, lo) counts values < lo; the difference is exactly the values in [lo, hi]. Using bisect_left for hi misses values equal to hi; using bisect_right for lo misses values equal to lo.
- q: >-
    A memoised recursive DP with @functools.cache works for n = 500 and fails for n = 50,000. What is the most likely cause?
  options: ["Integer overflow, because DP values exceed 64 bits at that size", "A race, because functools.cache is not thread-safe under load", "The cache fills up and evicts entries, so the recursion recomputes them", "RecursionError, because CPython's default limit is about 1000 frames"]
  answer: 3
  explanation: >-
    Each recursive call is a Python frame and the default limit is 1000. Raising the limit risks crashing on the C stack; the robust fix is a bottom-up loop. Python integers do not overflow, and cache without maxsize never evicts.
- q: >-
    `grid = [[0] * 3] * 3` then `grid[0][0] = 1`. What does grid contain?
  options: ["[[1, 0, 0], [0, 0, 0], [0, 0, 0]]", "[[1, 1, 1], [0, 0, 0], [0, 0, 0]]", "[[1, 1, 1], [1, 1, 1], [1, 1, 1]]", "[[1, 0, 0], [1, 0, 0], [1, 0, 0]]"]
  answer: 3
  explanation: >-
    Multiplying the outer list copies the reference to one inner list three times, so all rows are the same object. Build rows with a comprehension: [[0] * 3 for _ in range(3)]. Multiplying the inner list is safe because ints are immutable.
```
