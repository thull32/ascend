---
slug: clarifying-and-scoping
title: "Clarifying and scoping: the questions that choose the algorithm"
description: Which clarifying questions change the approach and which only burn time, how to turn n into an operation budget, how to state assumptions when the interviewer says "your call", and how to scope an open-ended practical problem.
minutes: 21
difficulty: medium
tags: [interview, clarifying-questions, constraints, scoping, assumptions]
problems: [top-k-frequent, merge-intervals, subarray-sum-equals-k, time-based-kv]
---
"Given a log of API requests, return the k users who made the most requests." You can have a hash map and a sort on the screen in ninety seconds. Then at minute 25 the interviewer asks what happens when two users tie for k-th place, and you discover your output order depends on dictionary iteration order. At minute 35 they mention that the log is 200 GB. The code handles neither, and it is too late to change the approach.

Every one of those facts was available at minute 4 for the price of a question. Clarifying is not a politeness ritual before the real work starts; it is the step where the algorithm gets chosen. The input size picks the complexity class. The value range picks between a hash map and an array. "Is it sorted?" picks two pointers or binary search. "Does it fit in memory?" picks between an in-memory algorithm and a streaming one. The opposite failure is just as real: twelve questions in eight minutes, most of whose answers you never use, reads as stalling. This lesson is about asking the four or five questions whose answers you *will* use, and knowing before you ask which way each answer sends you.

## A question is worth asking if the answer changes your code

Before asking anything, run a quick test: for each possible answer, would I write different code? If yes, ask. If no, assume, and state the assumption in a sentence.

"Can the list be empty?" usually fails this test, because you will handle empty input with a one-line guard either way. State it instead: "I'll return an empty list for empty input." "Can values be negative?" often passes. For "longest subarray with sum at most k", non-negative values mean the window sum only grows when you extend the window and only shrinks when you contract it, so a sliding window works. Negatives break that property and push you towards prefix sums combined with binary search or a sorted structure. One answer selects the algorithm.

## The questions that change the algorithm

| Question | If the answer is… | …the approach shifts to |
|---|---|---|
| How large is n? | ≤ 20 | Exponential is fine: backtracking, bitmask enumeration |
| | up to a few thousand | O(n²) is fine: nested loops, 2D DP |
| | 10⁵ to 10⁶ | O(n log n) or O(n): sort, heap, hash map, two pointers |
| | 10⁹ or unbounded | Stream, sample, or use math or binary search on the answer |
| Can values be negative or zero? | Yes | Sum-based sliding windows break; prefix sums plus a hash map; max-product needs a running min and max |
| What is the value range? | Small (0–255, lowercase letters) | A counting array instead of a hash map; counting sort |
| Is the input sorted? | Yes | Two pointers, binary search, merge-style walks |
| Are there duplicates? | Yes | Dedupe logic in backtracking; first/last-occurrence binary search |
| One answer or all? Any valid one? | All | Enumeration; the output size may dominate the complexity |
| What exactly is returned? | Indices, not values | Sorting destroys indices, so sort pairs or use a hash map |
| How are ties broken? | A specified order | The sort key or heap key must include the tiebreaker |
| May I modify the input? | Yes | In-place tricks with O(1) extra space: cyclic sort, marking by sign |
| Does it fit in memory? Is it a stream? | No / yes | One pass, bounded state, a heap of size k, external sort |
| Called once or many times? | Many queries | Precompute once (prefix sums, an index, a sort), then answer each query fast |

The first row does the most work. Ask for n every time, then convert it into a budget.

## Turning n into a budget

A rough but reliable rule: compiled languages do something like 10⁸ to 10⁹ simple operations per second, and Python does something like 10⁷. Judges and interviewers both think in these orders of magnitude, even when nothing is being run.

Worked for n = 10⁵:

