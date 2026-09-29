---
slug: clarifying-and-scoping
title: "Clarifying and scoping: the questions that choose the algorithm"
description: A catalogue of clarifying questions by problem type with the answer that changes the approach, a measured operation budget for n, a worked Meeting Rooms II where one answer turns O(n log n) into O(n), and how clarification is graded, noted and argued in a debrief.
minutes: 35
difficulty: medium
tags: [interview, clarifying-questions, constraints, scoping, assumptions]
problems: [top-k-frequent, merge-intervals, subarray-sum-equals-k, time-based-kv, meeting-rooms-ii]
---
"Given a log of API requests, return the k users who made the most requests." You can have a hash map and a sort on the screen in ninety seconds. Then at minute 25 the interviewer asks what happens when two users tie for k-th place, and you discover your output order depends on dictionary iteration order. At minute 35 they mention that the log is 200 GB. The code handles neither, and it is too late to change the approach.

Every one of those facts was available at minute 4 for the price of a question. Clarifying is the step where the algorithm gets chosen: the input size picks the complexity class, the value range picks between a hash map and an array, "is it sorted?" picks two pointers or binary search, and "does it fit in memory?" picks between an in-memory algorithm and a streaming one. The opposite failure is as real: twelve questions in eight minutes, most of whose answers you never use, reads as stalling.

## A question is worth asking if the answer changes your code

Before asking anything, run one test: for each possible answer, would I write different code? If yes, ask. If no, assume, and state the assumption in a sentence.

"Can the list be empty?" usually fails this test, because you will handle empty input with a one-line guard either way. State it instead: "I'll return an empty list for empty input." "Can values be negative?" often passes. For "longest subarray with sum at most k", non-negative values mean the window sum only grows when you extend the window and only shrinks when you contract it, so a sliding window works in O(n). Negatives break that monotonicity and push you to prefix sums with a binary search over the running prefix maximum, O(n log n). One answer selects the algorithm.

The test also orders your questions: first the ones whose answers would invalidate the most code (size, memory, sortedness, value range), then the ones that change a single line (tie-breaking, output order, inclusive bounds), and the one-line ones become statements whenever the example already implies the answer.

## The catalogue: questions by problem type

Five questions apply to nearly every problem: **how large is n**, **does it fit in memory**, **is the input sorted**, **what is the value range**, and **is this called once or many times**. The tables below add the questions specific to each problem type. At minute 3 you need two or three rows of one table, not all of them.

### Arrays and sequences

| Question | Answer that changes the approach | New approach |
|---|---|---|
| What range do values take? | Bounded, e.g. 1..n or 0..10⁴ | Counting array or counting sort, O(n + range), instead of an O(n log n) comparison sort; 1..n also allows [cyclic sort](/learn/interview-patterns/array-patterns/cyclic-sort) and index marking in O(1) extra space |
| Can values be negative or zero? | Yes | Sum-based sliding windows break; prefix sums plus a hash map; max-product needs a running min and max |
| Is the input sorted? | Yes | Two pointers or binary search, O(n) or O(log n), instead of a hash map or a sort |
| Are there duplicates? | Yes | First/last-occurrence binary search; a skip-equal step in backtracking; a `set` would change counts |
| Return indices or values? | Indices | Sorting destroys positions: sort `(value, index)` pairs or keep a value-to-index map |
| Contiguous subarray or subsequence? | Subsequence | Windows and prefix sums no longer apply; DP, or greedy with a heap |
| May I modify the input? | Yes | In-place sign marking or swapping, O(1) extra space |

### Intervals and scheduling

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Do touching intervals overlap? Half-open or closed? | Touching merges / `[s, e)` | `<=` versus `<` in the overlap test; at equal times, process ends before starts in a sweep |
| Is the input sorted by start? | Yes | Skip the O(n log n) sort; one pass |
| Are times integers in a small range? | Minutes within one day, 0..1,440 | Difference array over the range, O(n + 1,440), no sort (worked below) |
| Count, or assignment (which room)? | Assignment | A min-heap of `(end, room_id)` rather than two sorted arrays |
| Do intervals arrive one at a time? | Yes | Sorted structure keyed by start, O(log n) per insert; see [Insert Interval](/practice/insert-interval) |
| Can a meeting have zero length? | Yes | Decide whether `[s, s)` needs a room; half-open says no |

