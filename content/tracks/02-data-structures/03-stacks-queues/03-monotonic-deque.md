---
slug: monotonic-deque
title: Monotonic deque
description: Sliding window maximum in O(n) with a deque that evicts from both ends, the invariant that makes it work, why it beats a heap, and the prefix-sum extension to shortest subarray with sum at least k.
minutes: 45
difficulty: medium
tags: [deque, monotonic-deque, sliding-window, sliding-window-maximum, heap, prefix-sum]
problems: [sliding-window-maximum, max-consecutive-ones-iii]
---
A metrics pipeline reports the maximum request latency over the last 60 seconds, updated every second. The naive implementation rescans the last 60 samples each second; at one sample per millisecond that is 60,000 comparisons per update, and a p99 that jumps every time garbage collection lands during the scan. A heap gets it down to logarithmic per sample but has to deal with samples that expire while buried in the middle of the heap. The right structure does it in constant amortised time per sample with a handful of comparisons, and the idea is the monotonic stack with one addition: the window's *left* edge can now evict too.

## The problem shape

Given `a[0..n−1]` and a window size `k`, output the maximum of every window `a[i−k+1..i]` for `i ≥ k−1`. Brute force is O(nk). The target is O(n).

The monotonic stack from the [previous lesson](/learn/data-structures/stacks-queues/monotonic-stack) already answers "which elements could still be the maximum of some future window?" An element `a[j]` can never be the maximum of any window that also contains a later, larger-or-equal element `a[i]`, because that window would contain `a[i]` too. So when `a[i]` arrives, every earlier element `≤ a[i]` is dead and can be discarded from the back. What remains, front to back, is decreasing.

The new ingredient is expiry: the element at the *front* (the current maximum) eventually falls out of the window because it is too old, not because something bigger arrived. A stack cannot remove from its bottom; a deque can. Hence a monotonic deque: pop from the back to keep it decreasing, pop from the front to discard expired indices, and read the maximum at the front.

## The invariant

The deque holds indices of elements in the current window such that:

1. the indices are increasing front to back (they were appended in arrival order), and
2. the values at those indices are strictly decreasing front to back.

Consequences: the front is the index of the window maximum; the front is the oldest surviving candidate, so expiry only ever removes from the front; and every index not in the deque is either expired or dominated by a later element.

```python
from collections import deque

def sliding_max(a, k):
    dq = deque()                  # indices; values decreasing front → back
    out = []
    for i, x in enumerate(a):
        while dq and a[dq[-1]] <= x:      # 1. drop dominated candidates from the back
            dq.pop()
        dq.append(i)                       # 2. i is now a candidate
        if dq[0] <= i - k:                 # 3. expire the front if it left the window
            dq.popleft()
        if i >= k - 1:                     # 4. window is full: report the front
            out.append(a[dq[0]])
    return out
```

Step 3 uses `<=` because the window `[i−k+1, i]` excludes index `i−k`. At most one index expires per step, because indices enter one per step and the window advances one per step, so a single `if` (not a `while`) is enough. The `<=` in step 1 is a choice: with `<`, equal values would coexist in the deque; both are correct for the maximum, but `<=` keeps the deque shorter and means the front is the *latest* index holding the max, which matters in problems that ask "where" as well as "what".

## A full trace

`a = [1, 3, -1, -3, 5, 3, 6, 7]`, `k = 3`.

| i | a[i] | back pops | deque (indices) | deque (values) | expire front? | output |
|---|---|---|---|---|---|---|
| 0 | 1 | – | `[0]` | `[1]` | – | – |
| 1 | 3 | pop 0 (1 ≤ 3) | `[1]` | `[3]` | – | – |
| 2 | −1 | – | `[1, 2]` | `[3, −1]` | – | 3 |
| 3 | −3 | – | `[1, 2, 3]` | `[3, −1, −3]` | 1 > 0, no | 3 |
| 4 | 5 | pop 3, pop 2, pop 1 | `[4]` | `[5]` | – | 5 |
| 5 | 3 | – | `[4, 5]` | `[5, 3]` | – | 5 |
| 6 | 6 | pop 5, pop 4 | `[6]` | `[6]` | – | 6 |
| 7 | 7 | pop 6 | `[7]` | `[7]` | – | 7 |

