---
slug: hash-map-patterns
title: "Hash-map patterns: complement, count, group, seen"
description: The four hash-map moves that turn an O(n²) inner loop into O(n), the signal and near-misses that select each one, the key design that is the real answer, Two Sum, Valid Sudoku, Longest Consecutive Sequence and Top K Frequent traced step by step, and what the lookup actually costs in CPython and V8.
minutes: 50
difficulty: medium
tags: [pattern:hash-map, hashing, frequency-count, grouping, complement-lookup]
problems: [two-sum, contains-duplicate, valid-anagram, group-anagrams, top-k-frequent, encode-decode-strings, product-except-self, longest-consecutive-sequence, valid-sudoku, first-missing-positive]
---
Most O(n²) solutions have the same shape: an outer loop over the input and an inner loop that scans everything else to answer one question about the current element. "Is there an earlier element equal to `target - x`?" "How many times has this value appeared?" "Which bucket does this word belong in?" "Have I seen this before?" The inner loop is a query, and a hash map answers the query in expected O(1) once you have chosen the right key. For `n = 10⁵` that is the difference between 5 × 10⁹ comparisons (minutes in CPython) and 10⁵ lookups (about 10 ms; a Python loop doing 10⁶ `in` checks against a set took 104 ms when measured with CPython 3.14 on one development machine).

What separates a candidate who reaches for `dict` on reflex from one who gets the senior rating is the choice of key, the honesty about memory, the argument for why a nested loop is still linear, and spotting the problems where the map is a trap. The mechanics (probing, load factor, resizing, `Counter` internals) are in [Hash tables](/learn/data-structures/hashing/hash-tables) and the seven interview shapes in [Hash maps in interviews](/learn/data-structures/hashing/hash-maps-in-interviews). This lesson is the other half: deciding within a minute which of four moves a statement needs, writing it without the classic bug, and defending it when the interviewer changes a constraint.

## The signal

Find the inner loop you would write, and name the question it asks. The question tells you the key.

| Phrase in the statement | Sub-pattern | Key → value | Question the map answers |
|---|---|---|---|
| "two elements that sum/differ/multiply to", "pair", "partner" | Complement lookup | value → index (or count) | Is my partner among the elements before me? |
| "how many times", "most frequent", "anagram", "can be rearranged" | Frequency count | element → count | How often has this appeared? |
| "group", "categorise", "all strings that are …", "cluster by" | Group by canonical key | canonical form → list of originals | Which class does this belong to? |
| "contains duplicate", "unique", "distinct", "already seen", "consecutive" | Seen set | value → present | Have I met this value? |

The constraint block confirms it. Unsorted input, values with no useful bound, and a target of O(n) or "better than O(n log n)" mean the interviewer wants a map. "O(1) extra space" removes the map from consideration. A value range of `1..n` over `n` slots is a different signal: the array can be its own map.

The near-misses cost more rounds than the signals win. Each row looks like a hash-map problem on a first read:

| Statement says | Pattern | Why the plain map is wrong |
|---|---|---|
| "Two numbers that sum to target" in a **sorted** array, O(1) space | [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) | Sortedness lets one comparison discard a whole row; the map's O(n) memory buys nothing |
| "Number of **subarrays** whose sum equals k" | [Prefix sum](/learn/interview-patterns/array-patterns/prefix-sum) with a map | The key is the running prefix sum, not an element; querying elements finds pairs, not ranges |
| "Longest **substring** with at most k distinct characters" | [Sliding window](/learn/interview-patterns/array-patterns/sliding-window) with a count map | The map summarises a window, so it needs deletes when the left edge moves |
| "First missing positive" or "find the duplicate" with values in `1..n` and O(1) space | [Cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort) or [fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) | The dense range makes each value an index into the array itself |
| "Smallest key ≥ x", "all events between t1 and t2" | [Ordered map](/learn/data-structures/hashing/ordered-maps-vs-hash-maps) | Hashing destroys order; floor and range queries need a tree or a sorted array |
| "Count distinct users in a 10⁹-event stream" on one machine | [HyperLogLog](/learn/advanced-data-structures/probabilistic-structures/count-min-sketch-and-hyperloglog) | An exact set of 10⁹ keys needs tens of gigabytes; a sketch needs kilobytes at about 1% error |

The test for the prefix-sum confusion is the same as for sliding windows: if the answer is a **pair of elements**, key by element; if the answer is a **range between two indices**, key by a running summary of the prefix.

## The template

Each sub-pattern is five lines. Learn them as one family: one pass, one map, and the map summarises everything processed so far.

### Complement lookup

```python
def complement_lookup(nums, target):
    seen = {}                      # value -> index of an earlier occurrence
    for i, x in enumerate(nums):
        need = target - x
        if need in seen:           # query first: only elements before i are in the map
            return [seen[need], i]
        seen[x] = i                # then update, so x can pair with later elements
    return []
```

