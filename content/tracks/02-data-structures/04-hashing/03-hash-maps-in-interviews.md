---
slug: hash-maps-in-interviews
title: Hash maps in interviews
description: The seven shapes behind most hash-map problems (frequency counting, complement lookup, canonical-key grouping, seen sets, prefix-sum maps, index maps and map-plus-structure designs), each traced step by step, with the key-design decision that is the real answer, what Counter, defaultdict and Map do underneath, and the costs to say out loud.
minutes: 45
difficulty: medium
tags: [hashing, hash-map, frequency-count, grouping, seen-set, prefix-sum, design, counter, defaultdict]
problems: [two-sum, contains-duplicate, valid-anagram, group-anagrams, top-k-frequent, longest-consecutive-sequence, insert-delete-getrandom, subarray-sum-equals-k, longest-substring-no-repeat]
---
Roughly a third of coding-interview problems are solved by a hash map, and almost none of them are *about* hash maps. The map is the tool; the problem is deciding what the key is. "Group these words by anagram class" is one line once you say "key by the sorted letters"; "find the longest run of consecutive integers" is one loop once you say "put everything in a set and only start counting from numbers whose predecessor is absent". The design of the key *is* the algorithm.

This lesson catalogues the shapes. Each has a one-line key decision, a state-table trace you can reproduce by hand, and the follow-up a senior interviewer will ask. [Hash tables](/learn/data-structures/hashing/hash-tables) covers why lookups are O(1) and when they are not; here that is assumed and the time goes on how to use them, what the library types do underneath, and the costs you should quote unprompted.

## Shape 1: frequency counting

**Key:** the item. **Value:** how many times it has appeared.

```python
from collections import Counter
counts = Counter(words)                  # dict subclass; missing keys read as 0
```

Valid Anagram is two counters compared, or one counter incremented by the first string and decremented by the second, checking that nothing goes negative. Top-K Frequent is a counter followed by a selection step (a heap of size k, or bucket sort by count, which is O(n)). Majority element, first unique character, and "can these tiles form this word" are all counters.

The senior detail is the **perfect-hash special case**: when keys are small dense integers (ASCII characters, dice values, HTTP status codes), a plain array indexed by the key beats a hash map. A 26-slot array of 8-byte counters is 208 bytes, four cache lines, with no hashing and no collisions; a `Counter` with 26 keys is an 832-byte dict on CPython 3.14 plus 26 boxed ints, and every increment hashes a one-character string, checks identity, and boxes a new integer. Say "I'll use a 26-element count array since the alphabet is fixed; a hash map if the input is Unicode".

Trace Valid Anagram on `"listen"`, `"silent"` with a 26-array, showing only the slots that change:

| Step | Char | Action | `e` | `i` | `l` | `n` | `s` | `t` |
|---|---|---|---|---|---|---|---|---|
| 1–6 | `l i s t e n` | +1 each | 1 | 1 | 1 | 1 | 1 | 1 |
| 7 | `s` | −1 | 1 | 1 | 1 | 1 | 0 | 1 |
| 8 | `i` | −1 | 1 | 0 | 1 | 1 | 0 | 1 |
| 9 | `l` | −1 | 1 | 0 | 0 | 1 | 0 | 1 |
| 10 | `e` | −1 | 0 | 0 | 0 | 1 | 0 | 1 |
| 11 | `n` | −1 | 0 | 0 | 0 | 0 | 0 | 1 |
| 12 | `t` | −1 | 0 | 0 | 0 | 0 | 0 | 0 |

Every slot returns to zero and no decrement went negative: anagram. O(n) time, O(1) space (the array size does not depend on `n`), and the early exit on a negative count means `"aab"` vs `"abb"` fails at step 6 without finishing.

## Shape 2: complement lookup

**Key:** a value you have seen. **Value:** its index (or a count, or presence). **Query:** "have I seen `target − x`?"

This is [Two Sum](/practice/two-sum), and the important line is *insert after checking*, so an element cannot pair with itself:

```python
seen = {}
for i, x in enumerate(nums):
    if target - x in seen:
        return [seen[target - x], i]
    seen[x] = i
```

Trace `nums = [3, 5, 2, 7]`, `target = 9`:

| `i` | `x` | need `9 − x` | in `seen`? | `seen` after |
|---|---|---|---|---|
| 0 | 3 | 6 | no | `{3: 0}` |
| 1 | 5 | 4 | no | `{3: 0, 5: 1}` |
| 2 | 2 | 7 | no | `{3: 0, 5: 1, 2: 2}` |
| 3 | 7 | 2 | yes → `[2, 3]` | |

With `nums = [4, 1]`, `target = 8`: at `i = 0`, need 4, `seen` is empty, so 4 is not found; only then is `4 → 0` stored. Insert-before-check would return `[0, 0]`.

Variants: pairs with a given difference (`x − k` or `x + k` in the set), "does any pair multiply to `t`" (`t / x` with the divisibility check), and the k-sum family, where a hash map handles the last two elements after fixing the others. The follow-up is always "now the array is sorted": then two pointers give O(1) space and the map is the wrong tool; [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) has that version.

## Shape 3: grouping by a canonical key

**Key:** a normalised form of the item such that two items belong together exactly when their normalised forms are equal. **Value:** the group.

[Group Anagrams](/practice/group-anagrams): key by the sorted string (`"eat"`, `"tea"`, `"ate"` → `"aet"`), or by the tuple of 26 letter counts. Three candidate keys and their real costs for `n` words of length `k`:

| Canonical key | Build cost per word | Key size | Hash/compare cost | Weakness |
|---|---|---|---|---|
| Sorted string `"aet"` | O(k log k), Timsort on a `k`-element list plus a join | `k` bytes | O(k) | The sort dominates for `k > ~20` |
| 26-count tuple `(1,0,0,0,1,…)` | O(k + 26) | 26 boxed ints, ~260 bytes on CPython | O(26) | Constant factor loses for short words; needs a fixed alphabet |
| Product of primes per letter | O(k) multiplies | one big int | O(1) for short words | Overflows fixed-width ints at ~10 letters; Python big ints make it O(k) anyway |

For dictionary-length words the sorted string is fastest on CPython because the sort runs in C and the tuple costs 26 allocations; for long strings the count wins. Saying both, with the crossover, is the senior answer.

```python
groups = {}
for w in words:
    key = "".join(sorted(w))
    groups.setdefault(key, []).append(w)
return list(groups.values())        # groups in first-seen order (Python 3.7+ dicts are ordered)
```

Trace `["eat", "tea", "tan", "ate", "nat", "bat"]`:

| Word | Key | `groups` after |
|---|---|---|
| eat | aet | `{aet: [eat]}` |
| tea | aet | `{aet: [eat, tea]}` |
| tan | ant | `{aet: [eat, tea], ant: [tan]}` |
| ate | aet | `{aet: [eat, tea, ate], ant: [tan]}` |
| nat | ant | `{aet: […], ant: [tan, nat]}` |
| bat | abt | `{aet: […], ant: […], abt: [bat]}` |

Other canonical keys: for shifted strings (`"abc"` and `"bcd"` are the same shift class) use the tuple of differences between adjacent characters mod 26; for points on the same line through the origin use the reduced fraction `(dy / g, dx / g)` with a sign convention; for equivalent fractions the same; for words with the same letter *set* use a `frozenset`. The interviewer is watching whether you can *define* equality and then encode it as a key.

**Key type pitfalls.** Python lists are unhashable; use a tuple. JavaScript objects and arrays as `Map` keys compare by reference, so serialise (`counts.join(",")`). Floating-point keys (`0.1 + 0.2 != 0.3`) need rounding or rational representation. Python's `dict` and JavaScript's `Map` preserve insertion order, which makes "groups in first-seen order" free; Go's map does not, so tests that depend on order must sort.

## Shape 4: the seen set

**Key:** the item. **Value:** none (a set). **Query:** membership.

[Contains Duplicate](/practice/contains-duplicate) is a set with an early return. The interesting member of this family is [Longest Consecutive Sequence](/practice/longest-consecutive-sequence): the longest run of integers `x, x+1, …, x+L−1` present in an unsorted array, in O(n).

