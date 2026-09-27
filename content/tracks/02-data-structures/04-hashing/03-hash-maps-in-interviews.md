---
slug: hash-maps-in-interviews
title: Hash maps in interviews
description: The seven shapes behind most hash-map problems (frequency counting, complement lookup, canonical-key grouping, seen sets, prefix-sum maps, index maps and map-plus-structure designs), each with a trace and the key-design decision that is the real answer.
minutes: 45
difficulty: medium
tags: [hashing, hash-map, frequency-count, grouping, seen-set, design]
problems: [two-sum, contains-duplicate, valid-anagram, group-anagrams, top-k-frequent, longest-consecutive-sequence, insert-delete-getrandom, subarray-sum-equals-k, longest-substring-no-repeat]
---
Roughly a third of coding-interview problems are solved by a hash map, and almost none of them are *about* hash maps. The map is the tool; the problem is deciding what the key is. "Group these words by anagram class" is trivial once you say "key by the sorted letters"; "find the longest run of consecutive integers" is trivial once you say "put everything in a set and only start counting from numbers whose predecessor is absent". The design of the key *is* the algorithm.

This lesson catalogues the shapes. Each has a one-line key decision, a short trace, and the follow-up a senior interviewer will ask. [Hash tables](/learn/data-structures/hashing/hash-tables) covers why lookups are O(1) and when they are not; here we assume that and spend the time on how to use them.

## Shape 1: frequency counting

**Key:** the item. **Value:** how many times it has appeared.

```python
from collections import Counter
counts = Counter(words)                  # dict subclass; missing keys read as 0
```

Valid Anagram is two counters compared, or one counter incremented by the first string and decremented by the second, checking that nothing goes negative. Top-K Frequent is a counter followed by a selection step (a heap of size k, or bucket sort by count, which is O(n)). Majority element, first unique character, and "can these tiles form this word" are all counters.

The senior detail is the **perfect-hash special case**: when keys are small dense integers (ASCII characters, dice values, HTTP status codes), a plain array indexed by the key beats a hash map. A 26-slot array for lowercase letters is one cache line, has no hashing cost, and cannot collide. Say "I'll use a 26-element count array since the alphabet is fixed; a hash map if the input is Unicode".

Trace Valid Anagram on `"listen"`, `"silent"` with a 26-array: increment for `l, i, s, t, e, n`, decrement for `s, i, l, e, n, t`; every slot returns to zero. O(n) time, O(1) space (the array size does not depend on `n`).

## Shape 2: complement lookup

**Key:** a value you have seen. **Value:** its index (or a count, or just presence). **Query:** "have I seen `target − x`?"

This is [Two Sum](/practice/two-sum), and the important line is *insert after checking*, so an element cannot pair with itself:

```python
seen = {}
for i, x in enumerate(nums):
    if target - x in seen:
        return [seen[target - x], i]
    seen[x] = i
```

Variants: pairs with a given difference (`x − k` or `x + k` in the set), "does any pair multiply to `t`" (`t / x` with the divisibility check), and the k-sum family, where a hash map handles the last two elements after fixing the others. The follow-up is always "now the array is sorted": then two pointers give O(1) space and the map is the wrong tool.

## Shape 3: grouping by a canonical key

**Key:** a normalised form of the item such that two items belong together exactly when their normalised forms are equal. **Value:** the group.

[Group Anagrams](/practice/group-anagrams): key by the sorted string (`"eat"`, `"tea"`, `"ate"` → `"aet"`), cost O(k log k) per word for words of length `k`. Or key by the tuple of 26 letter counts, cost O(k) but a 26-element key to hash and compare. For short words the sort is faster in practice (the constant factor of building a 26-tuple dominates); for long words the count wins. Saying both, with the trade-off, is the senior answer.

```python
groups = {}
for w in words:
    key = "".join(sorted(w))
    groups.setdefault(key, []).append(w)
return list(groups.values())        # groups in first-seen order (Python 3.7+ dicts are ordered)
```

Trace `["eat", "tea", "tan", "ate", "nat", "bat"]`: keys `aet, aet, ant, aet, ant, abt` → groups `[eat, tea, ate]`, `[tan, nat]`, `[bat]`.

Other canonical keys: for shifted strings (`"abc"` and `"bcd"` are the same shift class) use the tuple of differences between adjacent characters mod 26; for points on the same line through the origin use the reduced fraction `(dy / g, dx / g)` with a sign convention; for equivalent fractions the same; for words with the same letter *set* use a `frozenset`. The interviewer is watching whether you can *define* equality and then encode it as a key.

