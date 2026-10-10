---
slug: monotonic-stack-pattern
title: "Monotonic stack: next greater, nearest smaller, and greedy removal"
description: The one invariant that turns every "next greater element" and "largest rectangle" problem into a linear pass, the exact 2n bound on its work, how to pick direction and tie rule from the question, Daily Temperatures with ties, circular Next Greater, Largest Rectangle with equal bars and Remove K Digits traced step by step, and the deque version with its JavaScript trap.
minutes: 45
difficulty: medium
tags: [pattern:monotonic-stack, stack, monotonic-deque, sliding-window, greedy]
problems: [next-greater-element, remove-k-digits, daily-temperatures, largest-rectangle-histogram, sliding-window-maximum]
---
For every day in a list of temperatures, how many days until a warmer one? For every bar in a histogram, how far left and right does its height extend? Delete `k` digits from a number to make it as small as possible. Each has an obvious O(n²) answer (for each element, scan outward until you find what you need), and for `n = 10⁵` that brute force is up to 5 × 10⁹ comparisons. Each also has an O(n) answer built on a stack whose contents are always sorted.

That sorted stack is the *monotonic stack*. The code uses `push` and `pop` like the [stack patterns](/learn/interview-patterns/sequence-patterns/stack-patterns), but nothing is nested: the invariant is on the *values* the stack holds, and every pop answers a query. The data-structure lessons, [Monotonic stack](/learn/data-structures/stacks-queues/monotonic-stack) and [Monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque), trace the classic inputs and cover stock span, subarray minimums and time-based windows. This lesson is about recognising the pattern when the statement hides it, choosing the direction and the tie rule without trial and error, and handling the follow-ups that change it.

## The signal

The phrase that selects the pattern is some version of **"for each element, the nearest element to its left or right that is greater (or smaller)"**. It is usually disguised:

- "How many days until a warmer temperature": next greater to the right, reported as a distance.
- "Largest rectangle in a histogram": nearest *smaller* on both sides of each bar, because those bars are the walls.
- "Sum of subarray minimums": nearest smaller on both sides, which counts the subarrays in which each element is the minimum.
- "Remove `k` digits to make the smallest number", "most competitive subsequence": greedy removal, which is a monotonic stack with a budget on pops.
- "Maximum of every window of size `k`": the same invariant in a deque, with eviction from the front.

The structural tell: the brute force is "for each `i`, scan outward until the condition holds", and the scans overlap. The stack removes the overlap by remembering only the candidates that could still be somebody's answer.

The near-misses:

| Statement says | Pattern | Why the monotonic stack is wrong |
|---|---|---|
| "Range maximum for each of `q` arbitrary queries `[l, r]`" | [Sparse table](/learn/advanced-data-structures/range-queries/sparse-tables-and-sqrt-decomposition) | Queries are not "nearest from each element"; O(1) per query after O(n log n) build |
| "The same, with point updates between queries" | [Segment tree](/learn/advanced-data-structures/range-queries/segment-trees) | The stack is a one-shot pass; it cannot absorb an update without recomputing |
| "Smallest element greater than `x` anywhere in the array" | Sort and binary search, or a balanced BST | "Greater by value", not "nearest by position" |
| "Trapping rain water" | [Two pointers](/learn/interview-patterns/array-patterns/two-pointers) (a stack also works) | Two pointers solve it in O(1) space; the stack version is O(n) space |
| "Maximum of each window" | Monotonic **deque** | The maximum must leave from the front when it ages out |
| "Longest subarray with `max − min ≤ limit`" | [Sliding window](/learn/interview-patterns/array-patterns/sliding-window) with two monotonic deques | The window's left edge moves by the constraint, not by a fixed `k` |

## The invariant, and why it is linear

Keep a stack of **indices** whose values are monotone from bottom to top. For next greater to the right, values never increase from bottom to top. Scan left to right; when `x` arrives at index `i`:

1. While the stack is non-empty and the top's value is smaller than `x`, pop it. **The popped index `j` has found its answer: `x` is the nearest greater element to its right.** Every index between `j` and `i` was pushed after `j`; each one either is still above `j` on the stack or was popped by something that arrived before `i`. Either way it is not greater than `nums[j]` (a greater one would have popped `j`), so nothing between them qualifies, and `x` does.
2. Push `i`. Everything below it is now at least `x`, so the values still never increase upwards.

