---
slug: monotonic-deque
title: Monotonic deque
description: Sliding window maximum in O(n) with a deque that evicts from both ends, the invariant traced on count-based, expiry-only, time-based and two-deque windows, why it beats a heap and when the heap is required, the prefix-sum extension to shortest subarray with sum at least k, and where the same idea runs inside the Linux TCP stack.
minutes: 40
difficulty: medium
tags: [deque, monotonic-deque, sliding-window, sliding-window-maximum, heap, prefix-sum, time-window]
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

## Two full traces

`a = [1, 3, -1, -3, 5, 3, 6, 7]`, `k = 3`:

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

Output `[3, 3, 5, 5, 6, 7]`. Index 1 (value 3) survived from `i = 1` to `i = 3` as the front while smaller values queued behind it, then was evicted by the value at `i = 4` before it would have expired at `i = 5`. In this input the expiry rule never fires, which is why a second trace is needed. `a = [5, 1, 1, 1, 1]`, `k = 2`:

| i | a[i] | back pops | deque (indices) | expire front? | output |
|---|---|---|---|---|---|
| 0 | 5 | – | `[0]` | – | – |
| 1 | 1 | – | `[0, 1]` | 0 ≤ −1? no | 5 |
| 2 | 1 | pop 1 (1 ≤ 1) | `[0, 2]` | 0 ≤ 0: **yes**, drop 0 | 1 |
| 3 | 1 | pop 2 | `[3]` | – | 1 |
| 4 | 1 | pop 3 | `[4]` | – | 1 |

Output `[5, 1, 1, 1]`. At `i = 2` nothing bigger than 5 ever arrives, yet 5 must leave because the window `[1, 2]` no longer contains index 0. Both eviction rules are needed; a solution with only back-pops reports 5 forever.

```viz
{"type": "stack-queue", "algorithm": "sliding-window-max", "values": [5, 1, 1, 1, 1], "k": 2, "title": "Monotonic deque: evict dominated from the back, expired from the front", "caption": "The second trace: nothing larger than 5 ever arrives, yet index 0 must leave from the front at i = 2, while each new 1 evicts the equal 1 behind it from the back."}
```

## Under the hood: why O(n), and what it costs

Same accounting as the stack: each index is appended once and removed at most once (from either end). Total deque operations ≤ 2n, and each is O(1) on a real deque. O(n) time, O(k) space, because the deque never holds more than `k` indices: for a 60-second window at one sample per millisecond that is at most 60,000 indices, 480 KB of 8-byte slots, and in a typical latency series the deque holds a few dozen because each new high evicts everything behind it.

The constant depends on the deque. `collections.deque` does `popleft`/`append` in about 30–35 ns each on CPython 3.14 (measured in [Stacks and queues](/learn/data-structures/stacks-queues/stacks-and-queues)); a Python `list` used as a deque with `pop(0)` costs O(k) per expiry and turns the algorithm into O(nk). In JavaScript, `shift()` is the same trap (212 ms to drain 100,000 elements on Node 24): keep a `head` index into a plain array and let the array grow. In Rust and Java, `VecDeque` and `ArrayDeque` are ring buffers and the whole pass runs at a few nanoseconds per element.

## Deque versus heap

The heap solution keeps `(value, index)` pairs in a max-heap; for each window, pop the top while its index is expired ("lazy deletion"), then report the top. Each element is pushed once and popped at most once, so it is O(n log n) time and O(n) space in the worst case (expired entries linger until they reach the top).

| | Monotonic deque | Max-heap with lazy deletion | Two heaps / balanced BST | Sparse table |
|---|---|---|---|---|
| Time | O(n) | O(n log n) | O(n log n) | O(n log n) build, O(1) per window |
| Space | O(k) | O(n) worst case (expired entries linger) | O(k) | O(n log n) |
| Arbitrary removals (cancellations) | No: only the oldest can expire | Yes, lazily | Yes | No (static) |
| Windows of varying width | Yes, if removals are from the front | Yes | Yes | Yes (any range) |
| k-th largest in window, median | No | No | Yes | No |
| Streaming (unbounded n) | Yes | Yes | Yes | No |