```javascript
function complementLookup(nums, target) {
  const seen = new Map();          // value -> index of an earlier occurrence
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (seen.has(need)) return [seen.get(need), i];
    seen.set(nums[i], i);
  }
  return [];
}
```

### Frequency count

```python
from collections import Counter

def freq(items):
    counts = Counter(items)        # C loop: counts[x] = counts.get(x, 0) + 1
    return counts
```

```javascript
function freq(items) {
  const counts = new Map();
  for (const x of items) counts.set(x, (counts.get(x) ?? 0) + 1);
  return counts;
}
```

### Group by canonical key

```python
from collections import defaultdict

def group_by(items, canonical):
    groups = defaultdict(list)     # canonical form -> originals, first-seen order
    for it in items:
        groups[canonical(it)].append(it)
    return list(groups.values())
```

```javascript
function groupBy(items, canonical) {
  const groups = new Map();
  for (const it of items) {
    const k = canonical(it);       // must be a primitive: string or number
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  return [...groups.values()];
}
```

### Seen set

```python
def has_duplicate(nums):
    seen = set()
    for x in nums:
        if x in seen:
            return True
        seen.add(x)
    return False
```

```javascript
function hasDuplicate(nums) {
  const seen = new Set();
  for (const x of nums) {
    if (seen.has(x)) return true;
    seen.add(x);
  }
  return false;
}
```

### The invariant, and why query-then-insert is correct

State this out loud before you write the loop:

> At the top of iteration `i`, the map is an exact summary of `nums[0..i)` under the chosen key, and contains nothing from `nums[i..]`.

For complement lookup this gives correctness in both directions. **Soundness:** any index returned from the map is some `j < i`, so the pair is two distinct positions. **Completeness:** if a pair `(j, i)` with `j < i` exists, then when the loop reaches `i`, `nums[j]` is already in the map (inserted at iteration `j`), so the query finds it; the loop cannot miss a pair because every pair is examined from its later element. Inserting before querying breaks the "nothing from `nums[i..]`" clause, and that is the entire source of the self-pairing bug traced below.

Watch the frequency count inside a real table: each `set` of an existing key walks the chain to the entry and overwrites the count; a new key appends to the chain.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 5,
 "operations": [["set","a",1],["set","b",1],["set","a",2],["set","c",1],["set","a",3],["get","a"],["get","b"],["get","z"]]}