At the end, indices still on the stack have no greater element to their right.

**The exact bound.** Each index is pushed once, so there are `n` pushes. Each pop removes an index pushed earlier, so there are at most `n` pops. Each evaluation of the `while` condition either pops (at most `n` times in total) or ends that iteration's loop (once per `i`, `n` times), so there are at most `2n` comparisons. The nested loop is O(n) with a constant you can state; this is the potential-function argument from [Amortised analysis](/learn/foundations/complexity/amortized-analysis) with the stack height as the potential.

```viz
{"type": "array", "algorithm": "monotonic-stack-next-greater", "values": [2, 1, 2, 4, 3, 1, 5], "title": "Next greater element with a stack of indices", "caption": "Values on the stack never increase upwards. Each arrival pops every smaller value, and each popped index has found its answer; an equal value does not pop. Every index is pushed once and popped at most once."}
```

The direction and the comparison come from the question:

| Question | Stack values, bottom to top | Pop while top is | Answer recorded |
|---|---|---|---|
| Next greater to the right | non-increasing | `< x` | for the popped index |
| Next greater **or equal** | strictly decreasing | `<= x` | for the popped index |
| Next smaller to the right | non-decreasing | `> x` | for the popped index |
| Previous greater | strictly decreasing | `<= x` | for `x`: the top after popping |
| Previous smaller | strictly increasing | `>= x` | for `x`: the top after popping |

One left-to-right pass gives both kinds of answer: the *next* answer for each popped index, and the *previous* answer for `x` (the top of the stack after popping, before pushing). Most "both walls" problems need one pass.

## The template

```python
def next_greater(nums):
    ans = [-1] * len(nums)    # -1: no greater element to the right
    stack = []                # indices; values never increase from bottom to top
    for i, x in enumerate(nums):
        while stack and nums[stack[-1]] < x:   # the comparison is the tie rule
            j = stack.pop()
            ans[j] = x        # or i, or i - j: what is asked for
        stack.append(i)       # read stack[-1] BEFORE this line for "previous greater or equal"
    return ans
```

```javascript
function nextGreater(nums) {
  const ans = new Array(nums.length).fill(-1);
  const stack = [];                       // indices
  for (let i = 0; i < nums.length; i++) {
    const x = nums[i];
    while (stack.length && nums[stack[stack.length - 1]] < x) {
      ans[stack.pop()] = x;
    }
    stack.push(i);
  }
  return ans;
}
```

Store indices, not values: the value is one lookup away, and the index is what distances, widths and window eviction need. The three knobs are the comparison (direction and tie rule), what you write at pop time, and whether you read the top before pushing.

## Worked problems

### Daily Temperatures, with a tie

[Daily Temperatures](/practice/daily-temperatures): for each day, the number of days until a *strictly* warmer one, or 0. Next greater to the right, reported as `i − j`.

```python
def daily_temperatures(t):
    ans = [0] * len(t)
    stack = []
    for i, cur in enumerate(t):
        while stack and t[stack[-1]] < cur:    # strictly warmer
            j = stack.pop()
            ans[j] = i - j
        stack.append(i)
    return ans
```

Trace `t = [34, 38, 34, 34, 36, 40, 28]`:

| `i` | temp | Pops (index: answer) | Stack after (indices) | Temps on stack |
|---|---|---|---|---|
| 0 | 34 | | `0` | 34 |
| 1 | 38 | 0: 1 | `1` | 38 |
| 2 | 34 | | `1 2` | 38 34 |
| 3 | 34 | none: 34 is not warmer than 34 | `1 2 3` | 38 34 34 |
| 4 | 36 | 3: 1, then 2: 2 | `1 4` | 38 36 |
| 5 | 40 | 4: 1, then 1: 4 | `5` | 40 |
| 6 | 28 | | `5 6` | 40 28 |

Result `[1, 4, 2, 1, 1, 0, 0]`, with 9 comparisons against the `2n = 14` bound. Row 3 is the tie: the second 34 does not answer the first. Change the comparison to `<=` and the second 34 pops index 2, which returns `[1, 4, 1, 1, 1, 0, 0]`, claiming 34 is warmer than 34. Row 5 shows why index 1's answer is 4: days 2 to 4 were all colder than 38 and were resolved without ever being compared with it.