Put everything in a set. For each `x`, if `x − 1` is *not* in the set, `x` starts a run; count upward while `x + 1, x + 2, …` are present. The trick is the `x − 1` check: without it you would count from the middle of runs and the algorithm would be O(n²) on a sorted input. With it, each element is visited by the inner loop exactly once (as part of the single run it belongs to), so the total is O(n).

Trace `[100, 4, 200, 1, 3, 2]`; the set is `{1, 2, 3, 4, 100, 200}` and the loop runs over the set:

| `x` | `x − 1` in set? | Inner walk | Run length | Best |
|---|---|---|---|---|
| 1 | no | 2, 3, 4 present; 5 absent | 4 | 4 |
| 2 | yes | skipped | | 4 |
| 3 | yes | skipped | | 4 |
| 4 | yes | skipped | | 4 |
| 100 | no | 101 absent | 1 | 4 |
| 200 | no | 201 absent | 1 | 4 |

Eleven set lookups for six elements: the inner loop touched 2, 3, 4 and 5 once each. Sorting would give O(n log n); the set makes it O(n) at the cost of O(n) memory and a constant of two to three hash lookups per element, which is worth saying out loud: for `n` under a few thousand, `sorted` in C beats the set loop in Python.

## Shape 5: prefix sums in a map

**Key:** a prefix sum (or prefix XOR, or prefix sum mod m). **Value:** its count or first index.

[Subarray Sum Equals K](/practice/subarray-sum-equals-k): a subarray `(i, j]` has sum `k` when `P[j] − P[i] = k`, so for each `j` you count earlier prefixes equal to `P[j] − k`. Seed the map with `{0: 1}` for the empty prefix.

Trace `nums = [1, 2, 1, −1, 2]`, `k = 3`:

| `j` | `x` | `P` | need `P − k` | count of need in map | total | map after |
|---|---|---|---|---|---|---|
| seed | | 0 | | | 0 | `{0: 1}` |
| 0 | 1 | 1 | −2 | 0 | 0 | `{0: 1, 1: 1}` |
| 1 | 2 | 3 | 0 | 1 | 1 | `{0: 1, 1: 1, 3: 1}` |
| 2 | 1 | 4 | 1 | 1 | 2 | `{…, 4: 1}` |
| 3 | −1 | 3 | 0 | 1 | 3 | `{…, 3: 2}` |
| 4 | 2 | 5 | 2 | 0 | 3 | `{…, 5: 1}` |

Three subarrays sum to 3: `[1, 2]` (prefix 0 → 3), `[2, 1]` (prefix 1 → 4) and `[1, 2, 1, −1]` (prefix 0 → 3 again, at `j = 3`). The "count, not presence" part matters exactly here: prefix 3 occurs twice, and each occurrence pairs with the seed. [Prefix sums and difference arrays](/learn/data-structures/arrays-strings/prefix-sums-and-difference-arrays) derives the identity. The variants change the key: `P mod m` for "sum divisible by m", the prefix XOR for "subarray XOR equals k", and "first index of this prefix" when the question is the *longest* subarray rather than the count.

## Shape 6: index maps for windows

**Key:** an item. **Value:** the last index where it appeared.

[Longest Substring Without Repeating Characters](/practice/longest-substring-no-repeat): slide a window `[l, r]`; when `s[r]` was last seen at an index `≥ l`, jump `l` to one past it. The map replaces a "remove from the window one character at a time" loop with a single jump.

```python
last = {}
best = l = 0
for r, ch in enumerate(s):
    if ch in last and last[ch] >= l:
        l = last[ch] + 1
    last[ch] = r
    best = max(best, r - l + 1)
```

Trace `"abcabcbb"`:

| `r` | `ch` | `last[ch]` | `≥ l`? | `l` after | window | best |
|---|---|---|---|---|---|---|
| 0 | a | – | | 0 | `a` | 1 |
| 1 | b | – | | 0 | `ab` | 2 |
| 2 | c | – | | 0 | `abc` | 3 |
| 3 | a | 0 | yes | 1 | `bca` | 3 |
| 4 | b | 1 | yes | 2 | `cab` | 3 |
| 5 | c | 2 | yes | 3 | `abc` | 3 |
| 6 | b | 4 | yes | 5 | `cb` | 3 |
| 7 | b | 6 | yes | 7 | `b` | 3 |

