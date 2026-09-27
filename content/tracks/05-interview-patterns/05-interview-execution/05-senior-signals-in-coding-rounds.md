---
slug: senior-signals-in-coding-rounds
title: "Senior signals in coding rounds: same problem, different rating"
description: What separates a senior rating from a mid-level one when two candidates write the same correct code, dimension by dimension, with a side-by-side LRU cache round, the follow-up ladder, and what changes in AI-assisted rounds.
minutes: 19
difficulty: medium
tags: [interview, senior, coding-round, levelling, lru-cache, ai-assisted]
problems: [lru-cache, merge-intervals, time-based-kv]
---
Two candidates get the same LRU cache problem in the same week. Both produce correct O(1) code with a hash map and a doubly linked list. Both pass every test. One comes out with "hire, senior-consistent". The other gets "hire, but at the level below", or "leaning no for senior". Nobody tells either of them why, and the second candidate spends the next month grinding more problems, which will not help, because the difference was never the algorithm.

The difference is almost entirely in *how* the 45 minutes were spent: who drove the session, whether trade-offs were stated or left implicit, whether the code read like something you would approve in review, whether testing happened unprompted, and what happened when the interviewer asked "now what if it's shared across threads?" This lesson makes those differences concrete, dimension by dimension, and then shows them side by side in a single round.

## How coding rounds feed the level decision

Be clear-eyed about what coding rounds do. At many large companies, the coding bar for mid-level and senior engineers is similar and the problems overlap heavily. Level is decided mostly by system design and behavioural rounds, where scope and judgement show more directly. See [The FAANG loop](/learn/senior-craft/getting-the-job/the-faang-loop) for how the pieces combine.

That does not make coding rounds level-neutral. They can pull a level decision *down*: a senior candidate who needs heavy hints, writes messy code, or has to be led through every phase looks mid-level in that round, and a hiring committee reading "strong system design, but the coding felt junior" will hesitate. Some companies, especially those using practical, multi-part coding problems, deliberately look for senior signals in the coding round itself: code structure, extensibility, production awareness. So the goal is not merely to pass; it is to produce a round whose notes read "senior-consistent".

## The five dimensions, mid-level versus senior

Most coding rubrics reduce to five dimensions. They are also the five that Ascend's mock interviewer scores. Here is what a pass looks like at each level.

| Dimension | Mid-level pass | Senior pass |
|---|---|---|
| Problem understanding and clarification | Asks questions when prompted; understands the problem | Drives clarification, finds the constraint that matters, states assumptions, scopes open problems |
| Algorithmic approach and complexity | Reaches the optimal approach, perhaps with a nudge; states complexity | Presents alternatives with trade-offs, chooses for a stated reason, gives complexity with its assumptions (expected vs worst, auxiliary vs total) |
| Code quality and correctness | Working code | Readable, well-named, decomposed code that is correct on the first trace; appropriate structure without gold-plating |
| Testing and edge cases | Tests when asked; covers the obvious cases | Tests unprompted with chosen cases; finds own bugs; re-checks complexity against the code |
| Communication | Explains when asked; responds to the interviewer | Drives the session, manages the clock, makes decisions visible, treats the interviewer as a collaborator |

Notice that the senior column is not "knows harder algorithms". It is *ownership*: of the problem definition, of the choice, of the quality, of the verification, and of the session itself. That is the same thing a senior engineer is paid for at work, which is why interviewers look for it. [What senior means](/learn/senior-craft/technical-leadership/what-senior-means) covers the job-level version.

## Side by side: one LRU cache, two candidates

The problem: implement an LRU cache with `get(key)` and `put(key, value)` in O(1), evicting the least recently used entry when capacity is reached. This is [LRU Cache](/practice/lru-cache).

### Opening minutes

**Candidate A:**

> "OK, so I need a hash map for O(1) lookup and a doubly linked list for ordering. I'll start coding."

**Candidate B:**