- O(n²) = 10¹⁰ operations: minutes in a compiled language, hours in Python. Out.
- O(n log n) ≈ 10⁵ × 17 ≈ 1.7 × 10⁶: milliseconds. In.
- O(n) = 10⁵: trivial.

For n = 2,000, O(n²) is 4 × 10⁶, which is fine even in Python. That changes which solution you should write. If the brute force is O(n²) and n is 2,000, write the brute force cleanly and spend the saved minutes on tests and follow-ups. Saying "n is small enough that the quadratic version is fine and much simpler; I'd only optimise if n grew" is a senior sentence, not a lazy one, provided you can also say what the optimisation would be.

For n ≤ 20, 2²⁰ ≈ 10⁶ subsets. A constraint that small is often a signal that the problem wants exponential search with pruning, or bitmask DP.

If the interviewer will not give you n ("assume it's large"), treat it as 10⁵ to 10⁶ and say so.

## Questions that do not change anything

Some questions feel diligent and are not.

- **"What language should I use?"** Pick the one you are fastest in; see [Choosing an interview language](/learn/senior-craft/languages-for-senior-engineers/choosing-an-interview-language).
- **"Can I use the standard library?"** Almost always yes. The exception is when a library call *is* the problem. For top-k, `heapq.nlargest` does the interesting part, so ask the precise version: "Is it fine to use the standard heap, or would you like to see the heap operations?"
- **"Should I handle null input?"** A one-line guard either way. State it.
- **"Is performance important?"** It always is. Ask for n instead.
- **Questions the example already answers.** If the example output is sorted by count, descending, confirm it in a clause ("and highest count first, like the example") rather than asking.

## Examples are clarifying questions

The cheapest clarifying question is an example with your expected output: "So for `[[1,4],[4,5]]` I'd return `[[1,5]]`, right?" It checks your understanding of the whole problem, not one attribute of it, and it tends to surface the edge case you had not thought to ask about. Interviewers often answer a concrete example more precisely than an abstract question, because they can check it against their notes.

Write two examples: a normal one that you work through fully, and a small one that tests a definition, such as touching intervals, ties, duplicates or an empty result. For [Merge Intervals](/practice/merge-intervals), the touching-endpoints example settles `<` versus `<=` before a single line of code exists.

## When the interviewer says "your call"

Senior interviews often leave details deliberately open. You ask how ties should be broken and hear "what do you think?" That is not evasion; they are checking whether you can make a reasonable decision and own it. Do not ask again. Decide, say why, and say what would change:

> "Then I'll break ties by user id ascending so the output is deterministic, which also makes it testable. If the product needed something else, like earliest first request, it's only a change to the sort key."

Keep an **assumption ledger** as a comment at the top of the editor. It takes thirty seconds, it stops you forgetting what you decided, and it gives the interviewer something to point at during follow-ups.

```python
# Assumptions (agreed at 05:30)
# - log fits in memory; up to ~1e6 lines
# - each line: "<timestamp> <user_id> <path>"; malformed lines are skipped
# - ties broken by user_id ascending; k <= number of distinct users
# - output: list of (user_id, count), highest count first
```

When the follow-up arrives ("what if the log is 200 GB?"), you point at line two: "That's the assumption that changes. Here's what I'd do instead: a streaming count per user if the distinct users fit in memory; otherwise partition by hash of user id into files, count each partition, and merge the per-partition top-k lists."

## Scoping an open-ended problem

Practical and multi-part rounds are increasingly common at senior level: "implement an in-memory key-value store with expiry", "build a rate limiter", "write a log aggregator". The statement is short on purpose, and the first five minutes are a small design exercise. Your job is to turn the statement into a concrete interface and an explicit list of what you are not building.

Take "implement a rate limiter". A strong scoping pass sounds like this:

