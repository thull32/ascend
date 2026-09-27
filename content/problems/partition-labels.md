---
slug: partition-labels
title: Partition Labels
difficulty: medium
patterns: [greedy]
lists: [ascend-150]
companies: [amazon, meta, google, microsoft]
order: 6
lesson: interview-patterns/combinatorial-patterns/greedy-pattern
hints:
  - "If a letter appears in a part, every occurrence of that letter must be in the same part. So the first occurrence of a letter commits the part to extend at least as far as its last occurrence."
  - "Precompute the last index of every letter. Walk the string keeping `end`, the furthest last-occurrence of any letter seen in the current part."
  - "When your index i reaches `end`, nothing in the current part appears later, so you can cut here. Cutting as early as possible is what maximises the number of parts."
signatures:
  python:
    name: partition_labels
    starter: |
      def partition_labels(s: str) -> list[int]:
          pass
  javascript:
    name: partition_labels
    starter: |
      function partition_labels(s) {
      }
tests:
  - args: ["abcabdefgfe"]
    expected: [5, 1, 5]
  - args: ["xyz"]
    expected: [1, 1, 1]
    label: all distinct letters
  - args: ["aaaa"]
    expected: [4]
    label: one repeated letter
  - args: ["q"]
    expected: [1]
    label: single character
  - args: ["abba"]
    expected: [4]
    label: nested spans
  - args: ["mnmopqpo"]
    expected: [3, 5]
  - args: ["abcdefa"]
    expected: [7]
    hidden: true
    label: first and last letter match
  - args: ["abacbcdd"]
    expected: [6, 2]
    hidden: true
    label: chained overlaps
  - args: ["zzyxxwy"]
    expected: [2, 5]
    hidden: true
time_limit_ms: 4000
---
You are given a string `s` of lowercase English letters. Cut it into as many contiguous parts as possible such that **each letter appears in at most one part**. Return the lengths of the parts, in order from left to right.

Concatenating the parts must give back `s` unchanged; you are only choosing where to cut.

### Examples

| Input | Output | Why |
|---|---|---|
| `s = "abcabdefgfe"` | `[5, 1, 5]` | `"abcab"`, `"d"`, `"efgfe"`. The second `b` at index 4 stops the first part ending sooner |
| `s = "mnmopqpo"` | `[3, 5]` | `"mnm"` then `"opqpo"`; the `o` at index 3 recurs at index 7 |
| `s = "xyz"` | `[1, 1, 1]` | No letter repeats, so every character is its own part |

### Constraints

- `1 ≤ len(s) ≤ 500`
- `s` contains only lowercase English letters.

### Follow-up

The interviewer asks: "Prove that cutting as early as possible gives the *maximum* number of parts." Then: "How does this relate to merging intervals?"

## Solution

### The naive approach

Try every set of cut positions and keep the valid one with the most parts: `2ⁿ⁻¹` possibilities. A less silly version tries each prefix length and checks, with sets, whether the prefix and the remainder share any letter, then recurses; that is polynomial but still `O(n²)` or worse with repeated set work. Neither is necessary.

### The insight

A letter "owns" the span from its first occurrence to its last. Any part containing that letter must contain its whole span. Scanning left to right, the current part must extend at least to `end = max(last[c])` over every letter `c` seen since the part began. The moment the scan index `i` equals `end`, every letter in the part has had its final occurrence, so a cut here is legal.

Cutting at the **first** legal position is optimal. Any valid partition must have a cut at or after that point (a cut earlier would split some letter's span), and cutting exactly there leaves the longest possible remainder to be partitioned further. An earlier cut is impossible, and a later cut can only merge parts, never create more.

This is the interval view: each letter's span is an interval, and the parts are the connected components you get by merging overlapping intervals, exactly as in [Merge Intervals](/practice/merge-intervals). The scan does that merge in one pass without sorting, because the intervals are discovered in order of their start.

### The optimal approach

```python
def partition_labels(s: str) -> list[int]:
    last = {c: i for i, c in enumerate(s)}   # later writes win: last occurrence
    sizes: list[int] = []
    start = end = 0
    for i, c in enumerate(s):
        end = max(end, last[c])
        if i == end:
            sizes.append(end - start + 1)
            start = i + 1
    return sizes
```

Trace `"abcabdefgfe"` with `last = {a:3, b:4, c:2, d:5, e:10, f:9, g:8}`:

| i | c | end | cut? |
|---|---|---|---|
| 0 | a | 3 | |
| 1 | b | 4 | |
| 2 | c | 4 | |
| 3 | a | 4 | |
| 4 | b | 4 | cut, size 5 |
| 5 | d | 5 | cut, size 1 |
| 6 | e | 10 | |
| 7..9 | f, g, f | 10 | |
| 10 | e | 10 | cut, size 5 |

Time `O(n)`: two passes over the string. Space `O(1)` beyond the output, because `last` has at most 26 entries.

### Common mistakes

- Using the *first* occurrence table instead of the last, or updating `end = last[c]` instead of `max(end, last[c])`, which shrinks the part when a letter with an earlier last occurrence appears. On `"abba"`, `a` sets `end = 3`; the `b` at index 1 must not pull it back to 2, or you cut `"abb"` and leave `a` in two parts.
- Returning the parts as strings or as cut indices when the prompt asks for lengths.
- Recomputing `s.rfind(c)` inside the loop. It is correct but `O(n)` per call, turning the solution into `O(n²)`; with 26 letters the interviewer will ask why you did not precompute.

### How to discuss it

Describe each letter as an interval from first to last occurrence and say "a part must contain whole intervals, so the parts are the merged interval groups". Then give the one-pass scan and the exchange argument: the earliest legal cut is forced to be at or before any other valid cut, so taking it never costs a part. Mention that the alphabet bound makes the extra space constant, and that for a large alphabet (Unicode code points, arbitrary tokens) the table becomes a hash map and the space is `O(distinct symbols)`.
