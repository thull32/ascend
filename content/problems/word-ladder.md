---
slug: word-ladder
title: Word Ladder
difficulty: hard
patterns: [graph]
lists: [ascend-150]
companies: [amazon, meta, google, linkedin, snap]
order: 10
lesson: interview-patterns/tree-and-graph-patterns/graph-traversal
hints:
  - "Treat every word as a node and connect two words when they differ in exactly one position. The question is now the length of a shortest path in an unweighted graph."
  - "Shortest path in an unweighted graph is BFS. The hard part is finding neighbours quickly: comparing every pair of words is O(N² · L)."
  - "Bucket words by wildcard patterns: 'cold' belongs to '*old', 'c*ld', 'co*d' and 'col*'. Two words are neighbours exactly when they share a bucket."
signatures:
  python:
    name: ladder_length
    starter: |
      def ladder_length(begin_word: str, end_word: str, word_list: list[str]) -> int:
          pass
  javascript:
    name: ladder_length
    starter: |
      function ladder_length(begin_word, end_word, word_list) {
      }
tests:
  - args: ["cold", "warm", ["cord", "card", "ward", "warm", "worm", "word", "wood"]]
    expected: 5
    label: two equally short ladders
  - args: ["lead", "gold", ["load", "goad", "gold", "lend"]]
    expected: 4
  - args: ["abc", "xyz", ["abz", "ayz"]]
    expected: 0
    label: target word is not in the list
  - args: ["a", "c", ["a", "b", "c"]]
    expected: 2
    label: one step
  - args: ["dog", "cat", ["dig", "cat", "big"]]
    expected: 0
    label: target unreachable
  - args: ["hot", "hat", ["hat"]]
    expected: 2
    label: begin word need not be in the list
  - args: ["cat", "dog", ["cot", "cog", "dog", "cat", "bat", "bot", "bog"]]
    expected: 4
    hidden: true
    label: a longer ladder exists too
  - args: ["aaa", "ccc", ["aab", "abb", "bbb", "bbc", "bcc", "ccc", "aac", "acc"]]
    expected: 4
    hidden: true
    label: DFS would find the long way first
  - args: ["ab", "cd", []]
    expected: 0
    hidden: true
    label: empty dictionary
  - args: ["pin", "bog", ["pig", "big", "bog", "pog", "pit", "bit"]]
    expected: 4
    hidden: true
time_limit_ms: 4000
---
A **ladder** from `begin_word` to `end_word` is a sequence of words that starts with `begin_word`, ends with `end_word`, and in which each consecutive pair differs in exactly one letter position. Every word after the first must come from `word_list`. All words have the same length and use lowercase letters.

Return the number of words in the **shortest** ladder, counting both ends. Return `0` if no ladder exists. `begin_word` does not have to appear in `word_list`; `end_word` does, or there is no ladder.

### Examples

| Input | Output | Why |
|---|---|---|
| `"lead"`, `"gold"`, `["load","goad","gold","lend"]` | `4` | `lead → load → goad → gold` |
| `"cold"`, `"warm"`, `["cord","card","ward","warm","worm","word","wood"]` | `5` | `cold → cord → card → ward → warm`; `cold → cord → word → worm → warm` is equally short |
| `"abc"`, `"xyz"`, `["abz","ayz"]` | `0` | `"xyz"` is not in the list |

### Constraints

- `1 ≤ L ≤ 10` where `L` is the word length
- `0 ≤ len(word_list) ≤ 5000`
- All words in `word_list` are distinct

### Follow-up

The interviewer asks: "Return every shortest ladder, not just the length." Then: "The dictionary has two million words. Where does the time actually go, and how do you cut it?"

## Solution

### The naive approach

Model words as nodes and build the graph explicitly by comparing every pair of words: two words are adjacent if they differ in exactly one position. That is `N²/2` comparisons of `L` characters each, `O(N²·L)`. For 5,000 words of length 5 that is 62 million character comparisons before you even start searching. Then run BFS from `begin_word`.

A DFS that tries ladders recursively is worse: it finds *a* ladder, not the shortest, and exploring all of them is exponential.

### The insight

Two separate ideas are needed.

**BFS gives the shortest ladder.** Every step costs the same, so the shortest ladder is the shortest path in an unweighted graph, which BFS finds by expanding words in order of distance. The moment `end_word` is first discovered, the number of the level being built is the answer.