### Graphs and grids

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Directed or undirected? | Directed | Cycle detection needs three colours or Kahn's algorithm; reachability is not symmetric |
| Weighted? Negative weights? | Weighted / negative | BFS becomes Dijkstra; negative weights need Bellman-Ford |
| Connected? Isolated nodes? | Not connected | Outer loop over every node; the number of traversals is the component count |
| Four or eight directions? May I write into the grid? | Eight / yes | Change the direction list; sink visited cells instead of keeping a set |
| How many cells? | 10⁶ or more | Iterative traversal; CPython's default recursion limit is 1,000 frames |
| Self-loops or parallel edges? | Yes | Parent-skip cycle checks give wrong answers; track edge ids |
| Do edges arrive over time between queries? | Yes | Union-find instead of repeated traversals |

### Trees

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Binary tree or BST? | BST | In-order is sorted; search and LCA walk one path in O(h) |
| Balanced? How deep can it be? | Unbalanced, n up to 10⁵ | Height can be n: explicit stack instead of recursion |
| Are parent pointers available? | Yes | LCA by walking up from both nodes; no search from the root |
| Are values unique? | No | Define where equal keys go; compare nodes by identity, not value |
| Is the tree modified between queries? | Yes | No precomputed Euler tour or depth table; maintain or recompute |

### Linked lists

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Singly or doubly linked? | Singly | Removal needs the predecessor: dummy head, or trail a pointer |
| Can it contain a cycle? | Yes | Floyd's cycle check before any loop that assumes termination |
| May I modify it? | No | Palindrome check needs O(n) extra space, or reverse half and restore it |
| Do I get the head, or only the node to delete? | Only the node | Copy the next node's value and unlink the next node |
| Is the length known? | No | Two pointers with a gap of k for k-th from the end in one pass |

### Strings, encoding and Unicode

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Lowercase ASCII only, or Unicode? | Lowercase only | `int[26]` counts instead of a hash map; Unicode needs a map and a definition of "character" |
| Case-sensitive? Ignore punctuation? | Ignore both | Normalise first, or skip non-alphanumerics inside two pointers |
| Characters, bytes or UTF-16 units? | Characters, in JavaScript | `"😀".length` is 2 in JavaScript and `len("😀")` is 1 in Python; iterate with `for...of` |
| Are "é" (one code point) and "e" + accent (two) equal? | Yes | NFC-normalise before comparing; see [numbers, strings and Unicode](/learn/foundations/how-code-runs/numbers-strings-unicode) |
| What separates words? | Any non-letter | A regex tokeniser; `split(" ")` produces empty tokens on double spaces |
| Can the delimiter appear inside the data? | Yes | Length-prefix encoding, as in [Encode and Decode Strings](/practice/encode-decode-strings) |

### Numeric: overflow, modulo, precision

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Can sums or products exceed 2³¹ − 1, or 2⁵³ in JavaScript? | Yes | 64-bit integers in Java, Go, C++; `BigInt` or per-step modulo in JavaScript; Python ints never overflow, but arithmetic slows as they grow |
| Return the answer modulo 10⁹ + 7? | Yes | Reduce after every add and multiply; fix negative remainders after subtraction |
| Integers or floating point? Money? | Floats or money | Compare with a tolerance, or use integer cents; float sums depend on addition order |
| Negative operands with `/` or `%`? | Yes | Python's `//` floors toward −∞ and `%` takes the divisor's sign; Java truncates toward zero, and Java's and JavaScript's `%` take the dividend's sign |
| What range can the answer take? | 1..10⁹ | Binary search on the answer: about 30 feasibility checks |