Output `[3, 3, 5, 5, 6, 7]`. Notice that index 1 (value 3) survived from `i = 1` to `i = 3` as the front while smaller values queued behind it, then was evicted by value at `i = 4` before it would have expired at `i = 5`. Both eviction rules are needed; try `[5, 1, 1, 1, 1]` with `k = 2` to see the expiry rule fire (5 must leave at `i = 2` even though nothing bigger arrives).

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [1, 3, -1, -3, 5, 3, 6, 7], "k": 3, "title": "Monotonic deque: evict dominated from the back, expired from the front"}
```

## Why O(n)

Same accounting as the stack: each index is appended once and removed at most once (from either end). Total deque operations ≤ 2n, and each is O(1) on a real deque (`collections.deque`, `ArrayDeque`, `VecDeque`, or an array with two indices in JavaScript). O(n) time, O(k) space, because the deque never holds more than `k` indices.

In JavaScript, do not use `shift()` for the front removal (it is O(n)); keep a `head` index into a plain array and let the array grow. In Python, `collections.deque` is the right tool and `list.pop(0)` is the wrong one, as [Stacks and queues](/learn/data-structures/stacks-queues/stacks-and-queues) explains.

## Deque versus heap

The heap solution keeps `(value, index)` pairs in a max-heap; for each window, pop the top while its index is expired ("lazy deletion"), then report the top. Each element is pushed once and popped at most once, so it is O(n log n) time and O(n) space in the worst case (expired entries linger until they reach the top).

| | Monotonic deque | Max-heap with lazy deletion |
|---|---|---|
| Time | O(n) | O(n log n) |
| Space | O(k) | O(n) worst case (expired entries linger) |
| Handles arbitrary removals? | No: only the oldest can expire | Yes, with lazy deletion or an indexed heap |
| Handles windows that shrink and grow non-uniformly? | Yes, as long as removals are from the front (oldest) | Yes |
| Handles "k-th largest in window"? | No | Not directly either; needs two heaps or a balanced BST |
| Code size | ~10 lines | ~15 lines |

The deque wins whenever the elements leave in the same order they arrived, which is exactly what "window" means. The heap is the fallback when expiry is not in arrival order (elements with individual deadlines, for example), or when you need more than the extremum. [Priority queues in practice](/learn/data-structures/heaps/priority-queues-in-practice) covers the heap side and the lazy-deletion idiom.

The senior answer to "sliding window maximum" is: "O(n log n) with a heap and lazy deletion is the safe first answer; the O(n) deque exists because expiry is in arrival order, so we never need to delete from the middle."

## Extension: shortest subarray with sum at least k

The deque idea combines with prefix sums to solve a problem that a plain sliding window cannot: with **negative numbers allowed**, find the length of the shortest contiguous subarray whose sum is at least `k`.

With prefix sums `P` (`P[0] = 0`), a subarray `(i, j]` has sum `P[j] − P[i]`. For each right endpoint `j`, you want the *largest* `i < j` with `P[i] ≤ P[j] − k`, to make `j − i` as small as possible. Two observations:

1. If `i₁ < i₂` and `P[i₁] ≥ P[i₂]`, then `i₁` is useless as a left endpoint for any future `j`: `i₂` is closer and has a smaller-or-equal prefix, so any `j` that works with `i₁` works at least as well with `i₂`. So keep only left candidates whose prefix values are **increasing**; pop from the back while `P[back] ≥ P[j]` before appending `j`.
2. Once a left candidate `i` at the front satisfies `P[j] − P[i] ≥ k` for the current `j`, record `j − i` and pop it: any later `j'` would give a longer subarray with the same `i`, so `i` is done.

```python
def shortest_subarray_at_least(a, k):
    n = len(a)
    P = [0] * (n + 1)
    for i, x in enumerate(a):
        P[i + 1] = P[i] + x
    dq = deque()                          # indices into P; P values increasing
    best = n + 1
    for j in range(n + 1):
        while dq and P[j] - P[dq[0]] >= k:    # front is a valid, now-finished left endpoint
            best = min(best, j - dq.popleft())
        while dq and P[dq[-1]] >= P[j]:       # keep prefixes increasing
            dq.pop()
        dq.append(j)
    return best if best <= n else -1
```