### Next Greater Element, circular

[Next Greater Element](/practice/next-greater-element) asks for the first strictly larger value to the right, or −1; its follow-up makes the array circular, so the search wraps past the end. Run `i` from `0` to `2n − 1` over `nums[i % n]`, and push only during the first pass. The second pass exists to pop.

```python
def next_greater_circular(nums):
    n = len(nums)
    ans = [-1] * n
    stack = []
    for i in range(2 * n):
        x = nums[i % n]
        while stack and nums[stack[-1]] < x:
            ans[stack.pop()] = x
        if i < n:
            stack.append(i)          # pushing in the second pass would duplicate indices
    return ans
```

Trace `nums = [3, 8, 4, 1, 2]`:

| `i` | index `i % n` | `x` | Pops (index → answer) | Stack after |
|---|---|---|---|---|
| 0 | 0 | 3 | | `0` |
| 1 | 1 | 8 | 0 → 8 | `1` |
| 2 | 2 | 4 | | `1 2` |
| 3 | 3 | 1 | | `1 2 3` |
| 4 | 4 | 2 | 3 → 2 | `1 2 4` |
| 5 | 0 | 3 | 4 → 3 | `1 2` |
| 6 | 1 | 8 | 2 → 8 | `1` |
| 7–9 | 2, 3, 4 | 4, 1, 2 | | `1` |

Result `[8, −1, 8, 2, 3]`. Index 4 (value 2) and index 2 (value 4) found their answers only after wrapping. Index 1 holds the maximum and stays on the stack, which is correct: nothing in a circle is greater than the maximum. Time O(n): `n` pushes, at most `n` pops, `2n` outer iterations.

### Largest Rectangle in Histogram, with equal bars

[Largest Rectangle in Histogram](/practice/largest-rectangle-histogram): the best rectangle has some bar as its limiting height and extends until a strictly shorter bar on each side. Keep an increasing stack. When bar `i` pops bar `j`, `i` is `j`'s right wall and the new top is its left wall, so the width is `i − left − 1` (with `left = −1` for an empty stack). A trailing sentinel height of 0 flushes every bar.

```python
def largest_rectangle(heights):
    best = 0
    stack = []                                   # indices; heights increasing
    for i, h in enumerate(heights + [0]):        # sentinel pops everything left
        while stack and heights[stack[-1]] > h:
            top = stack.pop()
            left = stack[-1] if stack else -1
            best = max(best, heights[top] * (i - left - 1))
        stack.append(i)
    return best
```

Trace `heights = [3, 1, 3, 3, 2, 4]`; the classic `[2, 1, 5, 6, 2, 3]` is traced in [Monotonic stack](/learn/data-structures/stacks-queues/monotonic-stack). This input has two equal bars:

| `i` | `h` | Pops: (index, height, left wall, width, area) | Stack after | `best` |
|---|---|---|---|---|
| 0 | 3 | | `0` | 0 |
| 1 | 1 | (0, 3, −1, 1, 3) | `1` | 3 |
| 2 | 3 | | `1 2` | 3 |
| 3 | 3 | none: `3 > 3` is false | `1 2 3` | 3 |
| 4 | 2 | (3, 3, left 2, 1, 3); (2, 3, left 1, 2, 6) | `1 4` | 6 |
| 5 | 4 | | `1 4 5` | 6 |
| 6 | 0 | (5, 4, left 4, 1, 4); (4, 2, left 1, 4, **8**); (1, 1, −1, 6, 6) | `6` | 8 |

Answer 8: height 2 across indices 2–5. The equal bars show the tie behaviour. With `>`, equal heights stack up; the right copy (index 3) is popped first with width 1, because its "left wall" is the equal bar at index 2, which is not shorter. The left copy is popped next and gets the true width 2. One of each run of equal bars always gets the full width, so the maximum is right even though an intermediate width looks wrong; with `>=`, the roles swap and the answer is equally correct. Without the sentinel, the input `[1, 2, 3, 4, 5]` never pops and returns 0 instead of 9.

### Remove K Digits: a budget on pops