### Design and class problems

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Which operations, and which is hot? | Many reads, few writes | Make `get` O(1) and let `put` cost O(log n) |
| Required cost per operation? | O(1) each | Hash map plus doubly linked list, as in [LRU Cache](/practice/lru-cache) |
| Does a read count as a use? Does an update refresh? | Yes | Move-to-end on both paths |
| What happens at capacity 0 or on a missing key? | Capacity 0 allowed | A guard in `put`; return a sentinel or raise, and say which |
| Are timestamps increasing? | Yes | Append plus binary search, as in [Time-Based Key-Value Store](/practice/time-based-kv); otherwise a sorted insert |
| Single-threaded? | Concurrent callers | Lock scope; a `get` that reorders needs the lock too |

### Streams and big data

| Question | Answer that changes the approach | New approach |
|---|---|---|
| Does it fit in memory? | No | Hash-partition to files, aggregate per partition, merge |
| One pass over an unbounded stream? | Yes | Bounded state: a size-k heap, reservoir sampling, running aggregates |
| Is approximate acceptable? | Yes | Count-Min sketch, HyperLogLog, sampling |
| Queries versus updates, which is more frequent? | Many queries | Maintain the answer incrementally; otherwise recompute on demand |
| Can events arrive out of order? | Yes | Buffer with a watermark; never assume monotonic time |

## Turning n into a budget, measured

"Python does about 10⁷ operations a second" is the folk number. Here is what one machine does: CPython 3.14 and Node 24 on a Ryzen 9 9950X3D desktop under WSL2, best of three runs. A laptop or an online judge can be several times slower, so treat these as a ceiling, not a promise.

| Loop body, per iteration | CPython 3.14 | Node 24 |
|---|---|---|
| `t += i` over 10⁷ | 12.5 ns (0.125 s total) | 0.5 ns (5 ms total) |
| Call a one-line function | 16 ns | 0.2 ns (inlined by the JIT) |
| Compare a pair in a nested loop, n = 2,000 | 14 ns (0.028 s for 2 × 10⁶ pairs) | 0.37 ns (0.74 ms) |
| Increment a dict / `Map` entry, 10⁶ keys drawn from 10⁵ | 51 ns (0.051 s) | 31 ns (31 ms) |
| Increment a list / `Int32Array` slot | 12 ns (0.012 s) | 6 ns (5.8 ms) |

The numbers support a two-line rule. CPython runs 10⁷ to 10⁸ simple loop iterations per second, with hash operations near the bottom of that range. A JIT (V8, the JVM) or a compiled language runs 10⁸ to 10⁹ simple iterations, but a hash-map operation still costs tens of nanoseconds (31 ns for a `Map` increment here), so hash-heavy loops sit nearer 10⁷ to 10⁸ per second in every language. Plan with the bottom of each range and you are rarely wrong by more than a factor of ten.

Worked for n = 10⁵:

- O(n²) is 5 × 10⁹ pair comparisons: at 14 ns each, about 70 seconds in CPython on this machine and about 2 seconds in Node. Out in both.
- O(n log n) is about 1.7 × 10⁶ steps: milliseconds. In.
- O(n) with a dict increment per element: about 5 ms. In.

For n = 2,000, the O(n²) pair loop measured 28 ms in CPython. Then code the quadratic version cleanly and say why: "it runs in about 30 ms and is much simpler; I'd optimise past n = 10⁴", provided you can name the optimisation. For n ≤ 20, 2²⁰ ≈ 10⁶ subsets is well under a second; a constraint that small is often a hint that the problem wants exponential search with pruning, or bitmask DP. If the interviewer will not give you n ("assume it's large"), treat it as 10⁵ to 10⁶ and say so.

## Worked example: one answer turns O(n log n) into O(n)

[Meeting Rooms II](/practice/meeting-rooms-ii): given meetings as half-open intervals `[start, end)`, return the minimum number of rooms so that no two overlapping meetings share one. The standard plan is O(n log n). One clarifying question can remove the `log n`.

### The plan before the question

Sort by start and keep a min-heap of the end times of rooms in use. For each meeting, if the earliest-ending room is free by its start, reuse that room; otherwise open one.