Trace `a = [2, −1, 2]`, `k = 3`: `P = [0, 2, 1, 3]`. `j = 0`: deque `[0]`. `j = 1`: `P[1] − P[0] = 2 < 3`; `P[0] = 0 < 2`, append: `[0, 1]`. `j = 2`: `P[2] − P[0] = 1 < 3`; back `P[1] = 2 ≥ 1`, pop; `P[0] = 0 < 1`, append: `[0, 2]`. `j = 3`: `P[3] − P[0] = 3 ≥ 3`: best = 3, pop front; `P[3] − P[2] = 2 < 3`; back `P[2] = 1 < 3`, append: `[2, 3]`. Result 3 (the whole array). Each index enters and leaves the deque at most once: O(n).

This is a monotonic deque over prefix sums, and it is the clean way to handle "at least k" with negatives. If all numbers are non-negative the ordinary two-pointer sliding window suffices, because then the prefix sums are already increasing and the deque degenerates into a single moving left pointer.

## Other members of the family

- **Sliding window minimum**: flip the comparison; increasing deque.
- **Both max and min of every window** (for "longest subarray with max − min ≤ limit"): two deques over the same window, one increasing and one decreasing, plus a left pointer that advances while the constraint is violated.
- **DP with a window constraint** (jump game VI, constrained subsequence sum): `dp[i] = a[i] + max(dp[i−k..i−1])`. The `max` over the last `k` values is a sliding window maximum over the `dp` array as it is produced, which turns an O(nk) DP into O(n). The deque is the standard optimisation for any DP whose transition takes the extremum over a fixed-length window of previous states.
- **Rolling max/min in streams**: exactly the opening example; the deque holds at most `k` timestamps and each sample costs O(1) amortised.

## Exercises

```exercise
id: sliding-max
title: Sliding window maximum
prompt: |
  Return the maximum of every contiguous window of size `k` in `nums`,
  from left to right, in O(n) using a monotonic deque of indices. Assume
  `1 <= k <= len(nums)` when `nums` is non-empty; return an empty list
  when `nums` is empty. In JavaScript use an array with a head index for
  the front (no `shift`).
languages: [python, javascript]
entry: sliding_max
starter:
  python: |
    from collections import deque

    def sliding_max(nums, k):
        # your code here
        return []
  javascript: |
    function sliding_max(nums, k) {
      // your code here
      return [];
    }
tests:
  - args: [[1, 3, -1, -3, 5, 3, 6, 7], 3]
    expected: [3, 3, 5, 5, 6, 7]
  - args: [[1], 1]
    expected: [1]
    label: single element
  - args: [[4, 3, 2, 1], 2]
    expected: [4, 3, 2]
    label: decreasing input exercises expiry
  - args: [[1, 2, 3, 4], 4]
    expected: [4]
    label: window is the whole array
  - args: [[], 3]
    expected: []
    label: empty input
  - args: [[9, 9, 9, 1], 2]
    expected: [9, 9, 9]
    hidden: true
    label: ties
  - args: [[5, 1, 4, 2, 3], 2]
    expected: [5, 4, 4, 3]
    hidden: true
hints:
  - "Before appending index `i`, pop from the back while the back's value is `<= nums[i]`."
  - "After appending, if the front index is `<= i - k`, pop it from the front; then if `i >= k - 1` record `nums[front]`."
```

