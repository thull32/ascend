---
slug: monotonic-stack-pattern
title: "Monotonic stack: next greater, nearest smaller, and greedy removal"
description: The one invariant that turns every "next greater element" and "largest rectangle" problem into a linear pass, why it is O(n) when it looks quadratic, and how to pick the stack's direction from the question.
minutes: 34
difficulty: medium
tags: [pattern:monotonic-stack, stack, monotonic-deque, sliding-window, greedy]
problems: [next-greater-element, remove-k-digits, daily-temperatures, largest-rectangle-histogram, sliding-window-maximum]
---
For every day in a list of temperatures, how many days until a warmer one? For every bar in a histogram, how far left and right does its height extend? Delete `k` digits from a number to make it as small as possible. Each of these has an obvious O(n²) answer (for each element, scan until you find what you need) and each has an O(n) answer that uses a stack whose contents are always sorted.

That sorted stack is the *monotonic stack*, and it is the pattern behind a surprising share of "hard" array problems. It is confusable with the plain [stack patterns](/learn/interview-patterns/sequence-patterns/stack-patterns) because the code uses `push` and `pop`, but the reasoning is different: nothing is nested. The invariant is on the *values* the stack holds, and every pop is an answer to a query. [Daily Temperatures](/practice/daily-temperatures) and [Largest Rectangle in Histogram](/practice/largest-rectangle-histogram) are filed under "stack" in the problem list and [Sliding Window Maximum](/practice/sliding-window-maximum) under "sliding window"; all three are canonically solved here.

## The signal

The phrase that selects the pattern is some version of **"for each element, find the nearest element to its left or right that is greater (or smaller)"**. It is often disguised:

- "How many days until a warmer temperature" is *next greater to the right*, reported as a distance.
- "Largest rectangle in a histogram" is *nearest smaller on both sides* of each bar, because those are the walls that stop the bar's rectangle.
- "Sum of subarray minimums" is *nearest smaller on both sides* again, because it tells you how many subarrays each element is the minimum of.
- "Remove `k` digits to get the smallest number" is *greedy removal*: keep the sequence increasing by deleting any earlier element that is larger than the current one, while you still have budget.
- "Maximum of every window of size `k`" is the deque version: the same invariant, plus eviction from the front when an index falls out of the window.

The structural tell is that a brute force would be "for each `i`, scan outward until the condition holds", and the scans overlap. The monotonic stack removes the overlap by *remembering only the candidates that could still be somebody's answer*.

What rules it out: if the query is "next greater in the whole array by value" (not nearest by position), sort. If you need *arbitrary* range minimum queries after preprocessing, that is a sparse table or a segment tree, not a stack. If the sequence changes after you build the answer (updates interleaved with queries), the stack is a one-shot structure and you need a balanced tree.

## The invariant, and why it is linear

Keep a stack of **indices** whose values are monotone from bottom to top. For "next greater to the right", the values decrease from bottom to top. Scan left to right. When element `x` arrives:

1. While the stack is non-empty and the top's value is smaller than `x`, pop it. **That popped index has just found its answer: `x` is the first greater element to its right.** Nothing between them was greater (otherwise it would have popped it earlier), and `x` is greater, so `x` is the nearest.
2. Push `x`'s index. Everything below it is now greater than or equal to `x`, so the invariant holds.

At the end, whatever is still on the stack has no greater element to its right.

Why it is O(n) even though there is a `while` inside a `for`: each index is pushed exactly once and popped at most once. The total number of pops across the entire run is at most `n`, so the inner loop's *total* work is O(n) regardless of how it is distributed. This is the amortised argument from [Amortised analysis](/learn/foundations/complexity/amortized-analysis); say the phrase "each element is pushed and popped at most once" out loud and the interviewer will stop worrying about the nested loop.

```viz
{"type": "array", "algorithm": "monotonic-stack-next-greater", "values": [2, 1, 2, 4, 3, 1, 5]}
```

The direction of the stack is chosen by the question:

| Question | Stack values (bottom to top) | Pop while top is |
|---|---|---|
| Next greater to the right | decreasing | `< x` |
| Next greater or equal | decreasing | `< x` (use `<=` to pop equals, depending on tie rule) |
| Next smaller to the right | increasing | `> x` |
| Previous greater (scan left to right; answer for `x` is the top after popping) | decreasing | `<= x` |
| Previous smaller | increasing | `>= x` |