The `≥ l` test is the line people drop: at `r = 6` the stale entry `a → 3` is still in the map, and without the test a later `a` would pull `l` *backwards*. The general form, a map of counts inside the window with a shrink condition, is covered in [Sliding window mastery](/learn/algorithms/technique-mastery/sliding-window-mastery).

## Shape 7: map plus another structure

Design questions ask for a container with several O(1) operations that no single structure provides. The answer is a hash map for lookup plus a second structure for the operation the map cannot do.

**Insert, delete and get-random in O(1)** ([Insert Delete GetRandom](/practice/insert-delete-getrandom)): a list holds the values (random index in O(1)); a map holds `value → index in the list`. Delete swaps the victim with the *last* element, updates the moved element's index in the map, and pops:

| Op | List | Map | Note |
|---|---|---|---|
| insert a, b, c | `[a, b, c]` | `{a:0, b:1, c:2}` | |
| delete a | `[c, b, a]` | `{a:0, b:1, c:0}` | swap a with last; **c's index updated first** |
| pop | `[c, b]` | `{b:1, c:0}` | remove a from map |
| getRandom | index 0 or 1 | | uniform over live values |

The swap-with-last trick is the whole problem: deleting from the middle of a list is O(n), but the list has no required order, so you move the hole to the end. Updating the moved element's index *before* popping is the step that fails when the victim is already last (the swap is a no-op and the map entry for the victim must still be removed).

**LRU cache**: map from key to a node in a doubly linked list ordered by recency; the map finds the node, the list moves it to the front and evicts from the back. [LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache) builds it in full.

**Time-based key-value store**: map from key to a sorted list of `(timestamp, value)`, with binary search for "latest value at or before t". [Ordered maps vs hash maps](/learn/data-structures/hashing/ordered-maps-vs-hash-maps) is the lesson.

**Two-way maps** (bijections: user id ↔ username) are two hash maps kept in sync; **multi-maps** are `dict[key, list]` and `setdefault`/`defaultdict` are the idioms; **counting with a cap** ("at most k of each") is a counter checked before insert.

## Under the hood: Counter, defaultdict, Map and friends

- **`collections.Counter`** is a `dict` subclass whose `__missing__` returns 0 without inserting. `Counter(iterable)` calls a C helper (`_count_elements`) that does `d[x] = d.get(x, 0) + 1` in a tight loop, measured at 1.4× the speed of the same loop in Python on CPython 3.14 (15 ms against 21 ms for a million single-character items; older interpreters show a wider gap); `most_common(k)` is `heapq.nlargest` (O(n log k)) and `most_common()` with no argument is a full sort. Arithmetic (`c1 - c2`) drops non-positive counts, which is why "subtract and check for negatives" must use `subtract()` or a manual loop.
- **`collections.defaultdict`** implements `__missing__` by calling the factory *and inserting the result*. `if d[k]:` on a defaultdict is a write. In a long-running service that reads more keys than it ever populates, the map grows without bound; `in` and `.get` never call `__missing__`.
- **`dict.setdefault(k, [])`** builds the empty list on every call and discards it when the key exists; `defaultdict(list)` builds it only on a miss. Grouping a million items into a thousand keys measured 41 ms with `setdefault` against 32 ms with `defaultdict` on CPython 3.14: 27% for a million discarded empty lists.
- **A `dict` entry** costs 24 bytes (16 for string keys since 3.11) in the entries array plus the index slot, plus the key and value objects: ~80–100 bytes per entry for small string keys, measured at 30.8 MB of dict arrays for a million `str → int` entries on CPython 3.14 before the objects themselves. Ten million entries is roughly a gigabyte. A Rust `HashMap<u64, u64>` is 17 bytes per slot, 20–39 bytes per live entry depending on how recently it doubled; ten million entries is 200–400 MB. When the interviewer asks "what if it doesn't fit in memory", the answers are: an array if keys are dense integers, sorting plus a scan (O(n log n), O(1) extra), or partition by hash across machines, which is [Hashing at scale](/learn/data-structures/hashing/hashing-at-scale).
## Under the hood: Map, object and the Java idioms