**Wildcard buckets find neighbours without pairwise comparison.** Replace each position of a word by `*` in turn: `cold` produces `*old`, `c*ld`, `co*d`, `col*`. Two words differ in exactly one position if and only if they share one of these patterns. So index the dictionary once as `pattern → [words]`; the neighbours of a word are the union of its `L` buckets. Building the index costs `O(N·L²)` (N words, L patterns each, each pattern a string of length L), and it replaces the `O(N²·L)` pairwise scan.

An equivalent trick with no index: for each position, try all 26 letters and check the dictionary set. That is `26·L` lookups per expanded word, each hashing an `L`-length string, and most of them miss. It needs no memory beyond the word set. Buckets do `L` lookups per word and only ever touch real neighbours, at the cost of an index about `L` times the size of the dictionary. Either is a good interview answer if you can say that trade-off.

### The optimal approach

1. If `end_word` is not in the list, return 0.
2. Build `buckets[pattern]` for every word in the list.
3. BFS from `begin_word` with `level = 1`. For each word in the current level, for each of its patterns, visit every unvisited word in that bucket. If it is `end_word`, return `level + 1`.
4. **Clear each bucket after you use it.** Every word in a bucket is visited the first time any member expands it, so a second expansion would only re-check visited words. Deleting the bucket makes the total work over all buckets `O(N·L)` rather than potentially quadratic when buckets are large.

Trace `"lead" → "gold"`. Level 1: `lead`. Its patterns `*ead`, `l*ad`, `le*d`, `lea*`: the bucket `l*ad` holds `load`, and `le*d` holds `lend`. Level 2: `load`, `lend`. `load`'s pattern `*oad` holds `goad`. Level 3: `goad`, whose pattern `go*d` holds `gold`, the target. Answer 3 + 1 = 4.

```python
from collections import defaultdict, deque

def ladder_length(begin_word: str, end_word: str, word_list: list[str]) -> int:
    if end_word not in set(word_list):
        return 0
    L = len(begin_word)
    buckets: dict[str, list[str]] = defaultdict(list)
    for w in word_list:
        for i in range(L):
            buckets[w[:i] + "*" + w[i + 1:]].append(w)

    seen = {begin_word}
    queue = deque([begin_word])
    level = 1
    while queue:
        for _ in range(len(queue)):
            word = queue.popleft()
            for i in range(L):
                pattern = word[:i] + "*" + word[i + 1:]
                for nxt in buckets.pop(pattern, ()):   # use each bucket once
                    if nxt == end_word:
                        return level + 1
                    if nxt not in seen:
                        seen.add(nxt)
                        queue.append(nxt)
        level += 1
    return 0
```

Time `O(N·L²)`: every word generates `L` patterns of length `L` once when indexed and once when expanded, and each bucket is scanned once. Space `O(N·L²)` for the index (each word is stored under `L` keys, and each key is a string of length `L`).

**Bidirectional BFS** is the standard speed-up. Search from both ends at once and always expand the smaller frontier; stop when they meet. If each word has about `b` neighbours and the answer is `d` steps, one-sided BFS explores on the order of `b^d` words, two-sided about `2·b^(d/2)`. On sparse, deep ladders that is the difference between milliseconds and seconds.

### Common mistakes

- **Returning the number of edges.** The answer counts words: a one-step ladder has length 2.
- **Not checking that `end_word` is in the list.** Without the check, a ladder can "arrive" at a target that was never allowed.
- **Marking visited on dequeue.** A word in the next level can be discovered by many words in the current level and enqueued many times, blowing up the queue.
- **Adding `begin_word` to the dictionary and then treating it as unvisited.** Mark it seen before the search starts; it may also appear in `word_list`, as in the `cat → dog` hidden test.
- **DFS.** It happily walks `aaa → aab → abb → bbb → …` and reports the long ladder.

### How to discuss it

Frame the model before any code: "Words are nodes, one-letter edits are edges, and I need a shortest path in an unweighted graph, so BFS. The real problem is neighbour generation." Then compare the three neighbour strategies (pairwise `O(N²·L)`, 26-letter substitution `O(26·L²)` per word including hashing, wildcard buckets) and pick one with a reason. That comparison is what distinguishes a senior answer; the BFS itself is table stakes.

For "all shortest ladders", run BFS level by level recording **parent lists** (every word in the previous level that reaches this word), stop after the level that finds `end_word`, then backtrack from `end_word` through the parent lists to enumerate paths. Do not store full paths in the queue; the number of partial paths can be exponential even when the number of shortest ones is small. For two million words, the cost is dominated by string allocation and hashing: bidirectional BFS shrinks the explored set, and mapping words to integer ids with precomputed neighbour lists moves the string work out of the query path.
