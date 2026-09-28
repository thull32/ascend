---
slug: python-idioms-for-interviews
title: "Python idioms for interviews: the standard library, its measured costs and its traps"
description: The comprehensions, collections, heapq, bisect and itertools idioms that make Python the densest interview language, with the complexity and measured CPython 3.14 cost of every builtin used, how the containers are built underneath, and the traps (mutable defaults, late binding, integer caching) that turn a correct idea into a failing run.
minutes: 55
difficulty: medium
tags: [python, idioms, collections, heapq, bisect, itertools, interviews, languages]
problems: [top-k-frequent, kth-largest-array, time-based-kv, group-anagrams, lru-cache]
---
Two candidates get "return the k most frequent words, ties broken alphabetically". The first writes a dictionary-increment loop, builds a list of tuples, writes a comparator, sorts, and slices: eighteen lines, twelve minutes, one off-by-one in the tie-break. The second writes three lines with `Counter` and `heapq.nsmallest`, then spends the saved nine minutes on the follow-up the interviewer actually cares about: "what if the words arrive as a stream too large for memory?"

Python is the densest mainstream interview language, but only if the standard library is in your fingers. The same density hides costs: `list.pop(0)`, `x in some_list` and `bisect.insort` are O(n) operations that look O(1), and a senior interviewer will ask for the complexity of every line you wrote. This lesson is the working set: the cost model with measured numbers, how the containers are built, the five modules that carry most solutions, and the traps that turn a correct idea into a failing run. Every timing below is CPython 3.14.7 on a Ryzen 9 9950X3D under WSL2, best of three; treat them as orders of magnitude on other machines.

## The cost model of the built-ins, measured

| Operation | Complexity | Measured | Note |
|---|---|---|---|
| `list.append(x)`, `list.pop()` | O(1) amortised | tens of ns | Over-allocating dynamic array |
| `list.pop(0)`, `list.insert(0, x)` | O(n) | 2.1 µs per pop draining 10⁵ items | Shifts every element; `deque.popleft` measured 25 ns |
| `x in list`, `list.index(x)` | O(n) | 251 µs per probe at n = 10⁵ | `x in set` measured 18 ns |
| `lst[a:b]`, `lst[:]`, `s[::-1]` | O(b − a) | | Slicing copies |
| `sorted`, `list.sort` | O(n log n); O(n) on sorted runs | 139 ms for 10⁶ random floats, 17 ms if already sorted | Stable; Timsort with the powersort merge policy since 3.11 |
| `dict` / `set` get, set, `in`, `del` | O(1) average, O(n) worst | tens of ns | Hash table; dicts keep insertion order |
| `deque.append/appendleft/pop/popleft` | O(1) | 25 ns | Indexing the middle is O(n) |
| `heapq.heappush` / `heappop` | O(log n) | 43 ns / 179 ns at n = 10⁵ | `heapify` of 10⁶ took 17 ms, O(n) |
| `heapq.nlargest(k, xs)` | O(n log k) | 5 ms for k = 10 of 10⁶ | Against 136 ms for `sorted(xs)[:10]` |
| `bisect.bisect_left` | O(log n) | 210 ns at n = 10⁵ | Implemented in C |
| `bisect.insort` | O(n) | 0.3 µs per insert at 10⁴, 2.0 µs at 10⁵, 3.9 µs at 2 × 10⁵ | The search is log n; the insert shifts |
| `Counter(iterable)` | O(n) | 19 ms for 10⁶ words | A `dict.get` loop took 26 ms; the counting loop is in C |
| `"".join(parts)` | O(total length) | 2 ms for 10⁶ pieces | |
| `s += t` in a loop | O(total) in CPython if nothing else references `s`; O(n²) otherwise | 1.5 ms for 10⁵ appends; 481 ms with a second reference alive | See the traps section |
| `@functools.cache` hit | O(1) plus hashing the arguments | 24 ns, against 18 ns for a plain call | |
| `len`, `min`, `max`, `sum` | O(1), O(n), O(n), O(n) | | `len` is stored |