- **JavaScript `Map` vs object.** A plain object coerces every key to a string (`obj[1]` and `obj["1"]` are the same key; `obj[[1,2]]` is `obj["1,2"]`), inherits `toString`, `constructor` and `__proto__` from its prototype (so `"constructor" in counts` is true on an empty object, and a user-supplied key named `__proto__` can rewrite the prototype: prototype pollution), and drops into V8's dictionary mode after `delete`. `Map` compares keys by SameValueZero (so `NaN` finds itself and `0` equals `-0`), has no inherited keys, keeps insertion order, and reports `size` in O(1). For counting user-controlled strings, `Map` or `Object.create(null)` is the only safe choice.
- **Java.** `map.merge(k, 1, Integer::sum)` and `computeIfAbsent(k, x -> new ArrayList<>())` are the Counter and defaultdict idioms; both do one hash lookup instead of the `get` + `put` pair, and `computeIfAbsent` throws if the mapping function modifies the map.
- **Hashing a string key costs O(k)** in its length, once per distinct string object in CPython and Java (the hash is cached) and once per call for a freshly built key such as `"".join(sorted(w))`. Grouping `n` words of length `k` is O(nk), not O(n), before the sort.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Memory of a service grows without bound although the set of real keys is small | `defaultdict` reads (`if d[k]`) or `setdefault` in a query path inserting every probed key | Use `in`/`.get` for reads; audit every `d[k]` on a defaultdict |
| "Group by" endpoint is O(n²) under load; profile shows `list.__contains__` | A seen "set" implemented as a list (`if x in seen_list`) | Use a `set`; the fix is one character and the difference is 1,000× at n = 10⁵ |
| Anagram grouping returns wrong groups for user input | Key built from `sorted(w)` without normalising case or Unicode (`"É"` vs `"é"`, NFC vs NFD) | Define the equivalence first (`casefold()`, `unicodedata.normalize`), then build the key |
| JavaScript counter shows `constructor: 1` or crashes on `__proto__` | Plain object used as a map for user-controlled keys | `Map` or `Object.create(null)` |
| `TypeError: unhashable type: 'list'` in production after a refactor changed a tuple to a list | Key type contract broken silently by a data-shape change | Convert to `tuple` at the boundary; type-annotate the key |
| Two-sum style dedupe returns an element paired with itself | Insert before check | Check, then insert; add the `[4, 1], 8` test |
| Sliding-window index map "goes backwards" and returns a window that contains a repeat | Missing `last[ch] >= l` guard against stale entries | Keep the guard or delete entries as the window's left edge passes them |

## Interviewer follow-ups

**"Your solution uses O(n) extra memory. Can you do better?"** Model answer: name what the map buys (random access to "have I seen this?") and what could replace it: sorting (O(n log n) time, O(1) or O(log n) extra) if order is allowed to change, two pointers if the input is sorted, a fixed-size array if the key space is small and dense, or bit tricks (XOR) for the single-number family. Common wrong answer: "no, hash maps are the optimal way to do lookups".

**"The keys are floating-point coordinates. What is your map keyed by?"** Model answer: never raw floats; either integers after scaling to a known precision (`round(x * 1e6)`), or an exact rational `(num, den)` reduced by their gcd with a sign convention, so that equal points compare equal. Common wrong answer: `(x, y)` as a tuple of floats, which fails on `0.1 + 0.2`.

**"How would you find the top-k frequent elements in O(n)?"** Model answer: count with a map, then bucket the keys by count into an array indexed by count (counts are at most `n`), and read buckets from the top until `k` items are collected; a heap gives O(n log k), sorting O(n log n). Common wrong answer: "sort the counter", offered as if it were O(n).

**"Why does longest-consecutive-sequence iterate the set rather than the array?"** Model answer: duplicates in the array would re-run the inner walk for the same run start, which breaks the "each element visited once" argument that gives O(n); the set removes duplicates and the `x − 1` guard removes non-starts. Common wrong answer: "it doesn't matter, lookups are O(1) either way".

**"Where does this pattern show up at scale?"** Model answer: a frequency count over a stream that does not fit in memory becomes a Count-Min Sketch or a partition-by-hash then count-per-partition job (word count in MapReduce is Shape 1 across machines); a seen set at scale becomes a Bloom filter (web crawlers, RocksDB); grouping by canonical key is the shuffle stage of every distributed join. Common wrong answer: "use a bigger machine".

