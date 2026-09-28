---
slug: monotonic-stack
title: Monotonic stack
description: The single invariant behind next-greater-element, stock span, sum of subarray minimums and largest rectangle in a histogram, with hand traces of each, the four variants and their tie rules, a proof that the whole thing is O(n), what it costs in a real runtime, and where it hides in compilers and suffix structures.
minutes: 40
difficulty: medium
tags: [stack, monotonic-stack, next-greater-element, histogram, amortized, cartesian-tree]
problems: [daily-temperatures, next-greater-element, largest-rectangle-histogram, remove-k-digits, car-fleet]
---
For each day in a list of temperatures, how many days do you wait until a warmer one? The obvious solution scans forward from each day: O(n²), and for a year of hourly readings (8,760 samples) that is up to 38 million comparisons for a question that should take 8,760. The scan is wasteful because it forgets: when day 5 finds its answer at day 9, it has learned that days 6, 7 and 8 are all colder than day 9, and the scan from day 6 will rediscover that.

A monotonic stack is a stack that remembers exactly the right amount. It holds the indices that are still *waiting* for an answer, arranged so that the answer for several of them can be resolved the moment one new element arrives. It turns a whole family of O(n²) "find the nearest element that is bigger/smaller" problems into O(n), and once you see the invariant you will recognise the family instantly.

## The invariant

For the "next greater element" problem, the stack holds indices whose values are **strictly decreasing from bottom to top**. Every index on the stack is waiting for its next greater element; none has found it yet.

When a new element `x` at index `i` arrives:

1. While the stack is non-empty and the value at the top is less than `x`, pop it. `x` is the next greater element for every index popped, because nothing between that index and `i` was greater (if it had been, the index would already have been popped).
2. Push `i`.

Step 1 preserves the invariant (everything left on the stack is `≥ x`, so pushing `i` keeps the stack decreasing). Step 2 registers `i` as waiting. When the input ends, whatever remains on the stack has no next greater element.

```python
def next_greater_indices(a):
    n = len(a)
    ans = [-1] * n              # -1 = no next greater element
    stack = []                  # indices, values strictly decreasing
    for i in range(n):
        while stack and a[stack[-1]] < a[i]:
            ans[stack.pop()] = i
        stack.append(i)
    return ans
```

Store **indices**, not values. The index gives you the distance (daily temperatures), the width (histogram) and the ability to look the value up; a stack of values can answer "what" but never "where" or "how far".

## A full trace

Daily temperatures `[73, 74, 75, 71, 69, 72, 76, 73]`; the answer is "days until warmer", i.e. `next_greater_index − i`, or 0 if none.

| i | temp | pops (index: temp) and answers | stack after (indices) | stack values |
|---|---|---|---|---|
| 0 | 73 | – | `[0]` | 73 |
| 1 | 74 | pop 0 (73 < 74): ans[0] = 1 | `[1]` | 74 |
| 2 | 75 | pop 1 (74 < 75): ans[1] = 1 | `[2]` | 75 |
| 3 | 71 | – | `[2, 3]` | 75, 71 |
| 4 | 69 | – | `[2, 3, 4]` | 75, 71, 69 |
| 5 | 72 | pop 4 (69 < 72): ans[4] = 1; pop 3 (71 < 72): ans[3] = 2 | `[2, 5]` | 75, 72 |
| 6 | 76 | pop 5 (72 < 76): ans[5] = 1; pop 2 (75 < 76): ans[2] = 4 | `[6]` | 76 |
| 7 | 73 | – | `[6, 7]` | 76, 73 |

End: indices 6 and 7 remain, answer 0. Result `[1, 1, 4, 2, 1, 1, 0, 0]`. Read the last column: the values at the stacked indices are always decreasing, which is the invariant holding. Eight pushes, six pops, fourteen stack operations for eight elements.

```viz
{"type": "array", "algorithm": "monotonic-stack-next-greater", "values": [73, 74, 75, 71, 69, 72, 76, 73], "title": "Next greater element with a decreasing stack"}
```

## Why it is O(n)

The loop body has a `while` inside a `for`, which looks like O(n²). It is not, and the argument is worth giving in full because interviewers ask for it.