Two constant factors belong in the same mental model. **Speed**: a bare `total += i` loop ran 74 million iterations a second, but realistic interview loop bodies do more: a 1,000 × 1,000 minimum-path DP ran 11.4 million cells a second and a grid BFS with a `deque` and tuple neighbours 4.5 million nodes a second. Budget roughly 5 to 10 million inner-loop iterations a second: O(n²) at n = 10⁴ (10⁸ iterations) takes tens of seconds, and O(n log n) at n = 10⁶ is fine. **Memory**: every `int` is a heap object, so a list of a million distinct integers measured 40 MB with `tracemalloc`, against 4 MB for a Java `int[]`. Built-ins written in C (`sum`, `sorted`, `str.join`, `Counter`'s loop, `heapq`, `bisect`) are the fast path, so "push the loop into C" is the first optimisation.

## Under the hood: how the containers are built

**`int`.** A 16-byte object header plus the digits: `sys.getsizeof` gave 28 bytes for 1, 32 for 2³⁰ and 36 for 2⁶⁴; integers grow instead of overflowing. The values −5 to 256 are preallocated singletons, which is the root of the `is` trap below.

**`list`.** An array of 8-byte pointers plus spare capacity. Appending to an empty list, `getsizeof` stepped from 56 bytes to 88 at the first append, 120 at the fifth, then 184, 248, 312 and 376 at 9, 17, 25 and 33 elements: capacity grows by about an eighth plus a constant, which keeps `append` amortised O(1) while wasting little memory. `pop(0)` must `memmove` every remaining pointer down one slot, which is why draining 10⁵ items that way took 212 ms against 2.6 ms for a `deque`.

**`dict`.** Since 3.6 a compact layout: a small *indices* array (1, 2, 4 or 8 bytes per slot, depending on table size) points into a dense *entries* array of (hash, key, value) triples, 24 bytes each, in insertion order. Lookups hash the key, probe the indices array with a perturbed sequence, then compare the stored hash before calling `__eq__`. A dict of 10⁶ `int` → `int` entries measured 74 MB including the int objects, about 74 bytes per entry. Insertion order became a language guarantee in 3.7 because the compact layout gave it for free.

**`set`.** An open-addressing table of (hash, key) slots with no separate entries array and no ordering; a set of 10⁶ ints measured 66 MB. An empty set is already 216 bytes, because it starts with eight slots inline.

**`deque`.** A doubly linked list of blocks, each holding 64 pointers. Appends and pops at either end touch one block, O(1); `d[i]` walks blocks, O(n). An empty deque measured 760 bytes: one whole block.

**`heapq`.** Not a class: functions over a plain list that maintain `a[k] <= a[2k+1]` and `a[k] <= a[2k+2]`. `heappush` appends and sifts up, stopping early once the parent is smaller, so random pushes cost few comparisons (43 ns measured). `heappop` moves the last element to the root and sifts it all the way down to a leaf before sifting back up, a strategy that minimises comparisons but always walks the full height: 179 ns measured.

## Comprehensions and generators

A comprehension builds a collection in one expression and runs faster than the equivalent `append` loop:

```python
squares = [x * x for x in nums if x % 2 == 0]
index_of = {v: i for i, v in enumerate(nums)}          # value -> last index
seen = {w.lower() for w in words}
grid = [[0] * cols for _ in range(rows)]                # a fresh list per row
```

A generator expression, in parentheses, is lazy: `sum(x * x for x in range(10**7))` runs in constant memory, while `sum([x * x for x in range(10**7)])` first builds a ten-million-element list, about 400 MB at the 40 bytes per int measured above. `any()` and `all()` short-circuit, so `any(len(w) > 20 for w in words)` stops at the first long word.

The everyday toolkit, all of which you should write without thinking:

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

Tuple keys are the multi-criteria sort idiom: tuples compare element by element, and negating a number reverses its order. For strings you cannot negate, sort twice using stability (secondary key first, then primary) or use a key with `heapq`, as the first exercise does.

## collections: Counter, defaultdict, deque

```python
from collections import Counter
c = Counter("mississippi")          # Counter({'i': 4, 's': 4, 'p': 2, 'm': 1})
c["z"]                              # 0, and nothing is inserted
c.most_common(2)                    # [('i', 4), ('s', 4)]
Counter("listen") == Counter("silent")   # anagram check in O(n)
(Counter("aab") - Counter("abc"))   # Counter({'a': 1}); subtraction drops counts <= 0
```

`most_common(k)` calls `heapq.nlargest` keyed on the count, O(n log k); without `k` it sorts, O(n log n). Ties come out in **first-encountered order**, not alphabetically: `Counter("the cat is the is dog".split()).most_common(2)` returned `[('the', 2), ('is', 2)]`, where an alphabetical tie-break wants `is` first. That silent mismatch is one of the commonest wrong answers on frequency problems.

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

The gotcha: *reading* a missing key inserts it. `if graph[node]:` on a node with no edges adds an empty list, and doing that while iterating over `graph` raises `RuntimeError: dictionary changed size during iteration`. Use `graph.get(node, [])` for reads. `deque` is the queue (`deque(maxlen=k)` keeps the last `k` items), and `OrderedDict` with `move_to_end` and `popitem(last=False)` gives an O(1) LRU cache in a dozen lines ([LRU Cache](/practice/lru-cache)).

## heapq: a min-heap on a plain list

`heapq` provides `heappush`, `heappop`, `heapify` (O(n)), `heappushpop` and `heapreplace` (one sift for two operations), `nsmallest`/`nlargest`, and `merge` for k sorted iterables. Python 3.14 made the max-heap variants public: `heappush_max`, `heappop_max`, `heapify_max`, `heapreplace_max` and `heappushpop_max`; pushing 5, 1, 8, 3 with `heappush_max` popped as 8, 5, 3, 1. Interview environments often run older versions, so negating keys (push `-x`, negate on pop) remains the portable idiom, and you should say which you are using.

For compound priorities push tuples. If two priorities tie, Python compares the next element, and for dict payloads that raised `TypeError: '<' not supported between instances of 'dict' and 'dict'`. Insert a monotonically increasing counter: `(priority, next(counter), item)`, which also keeps equal priorities first in, first out.

The top-k pattern keeps a heap of size k whose root is the weakest survivor, so each element costs O(log k):

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

Traced on `[3, 2, 1, 5, 6, 4, 9, 7]` with k = 3 (the list is the heap's array, root first):

| x | Action | Heap after |
|---|---|---|
| 3, 2, 1 | push while fewer than 3 | `[1, 3, 2]` |
| 5 | 5 > root 1: replace root, sift 5 down past 2 | `[2, 3, 5]` |
| 6 | 6 > 2: replace, sift down past 3 | `[3, 6, 5]` |
| 4 | 4 > 3: replace; 4 is already smaller than both children | `[4, 6, 5]` |
| 9 | 9 > 4: replace, sift down past 5 | `[5, 6, 9]` |
| 7 | 7 > 5: replace, sift down past 6 | `[6, 7, 9]` |

The answer is `[9, 7, 6]`.

```viz
{"type": "heap", "algorithm": "top-k", "values": [3, 2, 1, 5, 6, 4, 9, 7], "k": 3, "kind": "min",
 "title": "Top-3 largest with a size-3 min-heap",
 "caption": "The root is the smallest of the three best seen so far, so it is the only value a newcomer has to beat. This is what heapq.nlargest and Counter.most_common(k) do internally."}
```

Dijkstra uses the same module with *lazy deletion*: instead of decreasing a key, push a new entry and skip stale ones when popped.

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

The [top-k elements](/learn/interview-patterns/sequence-patterns/top-k-elements) lesson and [Kth Largest Element in an Array](/practice/kth-largest-array) drill this.

## bisect: binary search you do not have to write

`bisect_left(a, x)` returns the first index `i` with `a[i] >= x`; `bisect_right(a, x)` the first with `a[i] > x`. Traced on `a = [1, 3, 3, 3, 7, 9]`, `x = 3`: `lo=0, hi=6`, `mid=3`, `a[3]=3` is not less than 3, so `hi=3`; `mid=1`, `a[1]=3`, so `hi=1`; `mid=0`, `a[0]=1 < 3`, so `lo=1`; `lo == hi`, return 1. Everything else follows:

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

Since 3.10, `bisect` takes `key=` and works on any sequence with `len` and indexing, including `range`, so "binary search on the answer" is one line: `bisect_left(range(lo, hi), True, key=feasible)` returns the smallest value in `[lo, hi)` where a monotone predicate holds, without materialising the range. [Time Based Key-Value Store](/practice/time-based-kv) is `defaultdict(list)` plus `bisect_right(times, t) - 1`.

The trap is `insort`: the search is O(log n) but the insert shifts, so n inserts are O(n²). The shift is a fast `memmove`, which is why 10⁴ random inserts took only 3 ms; at 10⁵ they took 196 ms and at 2 × 10⁵ 771 ms, the quadratic showing. For many inserts into a sorted structure, use a heap if you only need the minimum, or say you would use a balanced tree or `sortedcontainers` outside the interview.

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

All of these are lazy iterators costing O(1) per item produced; the cost is in how many items you ask for. `groupby` groups *consecutive* equal keys only, so sort first or use a `defaultdict` to group all equal keys. A classic combination: in a sorted list of distinct integers, `value - index` is constant along each run of consecutive values, so `groupby(enumerate(days), key=lambda p: p[1] - p[0])` splits `[1, 2, 3, 7, 8]` into `[1, 2, 3]` and `[7, 8]`. `combinations`, `permutations` and `product` replace hand-written backtracking when n is small; say the count aloud (`permutations` of 10 items is 3.6 million, `math.comb(n, k)` gives the size).

`functools.cache` memoises a recursive function, turning top-down DP into a decorator at about 6 ns of overhead per hit. The limit is recursion depth: the default limit is 1,000 frames, and measured on 3.14 a recursion 990 deep succeeded while one 1,000 deep raised `RecursionError`. Raising the limit with `sys.setrecursionlimit` risks overflowing the C stack and crashing the process; convert to bottom-up iteration instead.

## Traps that cost interviews

Each line's comment is the measured output on 3.14:

```python
def add(x, acc=[]):          # the default list is created once, at definition time
    acc.append(x)
    return acc
add(1), add(2)               # ([1, 2], [1, 2]); add.__defaults__ is now ([1, 2],). Use acc=None

grid = [[0] * 3] * 2         # two references to ONE row
grid[0][0] = 1               # [[1, 0, 0], [1, 0, 0]]

fs = [lambda: i for i in range(3)]
[f() for f in fs]            # [2, 2, 2]: closures capture the variable, not its value
fs = [lambda i=i: i for i in range(3)]   # [0, 1, 2]: a default binds the value now

-7 // 2, -7 % 2              # (-4, 1): Python floors; int(-7 / 2) truncates to -3, as C, Java, Go and JS do
int("257") is 257            # False: only -5..256 are cached singletons. Use ==
```

The `is` trap has a subtlety that confuses people who test it. `a = 257; b = 257; a is b` printed `True`, because both literals sit in one compiled code object and share a constant; the same two assignments compiled separately gave `False`, and an `int` computed at run time is a new object whenever it is outside −5 to 256. CPython also emits `SyntaxWarning: "is" with 'int' literal` for `x is 257`, which interview editors rarely show you.

Strings have a trap in the other direction. `s += t` in a loop *should* be quadratic, since strings are immutable, but CPython resizes the string in place when nothing else references it: 10⁵ appends took 1.5 ms. Keep one extra reference alive in the loop (`alias = s`) and the same loop took 481 ms, because every append now copies. PyPy and other implementations do not promise the optimisation, so build with a list and `"".join` and say why.

Also: `list.sort()` returns `None`, so `x = xs.sort()` loses your data; mutating a list while iterating over it skips elements; `row[:]` is a shallow copy; and because integers never overflow, "what changes in Java?" includes 32-bit overflow on sums and products.

## Memory model: reference counting plus a cycle collector

CPython frees most objects the instant their reference count reaches zero, which is why a file opened without `with` usually closes as soon as its last reference disappears. Cycles never reach zero, so a cycle collector runs periodically to find unreachable groups (its thresholds on 3.14 were `(2000, 10, 10)`).

```viz
{"type": "memory", "algorithm": "reference-counting",
 "title": "How CPython frees most objects",
 "caption": "Every assignment, argument and container slot adjusts a count; zero frees immediately. The final steps show the cycle that reference counting alone can never free, which is what CPython's separate cycle collector exists for."}
```

The global interpreter lock means one thread executes Python bytecode at a time in the default build, so threads help with I/O but not with CPU-bound work; use `multiprocessing`, native extensions, or the free-threaded build, which 3.13 introduced and 3.14 made officially supported but not the default. The [memory management](/learn/foundations/how-code-runs/memory-management) lesson compares this model with tracing collectors and Rust's ownership.

## Choosing a structure

| Need | Structure | Insert | Remove the best | Lookup by key | Ordered iteration | Memory per item (10⁶ ints) |
|---|---|---|---|---|---|---|
| FIFO queue | `deque` | O(1) | O(1) at either end | O(n) | Insertion order | about 8 B plus the object |
| Repeated min or max | `heapq` list | O(log n) | O(log n) | O(n) | No | 8 B plus the object |
| Sorted with rare inserts | list plus `bisect` | O(n) | O(1) at the end | O(log n) | Yes | 8 B plus the object; 40 MB total |
| Membership | `set` | O(1) average | Not applicable | O(1) average | No | 66 MB total |
| Key to value, counts | `dict`, `Counter` | O(1) average | Not applicable | O(1) average | Insertion order | 74 MB total |
| Recency order | `OrderedDict` | O(1) | O(1) at either end | O(1) average | Recency | More than a `dict` |

## Interview idioms at a glance

| Need | Idiom | Trap |
|---|---|---|
| Count | `Counter(xs)` | `most_common` ties are first-seen, not alphabetical |
| Group | `defaultdict(list)` | Reading a missing key inserts it |
| Queue, BFS | `deque`, `popleft()` | `list.pop(0)` is O(n) |
| Top k | `heapq.nlargest(k, xs, key=...)` or a size-k heap | Tuple ties fall through to unorderable payloads |
| Max-heap | Negate keys; `heappush_max` on 3.14+ | Older interpreters lack the public max API |
| Floor lookup | `bisect_right(keys, x) - 1` | `-1` means no such key |
| Binary search on the answer | `bisect_left(range(lo, hi), True, key=ok)` | `key=` needs 3.10+ |
| Prefix sums | `accumulate(xs, initial=0)` | Off-by-one without `initial` |
| Memoised recursion | `@functools.cache` | 1,000-frame recursion limit |
| Two-key sort | `key=lambda p: (-p.score, p.name)` | Cannot negate a string; sort twice by stability |

## Failure modes

**Symptom: the solution passes the visible tests and times out on a hidden large one.** Diagnosis: a hidden O(n) operation inside a loop: `pop(0)` in a BFS (2.1 µs a pop at 10⁵, quadratic overall), `x in list` inside a loop, or `insort` over hundreds of thousands of items. Profile with `cProfile`, or re-read each line against the cost table. Fix: `deque`, a `set` beside the list, or a heap.

**Symptom: `RecursionError: maximum recursion depth exceeded` on a deep tree or a long DP chain.** Diagnosis: Python frames past the 1,000 default. Fix: an explicit stack for DFS, bottom-up iteration for DP; raising the limit trades the error for a possible segmentation fault.

**Symptom: `TypeError: '<' not supported between instances of 'dict' and 'dict'` from `heappush`, only on some inputs.** Diagnosis: equal priorities made tuple comparison fall through to the payload. Fix: `(priority, next(counter), item)`.

**Symptom: correct on small inputs, wrong on large ones, with an `is` comparison or a `most_common` in the code.** Diagnosis: `is` compared identities that are only shared for −5 to 256, or ties came out in first-seen order. Fix: `==`, and an explicit `(-count, word)` key.

**Symptom: a string-building function that was fast becomes slow after a refactor.** Diagnosis: the refactor kept a second reference to the string (a list of prefixes, a debug variable), which disables CPython's in-place append; 10⁵ appends went from 1.5 ms to 481 ms. Fix: `"".join(parts)`, which does not depend on the optimisation.

**Symptom: memory limit exceeded on 10⁷ elements.** Diagnosis: 40 bytes per int in a list and about 74 per dict entry measured means 10⁷ ints need about 400 MB before any work happens. Fix: `array('i')` or `bytearray` for dense numbers, generators instead of lists, and bitsets for visited flags.

## Interviewer follow-ups

**"What is the complexity of each line you wrote?"** Model answer: go line by line, naming the hidden ones: `in` on a list is O(n), `pop(0)` is O(n), `sorted` is O(n log n) but O(n) on sorted input, `heappop` is O(log n), `insort` is O(n). Common wrong answer: "it's all O(1), they're built-ins".

**"How does Python's `dict` work, and when is it slow?"** Model answer: a compact table of (hash, key, value) entries in insertion order behind a sparse index array; lookup hashes, probes and compares stored hashes before calling `__eq__`; it degrades with many colliding hashes or an expensive `__eq__`, and it resizes as it fills. Common wrong answer: "it's a balanced tree", or "it's always O(1)".

**"Your BFS is slow at n = 10⁶. Why, and what would you change?"** Model answer: check for `list.pop(0)`, and budget: about 4.5 million nodes a second was measured for a grid BFS with a `deque`, so 10⁶ nodes is a fraction of a second, and 10⁷ needs a leaner inner loop or another language. Common wrong answer: "Python is slow, so there is nothing to do".

**"Why does `most_common` give the wrong order here?"** Model answer: it keys on the count alone through `nlargest`, and equal counts keep first-seen order; use a key of `(-count, word)`. Common wrong answer: "Counter sorts alphabetically on ties".

**"What changes if this runs on the free-threaded build?"** Model answer: threads can run bytecode in parallel, so CPU-bound thread pools can scale, but compound operations on shared lists and dicts still need locks, and single-thread speed is somewhat lower. Common wrong answer: "nothing, the GIL makes everything thread-safe", which was never true of compound operations.

## What mid-level engineers get wrong

- **Treating built-ins as free.** Consequence: an O(n²) solution from `pop(0)`, `in` on a list or `insort`, found by the interviewer's hidden test.
- **Using `most_common` for ordered ties.** Consequence: a wrong answer that passes the examples.
- **Pushing tuples with unorderable payloads onto a heap.** Consequence: an intermittent `TypeError` on tied priorities.
- **Deep recursion with `@cache`.** Consequence: `RecursionError` at 1,000 frames on the largest test.
- **Mutable default arguments and late-binding lambdas.** Consequence: state shared across calls, closures that all see the last loop value.
- **`is` for numbers.** Consequence: code that works for small values and fails above 256.
- **Not knowing the other language's behaviour.** Consequence: no answer to "what changes in Java?" (overflow, truncating division, no built-in `Counter`).

## Exercises

Each exercise is a few lines in idiomatic Python and noticeably longer in JavaScript, which has no `Counter`, `heapq`, `bisect` or `groupby`. Writing both is the fastest way to learn what the Python standard library saves you.

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

- You state the complexity and rough cost of every built-in you call, including the hidden O(n) ones (`pop(0)`, `in` on a list, `insort`, string building with a live alias).
- You know how the containers are built (over-allocating arrays, the compact dict, deque blocks, heap arrays) and use that to predict speed and memory.
- You reach for `Counter`, `defaultdict`, `deque`, `heapq` and `bisect` by reflex and know their edges: tie order, insert-on-read, min-only (or the 3.14 max API), linear `insort`.
- You budget runtime from measured throughput (millions of loop bodies a second, not billions) and memory from bytes per object.
- You avoid deep recursion and convert memoised recursion to iteration when n is large.
- You can translate each idiom to the interviewer's language and name what changes: overflow, truncating division, no built-in heap in JavaScript.

## Check yourself

```quiz
- q: >-
    A BFS over 200,000 nodes uses a list as its queue with `queue.pop(0)`. Draining 100,000 items that way measured 2.1 µs per pop against 25 ns for deque.popleft. What is the real cost and fix?
  options: ["O(V log V), because the list is re-sorted on each pop; use heapq", "O(E²), because visited checks scan the list; use a set", "O(V + E), because pop(0) is amortised O(1) like append", "O(V² + E), because each pop(0) shifts the rest; use deque"]
  answer: 3
  explanation: >-
    A Python list is a contiguous array of pointers, so removing the first element memmoves every remaining pointer; with a wide frontier that is quadratic. deque stores blocks of 64 pointers and pops from either end in O(1). Only pops from the end of a list are cheap, and nothing re-sorts the list.
- q: >-
    Counter("the cat is the is dog".split()).most_common(2) returned [('the', 2), ('is', 2)]. The problem wants ties broken alphabetically. Why is it wrong, and what fixes it?
  options: ["most_common sorts ties in reverse alphabetical order", "Counter hashes strings, so its order is random", "Ties keep first-seen order; key on (-count, word)", "most_common drops ties; call it with a larger k"]
  answer: 2
  explanation: >-
    most_common keys nlargest on the count alone, so equal counts come out in the order the words were first counted, which dict insertion order preserves. A key of (-count, word) with heapq.nsmallest or sorted gives count descending and word ascending. The order is deterministic, not random, and nothing is dropped.
- q: >-
    You insert 200,000 random values into a list with bisect.insort. It measured 3.9 µs per insert, against 0.3 µs at 10,000 items. What explains the growth?
  options: ["Garbage collection runs more often as the list grows larger", "bisect falls back to a linear scan once the list is large", "The list re-sorts itself after each insert to stay ordered", "The search is O(log n) but each insert shifts O(n) pointers"]
  answer: 3
  explanation: >-
    insort finds the position by binary search, then list.insert moves every later pointer one slot, so the per-insert cost grows with n and the total is quadratic. The shift is a fast memmove, which is why small lists look fine. The search stays logarithmic and nothing re-sorts.
- q: >-
    In one script, `a = 257; b = 257; print(a is b)` prints True, but `int("257") is 257` is False. Why?
  options: ["The is operator compares values for literals and identities for computed ints", "Literals in one code object share a constant; run-time ints above 256 are new objects", "Python caches every integer below 1,000, but only for values created from literals", "int() always returns a copy, while assignment always shares the cached object"]
  answer: 1
  explanation: >-
    The compiler stores one constant for equal literals in a code object, so both names refer to it. Only -5 to 256 are preallocated singletons; an int computed at run time outside that range is a fresh object. is always compares identity, which is why == is the only safe equality for numbers.
- q: >-
    A string-building loop took 1.5 ms for 100,000 appends; after a refactor that keeps a reference to the partial string each iteration, it took 481 ms. What happened?
  options: ["The extra reference stops CPython resizing the string in place", "Strings over 64 KB switch to a slower internal representation", "The interpreter disabled its specialising bytecode for the loop", "The refactor added a garbage-collection pass on every iteration"]
  answer: 0
  explanation: >-
    s += t is optimised in CPython to resize the string in place when s has no other references; a second reference forces a full copy every time, making the loop quadratic. "".join does not depend on that implementation detail, which is why it is the idiom to use and to name.
- q: >-
    A memoised recursive DP with @functools.cache works for n = 500 and fails for n = 50,000. What is the most likely cause?
  options: ["RecursionError, because the default limit is 1,000 frames", "The cache evicts entries, so the recursion recomputes them", "A race, because functools.cache is not thread-safe under load", "Integer overflow, because DP values exceed 64 bits at that size"]
  answer: 0
  explanation: >-
    Each recursive call is a Python frame and the default limit is 1,000; measured on 3.14, a recursion 990 deep worked and one 1,000 deep failed. Raising the limit risks crashing on the C stack, so convert to a bottom-up loop. cache without maxsize never evicts, and Python integers do not overflow.
```