```python
import heapq

def min_meeting_rooms(intervals):
    ends = []                                   # min-heap: end times of rooms in use
    for s, e in sorted(intervals, key=lambda iv: iv[0]):
        if ends and ends[0] <= s:               # <= because intervals are half-open
            heapq.heapreplace(ends, e)          # reuse the room that frees first
        else:
            heapq.heappush(ends, e)             # every room is busy: open one
    return len(ends)
```

Trace it on five meetings in minutes after midnight: A `[540, 600)` (9:00 to 10:00), B `[555, 585)`, C `[570, 630)`, D `[600, 660)`, E `[585, 615)`. Sorted by start: A, B, C, E, D.

| Meeting | Start | `ends[0] <= start`? | Action | Heap array after | Rooms |
|---|---|---|---|---|---|
| A | 540 | heap empty | push 600 | `[600]` | 1 |
| B | 555 | 600 ≤ 555, no | push 585 | `[585, 600]` | 2 |
| C | 570 | 585 ≤ 570, no | push 630 | `[585, 600, 630]` | 3 |
| E | 585 | 585 ≤ 585, yes | replace 585 by 615 | `[600, 615, 630]` | 3 |
| D | 600 | 600 ≤ 600, yes | replace 600 by 660 | `[615, 660, 630]` | 3 |

Answer 3. The sort is O(n log n) and each heap operation is O(log r) for r rooms, so the whole thing is O(n log n).

### The question, and the difference array

> **Candidate:** Are the times whole minutes within a single day?
>
> **Interviewer:** Yes, it's a booking system for one day.

That answer bounds every endpoint to 0..1,440. The number of rooms in use at minute t is (meetings started at or before t) minus (meetings ended at or before t). Record +1 at each start and −1 at each end in an array of 1,441 slots, then take a running sum; the peak of the running sum is the answer. No sort, no heap.

```python
def min_meeting_rooms_day(intervals):
    """Meetings are [start, end) in whole minutes, 0 <= start < end <= 1440."""
    delta = [0] * 1441                          # one slot per minute boundary
    for s, e in intervals:
        delta[s] += 1                           # a room is taken at s
        delta[e] -= 1                           # and free again at e (half-open)
    rooms = peak = 0
    for d in delta:                             # running sum = rooms in use
        rooms += d
        peak = max(peak, rooms)
    return peak
```

The same five meetings, showing only the slots a meeting touches:

| Minute | Changes in `delta` | Net | `rooms` after | `peak` |
|---|---|---|---|---|
| 540 | A starts | +1 | 1 | 1 |
| 555 | B starts | +1 | 2 | 2 |
| 570 | C starts | +1 | 3 | 3 |
| 585 | B ends, E starts | 0 | 3 | 3 |
| 600 | A ends, D starts | 0 | 3 | 3 |
| 615 | E ends | −1 | 2 | 3 |
| 630 | C ends | −1 | 1 | 3 |
| 660 | D ends | −1 | 0 | 3 |

The other 1,433 slots stay zero and leave `rooms` unchanged. Answer 3, matching the heap. Minute 585 is the half-open rule doing its work: B's −1 and E's +1 land in the same slot and cancel, so E takes B's room. With closed intervals you would write the −1 at `e + 1` instead, and the answer would become 4.

The cost is O(n + T) for T = 1,441 slots, which is O(n) because T is a constant fixed by the answer to the question. It is the [difference-array technique](/learn/data-structures/arrays-strings/prefix-sums-and-difference-arrays) applied to time.

### What it is worth, measured

One million random meetings within a day (durations of 1 to 120 minutes), the same machine and runtimes as above, best of three:

| Version | CPython 3.14 | Node 24 |
|---|---|---|
| Sort by start + min-heap | 0.686 s | 0.367 s |
| Sort starts and ends separately, two pointers | 0.402 s | 0.146 s (typed-array sort) |
| Difference array over 1,441 slots | 0.037 s | 0.0058 s |

All three returned the same peak. The difference array is about 18 times faster in CPython and 60 times faster in Node; at n = 10⁵ the CPython gap was 27 ms against 3 ms. Neither would time out; the point is that a cheap question changed the complexity class.

