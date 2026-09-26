---
slug: reorganize-string
title: Reorganize String
difficulty: medium
patterns: [heap]
lists: [ascend-150]
companies: [amazon, meta, google, twitter]
order: 7
lesson: interview-patterns/sequence-patterns/top-k-elements
hints:
  - "When is it impossible? If one character appears more than half the positions (rounded up), two copies must touch. That check alone settles the empty-string cases."
  - "Greedy: always place the character with the most remaining copies that is not the one you just placed. A max-heap of counts gives you that character."
  - "Hold the character you just used out of the heap for one step, then push it back if it still has copies. That is what prevents it from being picked twice in a row."
signatures:
  python:
    name: reorganize_string
    starter: |
      def reorganize_string(s: str) -> str:
          pass
  javascript:
    name: reorganize_string
    starter: |
      class MinHeap {
        constructor(compare = (a, b) => a - b) { this.a = []; this.cmp = compare; }
        size() { return this.a.length; }
        peek() { return this.a[0]; }
        push(x) {
          const a = this.a; a.push(x);
          let i = a.length - 1;
          while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.cmp(a[i], a[p]) >= 0) break;
            [a[i], a[p]] = [a[p], a[i]]; i = p;
          }
        }
        pop() {
          const a = this.a; const top = a[0]; const last = a.pop();
          if (a.length) {
            a[0] = last;
            let i = 0;
            for (;;) {
              const l = 2 * i + 1, r = l + 1; let m = i;
              if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
              if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
              if (m === i) break;
              [a[i], a[m]] = [a[m], a[i]]; i = m;
            }
          }
          return top;
        }
      }

      function reorganize_string(s) {
      }
tests:
  - args: ["aab"]
    expected: "aba"
  - args: ["aaab"]
    expected: ""
    label: impossible
  - args: ["a"]
    expected: "a"
    label: single character
  - args: ["aaabb"]
    expected: "ababa"
  - args: ["aa"]
    expected: ""
  - args: ["ccccbbb"]
    expected: "cbcbcbc"
  - args: ["xyyyx"]
    expected: "yxyxy"
  - args: ["aaaabbb"]
    expected: "abababa"
    hidden: true
  - args: ["zzzzzab"]
    expected: ""
    hidden: true
    label: too many of one letter even with helpers
  - args: ["bbbbbbaaaaa"]
    expected: "bababababab"
    hidden: true
time_limit_ms: 4000
---
Given a string `s` of lowercase letters, rearrange its characters so that no two adjacent characters are equal. Return the rearranged string, or the empty string `""` if no such arrangement exists.

The test inputs are chosen so that whenever an arrangement exists it is *unique* (for instance `"aab"` can only become `"aba"`), so any correct algorithm produces the expected output. Your solution should nevertheless work for inputs with many valid answers.

### Examples

| Input | Output | Why |
|---|---|---|
| `"aab"` | `"aba"` | The two `a`s must be separated by the `b` |
| `"aaab"` | `""` | Three `a`s need at least two separators; only one exists |
| `"ccccbbb"` | `"cbcbcbc"` | Four `c`s fill the odd positions, three `b`s the even ones |

### Constraints

- `1 ≤ len(s) ≤ 500`
- `s` contains only lowercase English letters

### Follow-up

The interviewer asks: "Now no two equal characters may be within distance `k` of each other. What changes?" Then: "Can you do it without a heap?"

## Solution

### The naive approach

Generate permutations until one has no adjacent duplicates. Exponential, and it does not even give a fast answer for the impossible case. The first useful observation is the impossibility test: if some character occurs more than `⌈n / 2⌉` times there are not enough other positions to separate its copies.

### The insight

The most frequent remaining character is the one most at risk of being forced next to itself, so place it as early as possible: at every step, emit the character with the most remaining copies that is *not* the one just emitted. If the frequency check passed, this greedy never gets stuck: the character you are holding back can only be the unique most frequent one, and the check guarantees something else is always available to separate it. A max-heap of `(count, char)` supplies "most remaining copies" in `O(log 26)` per step.

### The optimal approach

```python
def reorganize_string(s: str) -> str:
    counts = collections.Counter(s)
    if max(counts.values()) > (len(s) + 1) // 2:
        return ""
    heap = [(-c, ch) for ch, c in counts.items()]
    heapq.heapify(heap)
    out: list[str] = []
    held: tuple[int, str] | None = None
    while heap:
        c, ch = heapq.heappop(heap)
        out.append(ch)
        if held is not None and held[0] < 0:
            heapq.heappush(heap, held)
        held = (c + 1, ch)  # one fewer copy remains; re-enters next round
    return "".join(out)
```

Trace `"aab"`: heap `[(-2,a), (-1,b)]`. Pop `a`, output `a`, hold `(-1,a)`. Pop `b`, output `ab`, push the held `a`, hold `(0,b)`. Pop `a`, output `aba`; the held `b` has no copies and is dropped. Done.

Time `O(n log k)` for `k` distinct characters, which is `O(n)` for a fixed alphabet. Space `O(k)`.

An `O(n)` alternative without a heap: sort characters by frequency, then fill the even indices `0, 2, 4, ...` with the most frequent character first, wrapping to the odd indices `1, 3, 5, ...` when the even ones run out. The frequency check guarantees the most frequent character never wraps onto a position adjacent to its own copies.

### Common mistakes

- Skipping the up-front frequency check and expecting the greedy to detect impossibility; it does, but only after building a partial answer, and the code is messier.
- Pushing the just-used character back immediately, which lets it be popped twice in a row when it is the clear leader.
- Comparing `max count > n // 2` instead of `> (n + 1) // 2`; `"aab"` has `n = 3`, and `2 > 1` would wrongly reject it.

### How to discuss it

Lead with the feasibility bound, then the greedy and why the bound makes it safe. For the distance-`k` follow-up, hold back the last `k - 1` characters instead of one: a queue of held-out entries that re-enter the heap after `k - 1` steps, and the greedy can now fail mid-way (return `""` when the heap is empty but the queue is not), which is the general "rearrange with cooldown" problem, the same structure as Task Scheduler. For "without a heap", give the even-odd slot filling and be precise about why the frequency check makes it correct.
