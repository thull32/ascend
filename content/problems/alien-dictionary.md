---
slug: alien-dictionary
title: Alien Dictionary
difficulty: hard
patterns: [topological-sort]
lists: [ascend-150]
companies: [airbnb, meta, google, amazon, uber]
order: 3
lesson: interview-patterns/tree-and-graph-patterns/topological-sort-pattern
hints:
  - "Compare each pair of *adjacent* words. The first position where they differ tells you one letter comes before another. Nothing after that position tells you anything."
  - "Each such fact is a directed edge between letters. The alphabet order is a topological order of that letter graph, and a cycle means the dictionary is inconsistent."
  - "Watch for the one input that has no differing position but is still invalid: a word followed by its own proper prefix, like 'abc' then 'ab'."
signatures:
  python:
    name: alien_order
    starter: |
      def alien_order(words: list[str]) -> str:
          pass
  javascript:
    name: alien_order
    starter: |
      function alien_order(words) {
      }
tests:
  - args: [["cc", "ca", "ab", "ba", "bb"]]
    expected: "cab"
  - args: [["zy", "zx", "yz", "yx", "x"]]
    expected: "zyx"
  - args: [["abc", "ab"]]
    expected: ""
    label: a word before its own prefix is invalid
  - args: [["ba", "ab", "bc"]]
    expected: ""
    label: contradictory facts
  - args: [["q"]]
    expected: "q"
    label: one word, one letter
  - args: [["xz", "yx", "yz", "zy"]]
    expected: "xyz"
    label: only the first differing letter matters
  - args: [["dd", "db", "be", "ea", "ac", "ca"]]
    expected: "dbeac"
    hidden: true
  - args: [["pq", "pqr", "prq", "q"]]
    expected: "pqr"
    hidden: true
    label: a prefix that comes first is fine
  - args: [["ab", "bc", "ca", "ab"]]
    expected: ""
    hidden: true
    label: a three-letter cycle
  - args: [["ba", "bc", "ac", "cab"]]
    expected: "bac"
    hidden: true
time_limit_ms: 4000
---
An alien language uses a subset of the lowercase English letters, but in an unknown order. You are given a list of words from its dictionary, **sorted lexicographically by the alien alphabet**. Lexicographic order works as usual: compare two words letter by letter; the first position where they differ decides, and if one word runs out first, the shorter word comes first.

Return a string containing every letter that appears in `words`, arranged in the alien alphabet's order. If the list cannot be sorted under any alphabet, return `""`.

The inputs are chosen so that whenever a valid order exists, the words determine it **completely**: exactly one arrangement of the letters is consistent.

### Examples

| Input | Output | Why |
|---|---|---|
| `["cc","ca","ab","ba","bb"]` | `"cab"` | `cc`/`ca` gives `c < a`; `ab`/`ba` gives `a < b` |
| `["xz","yx","yz","zy"]` | `"xyz"` | `xz`/`yx` gives `x < y` and nothing about `z` versus `x`; the other pairs give `x < z` and `y < z` |
| `["abc","ab"]` | `""` | No alphabet puts a word before its own prefix |

### Constraints

- `1 ≤ len(words) ≤ 100`
- `1 ≤ len(words[i]) ≤ 100`
- Words use lowercase English letters

### Follow-up

The interviewer asks: "Drop the guarantee that the order is fully determined. Return any valid order, and separately tell me whether it is the only one."

## Solution

### The naive approach

Try every permutation of the letters that appear and check whether the word list is sorted under it. With `k` distinct letters that is `k!` permutations, each checked in `O(C)` where `C` is the total number of characters. Fine for 5 letters, impossible for 26 (26! is about 4 × 10²⁶).

### The insight

A sorted dictionary leaks the alphabet one fact at a time, and only between **adjacent** words. For two neighbours `w1`, `w2`, find the first index `i` where they differ. Then `w1[i]` comes before `w2[i]` in the alphabet, and that is **all** the pair tells you. Letters after position `i` are unconstrained, because the comparison was already decided.