**Key type pitfalls.** Python lists are unhashable; use a tuple. JavaScript objects and arrays as `Map` keys compare by reference, so serialise (`counts.join(",")`). Floating-point keys (`0.1 + 0.2 != 0.3`) need rounding or rational representation. Python's `dict` and JavaScript's `Map` preserve insertion order, which makes "groups in first-seen order" free; Go's map does not, so tests that depend on order must sort.

## Shape 4: the seen set

**Key:** the item. **Value:** none (a set). **Query:** membership.

[Contains Duplicate](/practice/contains-duplicate) is a set with an early return. The interesting member of this family is [Longest Consecutive Sequence](/practice/longest-consecutive-sequence): the longest run of integers `x, x+1, …, x+L−1` present in an unsorted array, in O(n).

Put everything in a set. For each `x`, if `x − 1` is *not* in the set, `x` starts a run; count upward while `x + 1, x + 2, …` are present. The trick is the `x − 1` check: without it you would count from the middle of runs and the algorithm would be O(n²) on a sorted input. With it, each element is visited by the inner loop exactly once (as part of the single run it belongs to), so the total is O(n).

Trace `[100, 4, 200, 1, 3, 2]`: set `{1, 2, 3, 4, 100, 200}`. `100`: 99 absent, count 100 → 1. `4`: 3 present, skip. `200`: run of 1. `1`: 0 absent, count 1, 2, 3, 4 → 4. `3`, `2`: predecessors present, skip. Answer 4. Sorting would give O(n log n); the set makes it O(n) at the cost of O(n) memory and a much larger constant, which is worth saying out loud.

## Shape 5: prefix sums in a map

**Key:** a prefix sum (or prefix XOR, or prefix sum mod m). **Value:** its count or first index.

[Subarray Sum Equals K](/practice/subarray-sum-equals-k) and its relatives: a subarray `(i, j]` has sum `k` when `P[j] − P[i] = k`, so for each `j` you count earlier prefixes equal to `P[j] − k`. Seed the map with `{0: 1}` for the empty prefix. [Prefix sums and difference arrays](/learn/data-structures/arrays-strings/prefix-sums-and-difference-arrays) has the trace. The variants change the key: `P mod m` for "sum divisible by m", the prefix XOR for "subarray XOR equals k", and "first index of this prefix" when the question is the *longest* subarray rather than the count.

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

Trace `"abcabcbb"`: `a`0 `b`1 `c`2 → best 3; `a` at 3, last 0 ≥ 0 → `l = 1`; `b` at 4, last 1 ≥ 1 → `l = 2`; `c` at 5 → `l = 3`, window `abc` again; `b` at 6, last 4 ≥ 3 → `l = 5`; `b` at 7 → `l = 7`. Best 3. The general form, a map of counts inside the window with a shrink condition, is covered in [Sliding window mastery](/learn/algorithms/technique-mastery/sliding-window-mastery).

## Shape 7: map plus another structure

Design questions ask for a container with several O(1) operations that no single structure provides. The answer is a hash map for lookup plus a second structure for the operation the map cannot do.

**Insert, delete and get-random in O(1)** ([Insert Delete GetRandom](/practice/insert-delete-getrandom)): a list holds the values (random index in O(1)); a map holds `value → index in the list`. Delete swaps the victim with the *last* element, updates the moved element's index in the map, and pops. Trace: list `[a, b, c]`, map `{a:0, b:1, c:2}`; delete `a`: swap with `c` → list `[c, b, a]`, map `{c:0, b:1}`, pop → `[c, b]`. The swap-with-last trick is the whole problem: deleting from the middle of a list is O(n), but the list has no required order, so you move the hole to the end.

**LRU cache**: map from key to a node in a doubly linked list ordered by recency; the map finds the node, the list moves it to the front and evicts from the back. [LRU cache](/learn/advanced-data-structures/caches-and-eviction/lru-cache) builds it in full.

**Time-based key-value store**: map from key to a sorted list of `(timestamp, value)`, with binary search for "latest value at or before t". [Ordered maps vs hash maps](/learn/data-structures/hashing/ordered-maps-vs-hash-maps) is the lesson.

**Two-way maps** (bijections: user id ↔ username) are two hash maps kept in sync; **multi-maps** are `dict[key, list]` and `setdefault`/`defaultdict` are the idioms; **counting with a cap** ("at most k of each") is a counter checked before insert.