## What mid-level engineers get wrong

- **Saying "hash map" before saying what the key is**, and then discovering mid-solution that the key does not encode the equivalence the problem needs.
- **Inserting before checking** in complement lookups, so an element pairs with itself.
- **Dropping the `x − 1` guard** and shipping an O(n²) "O(n)" solution that passes small tests.
- **Using `defaultdict` in a read path** and leaking memory one probed key at a time.
- **Keying by a list, a float or a JavaScript object**, all of which either fail to hash or hash by identity.
- **Quoting O(1) per operation and stopping**: the interviewer wanted O(k) for string keys and the 80–100-byte-per-entry constant.
- **Reaching for a heap for top-k when bucket sort by count is O(n)**, or for a `Counter` when a 26-slot array is one cache line.

```viz
{"type": "hash-table", "algorithm": "chaining", "buckets": 6, "operations": [["set", "aet", 1], ["set", "ant", 1], ["set", "aet", 2], ["set", "abt", 1], ["set", "aet", 3], ["set", "ant", 2], ["get", "aet"]], "title": "Grouping by canonical key: repeated keys update one bucket entry"}
```

## Exercises

```exercise
id: group-anagrams
title: Group anagrams by canonical key
prompt: |
  Group the words that are anagrams of each other. Return a list of groups;
  groups appear in the order their first member appears in `words`, and
  within a group the words keep their input order. Key each word by its
  sorted characters (or its letter-count signature).
languages: [python, javascript]
entry: group_anagrams
starter:
  python: |
    def group_anagrams(words):
        # your code here
        return []
  javascript: |
    function group_anagrams(words) {
      // your code here
      return [];
    }
tests:
  - args: [["eat", "tea", "tan", "ate", "nat", "bat"]]
    expected: [["eat", "tea", "ate"], ["tan", "nat"], ["bat"]]
  - args: [[]]
    expected: []
    label: no words
  - args: [[""]]
    expected: [[""]]
    label: empty string is its own group
  - args: [["a"]]
    expected: [["a"]]
  - args: [["ab", "ba", "abc", "cab", "x"]]
    expected: [["ab", "ba"], ["abc", "cab"], ["x"]]
    hidden: true
  - args: [["aa", "a", "aa"]]
    expected: [["aa", "aa"], ["a"]]
    hidden: true
    label: duplicates stay in their group
hints:
  - "`key = ''.join(sorted(w))` in Python; `w.split('').sort().join('')` in JavaScript."
  - "Use a dict / Map so insertion order gives you the required group order; return its values."
```

```exercise
id: longest-consecutive
title: Longest consecutive sequence
prompt: |
  Return the length of the longest run of consecutive integers
  (`x, x+1, ..., x+L-1`) that all appear in `nums`, in O(n) time. Put the
  values in a set and only start counting from values whose predecessor
  is absent. Return 0 for an empty array.
languages: [python, javascript]
entry: longest_consecutive
starter:
  python: |
    def longest_consecutive(nums):
        # your code here
        return 0
  javascript: |
    function longest_consecutive(nums) {
      // your code here
      return 0;
    }
tests:
  - args: [[100, 4, 200, 1, 3, 2]]
    expected: 4
  - args: [[]]
    expected: 0
    label: empty
  - args: [[1, 2, 0, 1]]
    expected: 3
    label: duplicates do not extend a run
  - args: [[5]]
    expected: 1
  - args: [[9, 1, 4, 7, 3, -1, 0, 5, 8, -1, 6]]
    expected: 7
    hidden: true
  - args: [[-3, -2, -1, 0, 1]]
    expected: 5
    hidden: true
    label: negatives
  - args: [[2, 2, 2]]
    expected: 1
    hidden: true
hints:
  - "Iterate over the set, not the array, so duplicates are visited once."
  - "If `x - 1` is in the set, skip `x`: it is not the start of its run."
```

## Senior signals

