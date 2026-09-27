---
slug: hand-of-straights
title: Hand of Straights
difficulty: medium
patterns: [greedy]
lists: [ascend-150]
companies: [google, amazon, meta, microsoft]
order: 5
lesson: interview-patterns/combinatorial-patterns/greedy-pattern
hints:
  - "If the hand size is not a multiple of group_size, the answer is immediately false. Otherwise, think about the smallest card in the hand: which group can it possibly belong to?"
  - "The smallest card cannot be the middle or end of a run, because nothing smaller exists. It must start a run of group_size consecutive values. That choice is forced, not guessed."
  - "Count cards with a hash map, then repeatedly take the smallest remaining value v and consume one copy each of v, v+1, ..., v+group_size-1. If any is missing, fail. Process values in sorted order so 'smallest remaining' is cheap."
signatures:
  python:
    name: can_form_straights
    starter: |
      def can_form_straights(hand: list[int], group_size: int) -> bool:
          pass
  javascript:
    name: can_form_straights
    starter: |
      function can_form_straights(hand, group_size) {
      }
tests:
  - args: [[4, 2, 3, 8, 6, 7], 3]
    expected: true
  - args: [[1, 2, 3, 5, 6], 2]
    expected: false
    label: hand size not divisible
  - args: [[5, 1, 2, 3, 3, 4, 4, 5, 6], 3]
    expected: true
    label: duplicates spread across runs
  - args: [[1, 1, 2, 2, 3, 4], 3]
    expected: false
  - args: [[7], 1]
    expected: true
    label: groups of one always work
  - args: [[1, 2, 4, 5], 2]
    expected: true
  - args: [[3, 3, 4, 4, 5, 5], 3]
    expected: true
    hidden: true
    label: two identical runs
  - args: [[1, 2, 3, 4], 3]
    expected: false
    hidden: true
  - args: [[10, 11, 12, 12, 13, 14], 3]
    expected: true
    hidden: true
  - args: [[2, 3, 4, 5, 5, 6], 3]
    expected: false
    hidden: true
    label: leftover duplicate breaks the second run
time_limit_ms: 4000
---
You hold a hand of cards, each showing an integer, given as the array `hand`. You want to split the entire hand into groups of exactly `group_size` cards, where each group is a *straight*: `group_size` consecutive values such as `[6, 7, 8]`. Every card must be used exactly once. Return `true` if such a split exists and `false` otherwise.

Values may repeat in the hand; two copies of `5` are two separate cards and may go into different groups.

### Examples

| Input | Output | Why |
|---|---|---|
| `hand = [4, 2, 3, 8, 6, 7]`, `group_size = 3` | `true` | `[2, 3, 4]` and `[6, 7, 8]` |
| `hand = [1, 1, 2, 2, 3, 4]`, `group_size = 3` | `false` | The first `1` forces `[1, 2, 3]`; the second `1` then needs a `3` that is gone |
| `hand = [1, 2, 3, 5, 6]`, `group_size = 2` | `false` | Five cards cannot split into pairs |

### Constraints

- `1 ≤ len(hand) ≤ 10⁴`
- `0 ≤ hand[i] ≤ 10⁹`
- `1 ≤ group_size ≤ len(hand)`

### Follow-up

The interviewer asks: "Can you do better than `O(n log n)` when `group_size` is small?" Then: "What if a straight may be *any* length of at least `group_size`, instead of exactly `group_size`?"

## Solution

### The naive approach

Backtracking: pick a card, try every straight it could belong to (as first, second, ... element), recurse on the rest. The branching makes this exponential. It is worth one sentence, mainly to set up the question "which of those choices is actually forced?"

### The insight

Look at the **smallest card** in the hand, value `v`. It cannot sit in the middle or at the end of a straight, because that would require a card with value `v - 1`, which does not exist. So the smallest card *must* start a straight `v, v+1, ..., v+group_size-1`. There is no choice to make, so there is nothing to backtrack over.

Remove that straight and the argument repeats on what is left: the new smallest card must start the next straight. The greedy algorithm is not a heuristic here; every step is forced, so if it fails, no split exists.

### The optimal approach

Count each value, then visit the distinct values in increasing order. When you reach value `v` with `count[v] = c > 0`, all `c` copies of `v` are now the smallest cards, so they must each start a straight. Consume `c` copies of each of `v, v+1, ..., v+group_size-1` in one go.

```python
from collections import Counter


def can_form_straights(hand: list[int], group_size: int) -> bool:
    if len(hand) % group_size:
        return False
    count = Counter(hand)
    for v in sorted(count):
        c = count[v]
        if c == 0:
            continue  # fully consumed by earlier straights
        for w in range(v, v + group_size):
            if count[w] < c:
                return False
            count[w] -= c
    return True
```

Trace `hand = [5, 1, 2, 3, 3, 4, 4, 5, 6]`, `group_size = 3`. Counts: `1:1, 2:1, 3:2, 4:2, 5:2, 6:1`.

- `v = 1`, `c = 1`: consume one each of 1, 2, 3. Counts: `3:1, 4:2, 5:2, 6:1`.
- `v = 2`: count is 0, skip.
- `v = 3`, `c = 1`: consume 3, 4, 5. Counts: `4:1, 5:1, 6:1`.
- `v = 4`, `c = 1`: consume 4, 5, 6. Everything is 0.
- `v = 5`, `v = 6`: skip. Return `true`.

Time: sorting the `d` distinct values is `O(d log d)`; the consumption loops touch each card once per straight it joins, `O(n)` in total because each straight removes `group_size` cards. Overall `O(n log n)`. Space `O(n)` for the counter.

Note that `count[w]` on a `Counter` returns `0` for a missing key without raising, which is why the gap check is a plain comparison. In JavaScript use `map.get(w) ?? 0`.

### Common mistakes

- Skipping the divisibility check. It is not required for correctness if the loop is right, but it is a free `O(1)` exit and interviewers notice when it is missing.
- Starting straights from an arbitrary card, or from the *most frequent* card. Only the smallest card's role is forced.
- Consuming one straight at a time with a heap and re-popping, which works but is slower and fiddlier than consuming all `c` copies at once.
- Forgetting that a value can reach `0` via earlier consumption and then iterating as if it still needed a straight.

### How to discuss it

Lead with the forcing argument: "the smallest remaining card has no smaller neighbour, so it must begin a straight; the choice is forced, hence greedy is exact." That sentence is the proof, and saying it separates you from candidates who pattern-match to "sort and try". For the follow-up, you can avoid sorting: for any card `v`, walk down `v - 1, v - 2, ...` while those values are still present to find the start of its run, then consume straights from that start up to `v`. Every value you walk over is zeroed by the consumption that follows, so each value is walked roughly once and the whole thing is expected `O(n)` with a hash map. For "any length ≥ `group_size`", the problem becomes splitting into consecutive subsequences: greedily *extend* an existing run that ends at `v - 1` before opening a new one, tracking how many runs end at each value.