[Remove K Digits](/practice/remove-k-digits): remove exactly `k` digits to make the smallest number, without leading zeros (empty means `"0"`). The leftmost digit that exceeds its successor is the highest-value place you can lower, so removing it is the best single deletion. Keep a non-decreasing stack and pop while budget remains.

```python
def remove_k_digits(num, k):
    stack = []
    for d in num:
        while k and stack and stack[-1] > d:   # the budget guards the pop
            stack.pop()
            k -= 1
        stack.append(d)
    if k:
        stack = stack[:-k]                     # leftover budget: cut the largest tail
    return "".join(stack).lstrip("0") or "0"
```

Trace `num = "4205123"`, `k = 3`:

| Digit | Pops (k after) | Stack after | `k` |
|---|---|---|---|
| 4 | | `4` | 3 |
| 2 | 4 (2) | `2` | 2 |
| 0 | 2 (1) | `0` | 1 |
| 5 | | `0 5` | 1 |
| 1 | 5 (0) | `0 1` | 0 |
| 2 | budget spent | `0 1 2` | 0 |
| 3 | | `0 1 2 3` | 0 |

`"0123"` becomes `"123"` after stripping. Two edges to say aloud: `"12345"` with `k = 2` never pops, so the whole answer comes from the tail cut (`"123"`); `"10"` with `k = 2` empties the stack and must return `"0"`, not `""`.

### The deque version: Sliding Window Maximum

[Sliding Window Maximum](/practice/sliding-window-maximum): the decreasing stack plus one move, evicting the front when its index leaves the window. The front is always the window's maximum: anything larger would have popped it, and anything older has been evicted.

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [9, 4, 7, 2, 6, 1, 3, 8], "k": 3, "title": "Sliding window maximum: pop smaller values from the back, expire old indices from the front", "caption": "Window size 3. The deque's values stay decreasing, so its front is each window's maximum. 9 and then 7 leave from the front when their indices slide out."}
```

```python
from collections import deque

