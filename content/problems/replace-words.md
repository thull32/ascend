---
slug: replace-words
title: Replace Words
difficulty: medium
patterns: [trie]
lists: [ascend-150]
companies: [uber, google, bloomberg]
order: 4
lesson: interview-patterns/tree-and-graph-patterns/trie-pattern
hints:
  - "For each word in the sentence you want the shortest dictionary root that is a prefix of it. Checking every root against every word is O(R · W · L); what makes prefix questions cheap?"
  - "Put the roots in a trie. Walk the sentence word character by character; the first node you reach that is marked as a root end gives the shortest root, so stop there."
  - "If the walk falls off the trie or reaches the end of the word without hitting a root end, the word stays as it is."
signatures:
  python:
    name: replace_words
    starter: |
      def replace_words(dictionary: list[str], sentence: str) -> str:
          pass
  javascript:
    name: replace_words
    starter: |
      function replace_words(dictionary, sentence) {
      }
tests:
  - args: [["cat", "bat", "rat"], "the cattle was rattled by the battery"]
    expected: "the cat was rat by the bat"
  - args: [["a", "b", "c"], "aadsfasf absbs bbab cadsfafs"]
    expected: "a a b c"
  - args: [["xyz"], "hello world"]
    expected: "hello world"
    label: nothing matches
  - args: [["inter", "in", "interview"], "interview internal inside"]
    expected: "in in in"
    label: shortest root wins
  - args: [["rat"], "rat rats rate"]
    expected: "rat rat rat"
    label: root equal to the whole word
  - args: [["s"], "sing"]
    expected: "s"
  - args: [["ab", "abc", "a"], "abcd abd bcd a"]
    expected: "a a bcd a"
    hidden: true
  - args: [["catt"], "cat cattle"]
    expected: "cat catt"
    hidden: true
    label: a word shorter than the root is untouched
  - args: [["pre", "prefix"], "prefixes preface prep"]
    expected: "pre pre pre"
    hidden: true
time_limit_ms: 4000
---
You are given a list of root words `dictionary` and a `sentence` of lowercase words separated by single spaces. Replace every word in the sentence that begins with some root by that root. If several roots are prefixes of the same word, use the shortest. Words that begin with no root are unchanged. Return the rewritten sentence.

### Examples

| Input | Output | Why |
|---|---|---|
| roots `["cat","bat","rat"]`, `"the cattle was rattled by the battery"` | `"the cat was rat by the bat"` | `cattle` → `cat`, `rattled` → `rat`, `battery` → `bat` |
| roots `["inter","in","interview"]`, `"interview internal inside"` | `"in in in"` | Three roots match `interview`; the shortest is `in` |
| roots `["catt"]`, `"cat cattle"` | `"cat catt"` | `cat` is shorter than the root, so it cannot start with it |

### Constraints

- `1 ≤ len(dictionary) ≤ 1000`, `1 ≤ len(root) ≤ 100`
- `1 ≤ len(sentence) ≤ 10⁶`, words separated by exactly one space, no leading or trailing spaces

### Follow-up

The interviewer asks: "The dictionary now has a million roots and the sentence stream is unbounded. What are the memory and per-word costs?" Then: "Suppose we want the *longest* matching root instead. What changes?"

## Solution

### The naive approach

For every word in the sentence, try every root and keep the shortest one that is a prefix. That is `O(R · W · L)` for `R` roots, `W` words and prefix length `L`. Sorting the roots by length and stopping at the first hit improves the average case but not the bound. A hash set of roots plus checking every prefix of each word (`O(W · L²)` hashing) is better and is a legitimate answer, but it still rehashes overlapping prefixes.

### The insight

"Shortest root that is a prefix of this word" is a single trie walk. Insert the roots; for each sentence word, walk down one character at a time. The first node flagged as a root end is the shortest matching root, so you can stop immediately, which also means a word never costs more than the length of its shortest matching root. If the walk falls off the trie or exhausts the word without hitting a flag, the word is kept.

### The optimal approach

```python
def replace_words(dictionary: list[str], sentence: str) -> str:
    root: dict = {}
    for r in dictionary:
        node = root
        for ch in r:
            node = node.setdefault(ch, {})
        node["$"] = True

    def shorten(word: str) -> str:
        node = root
        for i, ch in enumerate(word):
            if "$" in node:
                return word[:i]
            node = node.get(ch)
            if node is None:
                return word
        return word[:len(word)] if "$" in node else word

    return " ".join(shorten(w) for w in sentence.split(" "))
```

The check for `"$"` happens before consuming the next character so that a root equal to a prefix of length `i` is detected before the walk moves past it, and the final check after the loop handles a root equal to the whole word. Building the trie is `O(total root characters)`; processing the sentence is `O(total sentence characters)` because each character is examined at most once. Space is `O(total root characters)`.

### Common mistakes

- Checking `"$"` only after moving to the child, which misses the case where the root is a strict prefix ending one character earlier, or which returns the longer of two nested roots.
- Splitting on whitespace generically and rejoining with a single space; the statement guarantees single spaces, but `split(" ")` is the honest choice.
- Returning the root when the *word* is a prefix of the root (`cat` with root `catt`).

### How to discuss it

Frame it as "a prefix question per word, so a trie of the roots turns each word into one walk that stops at the first end flag." For the million-root follow-up: memory is proportional to total root characters, not the product with the sentence, and per-word cost is bounded by the shortest matching root, so the stream can be processed online with constant memory beyond the trie. For the longest-root variant, keep walking and remember the last flagged depth instead of returning at the first, which turns early exit into a full-length walk; the cost bound becomes `O(len(word))` per word.