```

The only design decision that matters is the key. In complement lookup the key is the value you will *ask about later*, so you store `x` and query `target - x`. In grouping the key is a canonical form that must be immutable and hashable: a string, a number, a tuple in Python. In JavaScript a `Map` key must be a primitive for value semantics, because two arrays with the same contents are different keys.

## Worked problems

### Two Sum: the order of two lines

[Two Sum](/practice/two-sum): return indices of two distinct positions whose values sum to `target`.

Trace `nums = [3, 2, 4]`, `target = 6` with the lines in the correct order and in the swapped order:

| `i` | `x` | `need` | Query-then-insert: found? | map after | Insert-then-query: map after insert | found? |
|---|---|---|---|---|---|---|
| 0 | 3 | 3 | no (map empty) | `{3: 0}` | `{3: 0}` | **yes, index 0** → returns `[0, 0]` |
| 1 | 2 | 4 | no | `{3: 0, 2: 1}` | | |
| 2 | 4 | 2 | yes, index 1 → `[1, 2]` | | | |

The swapped version pairs 3 with itself, because `target = 2 × 3`. It passes every sample where no element is half the target, which is why it survives until the hidden tests.

Duplicates are the second thing to trace. `nums = [1, 5, 1, 5]`, `target = 10`:

| `i` | `x` | `need` | found? | map after |
|---|---|---|---|---|
| 0 | 1 | 9 | no | `{1: 0}` |
| 1 | 5 | 5 | no (the only 5 is me, and I am not inserted yet) | `{1: 0, 5: 1}` |
| 2 | 1 | 9 | no | `{1: 2, 5: 1}` (index of 1 overwritten) |
| 3 | 5 | 5 | yes, index 1 → `[1, 3]` | |

Overwriting `1: 0` with `1: 2` is harmless for existence, but if the problem asks for the **smallest** indices you must keep the first occurrence (`seen.setdefault(x, i)`), and if it asks for **all** pairs you store counts or lists, not an index. Time O(n) expected, space O(n).

### Valid Sudoku: the key is the solution

[Valid Sudoku](/practice/valid-sudoku): decide whether the filled cells of a 9 × 9 board break the rules (no digit twice in a row, a column, or a 3 × 3 box). Empty cells are `"."`.

Three sets of 9 sets each is the first idea. The cleaner design is **one** set of tagged strings: cell `(r, c)` holding digit `d` produces `"r{r}:{d}"`, `"c{c}:{d}"` and `"b{b}:{d}"`, where the box index is `b = (r // 3) * 3 + c // 3`. A conflict is a key that is already present. The tag prefix is what keeps "row 3 has a 7" and "column 3 has a 7" from colliding.

Trace the filled cells of a board in row-major order:

| Cell | Digit | Box `b` | Keys | Already present? | Set size after |
|---|---|---|---|---|---|
| (0, 0) | 5 | 0 | `r0:5 c0:5 b0:5` | none | 3 |
| (0, 1) | 3 | 0 | `r0:3 c1:3 b0:3` | none | 6 |
| (0, 4) | 7 | 1 | `r0:7 c4:7 b1:7` | none | 9 |
| (1, 0) | 6 | 0 | `r1:6 c0:6 b0:6` | none | 12 |
| (1, 4) | 5 | 1 | `r1:5 c4:5 b1:5` | none (5 is new to row 1, column 4 and box 1) | 15 |
| (2, 2) | 3 | 0 | `r2:3 c2:3 b0:3` | **`b0:3`** from (0, 1) | return false |

The conflict is in a box, not a row or column, which is the case candidates forget when they check rows and columns first and "add boxes later". Here are the same six inserts and the failing lookup in an open-addressing table:

```viz
{"type": "hash-table", "algorithm": "open-addressing", "buckets": 16,
 "operations": [["set","r0:5",1],["set","c0:5",1],["set","b0:5",1],["set","r0:3",1],["set","c1:3",1],["set","b0:3",1],["get","b0:3"]],
 "title": "Valid Sudoku's seen set", "caption": "Each filled cell inserts three tagged keys; a lookup that finds a key already present is a rule violation."}
```

The board is 81 cells, so the work is at most 243 inserts: constant for this problem, and O(n²) cells for an `n × n` generalisation.

```python
def is_valid_sudoku(board):
    seen = set()
    for r in range(9):
        for c in range(9):
            d = board[r][c]
            if d == ".":
                continue                       # empties are not values
            b = (r // 3) * 3 + c // 3
            for key in (f"r{r}:{d}", f"c{c}:{d}", f"b{b}:{d}"):
                if key in seen:
                    return False
                seen.add(key)
    return True
```

The array-as-map variant is worth naming: 27 integers used as 9-bit masks (`rows[r] |= 1 << d`), no hashing at all, and 27 machine words of state. Say it if the interviewer asks what you would ship in a solver that validates millions of boards.

### Longest Consecutive Sequence: a nested loop that is linear

[Longest Consecutive Sequence](/practice/longest-consecutive-sequence): return the length of the longest run of consecutive integers in an unsorted array, in O(n).

Put everything in a set, then walk upward from each value while `x + 1` is present. Walking from *every* value is O(n²) on `[1, 2, …, n]`; the fix is to **start a walk only at a run's head**, a value whose predecessor is absent. Every value belongs to exactly one run and every run has exactly one head, so the walks together touch each value once.

```python
def longest_consecutive(nums):
    s = set(nums)                    # also removes duplicates
    best = 0
    for x in s:
        if x - 1 in s:
            continue                 # not a head: some walk will reach x
        length = 1
        while x + length in s:
            length += 1
        best = max(best, length)
    return best
```

Trace `nums = [4, -1, 2, 0, 9, 1, 3, 2, 10, -2]`, set `{-2, -1, 0, 1, 2, 3, 4, 9, 10}` (9 values; the duplicate 2 is gone). The rows visit values in input order for readability; a set's real iteration order is arbitrary (see "Under the hood") and the answer does not depend on it. The last column counts set lookups:

| `x` | `x − 1` in set? | Walk | Length | Best | Lookups |
|---|---|---|---|---|---|
| 4 | 3 yes, skip | | | 0 | 1 |
| −1 | −2 yes, skip | | | 0 | 1 |
| 2 | 1 yes, skip | | | 0 | 1 |
| 0 | −1 yes, skip | | | 0 | 1 |
| 9 | 8 no, head | 10 present, 11 absent | 2 | 2 | 1 + 2 |
| 1 | 0 yes, skip | | | 2 | 1 |
| 3 | 2 yes, skip | | | 2 | 1 |
| 10 | 9 yes, skip | | | 2 | 1 |
| −2 | −3 no, head | −1, 0, 1, 2, 3, 4 present; 5 absent | 7 | 7 | 1 + 7 |

Total lookups: 9 head checks plus 9 walk lookups, exactly `2 × |set|` = 18. The walk from a head of a run of length `L` performs `L` lookups (`L − 1` hits and one miss), and the run lengths sum to `|set|`. That is the argument to say out loud. Walking from every value instead costs `7 + 6 + … + 1 = 28` lookups for the long run alone, and `n(n + 1)/2` on `[1..n]`: for `n = 10⁵`, 5 × 10⁹ lookups, around eight minutes at the 10⁷ lookups per second measured above.

### Top K Frequent Elements: count, then select without sorting

[Top K Frequent Elements](/practice/top-k-frequent): return the `k` most frequent values; the input guarantees no tie at the `k`-th place.

Counting is the hash-map half. Selecting is where you show how you think about complexity: sorting the `m` distinct `(count, value)` pairs is O(m log m); a size-`k` min-heap is O(m log k) and is the [Top-k](/learn/interview-patterns/sequence-patterns/top-k-elements) pattern; and because every count lies in `1..n`, an array of `n + 1` buckets indexed by count is a counting sort on frequencies, O(n) total.

Trace `nums = [4, 4, 1, 2, 2, 2, 5, 4, 2]` (`n = 9`), `k = 2`:

| Phase | State |
|---|---|
| Count | `{4: 3, 1: 1, 2: 4, 5: 1}` (first-seen order, because dicts keep insertion order) |
| Bucket (index = count) | `buckets[1] = [1, 5]`, `buckets[3] = [4]`, `buckets[4] = [2]`, the other 7 of the 10 buckets empty |
| Read from index 9 down | 9, 8, 7, 6, 5 empty; 4 → `out = [2]`; 3 → `out = [2, 4]`, length `k`, stop |

```python
from collections import Counter

def top_k_frequent(nums, k):
    counts = Counter(nums)
    buckets = [[] for _ in range(len(nums) + 1)]   # index = frequency, 0..n
    for v, c in counts.items():
        buckets[c].append(v)
    out = []
    for c in range(len(nums), 0, -1):
        out.extend(buckets[c])
        if len(out) >= k:
            return out[:k]                         # a bucket may overshoot k
    return out
```

The `out[:k]` slice matters when the bucket that crosses `k` holds several values: with `k = 3`, bucket 1 adds both 1 and 5. The "no tie at the k-th place" guarantee makes the slice unambiguous; without it, ask which tied value the caller wants.

### Group Anagrams: choosing the key with numbers

[Group Anagrams](/practice/group-anagrams) is the grouping template with `canonical = sorted letters`; the step-by-step trace is in [Hash maps in interviews](/learn/data-structures/hashing/hash-maps-in-interviews). What the pattern lesson adds is the measured choice between the two canonical keys, because "the count signature is O(L) so it is faster" is the answer interviewers hear most and it is only half right. Grouping 10⁵ random words over a 10-letter alphabet, CPython 3.14, one development machine:

| Word length | `"".join(sorted(w))` key | 26-slot count tuple key |
|---|---|---|
| 5 | 16 ms | 25 ms |
| 50 | 240 ms | 133 ms |

For short words the sort is a C loop over five items and the count tuple is 26 interpreted increments plus a 26-element tuple; for long words the O(L log L) sort loses. Say "sorted string for short words, counts once words are long or the alphabet is fixed and small", and name the length where you would measure.

The count signature has a second life: slid across a longer text, with one increment for the character entering and one decrement for the character leaving, it finds every anagram of a pattern in O(n). That is a frequency map inside a [sliding window](/learn/interview-patterns/array-patterns/sliding-window):

```viz
{"type": "string", "algorithm": "anagram-window", "text": "cbaebabacd", "pattern": "abc"}
```

## Where the map is the wrong answer

Three problems in this lesson's list are there to see whether you pattern-match on the module name.

**[Product of Array Except Self](/practice/product-except-self)** has no membership query at all. The O(n) answer is a prefix-product pass and a suffix-product pass, taught in [Prefix sum](/learn/interview-patterns/array-patterns/prefix-sum).

**[First Missing Positive](/practice/first-missing-positive)** has a three-line set solution, O(n) time and O(n) space, and it is a fine first answer. The O(1)-space requirement plus the range `1..n` unlocks [cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort): place each value `v` at index `v − 1`, then the first index `i` with `nums[i] != i + 1` gives the answer. Say the set solution, then say why the constraint moves you off it.

**[Encode and Decode Strings](/practice/encode-decode-strings)** is canonical representation, the same skill as choosing a grouping key: length-prefixing (`"5#hello3#abc"`) is unambiguous for any content, a bare delimiter is not.

[Contains Duplicate](/practice/contains-duplicate) and [Valid Anagram](/practice/valid-anagram) are the seen-set and count templates verbatim; the senior addition is the sort-and-compare alternative when memory matters more than a log factor.

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| **Count all pairs** with sum `t` | `pairs += seen.get(t - x, 0)` then `seen[x] += 1`; each unordered pair is counted once, from its later element | O(n) time, O(distinct) space |
| **Pairs with difference `k`** | Look up both `x − k` and `x + k`; when `k == 0` they are the same key, so look up once | O(n) |
| **Smallest indices** | `seen.setdefault(x, i)` keeps the first occurrence | O(n) |
| **Fixed small alphabet** | An array of 26 or 128 counters indexed by code point: a perfect hash, no collisions, fits in a few cache lines | O(n), O(1) space |
| **Collection as key** | Python: `tuple(...)` or `frozenset(...)`; JavaScript: join with a separator that cannot occur in the elements | O(key length) per lookup |
| **Map inside a window** | Decrement on leave and delete at zero, or `len(map)` overcounts distinct values | [Sliding window](/learn/interview-patterns/array-patterns/sliding-window) |
| **Map of prefix sums** | Key = running sum, value = count; seed `{0: 1}` for ranges that start at index 0 | [Prefix sum](/learn/interview-patterns/array-patterns/prefix-sum) |
| **Group shifted strings** | Key = the sequence of letter gaps mod 26 (see the exercise) | O(total characters) |

## Complexity, derived

Each lookup and insert costs one hash computation plus an expected constant number of probes, provided the load factor is bounded, which every production table enforces by resizing (CPython's dict resizes when it reaches two-thirds full). Resizing copies every entry, but capacity grows geometrically, so the total copying over `n` inserts is at most `n + n/2 + n/4 + … < 2n`: amortised O(1) per insert. A one-pass hash-map algorithm is therefore O(n) expected time.

Two terms hide in "expected O(1)":

- **The key's cost.** Hashing a string of length `L` is O(L) the first time. Building the key can dominate: `"".join(sorted(w))` is O(L log L) per word, so Group Anagrams is O(N · L log L) overall, not O(N).
- **The worst case.** If an adversary makes every key collide, each insert probes every earlier key and the loop becomes O(n²). This is not hypothetical: in CPython an `int` hashes to its value modulo the Mersenne prime 2⁶¹ − 1, so every multiple of 2⁶¹ − 1 hashes to 0. Building a set of 20,000 such integers took 1.27 s against 0.26 ms for 20,000 small integers, measured on CPython 3.14: about 5,000× slower, and the time roughly quadrupled each time `n` doubled.

Memory is the cost to say unprompted. Measured with `sys.getsizeof` on CPython 3.14, a set of 10⁶ integers is 33.6 MB and a dict mapping them to indices is 41.9 MB, against 8 MB for the list of pointers holding the same integers; the table is 4–5× the input before you count any new objects. In Node 24 a `Map` of 10⁶ integer pairs grew the heap by about 59 MB.

Compare the approaches for "does any value repeat?":

| Approach | Time | Extra space | Keeps input order | Worst case | Streams |
|---|---|---|---|---|---|
| Nested loop | O(n²) | O(1) | yes | O(n²) | no |
| Sort, compare neighbours | O(n log n) | O(1) in place, O(n) for a copy | no (mutates or copies) | O(n log n) | no |
| Hash set | O(n) expected | O(n), 30+ bytes per element in CPython | yes | O(n²) under collisions | yes, until memory runs out |
| Bitmap over a value range `V` | O(n + V) | V/8 bytes | yes | O(n + V) | yes |
| Bloom filter | O(n) | about 10 bits per element at 1% false positives | yes | O(n) | yes, with false "duplicate" answers |

## Under the hood

### What a lookup costs in CPython 3.14

`x in s` computes `hash(x)`, masks it to a slot, and compares the stored hash before calling `__eq__`, so most misses never compare keys. What `hash(x)` costs depends on the type. A `str` caches its hash in the object, so a key string is hashed once in its life; the first `hash()` of a 10⁷-character string took 1.2 ms and the second 0.5 µs. Since CPython 3.14 a `tuple` also caches its hash (measured the same way: 1.2 ms, then 1 µs for a million-element tuple); on earlier versions every lookup with a tuple key rehashes every element, which is one reason string keys were the traditional advice. An `int` hashes to its value modulo 2⁶¹ − 1 with one exception you can check in a REPL: `hash(-1)` is `-2`, because `-1` is the error return value of the C hash function, so `-1` and `-2` always share a hash.

String and bytes hashes are salted with a per-process random key (SipHash-1-3, controlled by `PYTHONHASHSEED`), which defeats precomputed collision attacks on text keys. Integers are not salted, which is why the multiples-of-2⁶¹−1 attack above works on any CPython. For untrusted integer keys at scale, cap the input size or convert keys to strings.

### Iteration order is part of the contract, or not

A `dict` iterates in insertion order, guaranteed since Python 3.7, because entries live in an append-only array next to the sparse index table. That is why the grouping template returns groups in first-seen order and why the Top K count above listed `4, 1, 2, 5`. A `set` has no such array and iterates in slot order: on CPython 3.14, `list({5, 3, 9, 1})` is `[9, 3, 5, 1]` and `list({100, 4, 200, 1, 3, 2})` is `[1, 2, 3, 100, 4, 200]`. Small non-negative integers often *look* sorted because they hash to themselves, which is how "iterate the set, it is sorted" code passes a sample and fails later.

In JavaScript, `Map` and `Set` iterate in insertion order. A plain object does not: integer-like keys come first in ascending numeric order, then string keys in insertion order. Setting `b`, `10`, `a`, `2`, `-1` on an object and calling `Object.keys` gives `['2', '10', 'b', 'a', '-1']` in Node 24, because `-1` is not an array index.

### JavaScript: Map, object, or typed array

Counting 10⁶ small integers (values below 1,000) in Node 24 took 19.5 ms with a `Map`, 5.2 ms with a plain object and 4.1 ms with an `Int32Array(1000)`. The object is fast here because V8 stores integer-like keys in an elements backing store, close to an array; with string keys it has the prototype and coercion problems described in [Hash maps in interviews](/learn/data-structures/hashing/hash-maps-in-interviews). The interview rule: `Map` for general keys, a typed array when the key range is small and known, never an object for user-controlled strings.

## Failure modes

**Self-pairing.** *Symptom:* `[3, 2, 4]`, target 6 returns `[0, 0]`. *Diagnosis:* insert before query (traced above). *Fix:* query, then insert.

**Ambiguous composite keys.** *Symptom:* two strings that are not anagrams land in one group, or two different letter-gap patterns merge. *Diagnosis:* a key built with `"".join` of numbers: gap sequence `1, 11` and `11, 1` both become `"111"`, as do count vectors `[11, 1, …]` and `[1, 11, …]`. *Fix:* a separator that cannot appear in the parts (`","`), a length prefix, or a tuple key in Python.

**A request that parses a JSON body pins a core.** *Symptom:* one endpoint's p99 jumps from milliseconds to seconds under a small request rate; the profile shows time inside dict insertion. *Diagnosis:* attacker-chosen keys that collide, the hash-flooding attack disclosed against most web stacks in 2011; CPython salts `str` hashes by default since 3.3, but integer keys and custom `__hash__` methods are not protected. *Fix:* cap the number of keys per request, salt or stringify integer keys, and in Java rely on `HashMap` converting a bucket to a red-black tree once it holds 8 entries (in a table of at least 64 slots), which caps the worst case near O(log n) for `Comparable` keys.

**Order assumed from a set.** *Symptom:* a solution returns `list(set(...))`, passes locally, fails in CI or on a different input with negative numbers or strings. *Diagnosis:* set iteration order is slot order, and for strings it changes with the per-process hash seed. *Fix:* sort explicitly, or use a dict (insertion-ordered) when first-seen order is required.

**Out of memory on a large distinct count.** *Symptom:* a job counting distinct IDs over a day of events is OOM-killed as volume grows. *Diagnosis:* an exact set grows linearly; at the 34 bytes per integer measured above, 10⁹ distinct IDs is over 30 GB before counting the ID objects. *Fix:* HyperLogLog for distinct counts (kilobytes, about 1% error), or hash-partition the stream into files by `hash(id) % 256` and count each file exactly.
## Interviewer follow-ups

**"Solve it with O(1) extra space."** Model answer: the pattern changes. For pair problems, sort in place and use two pointers, O(n log n); for a dense range `1..n`, use the array as the map with cyclic sort or index negation; for a duplicate in a read-only array of `n + 1` values in `1..n`, use [fast and slow pointers](/learn/interview-patterns/sequence-patterns/fast-slow-pointers) on the implicit linked list `i → nums[i]`. Common wrong answer: "a hash map is O(1) per operation", which confuses time per operation with total space.

**"The input is a stream that does not fit in memory."** Model answer: an exact answer needs either all distinct keys in memory or multiple passes. For exact results, hash-partition to disk (every copy of a key lands in the same partition, so each partition is counted independently); for one pass, a Count-Min sketch for frequencies or HyperLogLog for distinct counts, with the stated error. Common wrong answer: "use a bigger machine", or a map that evicts keys, which silently gives wrong counts.

**"What is the worst case of your solution?"** Model answer: O(n²) if keys collide adversarially; Python salts string hashes but not integers, Java treeifies long buckets to get O(log n) per operation, and a sorted approach has a guaranteed O(n log n). Common wrong answer: "O(n), hash maps are O(1)".

**"Return all pairs, not one."** Model answer: store counts or index lists, not one index; with many repeats the output itself is O(n²) pairs, so ask whether they want value pairs or index pairs. Common wrong answer: one index per value, which misses repeated partners.
## What mid-level engineers get wrong

- **Insert before query** in complement lookup. Consequence: an element pairs with itself on exactly the inputs where `target = 2x`.
- **Naming the data structure instead of the key.** "I'll use a hash map" without saying what maps to what. Consequence: the interviewer cannot tell whether you know the solution, and you discover mid-code that you needed counts, not indices.
- **Calling a nested loop O(n²) or O(n) without the argument.** Consequence: in Longest Consecutive Sequence the interviewer assumes you got lucky; the head argument (each value is walked once) is what earns the point.
- **Forgetting the memory cost.** Consequence: surprise at "can you do it without extra memory?", which is the most predictable follow-up in this family.
- **Using a plain JavaScript object for counts of arbitrary strings.** Consequence: a key named `constructor` reads as a function, and `__proto__` can rewrite the prototype.
- **Iterating a set and assuming it is sorted.** Consequence: correct on small positive integers, wrong on negatives or strings.

## Exercises

```exercise
id: count-pairs-with-diff
title: Count pairs with a given difference
prompt: |
  Given an array of integers `nums` and a non-negative integer `k`, return
  the number of index pairs `(i, j)` with `i < j` such that
  `|nums[i] - nums[j]| == k`.

  Aim for O(n) time using a single pass and a frequency map of the values
  seen so far. Be careful with `k == 0`: each pair of equal values must be
  counted exactly once.
languages: [python, javascript]
entry: count_pairs_with_diff
starter:
  python: |
    def count_pairs_with_diff(nums, k):
        # your code here
        return 0
  javascript: |
    function count_pairs_with_diff(nums, k) {
      // your code here
      return 0;
    }
tests:
  - args: [[1, 5, 3, 4, 2], 2]
    expected: 3
  - args: [[1, 1, 1], 0]
    expected: 3
    label: k is zero, all equal
  - args: [[], 1]
    expected: 0
    label: empty input
  - args: [[3, 1, 4, 1, 5], 2]
    expected: 3
    label: duplicate values
  - args: [[1, 2, 3, 4], 1]
    expected: 3
    hidden: true
  - args: [[2, 2, 4, 4], 2]
    expected: 4
    hidden: true
    label: every cross pair counts
  - args: [[5], 3]
    expected: 0
    hidden: true
    label: single element
hints:
  - "For the current value x, the earlier partners are the elements equal to x - k and x + k. Look both up before you insert x."
  - "When k is 0, x - k and x + k are the same value; count that lookup once, not twice."
  - "Keep a map from value to how many times it has appeared so far, and add the partner counts to a running total."
```

```exercise
id: group-shifted-strings
title: Group strings by shift pattern
prompt: |
  A string of lowercase letters can be "shifted" by moving every letter
  forward the same number of places, wrapping from `z` to `a`: `"abc"`,
  `"bcd"` and `"xyz"` are shifts of one another, and so are `"az"` and
  `"ba"`. Group the input strings so that each group holds strings that are
  shifts of one another.

  Return the groups in order of their first appearance in the input, with
  the strings inside each group in input order. Keep duplicates. Design a
  canonical key that is the same for every shift of a string and different
  otherwise; one pass with a map is enough.
languages: [python, javascript]
entry: group_shifted
starter:
  python: |
    def group_shifted(words):
        # your code here
        return []
  javascript: |
    function group_shifted(words) {
      // your code here
      return [];
    }
tests:
  - args: [["abc", "bcd", "acef", "xyz", "az", "ba", "a", "z"]]
    expected: [["abc", "bcd", "xyz"], ["acef"], ["az", "ba"], ["a", "z"]]
  - args: [[]]
    expected: []
    label: empty input
  - args: [["a"]]
    expected: [["a"]]
    label: single one-letter word
  - args: [["ab", "ba"]]
    expected: [["ab"], ["ba"]]
    label: the direction of the gap matters
  - args: [["az", "yx", "ba", "bc", "ab"]]
    expected: [["az", "yx", "ba"], ["bc", "ab"]]
    hidden: true
  - args: [["abc", "ab", "abc"]]
    expected: [["abc", "abc"], ["ab"]]
    hidden: true
    label: length is part of the key, duplicates kept
  - args: [["zab", "abc"]]
    expected: [["zab", "abc"]]
    hidden: true
    label: gaps wrap around z
  - args: [["abm", "alm"]]
    expected: [["abm"], ["alm"]]
    hidden: true
    label: gaps 1,11 and 11,1 must not collide
hints:
  - "Two strings are shifts of each other exactly when they have the same length and the same sequence of gaps between neighbouring letters."
  - "Take each gap modulo 26 so that z to a counts as 1: (code[i] - code[i-1] + 26) % 26."
  - "Join the gaps with a separator, or use a tuple in Python: without one, gaps 1 then 11 and 11 then 1 produce the same key."
```

## Senior signals

- You name the **key** before the data structure: "a map from the sorted letters to the words", "a set of tagged strings like `r3:7`".
- You state the **invariant** (the map summarises exactly the elements before `i`) and use it to explain why query-then-insert handles `target = 2x`.
- You defend a nested loop as **linear by counting lookups**: each value is walked once from its run's head, `2 × |set|` lookups in total.
- You say the **memory cost** with a number (a CPython set of 10⁶ ints is about 34 MB) and the O(1)-space alternative before being asked.
- You know when the map is a **perfect hash in disguise**: a 26-slot array, 27 bitmasks for Sudoku, the array itself for values in `1..n`.
- You know the **worst case is O(n²)** under adversarial collisions, which types CPython salts and which it does not, and what Java does about it.
- You recognise the listed problems that are **not** map problems (prefix products, first missing positive under O(1) space, encode/decode) and say why.

## Check yourself

```quiz
- q: >-
    You write the complement lookup as seen[x] = i followed by checking whether target - x is in seen. Which input exposes the bug?
  options: ["An input that has more than one valid pair", "An input where target is twice some element", "An input where the answer uses the last element", "An input that contains negative numbers"]
  answer: 1
  explanation: >-
    Inserting first means the current element is in the map when it asks for its complement, so when target - x equals x it finds itself and returns the same index twice. Query first, then insert, and every index found is strictly earlier. Negatives, several valid pairs and a last-element answer are all handled by either order.
- q: >-
    Longest Consecutive Sequence on a set of 9 distinct values forming two runs of lengths 7 and 2 performs how many set lookups with the head-only walk?
  options: ["18, one head check per value plus one walk lookup per value", "81, since each of the 9 values can walk up to 9 steps", "31, since every value walks to the end of its own run", "11, one head check per value plus one per run found"]
  answer: 0
  explanation: >-
    Every value gets one head check (9). Only the two heads walk, and a walk over a run of length L does L lookups (L - 1 hits and one miss), so the walks add 7 + 2 = 9. Walking from every value gives 28 + 3 = 31 walk lookups, the quadratic version the head check exists to avoid.
- q: >-
    Grouping 100,000 five-letter words by anagram class in CPython, which key did the measurement in this lesson favour, and why?
  options: ["The count tuple, since building it is O(L) while sorting is O(L log L)", "Neither, since the dict lookup dominates and both keys cost the same", "The sorted string, since sorting five items in C beats 26 interpreted increments", "The count tuple, since tuples hash faster than strings of equal length"]
  answer: 2
  explanation: >-
    At L = 5 the sorted key took 16 ms against 25 ms for the count tuple; the asymptotic advantage of counting only shows once words are long (at L = 50 the count key won, 133 ms against 240 ms). Constant factors dominate at small L, which is the point to make in the interview.
- q: >-
    A Python solution returns list(set(nums)) and a test expects the values in first-seen order. It passes on [5, 1, 3] locally and fails on other inputs. What is the most accurate explanation?
  options: ["Sets reorder themselves after every resize of the table", "Sets keep insertion order only for integers below 256", "Sets iterate in slot order, which only sometimes matches input", "Sets sort their contents, so any unsorted input will fail"]
  answer: 2
  explanation: >-
    A set has no insertion-ordered entries array, so it iterates in the order of its hash slots. Small non-negative integers hash to themselves, which can make the order look sorted or look like input order by accident; list({5, 3, 9, 1}) is [9, 3, 5, 1] on CPython 3.14. A dict, or dict.fromkeys(nums), keeps first-seen order by guarantee.
- q: >-
    An interviewer says the array holds n + 1 values in the range 1..n, must not be modified, and you may use O(1) extra space. Find a duplicate. Which approach fits?
  options: ["A hash set of values seen, returning the first repeat", "Treating i to nums[i] as a linked list and finding its cycle", "Sorting the array, then comparing neighbouring values", "Counting values in a Counter and returning any count above 1"]
  answer: 1
  explanation: >-
    The set and the Counter are O(n) space and sorting modifies the input. Because every value is a valid index, following i to nums[i] from index 0 forms a linked list that must contain a cycle, and the cycle's entrance is the duplicate; Floyd's fast and slow pointers find it in O(n) time and O(1) space.
- q: >-
    Why can 20,000 integer keys take over a second to insert into a CPython set when 20,000 other integers take a fraction of a millisecond?
  options: ["Large integers are boxed objects and slow to allocate", "The set resizes on every insert once it exceeds 2^16 keys", "Every multiple of 2^61 - 1 hashes to 0, so each insert probes all", "Integer hashes are salted, so some seeds produce collisions"]
  answer: 2
  explanation: >-
    CPython hashes an int to its value modulo the prime 2^61 - 1 and does not salt integer hashes, so multiples of that prime all collide and each insert compares against every earlier key, making the loop quadratic. String hashes are salted per process; integer hashes are not, which is why capping input size or stringifying untrusted integer keys matters.
```