def max_sliding_window(nums, k):
    dq, out = deque(), []            # indices; values decreasing front to back
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] < x:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()             # the front index has left the window
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out
```

The traces, the heap comparison and time-based windows are in [Monotonic deque](/learn/data-structures/stacks-queues/monotonic-deque). The interview trap is JavaScript, covered under "Under the hood".

## Variants

| Variant | What changes in the template | Complexity |
|---|---|---|
| **Circular array** | Iterate `2n` times over `i % n`, push only when `i < n` | O(n) |
| **Previous greater / smaller** | Read the top after popping, before pushing | O(n) |
| **Both walls, counting subarrays** | Strict comparison on one side, non-strict on the other, so each run of equal values is counted once | O(n) |
| **Budget on pops** (Remove K Digits, most competitive subsequence) | `while k and …`; cut the tail with leftover budget | O(n) |
| **Maximal rectangle of 1s in a matrix** | Build a height array per row, run the histogram per row | O(rows × cols) |
| **132 pattern** | Scan right to left with a decreasing stack; the last popped value is the best "2" | O(n) |
| **Window maximum** | Deque; evict the front by index | O(n) |
| **Online stock span** | Store `(price, span)` pairs so a popped entry's span is added to the new one | O(1) amortised per call |

## Complexity, derived

At most `n` pushes, `n` pops and `2n` comparisons, as argued above, so O(n) time. Space is the maximum stack height, which depends on the data far more than on `n`. Measured on CPython 3.14 for next greater over 10⁶ elements: on random floats the stack never exceeded 37 entries; on a descending input it held all 10⁶ indices (nothing ever pops); on an ascending input it never held more than one. The time barely moved with the shape: 60 ms on random data, 42 ms descending, 45 ms ascending, and 16 ms for the random case in Node 24. The brute force on a descending input of only 20,000 elements took 2.2 s in CPython, which extrapolates to over an hour for 10⁶.

| Approach for "nearest greater for every element" | Time | Extra space | Online | Handles updates | Answers arbitrary ranges |
|---|---|---|---|---|---|
| Brute-force scan | O(n²) | O(1) | yes | trivially | O(range) each |
| Monotonic stack | O(n), at most 2n comparisons | O(n) worst, often tiny | previous-X yes; next-X answers arrive late | no, recompute | no |
| Sparse table plus binary search | O(n log n) build, O(log n) each | O(n log n) | no | no | yes, O(1) max |
| Segment tree plus descent | O(n log n) | O(n) | yes | O(log n) | yes, O(log n) |

## Under the hood

### What the stack holds on real data

The stack is the set of indices still waiting for an answer, so its size is a property of the input's shape. On a random permutation, the waiting indices at any moment are the prefix's "records seen from the right", about `ln n` of them on average, which is why 37 was the peak over a million random values. On a monotone feed in the wrong direction, nothing ever resolves and every index waits. In Python each waiting index is an 8-byte list slot pointing to an `int` object (28 bytes for values above 256, which are not cached), so a million waiting indices is about 36 MB; V8 keeps small integers unboxed in a packed array.

### JavaScript has no deque, and `shift()` is O(n)

`Array.prototype.shift` moves every remaining element down one slot unless V8 can trim the front of the backing store in place, which it does not do reliably for large arrays. Measured in Node 24 on a decreasing input of 2 × 10⁵ values with `k = 5 × 10⁴`, which keeps the deque full: 313 ms with `shift()` against 2.3 ms with a preallocated `Int32Array` and `head`/`tail` indices. On random data the deque stays short and the two were 5 ms and 3 ms, so the bug hides until the adversarial test. Python's `collections.deque` is a linked list of fixed-size blocks with O(1) `popleft`; never use `list.pop(0)` for the same job.

### Where it runs outside interviews

Precedence-climbing parsers pop operators while the top binds at least as tightly, a monotonic stack over precedence. The all-nearest-smaller-values pass builds a Cartesian tree in O(n), the first step of O(1)-query range-minimum structures over suffix-array LCP arrays ([Suffix arrays and LCP](/learn/advanced-data-structures/advanced-strings/suffix-arrays-and-lcp)). Metrics agents compute "time since the last higher reading" online with a stack of waiting samples.

## Failure modes

**"Warmer" answered by an equal value.** *Symptom:* Daily Temperatures returns 1 for a day followed by the same temperature. *Diagnosis:* `<=` in the pop condition, so equal values resolve each other. *Fix:* read the tie rule from the statement ("strictly warmer" is `<`), and trace an input with a repeated value before running.

**The histogram misses the best rectangle.** *Symptom:* `[1, 2, 3, 4, 5]` returns 0; any input ending in an increasing run is wrong. *Diagnosis:* no sentinel, so bars still on the stack at the end are never measured. *Fix:* append a 0 height, or flush the stack after the loop with `i = n`.

**Rectangles that are too wide.** *Symptom:* areas larger than any real rectangle. *Diagnosis:* width computed as `i − top` or `i − left` instead of `i − left − 1`, or "no left wall" taken as 0 instead of −1. *Fix:* the walls are exclusive; trace one pop by hand.

**A sliding-window job that times out only on some inputs.** *Symptom:* a JavaScript window-maximum passes random tests and times out on a sorted one. *Diagnosis:* `shift()` on a long array, 136× slower in the measurement above. *Fix:* a head index or a ring buffer.

**Memory grows during a downtrend.** *Symptom:* a service that computes "next higher price" for every tick grows its heap steadily through a falling market and releases it in one burst when the price recovers. *Diagnosis:* a decreasing feed never pops, so the stack holds every tick of the downtrend. *Fix:* bound it by time (expire entries older than the horizon you report on, turning the stack into a deque), or report "no higher price within the window" explicitly.

## Interviewer follow-ups

**"Make it circular."** Model answer: iterate `2n` times over `i % n` and push only in the first pass; still at most `n` pushes and `n` pops, O(n). Common wrong answer: concatenate the array with itself and push everything, which doubles memory and produces duplicate answers that must be reconciled.

**"Give me the previous smaller element instead."** Model answer: same single pass with an increasing stack; pop while the top is `>= x`, then the top (if any) is the previous strictly smaller element for `x`. Nothing else changes. Common wrong answer: reverse the array and rerun next smaller, which works but shows the candidate does not see that one pass yields both directions.

**"Now answer arbitrary range-maximum queries."** Model answer: the pattern changes; a sparse table gives O(1) queries after an O(n log n) build if the array is static, and a segment tree gives O(log n) queries and updates. Common wrong answer: rerun the stack per query, O(n) each.

**"Maximal rectangle of 1s in a binary matrix."** Model answer: for each row, height[c] is the number of consecutive 1s ending at that row in column c; run the histogram algorithm on each row's heights. O(rows × cols) total. Common wrong answer: enumerate corners, O(rows² × cols²).

**"Prove the digit removal is optimal."** Model answer: two results of the same length compare at their first differing digit, and everything after it is irrelevant. When a kept digit is larger than the digit that follows it and budget remains, deleting it makes that position smaller than in any result that keeps it, so the deletion is safe; the stack takes the leftmost such descent first. Once no descent is left, the kept digits are non-decreasing and deleting from the end removes the largest ones. Common wrong answer: "remove the k largest digits", which turns `"4205123"` with `k = 3` into `"2012"` instead of `"123"`.

## What mid-level engineers get wrong

- **Pushing values instead of indices.** Consequence: halfway through they need `i − j` or eviction by position and rewrite under time pressure.
- **Picking the tie rule by trial and error.** Consequence: a solution that passes samples without repeated values and fails the hidden ones.
- **Believing the inner `while` makes it O(n²).** Consequence: they abandon a correct solution, or cannot defend it; the answer is "at most `n` pops in total, `2n` comparisons".
- **Forgetting the sentinel or the leftover budget.** Consequence: increasing tails are never measured, and non-decreasing inputs to Remove K Digits return the original number.
- **`shift()` as a deque in JavaScript.** Consequence: O(nk) on adversarial inputs.
- **Reaching for the stack on range queries.** Consequence: O(n) per query where a sparse table answers in O(1).

## Exercises

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

```exercise
id: next-greater-circular
title: Next greater element in a circular array
prompt: |
  `nums` is circular: the element after the last is the first. For each
  index, return the first value strictly greater than `nums[i]` found by
  walking forward (wrapping around), or `-1` if there is none. Values are
  non-negative.

  Example: `[3, 8, 4, 1, 2]` → `[8, -1, 8, 2, 3]`.

  Aim for O(n) time with one monotonic stack of indices and no copy of the
  array.