> **Candidate:** Let me pin down the interface first. I'm thinking of a class with `allow(key) -> bool`, where the key is a user or API token, and a limit of N requests per W seconds set at construction. Two questions. Does the window need to be exact, or is a small burst at window boundaries acceptable? And is this single-process, or shared across servers?
>
> **Interviewer:** Exact, single process. Keep it simple.
>
> **Candidate:** Then I'll keep a sliding log per key: a deque of timestamps. On each call I drop timestamps older than W and allow the request if fewer than N remain. I'll inject the clock so tests don't need to sleep. Out of scope for now: thread safety, cleaning up idle keys, and sharing limits across servers. I'll come back to how each would change at the end.

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
        ...
```

Three decisions in that pass carry most of the signal. The interface is chosen before the internals. The clock is injected, so the code is testable. And the out-of-scope list is spoken aloud. That list turns the later follow-ups into "yes, that's the thing I set aside; here's how it changes" rather than "oh, I hadn't thought of that".

Scoping also means naming the cost of the choice you made. The sliding log stores up to N timestamps per key, which is O(N) memory per active key. Saying "if N were large, a sliding-window counter or a token bucket would bound memory at the price of exactness" shows you chose the log on purpose.

## A weak and a strong opening, side by side

Problem: "Return the k most frequent words in a document."

**Weak, with too few questions:**

> "OK, I'll count with a dictionary and sort." *(starts typing at 00:40)*

The code works on the example. At minute 28 the interviewer asks about ties. The sort key does not include the word, so equal-count words come out in insertion order, which does not match the expected output. At minute 35: "The document is a 50 GB corpus." The candidate has nothing prepared.

**Weak, with too many:**

> "Is the document a string or a list? Are words separated only by spaces? What about punctuation? Uppercase? Hyphens? Apostrophes? Is k always positive? Can k be zero? Can k exceed the number of words? What if the document is empty? Should I return a list or a set? Do you want the counts too?" *(minute 9, no example yet)*

Several of these are reasonable on their own, but asked as a list they show no prioritisation and use up a fifth of the round. Tokenisation rules can be assumed and stated in one line.

**Strong:**

> **Candidate:** So I count word frequencies and return the k highest. Four things would change my code. Roughly how big is the document, and does it fit in memory? How are ties at k-th place broken? Should the output be in frequency order? And is k small compared with the number of distinct words? I'll assume lowercase, split on non-letters, and return an empty list for an empty document.
>
> **Interviewer:** Fits in memory, a few million words. Ties alphabetical. Yes, most frequent first. k is small, around 10.
>
> **Candidate:** Then counting is O(n). For the top k, I can sort the d distinct words in O(d log d), or keep a heap of size k in O(d log k). With k around 10 the heap is cheaper. The tie rule needs care in the heap, because I'm keeping the k *largest* counts but ties prefer the *smallest* word, so I'll write the comparison explicitly. Example: `"b a b c a b"` with k = 2 gives `["b", "a"]`.

Forty-five seconds of questions, and every answer is used: the size picks in-memory counting, the tie rule picks the key, the order picks the output shape, and small k picks the heap. The tokenisation assumptions are stated, not asked. This is the same shape as [Top K Frequent Elements](/practice/top-k-frequent) with a tiebreaker added, which is exactly the kind of twist interviewers add to a known problem.

## Clarifying does not stop at minute 8

New questions come up while you code, and it is fine to ask them then: "I've just realised I don't know whether timestamps are guaranteed to increase. Are they?" That is far better than guessing silently. [Time-Based Key-Value Store](/practice/time-based-kv) is a good example: whether `set` timestamps arrive in increasing order decides whether you can append to a list and binary-search it, or need a sorted insert.

What changes is the cost. A question at minute 5 costs nothing; the same question at minute 25 may mean rewriting code. That is why the size, order and uniqueness questions, which are the ones most likely to invalidate an approach, belong at the front. [Subarray Sum Equals K](/practice/subarray-sum-equals-k) is the classic case: a candidate who never asked about negative values writes a sliding window, and the first test with a negative number breaks it.

## How much is too much

A workable rule for a 45-minute round: three to five questions, two examples and one sentence of stated assumptions, all within five minutes. Signs you are over-clarifying:

- You are asking about things that would be a one-line guard either way.
- You are asking questions the example already answers.
- You have not written an example yet.
- You notice you are asking because you do not yet have an idea for the approach. That is being stuck, not clarifying; see [Getting unstuck](/learn/interview-patterns/interview-execution/getting-unstuck).

To practise, start a coding interview on `/interviews` and treat the first five minutes as the whole exercise. The mock interviewer answers clarifications the way a real one does: it gives constraints when you ask for them and does not volunteer the approach. The report's "problem understanding and clarification" score tells you whether your questions landed.

## Senior signals

- You ask for the input size first and turn it into an operation budget out loud.
- Every question you ask has an answer you use, and you can say which way each answer sends the design.
- When told "your call", you decide, justify the decision, and note what would change, rather than asking again.
- You scope open-ended problems by fixing the interface first and naming what is out of scope.
- You keep an assumption ledger and use it to absorb follow-ups: "that's the memory assumption; here's what changes".
- You use an example with an expected output as a clarifying question, and it catches definitional edge cases (touching, ties, duplicates) before any code exists.

## Check yourself

```quiz
- q: >-
    For "find the longest subarray with sum at most k", which clarifying question most changes the algorithm?
  options: ["Can the values in the array be negative?", "Can the array be empty or hold one element?", "Should I return the length or the subarray?", "Which programming language should I use?"]
  answer: 0
  explanation: >-
    With non-negative values, extending the window never decreases the sum and shrinking never increases it, so a sliding window is correct. Negative values break that monotonicity and force a different technique. Empty input is a one-line guard, and returning the subarray instead of its length changes only the bookkeeping.