> "Two quick questions. Does `get` count as a use, so it refreshes recency? And can capacity be zero? I'll assume integer keys and a single thread for now and come back to concurrency at the end. The standard approach is a hash map from key to node plus a doubly linked list in recency order, so `get`, `put` and eviction are all O(1). In Python, `OrderedDict` with `move_to_end` does exactly this and is what I'd use in production. Would you like me to use it, or build the list myself?"
>
> **Interviewer:** Build it yourself.

A's approach is correct. B's is the same approach, but B has settled two semantic questions that affect correctness, deferred concurrency explicitly, and shown awareness of the production answer without hiding behind it. B has also let the interviewer choose what they want to see, which avoids the awkward moment where a candidate reaches for `OrderedDict` and the interviewer has to ask them to start again.

### The code

Candidate A writes one class with pointer manipulation inline in `get` and `put`, about 45 lines with the unlink logic duplicated three times. It works.

Candidate B:

```python
class Node:
    __slots__ = ("key", "val", "prev", "next")

    def __init__(self, key=0, val=0):
        self.key, self.val = key, val
        self.prev = self.next = None


class LRUCache:
    def __init__(self, capacity: int):
        self.cap = capacity
        self.map: dict[int, Node] = {}
        # Sentinels: head.next is least recently used, tail.prev is most recent.
        self.head, self.tail = Node(), Node()
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, node: Node) -> None:
        node.prev.next, node.next.prev = node.next, node.prev

    def _append(self, node: Node) -> None:
        node.prev, node.next = self.tail.prev, self.tail
        self.tail.prev.next = node
        self.tail.prev = node

    def get(self, key: int) -> int:
        node = self.map.get(key)
        if node is None:
            return -1
        self._unlink(node)
        self._append(node)
        return node.val

    def put(self, key: int, value: int) -> None:
        if self.cap <= 0:
            return
        node = self.map.get(key)
        if node is not None:
            node.val = value
            self._unlink(node)
            self._append(node)
            return
        if len(self.map) == self.cap:
            lru = self.head.next
            self._unlink(lru)
            del self.map[lru.key]
        node = Node(key, value)
        self.map[key] = node
        self._append(node)
```

B narrates three decisions while writing, and only three: "Sentinel nodes, so unlink and append never check for null." "The node stores its key, because eviction starts from the node and has to delete the map entry." "Two helpers, because every operation is some combination of unlink and append." The code has one comment, and it states the invariant. Nothing is over-engineered: there is no abstract base class, no generic type parameters, no configurable eviction policy.

### Testing

A, when asked: "It should work. Let me run the example." The example passes.

B, unprompted: "Let me test the cases that break LRU implementations. First, capacity one: put 1, put 2, and 1 should be evicted. Second, updating an existing key must not evict anything, and must refresh recency: put 1, put 2, put 1 again with a new value, put 3; now 2 should be evicted, not 1. That second case is where people forget to move the node. Third, a `get` refreshes recency, which the example covers." B runs them. All pass.

### The follow-up

The interviewer asks: "How would you make this thread-safe?"

**A:** "I'd add a lock around `get` and `put`."

**B:** "The simplest correct version is one lock around both methods. Note that `get` mutates the list, so even reads need the lock, which serialises every operation on the cache. If that becomes the bottleneck, the usual move is to stripe: hash each key to one of N independent LRU caches, each with its own lock. That gives up global LRU order; eviction becomes LRU within a stripe, which is usually fine. Production caches often go further and approximate LRU to make reads cheaper. Redis, for example, evicts by sampling a few keys and picking the oldest of them, rather than maintaining an exact list. I'd pick based on the measured contention and the hit rate we need."

A's answer is not wrong. B's answer shows that B knows *why* the obvious answer has a cost (reads need the exclusive lock too), knows the standard escalation (striping) and its price (approximate LRU), and knows how production systems actually approach it, all in about forty seconds, and closes by tying the choice to measurement. That is the senior signal, and it only appeared because B reached the follow-up with time to spare.

## The senior deltas, one at a time

### You drive the session

You move from phase to phase without being prompted, announce transitions, and keep the clock. The interviewer should feel like a collaborator you are working with, not a proctor pushing you along. The [45-minute protocol](/learn/interview-patterns/interview-execution/the-45-minute-protocol) is the mechanism.

