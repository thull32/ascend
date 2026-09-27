---
slug: hash-map-patterns
title: "Hash-map patterns: complement, count, group, seen"
description: The four hash-map moves that turn an O(n²) inner loop into O(n), the signal that selects each one, and the two outline problems where the map is the wrong answer.
minutes: 32
difficulty: medium
tags: [pattern:hash-map, hashing, frequency-count, grouping, complement-lookup]
problems: [two-sum, contains-duplicate, valid-anagram, group-anagrams, top-k-frequent, encode-decode-strings, product-except-self, longest-consecutive-sequence, valid-sudoku, first-missing-positive]
---
Most O(n²) solutions have the same shape: an outer loop over the input and an inner loop that scans everything else to answer one question about the current element. "Is there an earlier element equal to `target - x`?" "How many times has this value appeared?" "Which bucket does this word belong in?" "Have I seen this before?" The inner loop is a query, and a hash map answers the query in expected O(1) once you have chosen the right key.

That sentence is the whole pattern. What separates a candidate who reaches for `dict` on reflex from one who gets the senior rating is the choice of key, the honesty about memory, and the recognition of the two or three problems where the map is a trap. This lesson assumes you know how a hash table works from [Hash tables](/learn/data-structures/hashing/hash-tables) and have seen the interview family introduced in [Hash maps in interviews](/learn/data-structures/hashing/hash-maps-in-interviews); here the focus is on recognising which of four sub-patterns a problem is, writing it from memory, and defending it.

## The signal

Read the problem statement for a question you would otherwise answer with a scan.

| Phrase in the statement | Sub-pattern | Key → value |
|---|---|---|
| "two elements that sum/differ/multiply to", "pair", "partner" | Complement lookup | value → index (or count) |
| "how many times", "most frequent", "anagram", "same letters", "can be rearranged" | Frequency count | element → count |
| "group", "categorise", "all strings that are …", "cluster by" | Group by canonical key | canonical form → list of originals |
| "contains duplicate", "unique", "distinct", "already seen", "consecutive" | Seen set | value → present |

The constraint block confirms it. Unsorted input, no bound on the value range, and an expected O(n) or "better than O(n log n)" complexity mean the interviewer wants a map. A value range like `1..n` with n elements is a different signal (that is cyclic sort). "O(1) extra space" removes the map from the table entirely.

The nearest confusable patterns:

- **Sorted input, or sorting allowed, and O(1) space wanted** → [two pointers](/learn/interview-patterns/array-patterns/two-pointers). Two Sum on a sorted array is a two-pointer problem, not a hash-map problem.
- **"Subarray" and "sum equals k"** → the map is still involved, but keyed by prefix sum; that is the [prefix-sum](/learn/interview-patterns/array-patterns/prefix-sum) pattern.
- **"Contiguous window" with counts** → the frequency map lives inside a [sliding window](/learn/interview-patterns/array-patterns/sliding-window). The map is a component, not the pattern.
- **Order or "nearest key" queries** (floor, ceiling, range) → hash maps cannot answer those; you need a sorted structure, see [Ordered maps vs hash maps](/learn/data-structures/hashing/ordered-maps-vs-hash-maps).

## The template

Each sub-pattern is five lines. Learn them as one family: one pass, one map, the map summarises everything you have processed so far. That last clause is the invariant: **after processing index `i`, the map is an exact summary of `nums[0..i]` under the chosen key**. Every bug in this family is a violation of it, usually by updating the map before the query instead of after.

### Complement lookup

```python
def complement_lookup(nums, target):
    seen = {}                      # value -> index
    for i, x in enumerate(nums):
        if target - x in seen:     # query first
            return [seen[target - x], i]
        seen[x] = i                # then update
    return []
```

```javascript
function complementLookup(nums, target) {
  const seen = new Map();        // value -> index
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
    counts = Counter(items)        # element -> count
    return counts
# Or explicitly:  counts[x] = counts.get(x, 0) + 1
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
    groups = defaultdict(list)     # canonical form -> originals
    for it in items:
        groups[canonical(it)].append(it)
    return list(groups.values())
```

```javascript
function groupBy(items, canonical) {
  const groups = new Map();
  for (const it of items) {
    const k = canonical(it);       // must be a string or number
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

Here is what a frequency count looks like inside the table. Each `set` of an existing key walks the chain to the entry and overwrites the count; a new key appends to the chain.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 5,
 "operations": [["set","a",1],["set","b",1],["set","a",2],["set","c",1],["set","a",3],["get","a"],["get","b"],["get","z"]]}
```