### When the answer is no

"Times are Unix timestamps in seconds over a year" makes T about 3.2 × 10⁷. A Python list of that many zeros is 8 bytes per slot, 252 MB, and on the same machine the running-sum loop over it measured 1.4 s before a single meeting was processed. The bound that made O(n) possible is gone, so you go back to sorting: either the heap, or sort the 2n endpoints and sweep them, which is coordinate compression in disguise. Say the threshold aloud: "if T is within a small multiple of n, and at most about 10⁷, the array wins; otherwise sort".

## Questions that do not change anything

- **"What language should I use?"** Pick the one you are fastest in; see [Choosing an interview language](/learn/senior-craft/languages-for-senior-engineers/choosing-an-interview-language).
- **"Can I use the standard library?"** Almost always yes. The exception is when a library call *is* the problem. For top-k, `heapq.nlargest` does the interesting part, so ask the precise version: "Is it fine to use the standard heap, or would you like to see the heap operations?"
- **"Should I handle null input?"** A one-line guard either way; state it. **"Is performance important?"** Always; ask for n instead.

## Examples are clarifying questions

The cheapest clarifying question is an example with your expected output: "So for `[[1,4],[4,5]]` I'd return `[[1,5]]`, right?" It checks the whole problem rather than one attribute, and interviewers answer a concrete example more precisely than an abstract question.

Write two examples: a normal one you work through fully, and a small one that tests a definition, such as touching intervals, ties, duplicates or an empty result. For [Merge Intervals](/practice/merge-intervals), the touching-endpoints example settles `<` versus `<=` before a single line of code exists. For Meeting Rooms II, B ending at 585 as E starts at 585 settles whether that is one room or two.

## When the interviewer says "your call"

Senior interviews often leave details open on purpose: you ask how ties break and hear "what do you think?" Do not ask again. Decide, say why, and say what would change:

> "Then I'll break ties by user id ascending so the output is deterministic and testable. If the product needed earliest-first-request instead, only the sort key changes."

Keep an **assumption ledger** as a comment at the top of the editor. It takes thirty seconds, stops you forgetting what you decided, and gives the interviewer something to point at during follow-ups.

```python
# Assumptions (agreed at 05:30)
# - log fits in memory; up to ~1e6 lines
# - each line: "<timestamp> <user_id> <path>"; malformed lines are skipped
# - ties broken by user_id ascending; k <= number of distinct users
# - output: list of (user_id, count), highest count first
```

When the follow-up arrives ("what if the log is 200 GB?"), you point at line two: "That's the assumption that changes. If the distinct users fit in memory, one streaming pass with a count per user. If not, partition lines by a hash of user id into files, count each partition, and merge the per-partition top-k lists."

## Scoping an open-ended problem

Practical and multi-part rounds ("implement an in-memory key-value store with expiry", "build a rate limiter") have short statements on purpose. The first five minutes are a small design exercise: a concrete interface and an explicit list of what you are not building.

> **Candidate:** Interface first: a class with `allow(key) -> bool`, the key being a user or API token, and a limit of N requests per W seconds set at construction. Two questions. Does the window need to be exact, or is a burst at window boundaries acceptable? Single process, or shared across servers?
>
> **Interviewer:** Exact, single process.
>
> **Candidate:** Then a sliding log per key: a deque of timestamps. Each call drops timestamps older than W and allows the request if fewer than N remain. I'll inject the clock so tests don't sleep. Out of scope for now: thread safety, evicting idle keys, sharing limits across servers.

The interface goes on the screen before any logic:

```python
from collections import deque
from typing import Callable
import time

class RateLimiter:
    def __init__(self, limit: int, window_s: float,
                 clock: Callable[[], float] = time.monotonic):
        self.limit, self.window, self.clock = limit, window_s, clock
        self.log: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = self.clock()
        q = self.log.setdefault(key, deque())
        while q and q[0] <= now - self.window:   # drop timestamps outside the window
            q.popleft()
        if len(q) < self.limit:
            q.append(now)
            return True
        return False
```