- You say what the key is before you say "hash map", and you can define the equality relation the key encodes.
- You reach for a fixed-size count array when the key space is small and dense, and you can say it is four cache lines against an 832-byte dict plus boxed ints.
- You insert after checking in complement lookups and can produce the `[4, 1], 8` counter-example for the other order.
- You explain the `x − 1` check in longest consecutive sequence with the "each element walked once" argument, and you iterate the set, not the array.
- You know the swap-with-last trick, including the update-before-pop order and the victim-is-last case.
- You know that `defaultdict` inserts on read, that `Counter` arithmetic drops non-positives, and that a JavaScript object is not a safe map for user-controlled keys.
- You quote memory per entry (80–100 bytes in CPython, 20–40 in Rust) and know the alternatives when the map does not fit.

## Check yourself

```quiz
- q: >-
    You key anagram groups by the sorted string. For n words of length k, the total time is:
  options: ["O(n log n): sorting dominates the grouping", "O(nk log k): a k-character sort per word", "O(n): one hash-map operation per word", "O(nk): the sort and the hash are linear in k"]
  answer: 1
  explanation: >-
    Each key costs a comparison sort of k characters, and hashing the key is O(k), so the sort dominates. A 26-count signature makes it O(nk) but with a larger constant for short words. Neither is O(n) in the word count alone, because hashing a string key costs its length.
- q: >-
    In longest consecutive sequence, what happens if you drop the "only start from x when x − 1 is absent" check?
  options: ["Still correct, but O(n log n) from repeated set lookups", "Still correct and O(n), because set lookups are O(1)", "Wrong answer, because runs are counted from their middle", "Still correct, but O(n²) on long runs from re-walking them"]
  answer: 3
  explanation: >-
    Counting upward from every element re-walks each run from every one of its members; the longest count still starts at the run's first element, so the answer is right but the work is quadratic on sorted-like input. The check guarantees each run is walked once, from its start, giving the O(n) bound.
- q: >-
    Deleting an arbitrary value in O(1) from an unordered list backed by a value→index map is done by:
  options: ["Marking the slot as deleted and skipping it in later calls", "Calling list.pop(index), then shifting the later indices", "Moving it to the front, fixing its index, then calling pop(0)", "Swapping with the last element, fixing its index, popping"]
  answer: 3
  explanation: >-
    Removing from the middle (or the front) of an array is O(n), but since order does not matter the hole can be moved to the end with one swap. The map must be updated for the element that moved, which is the step people forget. Tombstones leave holes that make the list grow and random sampling retry.
- q: >-
    Which Python idiom silently inserts a key into a map during what looks like a read?
  options: ["`d.keys()` on a `defaultdict`", "`d.get(k)` on a `defaultdict`", "`d[k]` on a `defaultdict`", "`k in d` on a `defaultdict`"]
  answer: 2
  explanation: >-
    defaultdict's __missing__ creates the default value on any indexed access, including reads inside a condition. In long-running services this turns queries into unbounded growth. `in` and `.get` never call __missing__, so use them for pure lookups.
- q: >-
    A Node service counts occurrences of user-supplied tags with `counts[tag] = (counts[tag] || 0) + 1` on a plain object. A user submits the tag `constructor`. What happens?
  options: ["The service crashes, because `constructor` is a reserved word", "Nothing unusual, because assignment creates an own property", "The count starts from a function, because the key is inherited from the prototype", "The tag is rejected, because object keys must be valid identifiers"]
  answer: 2
  explanation: >-
    An empty object inherits `constructor` (and `toString`, `__proto__`, …) from `Object.prototype`, so the read returns a function and `function + 1` produces a string, corrupting the count. `Map` or `Object.create(null)` has no inherited keys. It is not reserved and the assignment itself would succeed, which is why the bug is silent.
- q: >-
    In the prefix-sum map for "count subarrays summing to k", why must the map store counts rather than presence?
  options: ["Because negative numbers make prefix sums decrease, breaking presence", "Because the same prefix sum can occur at several indices, each giving a subarray", "Because counts are needed to seed the map with the empty prefix", "Because presence would make the map a set, which cannot hold integers"]
  answer: 1
  explanation: >-
    Every earlier index with prefix P − k ends a distinct subarray at the current index, so the answer adds the number of such indices, not one. The seed {0: 1} is a count too, and negatives are exactly what make repeated prefix values possible, but the reason is multiplicity. A set works only for the "does any subarray sum to k" variant.
```