The only design decision that matters is the key. In complement lookup the key is the value you will *ask about later*, so you store `x` and query `target - x`, never the other way round. In grouping the key is a canonical form, which must be immutable and hashable: a string, a number, a tuple in Python. In JavaScript the key must be a primitive; two arrays with the same contents are different `Map` keys because they are compared by reference.

## Worked problems

### Group Anagrams

[Group Anagrams](/practice/group-anagrams): given a list of words, return the words grouped so that each group holds words that are anagrams of one another.

Two words are anagrams if they have the same multiset of letters. The key insight is that a multiset has a canonical representation, and every canonical representation is a hashable key. Two candidates:

- **Sorted string.** `"eat" → "aet"`. Costs O(L log L) per word for length L, keys are readable, works for any alphabet.
- **Count signature.** For lowercase ASCII, a 26-slot count vector, `"eat" → (1,0,0,0,1,...,1,...)` as a tuple (Python) or a joined string like `"1,0,0,0,1,…"` (JavaScript). Costs O(L) per word, but the key is 26 entries long even for one-letter words, so for short words it is slower in practice and it does not extend to Unicode.

Trace with `["eat","tea","tan","ate","nat","bat"]` using the sorted-string key:

| Word | Key | Map after insert |
|---|---|---|
| `eat` | `aet` | `{aet: [eat]}` |
| `tea` | `aet` | `{aet: [eat, tea]}` |
| `tan` | `ant` | `{aet: [eat, tea], ant: [tan]}` |
| `ate` | `aet` | `{aet: [eat, tea, ate], ant: [tan]}` |
| `nat` | `ant` | `{aet: [eat, tea, ate], ant: [tan, nat]}` |
| `bat` | `abt` | `{aet: [eat, tea, ate], ant: [tan, nat], abt: [bat]}` |

Return the values: `[[eat, tea, ate], [tan, nat], [bat]]`.

```python
def group_anagrams(words):
    groups = defaultdict(list)
    for w in words:
        groups["".join(sorted(w))].append(w)
    return list(groups.values())
```

Time O(N · L log L) for N words of average length L with the sorted key, O(N · L) with the count key. Space O(N · L) for the groups plus the keys. When the interviewer asks "can you do better than sorting each word?", the answer is the count signature, and the honest follow-up is that for typical word lengths the difference is not measurable.

[Valid Anagram](/practice/valid-anagram) is the two-word special case: one count map, increment for the first word, decrement for the second, check that nothing is non-zero. The same count-signature idea, viewed as a window sliding over a longer text, becomes the anagram-window search:

```viz
{"type": "string", "algorithm": "anagram-window", "text": "cbaebabacd", "pattern": "abc"}
```

### Longest Consecutive Sequence

[Longest Consecutive Sequence](/practice/longest-consecutive-sequence): given an unsorted array, return the length of the longest run of consecutive integers (`3, 4, 5, 6` counts as 4), in O(n).

Sorting would make this trivial and O(n log n). The O(n) constraint is the signal: you need membership queries, so put everything in a set. Then the naive idea is "for each `x`, walk `x+1, x+2, …` while present". That is O(n²) on a sorted-looking input like `[1, 2, 3, …, n]` because you rerun the walk from every element.

The fix is the insight: **only start a walk from a sequence head**, an `x` where `x - 1` is *not* in the set. Every element belongs to exactly one run, and every run has exactly one head, so each element is visited once by a walk plus once by the head check. Two nested loops, O(n) total. That argument is the thing to say out loud.

Trace with `[100, 4, 200, 1, 3, 2]`, set `{1, 2, 3, 4, 100, 200}`:

| `x` | `x-1` in set? | Walk | Length | Best |
|---|---|---|---|---|
| 100 | 99, no → head | 100, 101 absent | 1 | 1 |
| 4 | 3, yes → skip | | | 1 |
| 200 | 199, no → head | 200, 201 absent | 1 | 1 |
| 1 | 0, no → head | 1, 2, 3, 4, 5 absent | 4 | 4 |
| 3 | 2, yes → skip | | | 4 |
| 2 | 1, yes → skip | | | 4 |

```python
def longest_consecutive(nums):
    s = set(nums)
    best = 0
    for x in s:
        if x - 1 in s:
            continue                 # not a head
        length = 1
        while x + length in s:
            length += 1
        best = max(best, length)
    return best
```

Iterating over `s` rather than `nums` also skips duplicates for free. Time O(n) expected, space O(n). The trap answer is "sort it" and the follow-up trap is walking from every element; the head check is what the interviewer is waiting for.

### Top K Frequent Elements

[Top K Frequent Elements](/practice/top-k-frequent): return the `k` most frequent values in an array.

Two phases. The frequency count is the hash-map half: one pass, `value → count`. The second phase is selecting the top `k` by count, and here you have a choice that tells the interviewer how you think about complexity.