The signal is in three decisions: interface before internals, an injected clock for testability, and a spoken out-of-scope list, which turns later follow-ups into "that's what I set aside; here's how it changes".

Scoping also means naming the cost: the sliding log stores up to N timestamps per active key, so N = 1,000 and 10⁵ keys is 10⁸ floats, several gigabytes in CPython. "If N were large, a sliding-window counter or a token bucket keeps two numbers per key, at the price of exactness" shows the log was a choice. The [rate limiter case study](/learn/system-design/case-studies/rate-limiter) has the distributed version.

## A weak and a strong opening, side by side

Problem: "Return the k most frequent words in a document."

**Weak**, in either direction: typing a dictionary and a sort at 00:40, then meeting the tie rule at minute 28 and "it's a 50 GB corpus" at minute 35; or twelve unprioritised questions ("Punctuation? Hyphens? k zero? List or set?") and no example at minute 9, a fifth of the round spent on things one stated assumption covers.

**Strong:**

> **Candidate:** So I count word frequencies and return the k highest. Four things would change my code: roughly how big is the document and does it fit in memory; how are ties at k-th place broken; is the output in frequency order; and is k small compared with the distinct words? I'll assume lowercase, split on non-letters, and an empty list for an empty document.
>
> **Interviewer:** A few million words, fits. Ties alphabetical. Most frequent first. k is about 10.
>
> **Candidate:** Counting is O(n). For the top k, sorting d distinct words is O(d log d); a size-k heap is O(d log k), cheaper for k = 10. The tie rule needs care in the heap: I keep the k *largest* counts but ties prefer the *smallest* word, so the comparison is written explicitly. Example: `"b a b c a b"` with k = 2 gives `["b", "a"]`.

Forty-five seconds of questions, every answer used: size picks in-memory counting, the tie rule picks the key, the order picks the output shape, small k picks the heap. It is [Top K Frequent Elements](/practice/top-k-frequent) with the tiebreaker twist added.

## Clarifying does not stop at minute 8

Questions that come up while you code are asked then: "I've realised I don't know whether timestamps always increase. Do they?" beats a silent guess. In [Time-Based Key-Value Store](/practice/time-based-kv), that answer decides between append plus binary search and a sorted insert.

A question at minute 5 costs nothing; at minute 25 it may mean a rewrite, which is why size, order and sign go first. [Subarray Sum Equals K](/practice/subarray-sum-equals-k) is the classic case: a candidate who never asked about negative values writes a sliding window, and the first test with a negative number breaks it.

## How much is too much

A workable rule for a 45-minute round: three to five questions, two examples and one sentence of stated assumptions, all within five minutes. You are over-clarifying when no example is written yet, or when you are asking because you have no idea for the approach; that is being stuck, not clarifying (see [Getting unstuck](/learn/interview-patterns/interview-execution/getting-unstuck)).

| Strategy | Minutes spent | Risk of a late rewrite | What the notes say | Fails when |
|---|---|---|---|---|
| Code first, ask when blocked | 0–1 | High: size, memory and ties surface at minute 25+ | "did not clarify; missed the tie rule" | Any problem with a planted constraint |
| Ask everything up front | 8–10 | Low | "slow start; questions not prioritised" | The clock: testing and follow-ups get squeezed |
| Ask the three to five that change code, state the rest | 3–5 | Low | "clarified unprompted; stated assumptions" | Rarely; an unstated assumption can still be wrong, which the ledger exposes early |
| Example with expected output as the main question | 1–2 | Low for definitions, none for scale | "confirmed understanding with an example" | Scale and memory, which an example cannot reveal |

## Under the hood: how clarification is graded