- q: >-
    n is at most 2,000 and the brute force is O(n²). What is the best plan?
  options: ["Find an O(n log n) solution before writing any code", "Ask the interviewer to raise n so the problem is harder", "Use a hash map, since it is faster at any input size", "Write the O(n²) version cleanly; name the faster idea"]
  answer: 3
  explanation: >-
    Converting n into an operation count is the point of asking for it. About 4 × 10⁶ operations is fast even in Python, so the simpler code is the better engineering choice, and describing the optimisation you would use if n grew shows you are choosing simplicity rather than missing the alternative.
- q: >-
    You ask how ties should be broken and the interviewer says "your call". What is the strongest response?
  options: ["Ignore ties, since they rarely occur in real inputs", "Rephrase the question slightly and ask it once more", "Choose a rule, justify it, and note what would change", "Return every tied item so that any rule is satisfied"]
  answer: 2
  explanation: >-
    "Your call" tests whether you can make and own a reasonable decision: pick a rule, give a reason such as deterministic output for testing, record it in your assumptions, and say how the code would change for a different rule. Asking again signals you need to be told. Ignoring ties makes the output nondeterministic, and returning extra items changes the contract of the function.
- q: >-
    In a practical "build a rate limiter" round, which opening move carries the most signal?
  options: ["Fixing the interface and naming what is out of scope", "Implementing thread safety first, before any logic", "Designing the distributed version from the start", "Asking which language the company uses in production"]
  answer: 0
  explanation: >-
    Scoping an open problem means choosing a concrete interface, making it testable (for example by injecting the clock), and being explicit about what you are deferring. Starting with thread safety or distribution builds the hardest parts first without a working core, which is how practical rounds run out of time.
- q: >-
    Which of these questions is most likely to read as stalling rather than clarifying?
  options: ["Is the input already sorted?", "How should ties be broken?", "How large is n, roughly?", "Should I handle a null input?"]
  answer: 3
  explanation: >-
    Null handling is a one-line guard whatever the answer, so state your assumption instead of asking. Size, sortedness and tie-breaking each change which algorithm or key you write.
```