The deque wins whenever the elements leave in the same order they arrived, which is exactly what "window" means. The heap is the fallback when expiry is not in arrival order (elements with individual deadlines, for example), or when you need more than the extremum. [Priority queues in practice](/learn/data-structures/heaps/priority-queues-in-practice) covers the heap side and the lazy-deletion idiom.

The senior answer to "sliding window maximum" is: "O(n log n) with a heap and lazy deletion is the safe first answer; the O(n) deque exists because expiry is in arrival order, so we never need to delete from the middle."

## Time-based windows

Production windows are measured in seconds, not samples, and samples arrive irregularly. The deque changes in two places. Expiry compares timestamps: pop the front while `t[front] <= now − W`. And it is a **`while`**, not an `if`: after a two-second gap in a one-second window, several front entries have expired at once. Trace a 3-second window (`W = 3`, expire while `t ≤ now − 3`) over timestamped latencies:

| Sample (t, ms) | back pops | deque `(t, ms)` after push | front expiry | max now |
|---|---|---|---|---|
| (0, 40) | – | `[(0,40)]` | – | 40 |
| (1, 25) | – | `[(0,40), (1,25)]` | – | 40 |
| (2, 30) | pop (1,25) | `[(0,40), (2,30)]` | – | 40 |
| (5, 10) | – | `[(0,40), (2,30), (5,10)]` | 0 ≤ 2: drop; 2 ≤ 2: drop | 10 |
| (6, 35) | pop (5,10) | `[(6,35)]` | – | 35 |

At `t = 5` two entries expired in one step because no sample arrived at 3 or 4; an `if` would have left `(2, 30)` at the front and reported 30 for a window that contains only the sample at 5.