```exercise
id: shortest-subarray-at-least-k
title: Shortest subarray with sum at least k
prompt: |
  Return the length of the shortest non-empty contiguous subarray of
  `nums` whose sum is at least `k`, or -1 if none exists. `nums` may
  contain negative numbers, so use prefix sums with a monotonic deque of
  prefix indices (increasing prefix values). O(n).
languages: [python, javascript]
entry: shortest_subarray_at_least
starter:
  python: |
    from collections import deque

    def shortest_subarray_at_least(nums, k):
        # your code here
        return -1
  javascript: |
    function shortest_subarray_at_least(nums, k) {
      // your code here
      return -1;
    }
tests:
  - args: [[1], 1]
    expected: 1
  - args: [[1, 2], 4]
    expected: -1
    label: no valid subarray
  - args: [[2, -1, 2], 3]
    expected: 3
    label: negative in the middle
  - args: [[84, -37, 32, 40, 95], 167]
    expected: 3
  - args: [[17, 85, 93, -45, -21], 150]
    expected: 2
  - args: [[1, 2, 3, 4, 5], 11]
    expected: 3
    hidden: true
  - args: [[-1, 5, -2, 4], 4]
    expected: 1
    hidden: true
hints:
  - "Build `P` of length n + 1. For each `j`, first pop from the FRONT while `P[j] - P[front] >= k`, recording `j - front`."
  - "Then pop from the BACK while `P[back] >= P[j]`, and append `j`."
```

## Senior signals

- You state both eviction rules (dominated from the back, expired from the front) and why a stack cannot do the second.
- You give the O(n) argument and note that a JavaScript `shift()` would silently make it O(nk).
- You compare the deque with the lazy-deletion heap and say precisely when the heap is required (expiry not in arrival order, or more than the extremum).
- You recognise "shortest subarray with sum ≥ k and negatives" as prefix sums plus a monotonic deque, and know the non-negative case degenerates to two pointers.
- You know the deque optimisation for DPs with a fixed-window max/min transition.
- You choose `<=` vs `<` in the back-pop deliberately.

## Check yourself

```quiz
- q: >-
    In the sliding window maximum deque, why can the front index be removed with a single `if` rather than a `while`?
  options: ["Because the deque holds at most one element", "Because indices enter one per step and the window advances one per step, so at most one index can expire per step", "Because expired indices are removed from the back instead", "It cannot; a while loop is required"]
  answer: 1
  explanation: >-
    The window's left edge moves by exactly one each iteration, and the deque's indices are increasing, so only the front can have just crossed the edge. A while loop is harmless but unnecessary.
- q: >-
    An element a[j] is popped from the back of the deque when a[i] >= a[j] arrives with i > j. Why is it safe to forget a[j] entirely?
  options: ["Because a[j] has already been reported", "Because any future window containing j also contains i, and a[i] is at least as large, so a[j] can never be the window maximum", "Because a[j] will expire soon anyway", "Because the deque has limited capacity"]
  answer: 1
  explanation: >-
    Windows are contiguous, so a window that includes the older index j and extends to the present includes i. The maximum of that window is at least a[i] >= a[j]. This domination argument is the whole invariant.
- q: >-
    Compared with a max-heap using lazy deletion, the monotonic deque's advantage for sliding window maximum is:
  options: ["It handles removals in arbitrary order", "O(n) time and O(k) space instead of O(n log n) and O(n), because expiry happens in arrival order", "It can report the k-th largest as well", "It works with unsorted windows"]
  answer: 1
  explanation: >-
    The deque exploits that elements leave in the order they arrived, so only the front ever expires. A heap is needed when elements can be removed out of order or when more than the extremum is required.
- q: >-
    For "shortest subarray with sum at least k" with negative numbers, why does a two-pointer sliding window fail?
  options: ["Two pointers cannot handle sums", "Extending the window no longer guarantees the sum grows, so the shrink/extend decision is not monotone", "The array must be sorted first", "Two pointers only find the longest subarray"]
  answer: 1
  explanation: >-
    The window technique relies on the sum increasing as the right edge moves and decreasing as the left edge moves. Negatives break both directions. Prefix sums with a monotonic deque of increasing prefix values restore a usable monotone structure.
- q: >-
    A DP has the transition dp[i] = a[i] + max(dp[i−k], …, dp[i−1]). The best way to compute it for large n and k is:
  options: ["Recompute the max over the last k values each step: O(nk)", "A monotonic deque over dp maintaining the window max: O(n)", "Sort the dp array each step", "Memoised recursion"]
  answer: 1
  explanation: >-
    The transition is exactly a sliding window maximum over the dp values as they are produced. The deque gives O(1) amortised per step. A heap with lazy deletion would also work at O(n log k).
```
