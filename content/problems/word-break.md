---
slug: word-break
title: Word Break
difficulty: medium
patterns: [dynamic-programming]
lists: [core-75, ascend-150]
companies: [amazon, google, meta, bloomberg]
order: 10
lesson: interview-patterns/combinatorial-patterns/dp-patterns
hints:
  - "Taking the first (or longest) dictionary word that matches can lead into a dead end. `\"abcd\"` with `[\"a\", \"abc\", \"b\", \"cd\"]` needs `a + b + cd`, not `abc + d`."
  - "Let `can[i]` mean the prefix `s[:i]` splits into dictionary words. Then `can[i]` is true if some `j < i` has `can[j]` true and `s[j:i]` in the dictionary."
  - "Put the words in a set, and only try `j` values within the longest word's length of `i`."
signatures:
  python:
    name: word_break
    starter: |
      def word_break(s: str, words: list[str]) -> bool:
          pass
  javascript:
    name: word_break
    starter: |
      function word_break(s, words) {
      }
tests:
  - args: ["sunflower", ["sun", "flower", "flow"]]
    expected: true
  - args: ["pineapplepie", ["pine", "apple", "pineapple", "pie"]]
    expected: true
  - args: ["carpetcar", ["car", "pet", "carp"]]
    expected: true
    label: words may be reused
  - args: ["abcd", ["a", "abc", "b", "cd"]]
    expected: true
    label: the longest first match is a dead end
  - args: ["gold", ["go", "old"]]
    expected: false
    label: overlapping words do not count
  - args: ["aaaaab", ["a", "aa", "aaa"]]
    expected: false
  - args: ["x", ["x"]]
    expected: true
  - args: ["dogsand", ["dog", "dogs", "sand", "and"]]
    expected: true
    hidden: true
  - args: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab", ["a", "aa", "aaa", "aaaa"]]
    expected: false
    hidden: true
    label: exponential for unmemoised recursion
  - args: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", ["aaa", "aaaaa"]]
    expected: true
    hidden: true
  - args: ["penpineapple", ["pen", "pine", "apple", "pineapple"]]
    expected: true
    hidden: true
time_limit_ms: 4000
---
Given a string `s` and a list of distinct dictionary `words`, return `true` if `s` can be split into a sequence of one or more dictionary words with nothing left over, and `false` otherwise. A dictionary word may be used any number of times.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "sunflower"`, `words = ["sun", "flower", "flow"]` | `true` | `sun + flower` |
| `s = "abcd"`, `words = ["a", "abc", "b", "cd"]` | `true` | `a + b + cd`; starting with `abc` leaves `d`, a dead end |
| `s = "gold"`, `words = ["go", "old"]` | `false` | `go` and `old` overlap on the `o`; pieces cannot share characters |

### Constraints

- `1 ≤ len(s) ≤ 300`
- `1 ≤ len(words) ≤ 1000`, `1 ≤ len(words[i]) ≤ 20`
- `s` and every word consist of lowercase English letters; words are distinct.

### Follow-up

The interviewer asks: "Return every way to split the string into words, as sentences." Then: "The dictionary has a million words and you will be asked about many strings. What would you precompute?"

## Solution

### The naive approach

Recurse: for every dictionary word that is a prefix of `s`, recurse on the rest. On `"aaaa…ab"` with `["a", "aa", "aaa", "aaaa"]` every split of the `a`s is explored before discovering that the `b` can never be matched, and the number of such splits grows exponentially (close to `2ⁿ` for this dictionary). The same suffix is re-examined every time a different split reaches it.

### The insight

Whether the rest of the string can be split does not depend on how you split the part before it. So the only thing that matters about a partial split is the position reached. There are `n + 1` positions. Mark each one reachable or not, left to right.

### The DP

- **State.** `can[i]` is true exactly when the prefix `s[:i]` can be split into dictionary words.
- **Transition.** `can[i] = any(can[j] and s[j:i] in words)` over `max(0, i - L) ≤ j < i`, where `L` is the longest word length. The last word of the split occupies `s[j:i]`.
- **Base case.** `can[0] = True`: the empty prefix is trivially split (into zero words).
- **Iteration order.** Increasing `i`.
- **Answer.** `can[n]`.

### Worked table for `s = "carpetcar"`, `words = ["car", "pet", "carp"]`

| `i` | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| `s[i-1]` | – | c | a | r | p | e | t | c | a | r |
| `can[i]` | T | F | F | **T** | **T** | F | **T** | F | F | **T** |
| last word | – | – | – | `car` from 0 | `carp` from 0 | – | `pet` from 3 | – | – | `car` from 6 |

Position 4 is reachable via `carp`, but nothing continues from it (`e`, `et`, `etc`… are not words): a dead end that the table records without any backtracking. Position 6 is reachable only via position 3. The answer `can[9]` is true: `car + pet + car`.

### Reference solution

```python
def word_break(s: str, words: list[str]) -> bool:
    vocab = set(words)
    longest = max(len(w) for w in words)
    n = len(s)
    can = [False] * (n + 1)
    can[0] = True
    for i in range(1, n + 1):
        for j in range(max(0, i - longest), i):
            if can[j] and s[j:i] in vocab:
                can[i] = True
                break
    return can[n]
```

Time `O(n · L · L)`: `n` end positions, up to `L` start positions each, and each slice-and-hash costs `O(L)`. With `n = 300` and `L = 20` that is about `10⁵` character operations. Without the `L` bound the inner loop is `O(n)` and the slices `O(n)`, giving `O(n³)`. Space `O(n)` for the table plus the set.

### Space

`can[i]` only reads the previous `L` entries, so a circular buffer of size `L + 1` would bring the table to `O(L)`. In practice nobody does this: the string itself is `O(n)`, so the table does not change the space class. Say it exists if asked; do not write it.

A different optimisation matters more: replace the set with a **trie**. From each reachable `j`, walk forward through the trie character by character and mark `can[j + len]` true at every node that ends a word. That checks all words starting at `j` in `O(L)` total instead of hashing `L` separate slices, giving `O(n · L)`.

```viz
{"type": "dp", "algorithm": "word-break", "s": "carpetcar", "words": ["car", "pet", "carp"], "title": "Word Break on carpetcar", "caption": "can[i] is true when some reachable j has s[j:i] in the dictionary."}
```

### Common mistakes

- Greedy: taking the longest (or shortest) matching word and never revisiting. `"abcd"` breaks longest-first. `"dogsand"` with `["dog", "dogs", "and"]` breaks shortest-first: `dog` leaves `sand`, which has no split, while `dogs + and` works.
- Checking `word in list` instead of a set, adding a factor of the dictionary size to every lookup.
- Forgetting `can[0] = True`, which makes every entry false.
- Memoising the recursion on the *remaining string* instead of the index: correct, but each key costs `O(n)` to hash and store.

### How to discuss it

Show the dead end with a small example first, since that is what rules out greedy. State `can[i]` as a prefix property, give the transition as "the last word ends at `i`", and say the `L` bound on `j`. Then offer the trie as the optimisation that removes the repeated slicing.

For "return every sentence", the output can be exponential (a string of `a`s with dictionary `["a", "aa"]` has Fibonacci-many splits), so use memoised recursion returning lists of sentences for each suffix, and prune with the boolean table first so you never expand a suffix that has no split. For the large-dictionary, many-queries follow-up, build the trie once (or a minimal automaton such as a DAWG to save memory) and run the forward-marking DP per query; the per-query cost is then independent of the dictionary size.