A single left-to-right pass gives you *both* the previous-X (the top of the stack after popping, at the moment you push) and the next-X (recorded when an index is popped). Most "both sides" problems need only one pass with that observation.

## The template

```python
def next_greater(nums: list[int]) -> list[int]:
    n = len(nums)
    ans = [-1] * n            # -1 = no greater element to the right
    stack = []                # indices; values decreasing from bottom to top
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:
            j = stack.pop()
            ans[j] = x        # or i, or i - j, depending on what is asked
        stack.append(i)
    return ans
```

```javascript
function nextGreater(nums) {
  const n = nums.length;
  const ans = new Array(n).fill(-1);
  const stack = [];                 // indices; values decreasing bottom to top
  for (let i = 0; i < n; i++) {
    const x = nums[i];
    while (stack.length && nums[stack[stack.length - 1]] < x) {
      const j = stack.pop();
      ans[j] = x;
    }
    stack.push(i);
  }
  return ans;
}
```

Store indices, not values. The value is one lookup away, and the index is what you need for distances, widths and window eviction. The three knobs are the comparison in the `while` (direction and tie handling), what you write into `ans[j]` at pop time, and whether you also read `stack[-1]` before pushing to get the previous-X answer for `i`.

## Worked problems

### Daily Temperatures

For each day, return how many days you wait for a strictly warmer temperature, or 0 if none comes. [Daily Temperatures](/practice/daily-temperatures).

The insight: this is next-greater-to-the-right with the answer expressed as `i - j`. The stack holds indices of days still waiting; their temperatures decrease from bottom to top because any day that was warmer than a later day would already have been answered.

```python
def daily_temperatures(t: list[int]) -> list[int]:
    ans = [0] * len(t)
    stack = []
    for i, cur in enumerate(t):
        while stack and t[stack[-1]] < cur:
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans
```

Trace on `t = [73, 74, 75, 71, 69, 72, 76, 73]`:

| i | temp | Pops (index: answer) | Stack after (indices) | Stack temps |
|---|---|---|---|---|
| 0 | 73 | — | `0` | 73 |
| 1 | 74 | 0: 1−0 = 1 | `1` | 74 |
| 2 | 75 | 1: 2−1 = 1 | `2` | 75 |
| 3 | 71 | — | `2 3` | 75 71 |
| 4 | 69 | — | `2 3 4` | 75 71 69 |
| 5 | 72 | 4: 5−4 = 1, then 3: 5−3 = 2 | `2 5` | 75 72 |
| 6 | 76 | 5: 6−5 = 1, then 2: 6−2 = 4 | `6` | 76 |
| 7 | 73 | — | `6 7` | 76 73 |

Indices 6 and 7 remain; their answers stay 0. Result: `[1, 1, 4, 2, 1, 1, 0, 0]`. Step 5 shows the mechanism: 72 answers two waiting days in one arrival, and the order of the pops (69 first, then 71) is exactly the order of the stack. Step 6 shows why the answer for index 2 is 4 and not something smaller: days 3, 4 and 5 were all colder than 75 and were resolved without ever being compared to it.

Time O(n): eight pushes, six pops. Space O(n) for the stack in the worst case (strictly decreasing input never pops).

### Largest Rectangle in Histogram

Given bar heights, return the area of the largest rectangle that fits under the histogram. [Largest Rectangle in Histogram](/practice/largest-rectangle-histogram).

The insight: the best rectangle has some bar as its *limiting height*, and extends left and right until it hits a bar that is strictly shorter. So for each bar you need the nearest shorter bar on each side. An increasing stack gives both in one pass: when bar `i` pops bar `j` (because `h[i] < h[j]`), then `i` is `j`'s right wall and the new top of the stack is `j`'s left wall. Width is `i - left - 1`, or `i` when there is no left wall.

Append a sentinel height of 0 at the end so every bar is eventually popped and measured.