- **Sort the (count, value) pairs**: O(m log m) for m distinct values. Fine, and the honest first answer.
- **Min-heap of size k**: O(m log k). This is the [Top-k](/learn/interview-patterns/sequence-patterns/top-k-elements) pattern and the right answer when k is small relative to m.
- **Bucket by frequency**: a count can only be between 1 and n, so make an array of n + 1 buckets, put each value in `buckets[count]`, and read buckets from the high end until you have k values. O(n) time and space, and the answer that gets the "can you do it in linear time?" follow-up.

Trace with `nums = [1, 1, 1, 2, 2, 3]`, `k = 2`:

| Phase | State |
|---|---|
| Count | `{1: 3, 2: 2, 3: 1}` |
| Buckets (index = count) | `[[], [3], [2], [1], [], [], []]` (n = 6, so 7 buckets) |
| Read from index 6 down | 6, 5, 4 empty; index 3 → `[1]`; index 2 → `[1, 2]`, length k, stop |

```python
def top_k_frequent(nums, k):
    counts = Counter(nums)
    buckets = [[] for _ in range(len(nums) + 1)]
    for v, c in counts.items():
        buckets[c].append(v)
    out = []
    for c in range(len(nums), 0, -1):
        out.extend(buckets[c])
        if len(out) >= k:
            return out[:k]
    return out
```

The bucket approach is a counting sort on frequencies. It works because the key space (1..n) is bounded and dense; that is exactly the condition under which counting sort beats comparison sort, and saying so connects this problem to the sorting lesson rather than leaving it as a trick.

## Where the map is the wrong answer

The outline lists two problems under hash-map whose best solutions do not use one. Interviewers put them there on purpose.

**[Product of Array Except Self](/practice/product-except-self).** A map buys nothing; there is no membership query. The O(n) solution is two prefix passes (product of everything to the left, product of everything to the right) and is taught in the [prefix-sum](/learn/interview-patterns/array-patterns/prefix-sum) lesson. If you reach for a map here you have pattern-matched on the module name rather than on the problem.

**[First Missing Positive](/practice/first-missing-positive).** A set of the values gives an O(n) time, O(n) space answer in three lines, and that is a fine first answer. The problem's real constraint is O(1) extra space, which the value range `1..n` unlocks: place each value at index `value - 1` in the array itself. That is [cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort). Say the set solution, then say why the constraints push you off it.

The general rule: a hash map is O(n) extra memory. Any time the statement says "in place", "constant space", or gives you a dense integer range, expect the interviewer to want the array itself to be the map.

Two more listed problems are worth placing. [Contains Duplicate](/practice/contains-duplicate) is the seen-set template verbatim, and the senior answer includes "or sort and scan neighbours if memory matters more than time". [Valid Sudoku](/practice/valid-sudoku) is a seen-set problem where the key design is the whole solution: one set of strings like `"r3:7"`, `"c5:7"`, `"b1,2:7"`, so that a single pass with three inserts per cell detects every conflict. [Encode and Decode Strings](/practice/encode-decode-strings) is not a hash-map problem at all; it sits in this list because it is about designing a canonical, unambiguous representation (length-prefixing), the same skill as choosing a grouping key.

## Variations

- **All pairs, not one pair.** Complement lookup with counts instead of indices: `pairs += seen[target - x]` before incrementing `seen[x]`. With duplicates this counts each unordered pair exactly once because each element is only matched with earlier elements.
- **Fixed small alphabet.** Replace the map with an array of 26 (or 128, or 256) counters. Same logic, no hashing, cache-resident; say that it is a perfect hash. Do it for anagram problems over lowercase ASCII, do not do it when the input is Unicode.
- **The key is a collection.** Python lists are unhashable; convert to `tuple`. JavaScript `Map` keys that are arrays compare by identity; serialise with `join(",")` or `JSON.stringify`, and be aware that `[1, 23]` and `[12, 3]` collide under `join("")`. Choose a separator that cannot appear in the elements.
- **Streaming input.** If the input does not fit in memory, exact frequency counting is impossible; you move to Count-Min Sketch and HyperLogLog, which is a systems answer rather than an interview coding answer, but naming them is a senior signal.
- **The query is about a window, not a prefix.** Add removal: when the left edge of the window leaves, decrement the count and delete the key at zero. Forgetting the delete makes "number of distinct elements in the window" wrong. That is the sliding-window pattern with a map inside.

## Pitfalls