The Linux kernel runs a bounded approximation of this shape in its TCP stack. `lib/win_minmax.c` (Kathleen Nichols' algorithm, per its header comment) keeps exactly three samples, the best, second-best and third-best in the window, with their timestamps, instead of a deque that can grow to `k`. In 6.12, BBR uses it for its windowed maximum delivery rate (`bbr->bw`, with the window counted in round trips) and the TCP stack uses it for the windowed minimum RTT (`tp->rtt_min`); BBR's own minimum RTT is a separate single value with a timestamp. The rules on a new sample: if it beats the best, or all three samples have expired, reset all three to it (the deque's "pop everything dominated"); if it beats the second or third choice, it replaces that choice and everything behind it; and as time passes, the sample arriving after a quarter of the window has gone by becomes the second choice, the one after half becomes the third, and when the best expires the others shift up one place.

Three slots means it can forget a value the deque would have kept. With a window of 8 and samples `(t=0, 50)`, `(1, 45)`, `(3, 20)`, `(9, 10)`: the 45 arrives inside the first quarter-window and beats neither stored choice, so it is not recorded; at `t = 3` the quarter-window rule makes `(3, 20)` the second and third choice; at `t = 9` the 50 expires and the tracker reports 20, while the true maximum of the window `[1, 9]` is 45, which the deque would still hold. The kernel's comment calls this "almost always" the same answer; the kernel accepts that error because it gets constant memory and constant time per socket, on millions of sockets. [Congestion control](/learn/networking/fundamentals/congestion-control) covers what BBR does with the numbers.

## Two deques: max and min together

"Longest subarray in which `max − min ≤ limit`" needs both extremes of a window whose left edge moves only when the constraint breaks. Keep a decreasing deque for the max, an increasing deque for the min, and a left pointer `l`. Trace `a = [8, 2, 4, 7]`, `limit = 4`:

| r | a[r] | max deque (values) | min deque (values) | max − min | action | window | best |
|---|---|---|---|---|---|---|---|
| 0 | 8 | `[8]` | `[8]` | 0 | – | `[0, 0]` | 1 |
| 1 | 2 | `[8, 2]` | `[2]` | 6 > 4 | `l = 1`; drop index 0 from max deque | `[1, 1]` | 1 |
| 2 | 4 | `[4]` | `[2, 4]` | 2 | – | `[1, 2]` | 2 |
| 3 | 7 | `[7]` | `[2, 4, 7]` | 5 > 4 | `l = 2`; drop index 1 from min deque | `[2, 3]` | 2 |

Answer 2. Front expiry here is "index < l" rather than a count, and it can remove from either deque depending on which extreme the departing element was. The same two-deque window with a running sum solves [Max Consecutive Ones III](/practice/max-consecutive-ones-iii)-style constraints when the constraint depends on extremes rather than counts.

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

Trace `a = [2, −1, 2]`, `k = 3`, `P = [0, 2, 1, 3]`:

| j | P[j] | front check `P[j] − P[front] ≥ 3` | back pops (`P[back] ≥ P[j]`) | deque after | best |
|---|---|---|---|---|---|
| 0 | 0 | – | – | `[0]` | – |
| 1 | 2 | 2 − 0 = 2, no | – | `[0, 1]` | – |
| 2 | 1 | 1 − 0 = 1, no | pop 1 (2 ≥ 1) | `[0, 2]` | – |
| 3 | 3 | 3 − 0 = 3: **yes**, best = 3, pop 0; then 3 − 1 = 2, no | – | `[2, 3]` | 3 |

Result 3 (the whole array). Each index enters and leaves the deque at most once: O(n). If all numbers are non-negative the ordinary two-pointer sliding window suffices, because then the prefix sums are already increasing and the deque degenerates into a single moving left pointer.

## Other members of the family

- **Sliding window minimum**: flip the comparison; increasing deque.
- **DP with a window constraint** (jump game VI, constrained subsequence sum): `dp[i] = a[i] + max(dp[i−k..i−1])`. The `max` over the last `k` values is a sliding window maximum over the `dp` array as it is produced, which turns an O(nk) DP into O(n). The deque is the standard optimisation for any DP whose transition takes the extremum over a fixed-length window of previous states; [Sequence DP](/learn/algorithms/dynamic-programming/sequence-dp) uses it. The order inside each step matters: expire the front, read `dp[front]` to compute `dp[i]`, and only then push `i` with the usual back pops. Trace `a = [1, −1, −2, 4, −7, 3]`, `k = 2` (jump at most two cells, maximise the sum of cells landed on):

| i | expire (front < i − 2) | dp[i] = a[i] + dp[front] | back pops, then push i | deque (indices) |
|---|---|---|---|---|
| 0 | – | 1 (start) | – | `[0]` |
| 1 | – | −1 + 1 = 0 | – | `[0, 1]` |
| 2 | 0 < 0? no | −2 + 1 = −1 | – | `[0, 1, 2]` |
| 3 | 0 < 1: drop 0 | 4 + 0 = 4 | pop 2 (−1), pop 1 (0) | `[3]` |
| 4 | – | −7 + 4 = −3 | – | `[3, 4]` |
| 5 | 3 < 3? no | 3 + 4 = 7 | pop 4 (−3), pop 3 (4) | `[5]` |

The answer is `dp[5] = 7`, the path 1 → −1 → 4 → 3. Reading the front before pushing is what keeps `dp[i]` from being computed from itself; pushing first would compare `dp[i]` with an unfinished value.

- **Rolling max/min in streams**: exactly the opening example; the deque holds at most `k` timestamps and each sample costs O(1) amortised.

## Production failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Window maximum stays at an old spike long after it should have dropped | Time-based expiry written as `if` instead of `while`; a gap in samples left stale entries | `while front.t <= now − W` |
| Rolling max never decreases at all | Only the back-pop rule implemented; front expiry missing | Add the expiry rule; test `[5, 1, 1, 1, 1]`, `k = 2` |
| Dashboard's rolling max is wrong after a clock adjustment | Timestamps went backwards, so newer samples "expired" older ones incorrectly | Use a monotonic clock for windowing, never wall-clock |
| A JavaScript or Python job is O(nk) although the code is "the deque algorithm" | `shift()` / `list.pop(0)` for the front | Head index or `collections.deque` |
| Memory grows without bound in a streaming max | Deque fed by a loop that never expires (window larger than the stream so far is fine; window never applied is not) | Bound the deque by `k` or by time and assert its length in tests |
| Wrong answer with equal values in a "where is the max" variant | `<` instead of `<=` on the back pop keeps the earliest index rather than the latest | Choose the comparison from the problem's tie rule |
| Prefix-sum variant returns nonsense on large inputs in JavaScript | Prefix sums exceeded 2⁵³ | `BigInt` or a language with 64-bit integers |

## Interviewer follow-ups

**"Make it a 60-second window with irregular samples."** Model answer: store `(timestamp, value)`, expire from the front with a `while` on timestamps, and use a monotonic clock; the deque holds as many entries as there are still-relevant local maxima, not one per second. Common wrong answer: keeping the `if`, which breaks after any gap.

**"Now the caller can cancel a sample that is still in the window."** Model answer: the deque cannot delete from the middle, so switch to a heap with lazy deletion (a set of cancelled ids checked when an entry reaches the top) or a balanced BST; O(log n) per operation. Common wrong answer: scanning the deque for the id, which is O(k) per cancellation.

**"Report the window median instead of the max."** Model answer: two heaps (a max-heap for the lower half, a min-heap for the upper) with lazy deletion for expired entries, or an order-statistics tree; the monotonic deque only tracks extremes. Common wrong answer: "sort the window", O(k log k) per step.

**"Why can the DP `dp[i] = a[i] + max(dp[i−k..i−1])` use a deque when the values are produced as you go?"** Model answer: the window slides over `dp` in index order and each `dp[i]` is final when computed, so it is a standard sliding window maximum interleaved with the DP; the deque stores indices into `dp`. Common wrong answer: "the deque needs the whole array up front".

**"What is the space bound, and when is it reached?"** Model answer: O(k), reached on a strictly decreasing input where nothing is ever dominated; on random data it is O(log k) expected, because each element evicts everything smaller behind it. Common wrong answer: O(n).

## What mid-level engineers get wrong

- **Implementing only the back-pop rule**, so the max never expires; the standard test data happens not to exercise expiry.
- **Writing the time-based expiry with `if`**, which passes tests with regular samples and fails on the first gap in production.
- **Using `shift()` or `pop(0)`** and reporting the O(n) algorithm as slow.
- **Reaching for a heap first** without being able to say why the deque suffices, or reaching for the deque when cancellations make the heap necessary.
- **Storing values rather than indices**, which makes expiry impossible.
- **Applying the plain two-pointer window to "sum at least k" with negatives**, where the monotone shrink/extend rule no longer holds.

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

- You state both eviction rules (dominated from the back, expired from the front), why a stack cannot do the second, and you test the expiry-only input.
- You give the O(n) argument, quote the O(k) space bound and when it is reached, and note that a JavaScript `shift()` would silently make it O(nk).
- You can convert the count-based window to a time-based one, know why expiry becomes a `while`, and insist on a monotonic clock.
- You compare the deque with the lazy-deletion heap and say precisely when the heap is required (cancellations, expiry not in arrival order, medians).
- You recognise "shortest subarray with sum ≥ k and negatives" as prefix sums plus a monotonic deque, and know the non-negative case degenerates to two pointers.
- You know the two-deque max-and-min window and the deque optimisation for DPs with a fixed-window extremum transition.

## Check yourself

```quiz
- q: >-
    In the sliding window maximum deque, why can the front index be removed with a single `if` rather than a `while`?
  options: ["Expired indices are removed from the back, not the front", "One index enters and the window slides by one each step", "Back pops have already removed every index older than the window", "The front is the newest index, so it is the last to expire"]
  answer: 1
  explanation: >-
    Indices enter one per step and the window's left edge moves by exactly one each iteration, and the deque's indices are increasing, so at most one index (the front) can have crossed the edge in this step. Back pops remove dominated indices, not old ones, so an old maximum can still sit at the front until it expires. In a time-based window with gaps several entries can expire at once, and there a while loop is required.
- q: >-
    An element a[j] is popped from the back of the deque when a[i] >= a[j] arrives with i > j. Why is it safe to forget a[j] entirely?
  options: ["It has already been reported as the maximum of its window", "The deque must stay within k entries, so something must go", "It can be recovered from the prefix maxima if needed again", "Every future window containing j also contains the larger a[i]"]
  answer: 3
  explanation: >-
    Windows are contiguous, so a window that includes the older index j and extends to the present includes i. The maximum of that window is at least a[i] >= a[j]. This domination argument is the whole invariant; a[j] may never have been reported at all, and nothing about capacity forces the pop.
- q: >-
    Compared with a max-heap using lazy deletion, the monotonic deque's advantage for sliding window maximum is:
  options: ["It handles removals in any order, since each index is stored once", "O(n) time and O(1) space, because only the front is ever read", "It also reports the k-th largest, because the deque is sorted", "O(n) time and O(k) space, because expiry is in arrival order"]
  answer: 3
  explanation: >-
    The deque exploits that elements leave in the order they arrived, so only the front ever expires, giving O(n) time with at most k indices stored. It cannot handle out-of-order removals or the k-th largest; a heap (or two heaps, or a balanced BST) is needed for those.
- q: >-
    For "shortest subarray with sum at least k" with negative numbers, why does a two-pointer sliding window fail?
  options: ["The window sum must be recomputed from scratch after each move", "Extending the window no longer guarantees the sum grows", "Two pointers need the array sorted before the window slides", "Two pointers find the longest valid subarray, not the shortest"]
  answer: 1
  explanation: >-
    The window technique relies on the sum increasing as the right edge moves and decreasing as the left edge moves, so the shrink/extend decision is monotone. Negatives break both directions. A running sum still updates in O(1); the problem is the decision rule, not the arithmetic. Prefix sums with a monotonic deque of increasing prefix values restore a usable monotone structure.
- q: >-
    A DP has the transition dp[i] = a[i] + max(dp[i−k], …, dp[i−1]). The best way to compute it for large n and k is:
  options: ["Memoised recursion that caches every dp[i] once: O(n)", "Recompute the max over the last k values each step: O(nk)", "A monotonic deque over dp maintaining the window max: O(n)", "Sort the last k dp values each step, take the top: O(nk log k)"]
  answer: 2
  explanation: >-
    The transition is exactly a sliding window maximum over the dp values as they are produced. The deque gives O(1) amortised per step. Memoisation only avoids recomputing dp[i]; each state still scans k predecessors, so it is O(nk). A heap with lazy deletion would also work at O(n log k).
- q: >-
    A rolling 60-second maximum built on a monotonic deque of (timestamp, value) pairs sometimes reports a spike from minutes ago. The most likely bug is:
  options: ["Back pops use `<=`, so equal values evict the newer sample", "The deque stores values only, so timestamps cannot be compared", "The window is count-based, so 60 samples are kept instead of 60 seconds", "Front expiry uses `if`, so after a gap in samples stale entries remain"]
  answer: 3
  explanation: >-
    With irregular samples, several front entries can cross the window edge between two arrivals; an `if` removes only one of them and the next stale entry becomes the reported maximum. Expiry must loop. The other options would produce different symptoms: a count-based window would be wrong constantly, not sometimes, and a value-only deque could not expire at all.
```