```python
def largest_rectangle(heights: list[int]) -> int:
    best = 0
    stack = []                                  # indices; heights increasing
    for i, h in enumerate(heights + [0]):       # sentinel flushes the stack
        while stack and heights[stack[-1]] > h:
            top = stack.pop()
            height = heights[top]
            left = stack[-1] if stack else -1
            best = max(best, height * (i - left - 1))
        stack.append(i)
    return best
```

Trace on `heights = [2, 1, 5, 6, 2, 3]` with sentinel at `i = 6`:

| i | h | Pops: (index, height, left wall, width, area) | Stack after | `best` |
|---|---|---|---|---|
| 0 | 2 | — | `0` | 0 |
| 1 | 1 | (0, 2, none, 1−(−1)−1 = 1, 2) | `1` | 2 |
| 2 | 5 | — | `1 2` | 2 |
| 3 | 6 | — | `1 2 3` | 2 |
| 4 | 2 | (3, 6, left 2, 4−2−1 = 1, 6); (2, 5, left 1, 4−1−1 = 2, 10) | `1 4` | 10 |
| 5 | 3 | — | `1 4 5` | 10 |
| 6 | 0 | (5, 3, left 4, 6−4−1 = 1, 3); (4, 2, left 1, 6−1−1 = 4, 8); (1, 1, none, 6, 6) | `6` | 10 |

Answer 10: the bars of height 5 and 6 form a 5 × 2 rectangle. The width formula is the part to trace carefully. When bar 2 (height 5) is popped at `i = 4`, its left wall is index 1 (height 1, the new top) and its right wall is index 4 (height 2). Bars strictly between the walls are indices 2 and 3, so width is `4 − 1 − 1 = 2`. When bar 1 (height 1) is popped by the sentinel with an empty stack, there is no left wall, so it spans the entire array: width 6.

The comparison is `>` and not `>=`. With equal heights, the left copy is popped by the right copy with a width that excludes the right copy; the right copy is later popped with the full width because its left wall is *past* the left copy. The final answer is still correct because the rightmost equal bar gets the whole span; it is a common source of confusion when candidates try to prove the algorithm and see the "wrong" width for the earlier bar.

Time O(n), space O(n).

### Remove K Digits

Given a number as a string and an integer `k`, remove exactly `k` digits so that the result is the smallest possible number. Leading zeros are dropped; an empty result is `"0"`. [Remove K Digits](/practice/remove-k-digits).

The insight: the leftmost digit dominates. If a digit is larger than the digit after it, removing it is the best single deletion you can make at that position, because it lowers the most significant place that changes. Keep an increasing stack of digits; when a smaller digit arrives, pop larger ones while budget remains. If budget is left over at the end, the stack is non-decreasing, so remove from the end.

```python
def remove_k_digits(num: str, k: int) -> str:
    stack = []
    for d in num:
        while k and stack and stack[-1] > d:
            stack.pop()
            k -= 1
        stack.append(d)
    if k:
        stack = stack[:-k]            # remaining budget: drop the largest tail
    return "".join(stack).lstrip("0") or "0"
```

Trace on `num = "1432219"`, `k = 3`:

| Digit | Pops (digit, k after) | Stack after | k |
|---|---|---|---|
| 1 | — | `1` | 3 |
| 4 | — | `1 4` | 3 |
| 3 | 4 (k→2) | `1 3` | 2 |
| 2 | 3 (k→1) | `1 2` | 1 |
| 2 | — | `1 2 2` | 1 |
| 1 | 2 (k→0) | `1 2 1` | 0 |
| 9 | — (budget exhausted) | `1 2 1 9` | 0 |

Result `"1219"`. The second 2 is not popped by the 1, because k reached 0 after the first pop; the `while k` guard is doing the work. Two edge traces worth stating aloud:

- `"10200"`, `k = 1`: 1 is popped by 0, stack becomes `0 2 0 0`, `lstrip` gives `"200"`.
- `"10"`, `k = 2`: 1 popped by 0 (k=1), then `stack[:-1]` empties it, and `"" or "0"` returns `"0"`.

Time O(n), space O(n). This is the same invariant as next-greater with a *budget* on the pops, and the leftover-budget step is the part people forget: `"12345"`, `k = 2` never pops, so the answer comes entirely from the tail cut.

## The deque version: sliding window maximum