### Trade-offs are spoken, including what you would not do

For every significant choice, name the alternative and the condition under which you would switch. "Heap of size k, O(n log k), because k is small; if k were close to n, I'd sort." Saying what you would *not* do, and why, is one of the clearest seniority markers, because it shows you saw the whole option space rather than the first option that worked.

### Code reads like production code, without gold-plating

Good names. Small helpers where they remove duplication. Invariant comments rather than narration comments. Validation at the boundary, not scattered through the logic. Equally important is what you leave out: no class hierarchies, no configuration, no generality nobody asked for. Over-engineering a 40-line problem is a negative signal, because at work it shows up as over-engineered systems.

### You know the gap between the interview answer and production

A sentence or two, not a lecture: "In production I'd use `OrderedDict`"; "a real rate limiter would need to be shared across instances, which moves the state to Redis"; "for 10⁹ items I'd sort externally". This shows you know the interview version is a model, not the thing itself. Keep it brief; name-dropping without substance reads worse than silence.

### Follow-ups are design questions, and you answer them as such

Follow-ups tend to climb a ladder. Here is the typical ladder with mid-level and senior answers:

| Follow-up | Mid-level answer | Senior answer |
|---|---|---|
| "n is now 10⁹" | "Use a faster language" | Names what no longer fits in memory; proposes streaming, external sort or sharding, and gives the new cost |
| "Input arrives as a stream" | "Re-run the algorithm on each arrival" | Identifies the incremental state that makes each update cheap; gives the amortised cost |
| "Make it thread-safe" | "Add a lock" | Says what the lock serialises, the contention cost, striping or lock-free alternatives, and what each gives up |
| "Now it's distributed" | "Use Redis" | Partitioning key, consistency of the operation across nodes, what is approximated, what fails |
| "Values have different sizes" | "Count items" | Capacity in bytes; evict in a loop until under budget; notes that a large insert can evict many entries |

You do not need a perfect answer to each rung. You need to reason from the mechanism, name the cost, and say what you would measure.

### Your confidence is calibrated

"I'm confident this is O(n) amortised, because each element is pushed and popped at most once. I'm less sure about the worst case of the rehash; let me think…" Senior engineers say which parts they are sure of and which they are not. Bluffing is the one behaviour graded lower than not knowing, because at work it causes incidents.

## Anti-signals that read as mid-level

- **Silent coding**, then a finished function. The interviewer cannot see your reasoning, so they cannot credit it.
- **A recited solution with no derivation.** Interviewers notice when an answer arrives fully formed, and they respond by changing a constraint. If you know the problem, say so honestly ("I've seen a version of this") and then show the reasoning anyway.
- **Waiting to be told what to do next.** "Should I code it now?" once is fine. At every transition, it signals you need direction.
- **Defensiveness about bugs**, or arguing with a hint.
- **Over-engineering**, or name-dropping technologies without explaining the mechanism.
- **Running out of time with no testing.** It suggests you do not manage your own delivery.

## When the round allows an AI assistant

Some companies have started running coding rounds in which candidates may use an AI assistant, reflecting how engineers now work. The senior signal does not disappear in these rounds; it moves. Typing speed and syntax recall matter less. What gets scored is how well you *direct* and *verify*: breaking the problem down before prompting, giving the assistant the constraints you clarified, reading every line it produces, testing it with the same deliberately chosen cases, catching and explaining its mistakes, and being able to justify every line you accept. Blind acceptance of generated code is the AI-era version of silent coding, and it is scored harshly.

Ascend's mock interviews support both modes. Choose **Solo** on `/interviews` for the classic round, with the coach locked. Choose **AI-assisted** to get an AI pair-programmer in a side panel. The interviewer will ask you to justify what you accept, everything you ask the assistant is visible to the grader, and the report adds an "AI direction and verification" dimension that is weighted heavily. [The AI-native interview](/learn/ai-assisted-engineering/senior-engineering-with-ai/the-ai-native-interview) covers this format in depth. Practise both; you may meet either.

## Practising for the senior column