languages: [python, javascript]
entry: next_greater_circular
starter:
  python: |
    def next_greater_circular(nums):
        # iterate i over 0 .. 2n - 1 using nums[i % n]
        return []
  javascript: |
    function next_greater_circular(nums) {
      // iterate i over 0 .. 2n - 1 using nums[i % n]
      return [];
    }
tests:
  - args: [[1, 2, 1]]
    expected: [2, -1, 2]
  - args: [[3, 8, 4, 1, 2]]
    expected: [8, -1, 8, 2, 3]
  - args: [[]]
    expected: []
    label: empty input
  - args: [[5]]
    expected: [-1]
    label: single element never beats itself
  - args: [[2, 2, 2]]
    expected: [-1, -1, -1]
    label: equal is not greater
  - args: [[5, 4, 3, 2, 1]]
    expected: [-1, 5, 5, 5, 5]
    hidden: true
    label: every answer wraps
  - args: [[1, 5, 3, 6, 8]]
    expected: [5, 6, 6, 8, -1]
    hidden: true
  - args: [[0, 0, 1]]
    expected: [1, 1, -1]
    hidden: true
hints:
  - "Walk i from 0 to 2n - 1 and read x = nums[i % n], so every element sees everything after it, wrapping once."
  - "Pop while the value at the top index is strictly less than x, recording x as the popped index's answer."
  - "Push i only while i < n: the second lap exists to answer waiting indices, not to add new ones."