Return the maximum of every window of `k` consecutive elements. [Sliding Window Maximum](/practice/sliding-window-maximum). The pattern is the decreasing stack with one extra move: the *front* of the structure is evicted when its index leaves the window, so you need pops from both ends, a deque. The front is always the current window's maximum, because anything larger would have popped it and anything older has been evicted.

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [1, 3, -1, -3, 5, 3, 6, 7], "k": 3}
```

```python
from collections import deque

def max_sliding_window(nums: list[int], k: int) -> list[int]:
    dq, out = deque(), []           # indices; values decreasing front to back
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] < x:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()            # index left the window
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out
```

The [monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque) lesson has the proof and the comparison with a heap: the heap is O(n log k) and needs lazy deletion; the deque is O(n) because each index enters and leaves at most once. In JavaScript there is no built-in deque; use an array with a `head` index instead of `shift()`, which is O(n).

## Variations

- **Circular array.** "Next greater element in a circular array": iterate `i` from `0` to `2n − 1`, using `nums[i % n]`, and only push indices from the first pass. The second pass exists purely to pop, so every element sees everything after it, wrapping around.
- **Both walls in one pass.** For "sum of subarray minimums" or histogram-style problems, record the right wall at pop time and the left wall as the top of the stack at push time. Watch the tie rule: use strict on one side and non-strict on the other so equal elements are counted exactly once.
- **Values instead of indices.** When only the values are needed and the input is a stream, push values; you lose distances and window eviction. Under interview conditions, always start with indices; converting later is trivial.
- **A budget on pops.** Remove K Digits, "create maximum number", "most competitive subsequence": the pop loop gains a counter, and the tail cut handles leftover budget.
- **Two-dimensional histogram.** Maximal rectangle in a binary matrix: compute a height array per row (consecutive ones ending at that row) and run the histogram algorithm on each row, O(rows × cols) in total. Recognising that a "matrix" problem is `n` histogram problems is the whole solution.

## Pitfalls

- **Pushing values when you need indices.** You will discover halfway through that you need `i - j` for the distance or `i` for eviction, and rewriting under time pressure is where bugs appear. Push indices from the start.
- **Wrong tie handling.** For "strictly warmer" the pop condition is `<`; if the problem says "greater or equal", it is `<=`. For nearest-smaller-on-both-sides problems, using the same strictness on both sides double counts or misses equal elements.
- **Forgetting the sentinel.** In the histogram problem, without the trailing 0 the last increasing run is never measured. Either append a sentinel or run a second loop that flushes the stack; appending is fewer lines and fewer bugs.
- **Off-by-one in the width.** The width between walls at `left` and `right` is `right − left − 1`, and "no left wall" is `left = −1`, not `0`. Trace one pop by hand in the interview.
- **`shift()` on a JavaScript array in the deque version.** It reallocates the array on every call, making the "O(n)" algorithm O(n · k). Keep a `head` pointer or implement a small ring buffer.
- **Believing the inner `while` makes it O(n²).** It does not, and being unable to explain why is worse than not knowing the pattern. Each index is pushed once and popped at most once; total work is bounded by `2n`.
- **Leaving leftover budget unspent.** In Remove K Digits, a non-decreasing input like `"12345"` never triggers a pop; you must still remove `k` from the tail.

## Exercise

```exercise
id: stock-span
title: Stock span
prompt: |
  Given daily stock prices, return an array `span` where `span[i]` is the
  number of consecutive days ending at day `i` (including day `i`) for which
  the price was less than or equal to `prices[i]`.

  Equivalently, `span[i] = i - j` where `j` is the index of the nearest day
  to the left with a strictly greater price, or `i + 1` if no such day
  exists. Aim for O(n) using a monotonic stack of indices.

  Example: `[100, 80, 60, 70, 60, 75, 85]` → `[1, 1, 1, 2, 1, 4, 6]`.
languages: [python, javascript]
entry: stock_span
starter:
  python: |
    def stock_span(prices):
        # stack of indices whose prices are strictly decreasing
        return []
  javascript: |
    function stock_span(prices) {
      // stack of indices whose prices are strictly decreasing
      return [];
    }