Each index is pushed exactly once (at its own iteration). An index can be popped at most once, because once popped it is gone. So the total number of pops over the whole run is at most `n`, and the total number of push and pop operations is at most `2n`. The inner `while` loop's iterations, summed over all outer iterations, are bounded by the total number of pops: at most `n`. Total work O(n), regardless of how uneven the pops are: on a strictly increasing input every iteration pops once (`n` pops spread evenly); on `[n, n−1, …, 2, 1, n+1]` the first `n` iterations pop nothing and the last pops all `n`.

This is amortised analysis with the accounting method: each push deposits one credit, each pop spends it. [Amortised analysis](/learn/foundations/complexity/amortized-analysis) has the general framework; the monotonic stack is its cleanest example after the dynamic array.

## The four variants

"Next greater" is one of four questions, and the stack answers all of them with a change of comparison and, for "previous", a change of *when* you read the answer.

| Question | Stack holds (bottom → top) | Pop while | Answer for the popped index | Answer for the pushed index |
|---|---|---|---|---|
| Next greater | decreasing | `a[top] < a[i]` | `i` | – |
| Next smaller | increasing | `a[top] > a[i]` | `i` | – |
| Previous greater | decreasing | `a[top] <= a[i]` | – | `top` after popping (or none) |
| Previous smaller | increasing | `a[top] >= a[i]` | – | `top` after popping (or none) |

For the "previous" questions the answer for index `i` is whatever is on top *after* the pops: the nearest index to the left that survived, which is by construction the nearest one with a greater (or smaller) value. Both "next" and "previous" answers can be collected in a single pass: when `i` pops `j`, `i` is `j`'s next; after popping, the top is `i`'s previous.

**Strict or non-strict** is decided by the problem's treatment of ties. "Next greater" with `<` treats an equal value as not greater (the equal index stays on the stack). For "previous smaller or equal" you would pop while `a[top] > a[i]`. The wrong choice produces off-by-one areas in the histogram problem, wrong spans in stock span and double counting in sum of subarray minimums; always write the tie case into your test set.

**Circular arrays** ("the next greater element may wrap around"): run the loop for `i` in `0..2n−1` using `a[i mod n]`, pushing only during the first pass. For `[1, 2, 1]`: the first pass leaves `[1, 2]` (indices) with `ans = [2, −1, −1]`; the second pass sees 1, then 2 (which pops index 2: `ans[2] = 2`), then 1: result `[2, −1, 2]`.

## Stock span: previous greater

The span of a stock's price on day `i` is the number of consecutive days ending at `i` with price `≤` today's. That is `i − (index of the previous strictly greater price)`, or `i + 1` if there is none. Prices `[100, 80, 60, 70, 60, 75, 85]`:

| i | price | pops | previous greater | span |
|---|---|---|---|---|
| 0 | 100 | – | none | 1 |
| 1 | 80 | – | 0 | 1 |
| 2 | 60 | – | 1 | 1 |
| 3 | 70 | pop 2 (60 ≤ 70) | 1 | 2 |
| 4 | 60 | – | 3 | 1 |
| 5 | 75 | pop 4 (60), pop 3 (70) | 1 | 4 |
| 6 | 85 | pop 5 (75), pop 1 (80) | 0 | 6 |

Spans `[1, 1, 1, 2, 1, 4, 6]`. The pop condition is `<=` (non-strict) because equal prices count toward the span; that is the tie decision made explicit. This variant is **online**: each day's span is known the moment its price arrives, which is why it suits a streaming feed, whereas "next greater" cannot answer for an index until a later element arrives.

## Sum of subarray minimums: two boundaries and a tie rule

"Sum the minimum of every contiguous subarray." Element `a[i]` is the minimum of every subarray that starts after its previous smaller element and ends before its next smaller element. If there are `L` choices of start and `R` choices of end, `a[i]` contributes `a[i] × L × R`. With equal values, one side must be strict and the other non-strict, so that a subarray with two equal minimums is credited to exactly one of them. Take previous *strictly* smaller on the left and next *smaller-or-equal* on the right, for `a = [3, 1, 2, 4]`:

| i | a[i] | previous strictly smaller | L | next smaller-or-equal | R | contribution |
|---|---|---|---|---|---|---|
| 0 | 3 | none | 1 | index 1 (value 1) | 1 | 3 × 1 × 1 = 3 |
| 1 | 1 | none | 2 | none | 3 | 1 × 2 × 3 = 6 |
| 2 | 2 | index 1 | 1 | none | 2 | 2 × 1 × 2 = 4 |
| 3 | 4 | index 2 | 1 | none | 1 | 4 × 1 × 1 = 4 |

Total 17, which you can confirm by listing all ten subarrays (`3 + 1 + 2 + 4` for the singletons, then `1, 1, 2, 1, 1, 1` for the six longer ones). With both sides strict, `[2, 2]` would credit the 2 twice; with both non-strict, neither would claim it. One pass with an increasing stack computes both boundaries: when `i` pops `j`, `i` is `j`'s "next smaller-or-equal" (pop while `a[top] >= a[i]`); the top after popping is `i`'s "previous strictly smaller".

## Largest rectangle in a histogram

The hard classic. Bars of heights `h[0..n−1]`, width 1 each; find the largest rectangle that fits under them. For each bar `i`, the widest rectangle of height `h[i]` extends left to one past the previous *smaller* bar and right to one before the next *smaller* bar. With `L[i]` and `R[i]` those boundaries, the area is `h[i] × (R[i] − L[i] − 1)`, and the answer is the maximum over `i`.

Both boundaries come from one increasing monotonic stack. When `i` pops `j` (because `h[i] < h[j]`), `i` is `j`'s next smaller; the new top after popping is `j`'s previous smaller. So you can compute `j`'s area at the moment it is popped. A sentinel height of 0 appended at the end pops everything.

```python
def largest_rectangle(h):
    stack = []                    # indices, heights increasing
    best = 0
    for i in range(len(h) + 1):
        cur = h[i] if i < len(h) else 0        # sentinel flushes the stack
        while stack and h[stack[-1]] > cur:    # strict: equal heights stay
            j = stack.pop()
            left = stack[-1] if stack else -1
            best = max(best, h[j] * (i - left - 1))
        stack.append(i)
    return best
```

Trace `h = [2, 1, 5, 6, 2, 3]`:

| i | cur | pops: j, left, area | stack after |
|---|---|---|---|
| 0 | 2 | – | `[0]` |
| 1 | 1 | j=0, left=−1, area 2×(1−(−1)−1)=2 | `[1]` |
| 2 | 5 | – | `[1, 2]` |
| 3 | 6 | – | `[1, 2, 3]` |
| 4 | 2 | j=3, left=2, 6×(4−2−1)=6; j=2, left=1, 5×(4−1−1)=10 | `[1, 4]` |
| 5 | 3 | – | `[1, 4, 5]` |
| 6 | 0 (sentinel) | j=5, left=4, 3×1=3; j=4, left=1, 2×(6−1−1)=8; j=1, left=−1, 1×6=6 | `[6]` |

Best is 10 (bars 5 and 6, height 5, width 2). O(n) time and space; the O(n²) "expand from each bar" solution is what most candidates write first, and moving to this one is the senior step. Ties: with the strict `>` an equal-height bar to the right does not pop, so the left bar's rectangle is computed later with the correct full width when the right one is popped (its `left` boundary is the previous *strictly* smaller bar). Both `>` and `>=` give the correct maximum here; only the intermediate areas differ.

Maximal rectangle in a binary matrix is this problem applied to each row, with heights accumulated downward: O(rows × cols).

## Under the hood: what a pass costs, and where it hides

The algorithm is a stack of integers, so its cost is the language's loop overhead, not the data structure. On CPython a `for` iteration with one comparison and an occasional `append`/`pop` runs in roughly 50–100 ns, so a million elements is on the order of 0.1 s; the same loop in Rust or C++ over a `Vec<u32>` is 1–3 ns per element because the stack lives in L1 cache (a million 4-byte indices is 4 MB at worst, but the stack is short in typical data) and the branch predictor learns the "push, rarely pop" pattern. The memory is at most `n` indices: 8 MB of pointers to boxed ints in a Python list for `n = 10⁶`, 4 MB in a `Vec<u32>`.

Where the pattern appears outside interviews:

- **Compilers.** The operator stack in the shunting-yard algorithm is a monotonic stack over precedence; [Stack applications](/learn/data-structures/stacks-queues/stack-applications) traces it. Every expression parser built by precedence climbing is doing "pop while the top binds at least as tightly".
- **Cartesian trees and range-minimum queries.** The all-nearest-smaller-values pass builds a Cartesian tree (each element's parent is the nearer of its previous and next smaller values) in O(n), which is the first step of the O(n)-space, O(1)-query RMQ used on suffix-array LCP arrays; [Suffix arrays and LCP](/learn/advanced-data-structures/advanced-strings/suffix-arrays-and-lcp) uses it.
- **Streaming analytics.** Stock span and "time since the last higher reading" are online, so a metrics agent can compute them with O(1) amortised work per sample and a stack whose size is the number of readings still waiting for a higher one.
- **Layout engines and computational geometry.** Largest empty rectangle and skyline problems reduce to the histogram algorithm per scanline.

## Trade-offs: monotonic stack against the alternatives

| | Monotonic stack | Brute-force scan | Sparse table (RMQ) | Segment tree |
|---|---|---|---|---|
| Nearest greater/smaller for all i | O(n) | O(n²) | O(n log n) build, then binary search per query | O(n log n) per full answer |
| Online (answers as data arrives) | "Previous" variants yes; "next" answers arrive later | Yes | No (static) | Yes with point updates |
| Updates to the array | Recompute O(n) | None needed | Rebuild | O(log n) |
| Extra space | O(n) worst, often small | O(1) | O(n log n) | O(n) |
| Arbitrary range min/max queries | No | O(range) | O(1) | O(log n) |
| Use when | One pass, nearest-boundary questions | n < ~1,000 | Many static range queries | Queries mixed with updates |

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| A nightly "days since last high" report scales quadratically with history length | Per-row backward scan | One stack pass over the series; store the answer per row |
| Sum-of-subarray-minimum totals are too high on data with repeated values | Both boundaries strict: subarrays with tied minimums counted twice | One side strict, the other non-strict |
| Histogram maximum is wrong only when the tallest bars are at the end | No sentinel: bars left on the stack never have their area computed | Process one extra index with height 0 |
| "Remove k digits" returns a number with leading zeros or removes too few | Leftover `k` not applied after the pass; leading zeros not stripped | After the loop, drop the last `k` remaining digits, then `lstrip("0") or "0"` |
| Stack of values loses the answer's position | Values stored instead of indices | Store indices; look values up |
| Memory spike on a long run of equal values | Strict comparison keeps every equal element waiting (stack grows to n) | Non-strict pop where ties are equivalent, or store `(value, count)` pairs |
| Circular next-greater misses wrap-around answers | Single pass | Iterate `2n` with `i mod n`, pushing only in the first pass |

## Recognising the family

Reach for a monotonic stack when the problem asks, for every element, about the **nearest** element to one side satisfying a comparison, or about a quantity that is determined by such boundaries:

- Daily temperatures, next greater element I/II, stock span.
- Largest rectangle in histogram, maximal rectangle, trapping rain water (stack version: each pop bounds a pool).
- Remove k digits / smallest subsequence: greedily pop larger digits while a smaller one arrives and you still have removals left, keeping the stack increasing. [Remove K Digits](/practice/remove-k-digits).
- Car fleet: sort by position, compute arrival times, and the stack holds fleet leaders; a car that arrives no later than the one ahead merges into it. [Car Fleet](/practice/car-fleet).
- Sum of subarray minimums, traced above.
- Parsing with precedence: the operator stack in shunting-yard.

The tell-tale phrasing: "next", "previous", "nearest", "to the left/right", "until a larger/smaller", "span", "width bounded by smaller elements".

## Interviewer follow-ups

**"The data is a stream. Which of the four variants can you answer online?"** Model answer: previous-greater and previous-smaller, because the answer for `i` is read from the stack top the moment `i` arrives; next-greater answers for an index are produced when a later element pops it, so they arrive with a delay and the stack holds every unanswered index. Common wrong answer: "all four, it is one pass".

**"Now the next greater element must be within a window of k positions."** Model answer: the stack cannot expire old indices from the bottom, so use a deque and pop expired indices from the front, which is the [monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque). Common wrong answer: check `i − top ≤ k` on pop, which leaves expired indices blocking the ones below them.

**"How do you avoid double counting ties in sum of subarray minimums?"** Model answer: make one boundary strict and the other non-strict so each tied subarray is credited to exactly one occurrence, then verify on `[2, 2]` (answer 6). Common wrong answer: both strict, which counts `[2, 2]` for both elements.

**"Can you do the histogram in O(1) extra space?"** Model answer: not in general with this method; the stack is the state, though it is bounded by the length of the longest increasing run rather than `n`, and for bounded heights a divide-and-conquer on the minimum with a range-minimum structure trades space for time. Common wrong answer: "reuse the answer array as the stack", which works for next-greater on permutations but not for arbitrary input.

**"Where does this show up in a real system?"** Model answer: expression parsers (operator precedence), Cartesian-tree construction for O(1) range-minimum queries on suffix-array LCP arrays, and streaming "time since last higher" metrics. Common wrong answer: "only in interviews".

## What mid-level engineers get wrong

- **Storing values instead of indices**, then being unable to compute a distance or a width.
- **Guessing the comparison direction** instead of deriving it from "what is waiting for what".
- **Forgetting the sentinel** in the histogram, so the tallest trailing bars are never scored.
- **Treating ties casually**, producing double counts or truncated spans.
- **Calling the nested loop O(n²)** in the complexity discussion because it has two loops.
- **Applying it to windowed problems**, where the bottom of the stack must expire and a deque is required.

## Exercises

```exercise
id: next-greater
title: Next greater element
prompt: |
  For each element of `nums`, return the value of the next strictly greater
  element to its right, or -1 if there is none. O(n) with a monotonic
  stack of indices; equal values are not "greater".
languages: [python, javascript]
entry: next_greater
starter:
  python: |
    def next_greater(nums):
        # your code here
        return []
  javascript: |
    function next_greater(nums) {
      // your code here
      return [];
    }
tests:
  - args: [[2, 1, 2, 4, 3]]
    expected: [4, 2, 4, -1, -1]
  - args: [[1, 2, 3]]
    expected: [2, 3, -1]
    label: increasing
  - args: [[3, 2, 1]]
    expected: [-1, -1, -1]
    label: decreasing
  - args: [[]]
    expected: []
    label: empty
  - args: [[1, 3, 2, 4, 1]]
    expected: [3, 4, 4, -1, -1]
    hidden: true
  - args: [[2, 2, 2]]
    expected: [-1, -1, -1]
    hidden: true
    label: ties are not greater
hints:
  - "Keep a stack of indices with decreasing values; when `nums[i]` is greater than the value at the top, pop and record `nums[i]` as that index's answer."
  - "Initialise the answer array with -1 so indices left on the stack need no extra handling."
```

```exercise
id: largest-rectangle
title: Largest rectangle in a histogram
prompt: |
  `heights` lists the heights of adjacent bars of width 1. Return the area
  of the largest rectangle that fits entirely under the bars. Use an
  increasing monotonic stack and a sentinel so each bar's area is computed
  when it is popped. O(n).
languages: [python, javascript]
entry: largest_rectangle
starter:
  python: |
    def largest_rectangle(heights):
        # your code here
        return 0
  javascript: |
    function largest_rectangle(heights) {
      // your code here
      return 0;
    }
tests:
  - args: [[2, 1, 5, 6, 2, 3]]
    expected: 10
  - args: [[2, 4]]
    expected: 4
  - args: [[]]
    expected: 0
    label: empty
  - args: [[1, 1, 1, 1]]
    expected: 4
    label: equal heights span the full width
  - args: [[5]]
    expected: 5
  - args: [[6, 2, 5, 4, 5, 1, 6]]
    expected: 12
    hidden: true
  - args: [[3, 3, 3, 2]]
    expected: 9
    hidden: true
hints:
  - "When bar `j` is popped by bar `i`, its right boundary is `i` and its left boundary is the new stack top (or -1); width is `i - left - 1`."
  - "Process one extra index with height 0 at the end to flush the stack."
```

## Senior signals

- You state the invariant ("stack holds indices whose values are decreasing; each is waiting for its next greater") before writing the loop, and you store indices.
- You give the push-once/pop-once argument for O(n) without being asked, and can show the two extreme inputs where the pops are evenly spread or all at once.
- You know the four variants, that "previous" answers are read from the top after popping, and which variants are online.
- You decide strict vs non-strict comparison from the problem's tie semantics, test the tie case, and can explain the one-strict-one-non-strict rule for counting problems.
- You solve the histogram in O(n) and can explain the sentinel and the width formula.
- You recognise the family from phrasing ("nearest", "until a larger", "span"), name two or three members, and know it becomes a deque when the window must expire.

## Check yourself

```quiz
- q: >-
    A monotonic stack algorithm has a while loop nested inside a for loop. Why is it O(n) rather than O(n²)?
  options: ["The inner loop only compares values, so its cost is not counted", "The stack never holds more than a constant number of indices", "Each index is pushed once and popped at most once overall", "The while loop pops at most one index per outer iteration"]
  answer: 2
  explanation: >-
    The inner loop's iterations are pops. An index can only be popped after being pushed and can never be pushed again, so total while-loop iterations across the whole run are bounded by n. A single iteration can pop many indices, which is why "at most one pop per iteration" is wrong. This is amortised analysis: uneven per-iteration cost, linear total.
- q: >-
    For "next greater element" the stack must hold values that are (bottom to top):
  options: ["Unordered, since each index is only compared with the top", "Decreasing, so the top is the smallest value still waiting", "Increasing, so each pop yields the next greater element", "Increasing, so the top is the largest value still waiting"]
  answer: 1
  explanation: >-
    Every stacked index is still waiting for a greater element. If a larger value were below a smaller one, the smaller one would have popped the larger when it arrived, contradiction; so the stack is decreasing. An increasing stack answers the next-smaller question instead.
- q: >-
    In stock span, the span counts consecutive earlier days with price less than OR EQUAL to today's. Which pop condition is correct while scanning for the previous greater price?
  options: ["Pop while price[top] > price[i], so the stack stays increasing", "Pop while price[top] >= price[i], so ties end the span", "Pop while price[top] < price[i], so ties stay as boundaries", "Pop while price[top] <= price[i], so ties join the span"]
  answer: 3
  explanation: >-
    Equal prices count toward the span, so they must be popped (they are not a boundary). Using strict `<` would stop at an equal price and undercount the span. Tie handling is a deliberate choice, not a default.
- q: >-
    In the histogram algorithm, bar j is popped when bar i arrives with a smaller height. The width of j's rectangle is:
  options: ["j − left, where left is the new stack top after popping j", "i − left − 1, where left is the stack top after popping j", "i − left, where left is the new stack top after popping j", "i − j, where j is the bar most recently popped from the stack"]
  answer: 1
  explanation: >-
    The rectangle of height h[j] extends from one past the previous smaller bar (left, or −1 if the stack is empty) to one before the next smaller bar (i). Both boundaries are exclusive, giving i − left − 1 bars; i − left counts one boundary bar too many, and i − j ignores the taller bars to j's left that were popped earlier.
- q: >-
    Sum of subarray minimums over [2, 2] should be 6 (subarrays [2], [2], [2, 2]). Computing each element's contribution with previous-smaller and next-smaller boundaries that are both strict gives:
  options: ["8, because the subarray [2, 2] is credited to both elements", "6, because strict boundaries stop at the equal neighbour", "2, because only the first occurrence of a value is counted", "4, because the subarray [2, 2] is credited to neither element"]
  answer: 0
  explanation: >-
    With both boundaries strict, neither 2 sees the other as a boundary, so each claims a span of 2 subarrays: 2 × 1 × 2 + 2 × 2 × 1 = 8, counting [2, 2] twice. Making one side non-strict credits it to exactly one element and gives 6; both non-strict gives 4.
- q: >-
    Which problem is NOT naturally a monotonic stack problem?
  options: ["Sliding window maximum of size k", "Sum of minimums over all subarrays", "Daily temperatures (wait for warmer)", "Largest rectangle in a histogram"]
  answer: 0
  explanation: >-
    Sliding window maximum needs to discard elements that leave the window from the front while maintaining order at the back, which requires a deque; the monotonic deque lesson covers it. The other three ask about nearest greater/smaller boundaries.
```