## Saying the costs honestly

- Time is *expected* O(1) per operation, O(n) worst case under adversarial or badly hashed keys. Interviewers rarely press on this, but if they ask "what if the keys are chosen by an attacker", the answer is a keyed hash or a balanced tree, from [Hash functions](/learn/data-structures/hashing/hash-functions).
- Hashing a string key costs O(k) in its length. Grouping `n` words of length `k` is O(nk), not O(n), and sorting each key makes it O(nk log k).
- Memory is O(n) entries, and the constant is large: a Python dict entry is roughly 100 bytes including the boxed key and value; a Rust `HashMap<u64, u64>` entry is about 17 bytes. Ten million keys is a gigabyte in Python and 200 MB in Rust. When the interviewer asks "what if it doesn't fit in memory", the answers are: an array if keys are dense integers, sorting plus a scan (O(n log n), O(1) extra), or an external/distributed approach (partition by hash, which is [Hashing at scale](/learn/data-structures/hashing/hashing-at-scale)).
- `defaultdict` creates the key on read, so `if d[k]` inserts `k`; use `in` or `.get` for pure queries. This has caused real memory leaks in long-running services.

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
- You reach for a fixed-size count array when the key space is small and dense, and you say why.
- You insert after checking in complement lookups and can explain the self-pairing bug.
- You explain the `x − 1` check in longest consecutive sequence and why it makes the algorithm O(n).
- You know the swap-with-last trick and the map-plus-structure pattern for O(1) design problems.
- You quote memory per entry as an order of magnitude and know the alternatives when the map does not fit.

## Check yourself

```quiz
- q: >-
    You key anagram groups by the sorted string. For n words of length k, the total time is:
  options: ["O(n): one hash-map operation per word", "O(n log n): sorting dominates the grouping", "O(nk log k): a k-character sort per word", "O(nk): the sort and the hash are linear in k"]
  answer: 2
  explanation: >-
    Each key costs a comparison sort of k characters, and hashing the key is O(k), so the sort dominates. A 26-count signature makes it O(nk) but with a larger constant for short words. Neither is O(n) in the word count alone, because hashing a string key costs its length.
- q: >-
    In longest consecutive sequence, what happens if you drop the "only start from x when x − 1 is absent" check?
  options: ["Still correct, but O(n²) on long runs from re-walking them", "Wrong answer, because runs are counted from their middle", "Still correct, but O(n log n) from repeated set lookups", "Still correct and O(n), because set lookups are O(1)"]
  answer: 0
  explanation: >-
    Counting upward from every element re-walks each run from every one of its members; the longest count still starts at the run's first element, so the answer is right but the work is quadratic on sorted-like input. The check guarantees each run is walked once, from its start, giving the O(n) bound.
- q: >-
    Deleting an arbitrary value in O(1) from an unordered list backed by a value→index map is done by:
  options: ["Swapping with the last element, fixing its index, popping", "Marking the slot as deleted and skipping it in later calls", "Calling list.pop(index), then shifting the later indices", "Moving it to the front, fixing its index, then calling pop(0)"]
  answer: 0
  explanation: >-
    Removing from the middle (or the front) of an array is O(n), but since order does not matter the hole can be moved to the end with one swap. The map must be updated for the element that moved, which is the step people forget. Tombstones leave holes that make the list grow and random sampling retry.
- q: >-
    Which Python idiom silently inserts a key into a map during what looks like a read?
  options: ["`d.get(k)` on a `defaultdict`", "`k in d` on a `defaultdict`", "`d[k]` on a `defaultdict`", "`d.keys()` on a `defaultdict`"]
  answer: 2
  explanation: >-
    defaultdict's __missing__ creates the default value on any indexed access, including reads inside a condition. In long-running services this turns queries into unbounded growth. `in` and `.get` never call __missing__, so use them for pure lookups.
- q: >-
    An interviewer asks for a structure with O(1) insert, O(1) delete by key and O(1) "most recently used" eviction. The hash map alone fails because:
  options: ["Its lookups are only amortised, so an array caches hot keys", "It orders keys by hash, so a BST must re-sort by recency", "It cannot delete in O(1), so a heap must track removals", "It keeps no recency order, so a linked list must track it"]
  answer: 3
  explanation: >-
    The map provides lookup and O(1) delete; recency is an ordering, which a doubly linked list maintains with O(1) move-to-front and pop-from-back given the node pointer the map stores. This is the LRU design. A heap or BST would make each touch O(log n).
```