Pick a problem you can already solve, such as [LRU Cache](/practice/lru-cache) or [Time-Based Key-Value Store](/practice/time-based-kv), and run it as a solo mock on `/interviews`. Solving it is not the point. After the report comes back, read each dimension's notes against the senior column of the table above, and list the specific moments where you were in the mid-level column: a trade-off you did not state, a test you only ran when asked, a follow-up you answered with a technology name instead of a mechanism. Then run the same problem again a week later and target those moments. Problems you already know are the best practice for senior signals, because all your attention is free for everything except the algorithm.

## Senior signals

- You own each phase, from clarification to verification, without being prompted, and treat the interviewer as a collaborator.
- You state alternatives with the conditions under which you would switch, including what you would not do.
- Your code is clean and decomposed with invariant comments, and deliberately free of unrequested generality.
- You mention the production equivalent or the limits of the interview answer in a sentence, without lecturing.
- You answer follow-ups from the mechanism: what breaks, what replaces it, what it costs, and what you would measure.
- In AI-assisted rounds, you direct, verify and justify every line you accept.

## Check yourself

```quiz
- q: >-
    Two candidates write the same correct LRU cache. Which behaviour most distinguishes the senior candidate?
  options: ["Clarifying semantics and testing edge cases unprompted", "Finishing the same working code a few minutes faster", "Mentioning as many caching technologies as possible", "Splitting the solution into more classes and interfaces"]
  answer: 0
  explanation: >-
    Seniority shows in ownership: settling the semantics that affect correctness (does get refresh recency?), verifying without being asked (the update-existing-key case), and reasoning about trade-offs from the mechanism (the cost of locking on reads). Speed matters little once the code is correct, extra classes are over-engineering, and name-dropping without mechanism reads as shallow.
- q: >-
    At many large companies, what role does the coding round typically play in the level decision?
  options: ["It matters for level only when hiring new graduates", "It has no effect on level; it is a pure pass or fail", "A bar check, though weak execution can pull level down", "It alone decides the level, and other rounds confirm it"]
  answer: 2
  explanation: >-
    Level is usually driven more by system design and behavioural rounds, so the coding round is mostly a bar check, but a coding round that looks mid-level (heavy hints, messy code, needing to be led) undermines a senior case. Practical, multi-part coding rounds often assess senior signals such as structure and extensibility directly.
- q: >-
    The interviewer asks how to make your LRU cache thread-safe. Which answer is strongest?
  options: ["Use a concurrent hash map in place of the plain dict", "One lock serialises even gets; stripe by key if contended", "None is needed, since caches never need to be thread-safe", "Add one lock around get and put, and the job is done"]
  answer: 1
  explanation: >-
    One lock is simplest, but get mutates recency, so reads serialise too. Striping by key hash cuts contention at the price of per-stripe rather than global LRU, and production caches often approximate LRU; choose based on measured contention. That answer names the obvious solution, its hidden cost, the escalation and what it gives up. A concurrent map alone does not protect the linked list, which is where the races are.
- q: >-
    Which is an example of gold-plating that counts against you in a 45-minute coding round?
  options: ["Extracting a helper that removes duplicated pointer logic", "Writing a one-line comment stating the list's invariant", "Adding a pluggable eviction policy and generic types", "Validating the capacity argument in the constructor"]
  answer: 2
  explanation: >-
    Unrequested generality, such as a pluggable eviction-policy interface and type parameters nobody asked for, costs time and signals a habit of over-building. Helpers that remove duplication, invariant comments, and validation at the boundary are all signs of good judgement.
- q: >-
    In an AI-assisted coding round, what replaces "silent coding" as the key anti-signal?
  options: ["Asking the assistant to produce a first draft of the code", "Accepting generated code without reading or testing it", "Using the AI assistant at any point during the round", "Pointing out and correcting the assistant's mistakes"]
  answer: 1
  explanation: >-
    In assisted rounds you are graded on direction and verification. Using the assistant and asking it for drafts are expected; catching and explaining its mistakes is a strong positive. Accepting its output without reading, testing or being able to justify it hides your reasoning, just as silent coding does, and it risks shipping bugs.
```