- **Update before query.** Inserting `x` and then asking for `target - x` lets an element pair with itself when `target = 2x`. `[3, 2, 4]` with target 6 returns `[0, 0]`. Query, then insert.
- **Type confusion in JavaScript keys.** A plain object stringifies its keys: `obj[1]` and `obj["1"]` are the same slot, and `obj[[1,2]]` is `obj["1,2"]`. Use `Map` for non-string keys, and know that `Map` uses SameValueZero, so `NaN` matches `NaN` and `0` matches `-0`.
- **Mutable keys in Python.** `groups[sorted(w)]` throws `TypeError: unhashable type: 'list'`. `"".join(sorted(w))` or `tuple(sorted(w))`.
- **`defaultdict` inserting on read.** `if groups[key]:` creates an empty entry for `key`. Use `key in groups` for a pure query.
- **Counting the walk cost wrongly.** In Longest Consecutive Sequence, the nested `while` looks O(n²). If you cannot explain why it is O(n), the interviewer assumes you got lucky. Rehearse the "each element is entered by exactly one walk" argument.
- **Forgetting the memory cost.** Say "O(n) extra space" unprompted. A candidate who is surprised by the follow-up "can you do it without extra memory?" has not thought about the trade-off.
- **Hashing cost hidden in the key.** Sorting each word to build a key is O(L log L) per word; hashing a 26-tuple is O(26). The map lookup is O(1) *in the key length*, and the key length is your choice.

## Exercise

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

## Senior signals

- You name the **key** before you name the data structure: "a map from sorted letters to the words" rather than "I'll use a hash map".
- You state the **memory cost** and the O(1)-space alternative (sort plus two pointers, or the array as the map) before being asked.
- You can defend a nested loop as **O(n) by amortisation** (the sequence-head argument) rather than by hand-waving.
- You know that a small dense alphabet turns the map into an **array**, and that this is faster, not just equivalent.
- You recognise the problems in this family that are **not** hash-map problems (prefix products, first missing positive under O(1) space) and say why.
- You know the JavaScript **object-vs-Map** key semantics and the Python **hashability** rules well enough that key bugs never appear in your code.

## Check yourself

```quiz
- q: >-
    In Longest Consecutive Sequence, why is the algorithm O(n) even though it contains a while loop nested inside a for loop?
  options: ["Set iteration is in sorted order, so no walk ever repeats", "The while loop runs at most log n times per element", "Walks start only at sequence heads, so each element is walked once", "Set lookups are O(1), so the nesting adds no asymptotic cost"]
  answer: 2
  explanation: >-
    Walks begin only at elements whose predecessor is absent. Each run of consecutive values has one head, so its elements are visited by exactly one walk. O(1) lookups alone would still allow O(n²) total work if walks restarted from every element, and set iteration order is not sorted.
- q: >-
    You are grouping records by a compound key of three integers in JavaScript. Which key works correctly with a Map?
  options: ["A template string like `${a}:${b}:${c}`", "The number a + b + c, which is cheap to hash", "An object {a, b, c} built fresh for each record", "The array [a, b, c] used directly as the key"]
  answer: 0
  explanation: >-
    Map compares arrays and objects by reference, so two equal-looking arrays are different keys. A string with a separator is unambiguous. a + b + c collides for different triples.
- q: >-
    An interviewer asks you to solve Top K Frequent Elements in O(n) time. Which idea does that constraint point to?
  options: ["Bucket the values by count, as counts are ≤ n", "Keep a balanced BST keyed by each value's count", "Sort the distinct values by their counts", "Build a max-heap of all distinct values"]
  answer: 0
  explanation: >-
    Counts lie in 1..n, so an array of n + 1 buckets indexed by count is a counting sort on frequencies and reads the top k in O(n). Sorting and heaps are O(m log m) or O(m log k); a heap of size k is the right answer when k is small but is not O(n) in general.
- q: >-
    First Missing Positive can be solved with a set in three lines. Why do interviewers usually reject that answer?
  options: ["Sets cannot hold integers larger than n without resizing", "The set version is O(n log n) once hashing costs are counted", "Sets are slower in practice than a sorted list here", "It needs O(1) extra space; the array itself can be the map"]
  answer: 3
  explanation: >-
    The set solution is O(n) time and O(n) space and is a fine first answer. The constraint that rules it out is space; the dense range 1..n is the signal for cyclic sort, which places each value at index value - 1 so the array serves as the map.
- q: >-
    You write `seen[x] = i` and then check `if target - x in seen`. What input breaks this?
  options: ["An input where target is twice some element", "Any input that contains negative numbers", "An input that has more than one valid pair", "An input where the answer uses the last element"]
  answer: 0
  explanation: >-
    Inserting before querying means x can find itself when target - x == x, so it pairs with itself. Query first, then insert, and the stored index is always earlier than the current one.
```
