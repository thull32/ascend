---
slug: design-add-search-words
title: Design Add and Search Words
difficulty: medium
patterns: [trie]
lists: [core-75, ascend-150]
companies: [meta, amazon, google, microsoft]
order: 2
lesson: interview-patterns/tree-and-graph-patterns/trie-pattern
hints:
  - "Without the wildcard this is a plain trie. What has to happen at a node when the next pattern character is `.`?"
  - "A `.` must try every child of the current node. That is a branch, so the search becomes a depth-first search over the trie that carries the current position in the pattern."
  - "Prune by length: the walk must consume exactly `len(word)` characters and land on a node with the end flag set. A partial match that runs out of children fails immediately."
signatures:
  python:
    name: WordDictionary
    starter: |
      class WordDictionary:
          def __init__(self):
              pass

          def add_word(self, word: str) -> None:
              pass

          def search(self, word: str) -> bool:
              pass
  javascript:
    name: WordDictionary
    starter: |
      class WordDictionary {
        constructor() {
        }
        add_word(word) {
        }
        search(word) {
        }
      }
tests:
  - args: [["add_word", "bad"], ["add_word", "dad"], ["add_word", "mad"], ["search", "pad"], ["search", "bad"], ["search", ".ad"], ["search", "b.."]]
    expected: [null, null, null, false, true, true, true]
  - args: [["search", "."], ["search", "a"]]
    expected: [false, false]
    label: empty dictionary
  - args: [["add_word", "a"], ["add_word", "ab"], ["search", "a"], ["search", "."], ["search", ".."], ["search", "..."], ["search", "a."], ["search", ".a"]]
    expected: [null, null, true, true, true, false, true, false]
    label: wildcards must respect length
  - args: [["add_word", "hello"], ["search", "hell"], ["search", "hello."], ["search", "....."], ["search", "h.l.o"]]
    expected: [null, false, false, true, true]
  - args: [["add_word", "cat"], ["add_word", "cut"], ["add_word", "cot"], ["search", "c.t"], ["search", ".u."], ["search", "c.d"], ["search", "ca."], ["search", "..t"], ["search", ".."]]
    expected: [null, null, null, true, true, false, true, true, false]
    hidden: true
    label: wildcard branches over several children
  - args: [["add_word", "abc"], ["add_word", "abd"], ["search", "ab."], ["search", "a.c"], ["search", "a.d"], ["search", "a.e"], ["search", "..."]]
    expected: [null, null, true, true, true, false, true]
    hidden: true
  - args: [["add_word", "x"], ["search", "x"], ["search", "xx"], ["search", "."]]
    expected: [null, true, false, true]
    hidden: true
    label: single letter word
time_limit_ms: 4000
---
Design a dictionary that supports adding words and searching with a single-character wildcard. Implement a class `WordDictionary` with:

- `add_word(word)` — store `word`.
- `search(pattern)` — return `true` if some stored word matches `pattern` exactly. Each `.` in `pattern` matches any one letter; every other character must match literally. The lengths must be equal.

Tests are given as a sequence of method calls; the expected output is the list of return values in order, with `null` for `add_word`.

### Examples

| Calls | Returns | Why |
|---|---|---|
| `add_word("bad"), add_word("dad"), search("pad")` | `null, null, false` | No stored word starts with `p` |
| `search(".ad"), search("b..")` (continuing) | `true, true` | `.` stands in for exactly one letter |
| `add_word("a"), search(".."), search("...")` | `null, true (with "ab" stored), false` | A wildcard cannot match zero letters or two |

### Constraints

- `1 ≤ len(word) ≤ 25`; stored words contain only lowercase letters
- Patterns contain lowercase letters and `.`; at most two `.` per pattern in the hidden large tests
- At most `10⁴` calls in total

### Follow-up

The interviewer asks: "What is the worst-case cost of `search("....")` on a dictionary of ten thousand four-letter words, and how would you bound it?" Then: "Now support `*` meaning zero or more of any character. What changes?"

## Solution

### The naive approach

Keep a list of words and, for each `search`, compare the pattern against every word of the same length. That is `O(N·L)` per search, which is fine for a toy and useless at scale. Bucketing words by length helps the constant but not the shape.

### The insight

A trie already handles the literal characters: walk one child per character. The wildcard is the only new thing, and what it asks for is "try every child here". So the search becomes a depth-first search over the trie that carries an index into the pattern. Literal characters follow one edge; `.` fans out over all edges; the walk succeeds when the pattern is consumed at a node whose `end` flag is set.

### The optimal approach

```python
class WordDictionary:
    def __init__(self):
        self.root: dict = {}

    def add_word(self, word: str) -> None:
        node = self.root
        for ch in word:
            node = node.setdefault(ch, {})
        node["$"] = True

    def search(self, word: str) -> bool:
        def dfs(node: dict, i: int) -> bool:
            if i == len(word):
                return "$" in node
            ch = word[i]
            if ch == ".":
                for key, child in node.items():
                    if key != "$" and dfs(child, i + 1):
                        return True
                return False
            child = node.get(ch)
            return child is not None and dfs(child, i + 1)

        return dfs(self.root, 0)
```

This version uses nested dictionaries with a `"$"` key as the end marker; it is compact and idiomatic Python. `add_word` is `O(L)`. `search` with no wildcards is `O(L)`; each `.` multiplies the work by the branching factor at that depth, so the worst case is `O(26^d · L)` for `d` wildcards, in practice far less because most branches die within a character or two.

### Common mistakes

- Treating `.` as "match anything, including nothing", which makes `search("..")` accept `"a"`.
- Iterating over `node.items()` and recursing into the `"$"` marker as if it were a child; skip it explicitly (or store the end flag outside the children map).
- Returning `true` when the pattern runs out on a node that is merely a prefix of a stored word.

### How to discuss it

Lead with "literal characters are a trie walk; a wildcard is a fan-out, so the search is a DFS over the trie". Give the complexity honestly: the wildcard can blow up, and the bound in the follow-up is `26^d`. Mitigations you can name: bucket the roots by word length so a search never enters a subtree that cannot produce the right length; limit wildcards per query; or, if wildcards are always at the end, the search collapses to `starts_with`. For `*`, the DFS gains a second kind of branch: consume zero characters and advance the pattern, or consume one character on any child and stay on the same pattern index. That is exactly the NFA simulation behind regular-expression matching, and saying so shows you see the general structure.