tests:
  - args: [[100, 80, 60, 70, 60, 75, 85]]
    expected: [1, 1, 1, 2, 1, 4, 6]
  - args: [[]]
    expected: []
    label: empty input
  - args: [[5]]
    expected: [1]
  - args: [[1, 2, 3, 4]]
    expected: [1, 2, 3, 4]
    label: strictly rising
  - args: [[4, 3, 2, 1]]
    expected: [1, 1, 1, 1]
    label: strictly falling
  - args: [[3, 3, 3]]
    expected: [1, 2, 3]
    hidden: true
    label: equal prices count towards the span
  - args: [[10, 4, 5, 90, 120, 80]]
    expected: [1, 1, 2, 4, 5, 1]
    hidden: true
hints:
  - "Scan left to right; pop while the price at the top of the stack is less than or equal to the current price."
  - "After popping, the top of the stack (if any) is the nearest strictly greater day to the left; span is `i - top`, or `i + 1` if the stack is empty."
  - "Push the current index after computing its span so the invariant holds for the next day."
```

## Senior signals

- You say "each index is pushed once and popped at most once, so the nested loop is O(n) total" without being asked, and you connect it to amortised analysis.
- You choose increasing versus decreasing by reading the question, and you can state the tie rule (strict or not) and which side it applies to before writing the comparison.
- You store indices, not values, and you can name the three things indices buy you: distances, widths and window eviction.
- You recognise the histogram problem inside "maximal rectangle in a binary matrix" and the next-greater problem inside "days until warmer".
- You know that the deque version of the same invariant replaces a heap for sliding-window maximum, why it is O(n) rather than O(n log k), and that `Array.prototype.shift` would wreck that bound in JavaScript.
- You can explain why a greedy digit removal is optimal: the leftmost position where a digit exceeds its successor is the highest-value place you can lower.

## Check yourself

```quiz
- q: >-
    A monotonic-stack solution has a while loop inside a for loop. Why is the total running time O(n) rather than O(n²)?
  options: ["The while loop runs at most once per iteration", "Each index is pushed exactly once and popped at most once, so all pops together cost at most n", "The stack never holds more than a constant number of elements", "The input is assumed to be sorted"]
  answer: 1
  explanation: >-
    Pops are charged to the element being popped, not to the iteration doing the popping. Each element can be popped only once, so the sum of all inner-loop iterations is bounded by n. The stack can grow to n elements on a monotone input, so the third option is false.
- q: >-
    You need, for each element, the nearest element to its right that is strictly smaller. Which stack do you keep, and when do you pop?
  options: ["Decreasing values; pop while top is less than the new element", "Increasing values; pop while top is greater than the new element", "Decreasing values; pop while top is greater than the new element", "Increasing values; pop while top is less than the new element"]
  answer: 1
  explanation: >-
    A new element that is smaller than the top resolves the top's query, so you pop while top is greater. What remains is increasing from bottom to top. The first option is the next-greater configuration.
- q: >-
    In the histogram algorithm, bar j is popped at index i and the stack top after the pop is index p. What is the width of bar j's rectangle?
  options: ["i - p", "i - p - 1", "i - j", "p - j + 1"]
  answer: 1
  explanation: >-
    p and i are the strictly shorter walls on each side; the rectangle covers the bars strictly between them, which number i - p - 1. If the stack is empty, treat p as -1 so the width is i.
- q: >-
    Remove K Digits on "12345" with k = 2 should return "123". Where does the answer come from?
  options: ["The stack pops 4 and 5 when they arrive", "No pops occur, so the leftover budget removes two digits from the end of the stack", "The lstrip removes the last two digits", "The algorithm returns \"0\" because the budget is unspent"]
  answer: 1
  explanation: >-
    Every digit is larger than the previous, so the pop condition never fires. The final step slices off k digits from the end of a non-decreasing stack, which is the correct greedy choice because the largest digits are at the end.
- q: >-
    Why is the sliding window maximum solved with a deque instead of a plain stack?
  options: ["A stack cannot hold indices", "The window's oldest index must be evicted from the front while the invariant is maintained at the back", "A deque has O(1) random access", "A heap would be faster but is harder to code"]
  answer: 1
  explanation: >-
    The monotone invariant is maintained by popping from the back, exactly as in a stack, but the maximum is read from the front and must be dropped when its index leaves the window. Two-ended access is the only extra requirement. A heap is slower, O(n log k), not faster.
```
