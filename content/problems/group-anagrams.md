---
slug: group-anagrams
title: Group Anagrams
difficulty: medium
patterns: [hash-map]
lists: [core-75, ascend-150]
companies: [amazon, meta, google, uber]
order: 4
lesson: interview-patterns/sequence-patterns/hash-map-patterns
hints:
  - Two strings belong together when they are anagrams. What single value could you compute from a string so that anagrams, and only anagrams, produce the same value?
  - The sorted string is such a key. So is the tuple of 26 letter counts. Map key → list of strings.
  - Think about the cost of the key. Sorting is O(L log L) per string; counting is O(L). For short strings it barely matters; say why.
signatures:
  python:
    name: group_anagrams
    starter: |
      def group_anagrams(strs: list[str]) -> list[list[str]]:
          pass
  javascript:
    name: group_anagrams
    starter: |
      function group_anagrams(strs) {
      }
tests:
  - args: [["eat", "tea", "tan", "ate", "nat", "bat"]]
    expected: [["ate", "eat", "tea"], ["nat", "tan"], ["bat"]]
    any_order: true
  - args: [["abc", "bca", "cab", "xyz"]]
    expected: [["abc", "bca", "cab"], ["xyz"]]
    any_order: true
  - args: [[""]]
    expected: [[""]]
    any_order: true
    label: single empty string
  - args: [["a"]]
    expected: [["a"]]
    any_order: true
  - args: [[]]
    expected: []
    any_order: true
    label: no strings
  - args: [["aab", "abb", "bba", "baa"]]
    expected: [["aab", "baa"], ["abb", "bba"]]
    any_order: true
  - args: [["ab", "ba", "ab"]]
    expected: [["ab", "ab", "ba"]]
    any_order: true
    hidden: true
    label: identical strings stay in one group
  - args: [["dog", "god", "odg", "cat", "act", "tac", "bird"]]
    expected: [["dog", "god", "odg"], ["act", "cat", "tac"], ["bird"]]
    any_order: true
    hidden: true
time_limit_ms: 4000
---
You are given a list of strings `strs`. Group the strings that are anagrams of one another and return the groups as a list of lists.

Two strings are anagrams when they contain exactly the same characters with the same counts. Within each group, order the strings lexicographically. The order of the groups themselves does not matter.

### Examples

| Input | Output | Why |
|---|---|---|
| `["eat", "tea", "tan", "ate", "nat", "bat"]` | `[["ate", "eat", "tea"], ["nat", "tan"], ["bat"]]` | Three anagram classes |
| `["aab", "abb", "bba", "baa"]` | `[["aab", "baa"], ["abb", "bba"]]` | Same letters, but `a`/`b` counts split them |
| `[""]` | `[[""]]` | The empty string is an anagram of itself |

### Constraints

- `0 ≤ len(strs) ≤ 10⁴`
- `0 ≤ len(strs[i]) ≤ 100`
- `strs[i]` consists of lowercase English letters.

### Follow-up

The interviewer asks: "Strings are now up to 10⁶ characters long and there are only a few hundred of them. Does your choice of key change?" And then: "How would you do this over a corpus that does not fit on one machine?"

## Solution

### The naive approach

For each string, scan the groups built so far and test whether it is an anagram of the group's first member. With `g` groups and strings of length `L` that is `O(n · g · L)`, and `g` can be as large as `n`. Quadratic in the number of strings; too slow for 10⁴ strings.

### The insight

You do not need to compare strings with each other. You need a *canonical form*: a function `key(s)` such that `key(a) == key(b)` exactly when `a` and `b` are anagrams. Then grouping is a single pass with a hash map from key to list. This "canonicalise, then bucket" move is the whole pattern, and it reappears in deduplication, in normalising URLs, and in join keys.

Two canonical forms work:

- **The sorted string.** `"tea"` → `"aet"`. Cost `O(L log L)` per string.
- **The count signature.** A tuple of 26 letter counts, `(1, 0, 0, 0, 1, …, 1, …)`. Cost `O(L + 26)` per string.

### The optimal approach

```python
def group_anagrams(strs: list[str]) -> list[list[str]]:
    groups: dict[tuple[int, ...], list[str]] = {}
    for s in strs:
        counts = [0] * 26
        for ch in s:
            counts[ord(ch) - 97] += 1
        key = tuple(counts)
        groups.setdefault(key, []).append(s)
    return [sorted(g) for g in groups.values()]
```

Time `O(n · L)` to build the keys (plus the final per-group sort, which the problem asks for). Space `O(n · L)` to hold the output plus `O(n · 26)` for keys.

With the sorted-string key the loop body becomes `key = "".join(sorted(s))` and the complexity is `O(n · L log L)`. For `L ≤ 100` the difference is not measurable and the sorted key is simpler to read, so either is acceptable; what matters is that you can say which is asymptotically better and why you chose the one you wrote.

### Common mistakes

- Using a list as a dictionary key in Python (unhashable); convert to a tuple, or join the counts into a string.
- Building the count key with a 26-slot array on input that turns out to contain uppercase or non-letters. Confirm the alphabet before hard-coding it.
- Forgetting that the empty string is a valid input and must form its own group.
- Counting with a `Counter` and using it directly as a key; `Counter` is a dict and is not hashable. `frozenset(counter.items())` works but is slower than a tuple.

### How to discuss it

Say "I need a canonical key such that anagrams collide" before touching the keyboard; that sentence is the solution. Offer both keys with their costs, choose one, code it, and trace the first example. For the long-strings follow-up, the count signature wins clearly: `O(L)` versus `O(L log L)` matters when `L = 10⁶`, and the key stays 26 integers instead of a megabyte-long sorted string, which also matters for memory and hashing time. For the distributed follow-up: the key is a natural shuffle key. Map each string to `(key, string)`, shuffle by key, and every anagram class lands on one reducer. The key is small and fixed-size, which is exactly what you want to ship over the network.
