---
slug: implement-trie
title: Implement Trie (Prefix Tree)
difficulty: medium
patterns: [trie]
lists: [core-75, ascend-150]
companies: [google, amazon, microsoft, uber]
order: 1
lesson: interview-patterns/tree-and-graph-patterns/trie-pattern
hints:
  - "A hash set answers `search` in O(1) but cannot answer `starts_with` without scanning every word. What structure shares the common prefix of `car` and `card` so a prefix is a single walk?"
  - "Each node holds a map from character to child node plus a flag saying whether a word ends here. `insert` walks and creates missing children; `search` and `starts_with` walk and give up on the first missing child."
  - "The only difference between `search` and `starts_with` is what you check at the last node. Factor the walk into one helper that returns the final node or `None`."
signatures:
  python:
    name: Trie
    starter: |
      class Trie:
          def __init__(self):
              pass

          def insert(self, word: str) -> None:
              pass

          def search(self, word: str) -> bool:
              pass

          def starts_with(self, prefix: str) -> bool:
              pass
  javascript:
    name: Trie
    starter: |
      class Trie {
        constructor() {
        }
        insert(word) {
        }
        search(word) {
        }
        starts_with(prefix) {
        }
      }
tests:
  - args: [["insert", "apple"], ["search", "apple"], ["search", "app"], ["starts_with", "app"], ["insert", "app"], ["search", "app"]]
    expected: [null, true, false, true, null, true]
  - args: [["search", "a"], ["starts_with", "a"]]
    expected: [false, false]
    label: empty trie
  - args: [["insert", "car"], ["insert", "card"], ["search", "car"], ["search", "card"], ["search", "ca"], ["starts_with", "ca"], ["starts_with", "cards"]]
    expected: [null, null, true, true, false, true, false]
    label: one word is a prefix of another
  - args: [["insert", "b"], ["insert", "ba"], ["insert", "bat"], ["search", "ba"], ["search", "bat"], ["search", "batt"], ["starts_with", "bat"]]
    expected: [null, null, null, true, true, false, true]
  - args: [["insert", "dog"], ["insert", "dot"], ["search", "do"], ["starts_with", "do"], ["search", "dog"], ["search", "dots"], ["starts_with", "dots"]]
    expected: [null, null, false, true, true, false, false]
    hidden: true
    label: shared prefix, divergent suffixes
  - args: [["insert", "hi"], ["insert", "hi"], ["search", "hi"], ["starts_with", "hip"], ["search", "h"]]
    expected: [null, null, true, false, false]
    hidden: true
    label: inserting the same word twice
  - args: [["insert", "zebra"], ["starts_with", "z"], ["starts_with", "zebra"], ["search", "zebr"], ["starts_with", "zebras"]]
    expected: [null, true, true, false, false]
    hidden: true
time_limit_ms: 4000
---
Build a prefix tree over lowercase words. Implement a class `Trie` with:

- `insert(word)` — add `word` to the structure.
- `search(word)` — return `true` if exactly `word` was inserted earlier.
- `starts_with(prefix)` — return `true` if at least one inserted word begins with `prefix` (a whole word counts as its own prefix).

Tests are given as a sequence of method calls; the expected output is the list of return values in order, with `null` for `insert`.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `insert("apple"), search("apple"), search("app")` | `null, true, false` | `app` is a prefix of a stored word, not a stored word |
| `starts_with("app"), insert("app"), search("app")` (continuing) | `true, null, true` | Once `app` is inserted it is both a word and a prefix |
| `insert("car"), insert("card"), starts_with("cards")` | `null, null, false` | Nothing extends past `card` |

### Constraints

- `1 ≤ len(word), len(prefix) ≤ 2000`
- Words and prefixes contain only lowercase English letters
- At most `3 × 10⁴` calls in total

### Follow-up

The interviewer asks: "Each node holds a map. What does memory look like for a million English words, and what would you change if the alphabet were all of Unicode?" Then: "How would you support `delete(word)` without leaving dead branches?"

## Solution

### The naive approach

Store every word in a hash set. `insert` and `search` are `O(L)` for a word of length `L` (hashing has to read the characters). `starts_with` has no good answer: you either scan every stored word (`O(N·L)`) or you also insert every prefix of every word into a second set, which multiplies memory by the average word length. Neither is what the interviewer wants.

### The insight

Words that share a prefix should share storage. A tree whose edges are labelled with characters makes each prefix a single path from the root; walking `prefix` character by character either reaches a node (some word continues from here) or falls off the tree (no word starts this way). That walk costs `O(len(prefix))` regardless of how many words are stored.

### The optimal approach

Each node is a dictionary `children` plus a boolean `end`. `insert` walks the word, creating children as needed, and marks the last node. `search` and `starts_with` share a `_walk` helper that returns the node reached by the string, or `None` if the walk fell off. `search` additionally requires `end` at that node.

```python
class TrieNode:
    __slots__ = ("children", "end")

    def __init__(self):
        self.children: dict[str, "TrieNode"] = {}
        self.end = False


class Trie:
    def __init__(self):
        self.root = TrieNode()

    def insert(self, word: str) -> None:
        node = self.root
        for ch in word:
            if ch not in node.children:
                node.children[ch] = TrieNode()
            node = node.children[ch]
        node.end = True

    def _walk(self, s: str):
        node = self.root
        for ch in s:
            node = node.children.get(ch)
            if node is None:
                return None
        return node

    def search(self, word: str) -> bool:
        node = self._walk(word)
        return node is not None and node.end

    def starts_with(self, prefix: str) -> bool:
        return self._walk(prefix) is not None
```

All three operations are `O(L)` in the length of their argument. Space is `O(total characters inserted)` in the worst case (no shared prefixes), and less when words overlap.

### Common mistakes

- Making `search` return `true` for a prefix: the `end` flag is the whole point of the difference.
- Forgetting that inserting the same word twice must be harmless (just re-set `end`).
- Using a fixed array of 26 children per node in Python; it works but wastes memory when the branching is sparse, and it breaks the moment the alphabet grows.

### How to discuss it

Say what the structure buys you: "a prefix query is a walk of `len(prefix)` steps, independent of how many words are stored, because shared prefixes share nodes." For the memory follow-up: a dictionary per node is roughly 100+ bytes of overhead in Python, so a million words with an average of three or four unshared characters each is a few hundred megabytes; the fixes are a compressed (radix) trie that collapses single-child chains, or a sorted array with binary search when the data is static. For `delete`, walk down recording the path, unset `end`, then walk back up removing any node that has no children and is not a word end.