Why adjacent pairs are enough: if `w1 ≤ w2 ≤ w3`, the facts from `w1`/`w3` follow from the facts from `w1`/`w2` and `w2`/`w3` by transitivity, so non-adjacent pairs add nothing new.

Each fact is a directed edge `w1[i] → w2[i]` in a graph whose nodes are letters. An alphabet consistent with all the facts is a **topological order** of that graph. A cycle means the facts contradict each other.

There is one invalid case with no differing position: `w2` is a proper prefix of `w1` (for example `"abc"` before `"ab"`). Lexicographic order always puts the prefix first, so no alphabet can fix it. Detect it explicitly.

### The optimal approach

1. Collect every letter that appears into the graph with in-degree 0 (letters with no constraints must still be output).
2. For each adjacent pair, find the first differing index. If there is one, add the edge (once; use a set so repeated facts do not inflate in-degrees). If there is none and `len(w1) > len(w2)`, return `""`.
3. Run Kahn's algorithm over the letters. If it emits every letter, return them joined; otherwise there was a cycle, return `""`.

Trace `["xz","yx","yz","zy"]`. Pairs: `xz`/`yx` differ at index 0, edge `x → y` (and **not** `z → x` from index 1). `yx`/`yz` differ at index 1, edge `x → z`. `yz`/`zy` differ at index 0, edge `y → z`. In-degrees: x:0, y:1, z:2. Kahn's: take `x` (y→0, z→1), take `y` (z→0), take `z`. Answer `"xyz"`. A solution that also used index 1 of the first pair would add `z → x`, find a cycle, and wrongly return `""`.

```python
from collections import deque

def alien_order(words: list[str]) -> str:
    succ: dict[str, set[str]] = {ch: set() for w in words for ch in w}
    indegree = {ch: 0 for ch in succ}

    for w1, w2 in zip(words, words[1:]):
        for a, b in zip(w1, w2):
            if a != b:
                if b not in succ[a]:
                    succ[a].add(b)
                    indegree[b] += 1
                break                        # only the first difference counts
        else:
            if len(w1) > len(w2):            # w2 is a proper prefix of w1
                return ""

    ready = deque(ch for ch in succ if indegree[ch] == 0)
    out: list[str] = []
    while ready:
        ch = ready.popleft()
        out.append(ch)
        for nxt in succ[ch]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                ready.append(nxt)
    return "".join(out) if len(out) == len(succ) else ""
```

Time `O(C)` to scan the words, where `C` is the total number of characters, plus `O(k + e)` for the topological sort over `k ≤ 26` letters and `e ≤ min(k², n)` edges. Space `O(k + e)`, which is bounded by a constant for a 26-letter alphabet.

### Common mistakes

- **Using more than the first difference.** The `"xz","yx"` pair says nothing about `z` and `x`. Continuing the loop after the first mismatch invents constraints.
- **Missing the prefix case.** `["abc","ab"]` has no differing position, so a solution that only builds edges happily returns `"abc"` or similar.
- **Dropping unconstrained letters.** Every letter in the input must appear in the output. Seed the graph with all letters before adding edges.
- **Duplicate edges inflating in-degrees.** If the same fact appears twice and you increment in-degree twice but store the edge once in a set, the letter never reaches 0. Either dedupe both or neither.
- **Comparing non-adjacent words.** It is not wrong, just `O(n²)` pairs for no new information.

### How to discuss it

Break the problem into its two halves out loud: "extract ordering facts from adjacent pairs, then topologically sort the letters." The first half is where candidates lose points, so walk through the first-difference rule and the prefix rule with a tiny example before coding. The second half is [Course Schedule II](/practice/course-schedule-ii) with letters instead of courses.

For the follow-up: any valid order is simply Kahn's output without the uniqueness guarantee. The order is unique exactly when the ready queue never holds two letters at once, so check `len(ready) > 1` at each step. When it is not unique, say what that means for the user: the dictionary is too small to pin down the alphabet, and a production system would report which pairs of letters are undetermined rather than silently guessing.