Many rubrics have a dimension close to "problem understanding" (Ascend's mock interviewer calls it "problem understanding and clarification" and scores it 1 to 5, quoting moments from the transcript). Its evidence is narrow and checkable, which makes it one of the easiest dimensions to win; the [45-minute protocol](/learn/interview-patterns/interview-execution/the-45-minute-protocol) covers how the whole round becomes a write-up.

A commonly reported interviewer habit is to keep one material constraint in reserve: the input size, a memory limit, a tie rule, or "the times are minutes in a day". The note records whether it was asked for or revealed at a follow-up. Two plausible sets of notes for the top-k log problem:

```text
Candidate 1
03:05  restated in one sentence, correct
03:20  asked n, fits in memory?, tie rule, k vs distinct  (4 questions, all used)
03:40  tie rule -> "your call"; chose user_id asc, reason: deterministic + testable
04:10  example with expected output; matches mine
05:30  typed a 4-line assumption ledger; malformed lines: assumed + stated, not asked
31:00  revealed 200 GB -> pointed at ledger line 2; hash-partition plan in 90 s

Candidate 2
03:05  typing dict + sort, no questions
11:40  asked mid-code whether output should be sorted
24:50  I asked about ties -> order was dict order; patched the sort key
33:00  revealed 200 GB -> "hadn't considered it"; no plan by 36:00
```

In the debrief, this dimension is argued from three facts. First, **discovered versus volunteered**: how many of the constraints that mattered did the candidate ask for, and how many did the interviewer have to supply? "Found three of four; I volunteered the size" is a pass; "every constraint was volunteered" is a concern at any level. Second, **time to a confirmed example**: an example checked at minute 4 means the rest of the round was spent on the right problem. Third, **whether the assumptions absorbed the follow-up**: Candidate 1's 200 GB answer cites a line written at 05:30, which reads as planning, not luck. Question count is not one of the three; four material questions outrank twelve.

## Failure modes

**"Solved a slightly different problem."** *Cause:* no confirmed example, so a definitional difference (touching intervals, inclusive bounds, ties) survived until testing; check the minute at which the interviewer first agreed with an output you wrote. *Fix:* a confirmed example, including one that tests a definition.

**The follow-up forces a rewrite ("the log is 200 GB").** *Cause:* the memory, stream or range question was never asked and nothing on screen recorded the assumption. *Fix:* the assumption ledger, which turns the rewrite into "here is what changes".

**A hidden test times out although the algorithm "looked fine".** *Cause:* n was not asked, or was converted at the wrong rate: an O(n²) pair loop at n = 10⁵ is about 70 s in CPython on a fast desktop. *Fix:* ask n first and convert with measured per-iteration costs, allowing a factor of ten for slower hardware.

## Interviewer follow-ups

**"Why did you ask whether times were minutes in a day?"** Model answer: a bounded range lets me index by value instead of comparing values, O(n + T) with T = 1,441. Common wrong answer: "to be thorough", which says the question was not chosen for a reason.

**"Now times are Unix timestamps over a year."** Model answer: T is about 3.2 × 10⁷ (252 MB, 1.4 s to scan, as measured above), so sort the 2n endpoints and sweep, O(n log n), independent of T. Common wrong answer: "the difference array is still O(n)", which drops the O(T) term that has become the dominant one.

**"You chose ties by user id. What if product wants the earliest first request?"** Model answer: the tiebreaker moves into the key as `(-count, first_seen[user])`, which needs one more map filled in the counting pass; complexity unchanged. Common wrong answer: sorting again after the top-k selection, which cannot promote a user the heap has already evicted.

## What mid-level engineers get wrong

- **Asking for n and then not using it.** The answer 10⁵ should produce an out-loud budget; without one the question is decoration, and an O(n²) plan survives to minute 20.
- **Asking the universal questions but not the type-specific one.** Size and sortedness asked, but "do touching intervals merge?" not asked, so `<` versus `<=` is decided by accident.
- **Designing for the worst case nobody asked about.** Building the distributed version before the single-process one exists, which is how practical rounds run out of time.
- **Forgetting the O(T) term.** Proposing a counting or difference array without asking the range, then discovering the range is 10⁹.

## Senior signals

- You ask for the input size first and turn it into a budget out loud, with a per-operation cost you can defend and the hardware caveat.
- Every question you ask has an answer you use, and you can say which way each answer sends the design.
- You carry a type-specific question for the problem in front of you (touching intervals, UTF-16 length, overflow, parent pointers), not only the universal five.
- You spot when a bounded range removes a `log n`, and you state the threshold at which it stops paying.
- You scope open-ended problems by fixing the interface first and naming what is out of scope.
- You keep an assumption ledger and use it to absorb follow-ups: "that's the memory assumption; here's what changes".

## Check yourself

```quiz
- q: >-
    You have a sort-plus-heap plan for Meeting Rooms II. Which answer to a clarifying question lets you drop the sort and solve it in O(n)?
  options: ["Times are whole minutes within one day", "No two meetings share a start time", "Back-to-back meetings may share a room", "Meetings arrive already sorted by start"]
  answer: 0
  explanation: >-
    A bounded integer range lets you index by time: +1 at each start and -1 at each end in 1,441 slots, then a running sum whose peak is the answer, O(n + 1,440). Sorted starts remove one sort, but the heap of end times still costs O(log r) per meeting. Distinct starts and the back-to-back rule change a comparison, not the complexity class.
- q: >-
    Measured on a fast desktop, a CPython pair comparison in a nested loop costs about 14 ns. Roughly how long does an O(n²) pair loop take at n = 10⁵?
  options: ["About 70 s, so the quadratic plan is out", "About 7 s, which is borderline but passes", "About 0.1 s, so the quadratic plan is fine", "About 3 hours, since Python is interpreted"]
  answer: 0
  explanation: >-
    n² / 2 is 5 × 10⁹ pairs; at 14 ns each that is 70 seconds, before allowing for slower laptops or judges. At n = 2,000 the same loop measured 28 ms, which is why the size answer, converted into a budget, decides whether the brute force is acceptable.
- q: >-
    A JavaScript solution for "longest substring without repeating characters" uses s.length and s[i]. Which answer to a clarifying question breaks it?
  options: ["The input may contain emoji like 😀", "The input may repeat one letter only", "The input may be the empty string", "The input may contain uppercase letters"]
  answer: 0
  explanation: >-
    JavaScript strings are UTF-16: an emoji outside the Basic Multilingual Plane is two code units, so s.length counts it as 2 and s[i] returns half a surrogate pair. Iterating with for...of or Array.from works on code points. Uppercase, empty and single-letter inputs need no change of representation.
- q: >-
    The interviewer changes Meeting Rooms II so that times are Unix timestamps in seconds over a year. What should happen to the difference-array solution?
  options: ["Replace it with a heap of start times per room", "Keep it, but store the array as a Python dict", "Replace it with a sweep over the sorted endpoints", "Keep it, since it remains O(n) for any input"]
  answer: 2
  explanation: >-
    The array has one slot per time unit, about 3.2 × 10⁷ here: 252 MB as a Python list and 1.4 s to scan on a fast desktop, and the O(T) term now dominates. Sorting the 2n endpoints and sweeping costs O(n log n) independent of T. A dict keyed only by endpoints can work but must still be iterated in time order, which is the sort again.
- q: >-
    You ask how ties at k-th place should be broken and hear "your call". What is the strongest response?
  options: ["Return every tied item to satisfy any rule", "Ask the same question again in other words", "Ignore ties, as real inputs rarely have them", "Pick a rule, give a reason, say what changes"]
  answer: 3
  explanation: >-
    "Your call" tests whether you can make and own a reasonable decision: choose a rule such as user id ascending for deterministic, testable output, write it in the assumption ledger, and say the key changes if the product wants another rule. Asking again signals you need to be told; ignoring ties makes output nondeterministic; returning extra items changes the function's contract.
- q: >-
    In a debrief, which fact most strengthens a candidate's problem-understanding rating?
  options: ["The candidate asked more than ten clarifying questions", "The material constraints were asked for, not volunteered", "The candidate avoided asking and inferred all constraints", "The candidate wrote the distributed design before coding"]
  answer: 1
  explanation: >-
    Interviewers commonly hold one material constraint in reserve and note whether the candidate asked for it or had to be told. Discovered constraints, an example confirmed early, and assumptions that absorb the follow-up are the evidence. Question count is not: four material questions outrank twelve, and silent inference leaves nothing in the notes.
```