```

## Senior signals

- You say "at most `n` pops in total, so at most `2n` comparisons" before the interviewer asks about the nested loop, and you can name the potential function.
- You choose **direction and tie rule** from the wording ("strictly warmer", "greater or equal") and state which side of a two-wall problem is strict.
- You store **indices** and can name what they buy: distances, widths, eviction.
- You see the histogram inside "maximal rectangle in a matrix", next greater inside "days until warmer", and a budgeted pop inside "remove k digits".
- You know the stack's size is a property of the **data**: tiny on random input, all of it on a monotone feed, and you plan memory for the adversarial shape.
- You know the deque version replaces a heap for window maxima, and that `shift()` destroys its bound in JavaScript.
- You know where the pattern **stops**: arbitrary range queries and updates need a sparse table or a segment tree.

## Check yourself

```quiz
- q: >-
    A monotonic-stack pass over n elements has a while loop inside a for loop. What is the tightest bound on the number of while-condition comparisons?
  options: ["About n log n, because pops shrink the stack geometrically", "At most 2n, since each check pops or ends that iteration's loop", "About n squared over 2 in the worst case of a descending input", "At most n, because each element is compared exactly once"]
  answer: 1
  explanation: >-
    Every check either pops, which happens at most n times over the whole run because each index is pushed once, or fails and ends the loop, which happens once per element. A descending input never pops, so it does n failing checks, not a quadratic number; a single element can be compared several times, so exactly once per element is wrong.
- q: >-
    Daily Temperatures asks for the wait until a strictly warmer day. The input has two consecutive days at 34. Which pop condition is correct, and what does the other one return for the first 34?
  options: ["Either condition works, since equal days are resolved later anyway", "Pop while top is at most current; the other answers 1 for the first 34", "Pop while top is at most current; the other answers 0 for the first 34", "Pop while top is below current; the other answers 1 for the first 34"]
  answer: 3
  explanation: >-
    Strictly warmer means an equal temperature must not resolve a waiting day, so the condition is top < current. With <=, the second 34 pops the first and records a wait of 1, claiming 34 is warmer than 34; in the traced input that changes the answer from 2 to 1.
- q: >-
    In the circular next-greater algorithm you iterate i from 0 to 2n - 1. Why are indices pushed only while i < n?
  options: ["The maximum element must be popped before the second lap starts", "Pushing in the second lap changes the stack from decreasing to increasing", "The second lap reads values past the end of the array otherwise", "Pushing in the second lap would put each index on the stack twice"]
  answer: 3
  explanation: >-
    The second lap exists so that waiting indices can see the elements before them, wrapping once. Pushing again would add a second copy of every index, and the copies would record answers from the third lap's point of view or overwrite correct ones. The modulo keeps reads in range, and the maximum correctly stays on the stack with answer -1.
- q: >-
    Heights [3, 1, 3, 3, 2, 4] with the pop condition heights[top] > h. When index 4 (height 2) arrives, the right 3 (index 3) is popped with width 1. Is the algorithm wrong?
  options: ["Yes, and switching to >= is needed to measure the width 2", "No, index 2 is popped next with its left wall at 1 and width 2", "No, because the answer comes from the height-1 bar anyway", "Yes, the equal bar should have stopped the stack from growing"]
  answer: 1
  explanation: >-
    With a strict comparison equal bars stack up, so the right copy's recorded left wall is the equal bar and its width is understated. The left copy, popped immediately after, sees the true left wall at index 1 and gets width 2 (area 6). One bar of each equal run always gets the full width, so the maximum, 8, is correct; with >= the roles swap and it is equally correct.
- q: >-
    A JavaScript sliding-window-maximum passes random tests but times out on a long sorted-descending input. What is the most likely cause?
  options: ["The comparison should be <= so that equal values are evicted", "V8 falls back to dictionary mode for arrays of indices", "shift() moves every element, and the deque is full on this input", "Descending input makes the monotonic deque pop every element"]
  answer: 2
  explanation: >-
    On a descending input nothing is popped from the back, so the deque holds k indices and each shift() copies all of them, O(nk) overall; measured at 313 ms against 2.3 ms with a head index. On random data the deque stays short, which hides the problem. A head index or ring buffer restores O(n).
- q: >-
    An interviewer asks for the maximum over q arbitrary ranges [l, r] of a static array. What do you reach for?
  options: ["A sparse table, O(1) per query after O(n log n)", "A monotonic stack rerun for each query range", "A max-heap of all elements with lazy deletion", "A monotonic deque slid across every query range"]
  answer: 0
  explanation: >-
    The monotonic stack answers "nearest greater for every element" in one pass; it has no way to answer an arbitrary range without rerunning, O(n) per query. A sparse table precomputes maxima of power-of-two blocks and answers any range with two overlapping blocks in O(1); with updates, a segment tree gives O(log n).
```
