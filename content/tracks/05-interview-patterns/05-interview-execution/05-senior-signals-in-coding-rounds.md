---
slug: senior-signals-in-coding-rounds
title: "Senior signals in coding rounds: same problem, different rating"
description: What separates a senior rating from a mid-level one when two candidates write the same correct code, shown as two annotated, timestamped LRU Cache rounds with the interviewer's notes and the two resulting write-ups side by side, plus the follow-up ladder, measured production numbers and AI-assisted rounds.
minutes: 30
difficulty: medium
tags: [interview, senior, coding-round, levelling, lru-cache, ai-assisted]
problems: [lru-cache, merge-intervals, time-based-kv]
---
Two candidates get the same LRU cache problem in the same week. Both produce correct O(1) code with a hash map and a doubly linked list. Both pass every test. One comes out with "hire, senior-consistent". The other gets "hire, at the level below". Nobody tells either of them why, and the second spends the next month grinding more problems, which will not help, because the difference was never the algorithm.

The difference is in *how* the 45 minutes were spent: who drove the session, whether trade-offs were stated or left implicit, whether the code read like something you would approve in review, whether testing happened unprompted, and what happened when the interviewer asked "now what if it's shared across threads?" This lesson makes that concrete. It shows the signals interviewers commonly record, runs the same LRU round twice with timestamps and the interviewer's notes beside each line, puts the two write-ups side by side, and then explains how a level is argued from them.

## How coding rounds feed the level decision

At many large companies the coding bar for mid-level and senior engineers is similar and the problems overlap heavily. Level is decided mostly by system design and behavioural rounds, where scope and judgement show more directly; [The FAANG loop](/learn/senior-craft/getting-the-job/the-faang-loop) covers how the pieces combine.

That does not make coding rounds level-neutral. They can pull a level decision *down*: a senior candidate who needs heavy hints, writes messy code, or has to be led through every phase looks mid-level in that round, and a hiring committee reading "strong design, but the coding felt junior" hesitates. Some companies, especially those using practical multi-part problems, deliberately look for senior signals in the coding round itself: structure, extensibility, production awareness. So the goal is a round whose notes read "senior-consistent", not merely a pass.

## The five dimensions, mid-level versus senior

Most coding rubrics reduce to five dimensions, and they are the five Ascend's mock interviewer scores (1 to 5 each, with quoted evidence).

| Dimension | Mid-level pass | Senior pass |
|---|---|---|
| Problem understanding and clarification | Asks questions when prompted; understands the problem | Drives clarification, finds the constraint that matters, states assumptions, scopes open problems |
| Algorithmic approach and complexity | Reaches the optimal approach, perhaps with a nudge; states complexity | Presents alternatives with trade-offs, chooses for a stated reason, gives complexity with its assumptions (expected vs worst, auxiliary vs total) |
| Code quality and correctness | Working code | Readable, decomposed code that is correct on the first trace; structure without gold-plating |
| Testing and edge cases | Tests when asked; covers the obvious cases | Tests unprompted with chosen cases; finds own bugs; re-checks complexity against the code |
| Communication | Explains when asked; responds to the interviewer | Drives the session, manages the clock, makes decisions visible, treats the interviewer as a collaborator |

The senior column is not "knows harder algorithms". It is *ownership*: of the problem definition, the choice, the quality, the verification and the session. That is what a senior engineer is paid for at work, which is why interviewers look for it; [What senior means](/learn/senior-craft/technical-leadership/what-senior-means) covers the job-level version.

## The axis underneath: prompted or unprompted

Read the two columns again and one difference runs through all five rows. The mid-level candidate does the right thing *when asked*; the senior candidate does it *before* being asked. Interviewers record which, because the notes are timestamped and the prompt is in them. The same correct behaviour produces a different line depending on who started it:

| Behaviour | Unprompted: the note commonly reads | Prompted: the note commonly reads |
|---|---|---|
| Settle whether `get` refreshes recency | "clarified semantics that affect correctness" | "semantics clarified when asked" |
| Test updating an existing key | "tested the case that breaks LRU implementations" | "bug on update path found by interviewer" |
| Say what the complexity assumes | "complexity with assumptions (expected O(1))" | "complexity correct when asked" |
| Raise concurrency or capacity limits | "anticipated the follow-up; deferred it explicitly" | "follow-up answered correctly but shallowly" |
| Name the library you would use at work | "knew the production equivalent without hiding behind it" | rarely noted |
| Cut scope when behind | "managed time; stated the cut" | "ran out of time" |

None of the prompted lines is a negative in isolation. Six of them together describe a candidate who can do the work when directed, which is close to the definition of the level below. That is how two sets of identical code produce two different recommendations.

The reason interviewers care is what the difference costs at work. An engineer who settles semantics, tests the case that breaks and raises the concurrency question unprompted produces a change that survives review. One who does the same things only when asked produces a change that needs a reviewer to ask, and at team scale the reviewer's time is the scarce resource. The prompt in the transcript stands in for the review comment that would have been needed.

## Round A: the mid-level version

The problem: implement an LRU cache with `get(key)` and `put(key, value)` in O(1), evicting the least recently used entry at capacity. This is [LRU Cache](/practice/lru-cache).

| Time | What happens | Interviewer's note |
|---|---|---|
| 03:10 | A: "Hash map for lookup, doubly linked list for order. I'll start coding." | "went straight to a known solution; no clarification" |
| 03:30–12:30 | Codes with long silences; pointer updates inline in `get` and `put`; unlink logic written three times | "silent coding; duplicated pointer logic ×3" |
| 12:40 | I: "Does `get` update recency?" A: "Yes, I'll move it to the front there too." | "semantics clarified only when asked" |
| 17:10 | A: "I think it's done." I: "How would you test it?" A runs the example; it passes | "testing prompted; example only" |
| 19:00 | I: "What if I `put` a key that's already there?" A traces; `put` adds a second node; A unlinks the old node first | "bug on update path found by interviewer; fixed correctly" |
| 22:30 | I: "Complexity?" A: "O(1) for both." | "correct when asked" |
| 24:00 | I: "Make it thread-safe." A: "A lock around `get` and `put`." I: "Any cost?" A: "Some overhead." | "correct but shallow; did not see `get` mutates shared state" |
| 28:00 | I: "Capacity in bytes, not items?" A: "Count bytes instead of items." | "did not consider one insert evicting several" |

A's final code is correct and passes every test, including the ones the interviewer suggested. Read the right-hand column again: it contains exactly one clear negative, the update bug found by the interviewer, and A fixed it correctly. Everything else is neutral or mildly positive in isolation. What the column lacks is any line a reader could quote as evidence of senior ownership: no question A chose to ask, no test A chose to run, no cost A named without being asked. That absence, not the bug, is what the level recommendation will rest on.

## Round B: the senior version

| Time | What happens | Interviewer's note |
|---|---|---|
| 03:10 | B: "Two questions. Does `get` count as a use? Can capacity be zero? I'll assume integer keys and a single thread, and come back to concurrency." | "clarified semantics unprompted; deferred concurrency explicitly" |
| 03:50 | B: "Map from key to node plus a doubly linked list in recency order: every operation O(1). In Python, `OrderedDict.move_to_end` does exactly this and is what I'd use at work. Use it, or build the list?" I: "Build it." | "knew the production equivalent; let me choose" |
| 04:30 | B: "Sentinels, so unlink and append never check for null. The node stores its key, because eviction starts from the node and must delete the map entry. Two helpers, since every operation is unlink plus append." | "stated design decisions before coding" |
| 05:00–12:30 | Codes, narrating only those three decisions | "clean decomposition; one invariant comment; no gold-plating" |
| 12:40 | B: "Testing the cases that break LRU: capacity 1; update an existing key then force an eviction; a `get` refreshing recency." Traces the update case with a list column | "tested unprompted with chosen cases, incl. update-then-evict" |
| 15:30 | B: "Expected O(1) per operation, since dict operations are expected constant; O(capacity) memory, one node and one dict slot per entry." | "complexity with its assumptions" |
| 16:30 | I: "Make it thread-safe." B answers (below) | "mechanism, hidden cost, escalation and its price, measurement" |
| 19:00 | I: "Capacity in bytes?" B: "Track total bytes; evict in a loop until under budget, so one large put can evict many; reject an item larger than the whole budget." | "anticipated multi-evict and the oversize edge" |
| 21:00 | I: "Entries expire after a TTL?" B: "Store a deadline per node. Expire lazily on `get`; for memory, a min-heap of deadlines swept on each `put`, or a periodic sweep. The heap adds O(log n) to `put`." | "third follow-up handled with costs" |

B's code:

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

The thread-safety answer at 16:30, in full, because it is the moment the round turned:

> **B:** The simplest correct version is one lock around both methods. `get` mutates the list, so reads need the lock too, which serialises every operation. An uncontended acquire and release is tens of nanoseconds in CPython; contention is the real cost. If it becomes the bottleneck, stripe: hash each key to one of N independent caches, each with its own lock. That gives up global LRU order for LRU within a stripe, which is usually fine. Production caches often approximate further: Redis samples a few keys (the `maxmemory-samples` setting, 5 by default) and evicts the oldest among them instead of maintaining a list. I'd pick by measured contention and the hit rate we need.

A's answer ("a lock") is not wrong. B's names the hidden cost (reads serialise), the standard escalation (striping) and its price (approximate LRU), how production systems approach it, and what would decide, in about forty seconds. It only happened because B reached the follow-up at minute 16 with time to spare; A reached the same question at minute 24 after two prompted fixes.

## The two write-ups, side by side

Within about a day, each interviewer turns the notes into a write-up. Plausible versions:

| Dimension | Round A | Round B |
|---|---|---|
| Problem understanding | Mixed: no questions; recency semantics clarified when asked at 12:40 | Strong: clarified `get` semantics and capacity 0 unprompted; deferred concurrency explicitly |
| Algorithm and complexity | Solid: standard approach; complexity correct when asked | Strong: approach with production equivalent; complexity with assumptions |
| Code quality | Mixed: correct, but pointer logic duplicated three times, no helpers | Strong: two helpers, sentinels, one invariant comment, nothing speculative |
| Testing | Weak: prompted; example only; update-path bug found by interviewer | Strong: unprompted, chosen cases including update-then-evict; no bugs found by me |
| Communication | Mixed: long silences; waited for prompts at each phase | Strong: drove the session; decisions narrated; reached three follow-ups |
| Follow-ups | Correct but shallow (lock without cost; bytes without multi-evict) | Mechanism, cost, escalation, measurement on all three |

```text
Round A - Recommendation: hire at the level below (mid-level).
Correct, working LRU with the standard design. Every senior behaviour I look
for appeared only after a prompt: semantics at 12:40, testing at 17:10, the
update bug at 19:00. Follow-ups answered correctly but without cost or
mechanism. Would be a solid mid-level hire; no evidence of senior ownership.

Round B - Recommendation: hire, senior-consistent.
Drove the round from 03:10. Clarified the semantics that affect correctness,
chose sentinels and helpers for stated reasons, tested the update-then-evict
case unprompted and got it right first time. Thread-safety answer named the
hidden cost (reads serialise), striping and its price, and what to measure.
Reached three follow-ups with time left.
```

Both write-ups say "hire". The difference is the level, and every sentence of B's that carries level evidence cites something B did before being asked.

### Where the two rounds diverged

Put the timestamps next to each other and the gap has three sources, none of them typing speed.

- **Forty seconds of questions at minute 3.** B settled `get` recency and capacity 0 before any code existed. A learned the `get` semantics at 12:40, reworked `get`, and finished coding at 17:10 instead of 12:30: four and a half minutes. A never settled capacity 0 at all; a cache with no guard treats the tail sentinel as the entry to evict and crashes, and only the interviewer's choice of tests kept that out of the notes.
- **Narrated structure from minute 4.** B's two helpers meant the update path was written once, as unlink plus append. A's three copies of the pointer logic are where the update bug lived.
- **Testing designed in, not asked for.** B's unprompted testing and complexity statement ran from 12:40 to 16:30, under four minutes, and found nothing, because the risky case had been designed for. A's prompted testing, the interviewer-found bug and the prompted complexity ran from 17:10 to 24:00, about seven.

Together that is roughly seven and a half minutes, which is the difference between B reaching the first follow-up at 16:30 and A reaching it at 24:00. B answered three follow-ups; A answered two, shallowly, and ran out of round. The level evidence was decided in the first twelve minutes, by time that B's habits saved.

## The senior deltas, one at a time

### You drive the session

You move from phase to phase without being prompted, announce transitions and keep the clock. The interviewer should feel like a collaborator, not a proctor. Count the transitions in the two rounds: questions to design, design to code, code to test, test to complexity, complexity to follow-ups. B started four of the five and the interviewer only opened the follow-ups, which is the interviewer's job. In A's round the interviewer started every transition after coding began. The [45-minute protocol](/learn/interview-patterns/interview-execution/the-45-minute-protocol) is the mechanism.

### Trade-offs are spoken, including what you would not do

For every significant choice, name the alternative and the condition under which you would switch: "Heap of size k, O(n log k), because k is small; if k were close to n, I'd sort." Saying what you would *not* do, and why, shows you saw the option space rather than the first option that worked.

### Code reads like production code, without gold-plating

Good names, small helpers where they remove duplication, invariant comments rather than narration comments, validation at the boundary. Equally, what you leave out: no class hierarchies, no configuration, no generality nobody asked for. A pluggable eviction policy in a 40-line problem costs ten minutes and reads as a habit of over-building.

### You know the gap between the interview answer and production, with numbers

A sentence or two, not a lecture, and ideally with a number you can defend. Measured on CPython 3.14 on a Ryzen 9 9950X3D desktop, 10⁶ mixed `get`/`put` operations on a 10⁴-entry cache: the hand-built map-plus-list version above ran at 133 ns per operation, an `OrderedDict` version at 101 ns, and the hand-built version behind one `threading.Lock` at 201 ns (an uncontended `with lock:` alone measured 51 ns). Memory was about 148 and 137 bytes per entry (tracemalloc, integer keys and values included); one `__slots__` node is 64 bytes. So "in production I'd use `OrderedDict`" is honestly about forty fewer lines to get wrong, not a large speed win. That kind of calibration is what separates production awareness from name-dropping.

### Complexity comes with its assumptions

"O(1)" is the mid-level answer for LRU and it is correct. The senior answer says what it rests on: dict operations are *expected* O(1), so the cache is expected O(1) per operation; the worst case is O(n) when many keys collide, which adversarial input can force for some key types; memory is O(capacity), one node and one dict slot per entry. The same habit applies everywhere: amortised or worst case, auxiliary or total space, for which input distribution. It takes one sentence and it is one of the lines interviewers most often quote as senior evidence, because it shows you know where the guarantee ends.

### Part one is written so part two is an addition

Practical multi-part rounds test extensibility directly. [Time-Based Key-Value Store](/practice/time-based-kv) is a common base: `set(key, value, timestamp)` and `get(key, timestamp)` returning the latest value at or before the timestamp. Part one, with timestamps per key clarified as increasing, keeps two parallel lists per key and appends; `get` is a `bisect_right` on the timestamps. Then the parts arrive:

```python
import bisect

class TimeMap:
    def __init__(self):
        self.times = {}                    # key -> sorted timestamps
        self.values = {}                   # key -> values, parallel to times

    def set(self, key, value, timestamp):
        times = self.times.setdefault(key, [])
        vals = self.values.setdefault(key, [])
        i = bisect.bisect_right(times, timestamp)   # part 2: was an append
        times.insert(i, timestamp)
        vals.insert(i, value)

    def get(self, key, timestamp):
        times = self.times.get(key)        # a read must not create an entry
        if not times:
            return ""
        i = bisect.bisect_right(times, timestamp) - 1
        return self.values[key][i] if i >= 0 else ""

    def compact(self, key, before):        # part 3: drop versions older than `before`
        times = self.times.get(key)
        if times:
            i = bisect.bisect_left(times, before)
            del times[:i]
            del self.values[key][:i]
```

Part two ("timestamps can now arrive out of order") replaced the two appends in `set` with one bisect and two inserts, and the candidate says the cost: `list.insert` is O(n) per out-of-order write, fine unless writes are mostly out of order, in which case a sorted container keyed by timestamp brings it to O(log n). Part three ("compact old versions") is a new method that reuses the same bisect. Both parts were additions because part one isolated the one decision that could change (where a timestamp goes) behind one line. The `.get` in `get` is the other detail an experienced reviewer notices: indexing a `defaultdict` on a read would create an empty entry for every missing key queried, a slow memory leak under traffic. This class passes all seven tests of the practice problem.

### Follow-ups are design questions, and you answer them as such

Follow-ups tend to climb a ladder:

| Follow-up | Mid-level answer | Senior answer |
|---|---|---|
| "n is now 10⁹" | "Use a faster language" | Names what no longer fits in memory; proposes streaming, external sort or sharding, and gives the new cost |
| "Input arrives as a stream" | "Re-run the algorithm on each arrival" | Identifies the incremental state that makes each update cheap; gives the amortised cost |
| "Make it thread-safe" | "Add a lock" | Says what the lock serialises, the contention cost, striping or lock-free alternatives, and what each gives up |
| "Now it's distributed" | "Use Redis" | Partitioning key, consistency of the operation across nodes, what is approximated, what fails |
| "Values have different sizes" | "Count bytes" | Capacity in bytes; evict in a loop until under budget; one large insert can evict many |

You do not need a perfect answer on each rung. You need to reason from the mechanism, name the cost, and say what you would measure.

### Your confidence is calibrated

"I'm confident this is O(n) amortised, because each element is pushed and popped at most once. I'm less sure about the worst case of the rehash; let me think." Senior engineers say which parts they are sure of and which they are not. On LRU that sounds like: "I'm sure `get` and `put` are expected O(1). I believe `move_to_end` is O(1) because `OrderedDict` keeps its own linked list, but I'd confirm that in the docs before relying on it in a hot path." The interviewer can then probe the uncertain half, which is a conversation; a confident wrong claim is a note. Bluffing is graded below not knowing, because at work it causes incidents.

## Choosing how to build the cache

| Option | Code you write | Cost per operation | Exactness | What the interviewer can assess |
|---|---|---|---|---|
| Map plus hand-built doubly linked list | About 40 lines | 133 ns measured | Exact LRU | Pointer handling, sentinels, invariants |
| `OrderedDict` with `move_to_end` | About 12 lines | 101 ns measured | Exact LRU | Library knowledge; little else |
| Hand-built behind one lock | About 45 lines | 201 ns measured, uncontended | Exact LRU | Correctness under threads; reads serialise |
| N striped caches, a lock each | About 55 lines | One lock per call; contention divided by about N | LRU within a stripe | Contention reasoning |
| Sampled eviction, Redis-style | A timestamp per key, no list | No reordering on `get`; eviction compares a sample | Approximate | Trading exactness for cheap reads |

## Under the hood: how a level is argued from a coding round

The [45-minute protocol](/learn/interview-patterns/interview-execution/the-45-minute-protocol) describes the general path from notes to write-up to debrief. What is specific to level is this, as commonly reported.

**Level evidence has to be affirmative.** A round with no negatives and no senior signals confirms the bar and says nothing about level. Round A has no serious negative; its problem is an absence, and absence is recorded ("no evidence of senior ownership"). A candidate cannot earn level by avoiding mistakes.

**Prompted and unprompted lines are weighed differently.** The debrief reads timestamps. "Found the update bug" and "update bug found by interviewer at 19:00, fixed correctly" describe the same code and different engineers. When interviewers disagree about level, the discussion typically goes to these lines, and the unprompted ones carry.

**The coding round is read for consistency with the others.** A senior recommendation from design and behavioural rounds next to Round A's write-up produces a question: is the coding a concern, or was it an off day? Round B's write-up answers it before it is asked. A "hire at the level below" from coding does not sink a senior case alone, but it is the most common reason a split decision resolves downward.

**Follow-up depth is the most level-specific evidence in the round.** Base-problem code overlaps between levels; the thread-safety and byte-capacity answers do not. That is why reaching the follow-ups with time left matters: in Round A they arrived at minutes 24 and 28 after two prompted fixes, and there was no time for a third.

**A split is settled by the specific lines, not the adjectives.** Suppose one interviewer reads Round A as "solid, probably senior" because the final code was clean and correct. The counter-argument in the room is a list of timestamps: semantics at 12:40 when asked, testing at 17:10 when asked, the update bug found at 19:00 by the interviewer, a lock "with some overhead". Adjectives ("solid", "strong") are hard to argue with and easy to discount; timestamped lines are the opposite. That is why a candidate should aim to produce lines that can be quoted, and why the notes in Round B are almost all of that kind.

## Anti-signals that read as mid-level

- **Silent coding**, then a finished function. The interviewer cannot credit reasoning they did not hear.
- **A recited solution with no derivation.** Interviewers notice answers that arrive fully formed and respond by changing a constraint. If you know the problem, say so ("I've seen a version of this") and show the reasoning anyway.
- **Waiting to be told what to do next.** "Should I code it now?" once is fine; at every transition it signals you need direction.
- **Defensiveness about bugs**, or arguing with a hint.
- **Over-engineering**, or naming technologies without the mechanism.
- **Running out of time with no testing**, which suggests you do not manage your own delivery.

## When the round allows an AI assistant

Some companies now run coding rounds in which candidates may use an AI assistant. The senior signal moves rather than disappears. Typing speed and syntax recall matter less; what gets scored is how well you *direct* and *verify*: decompose the problem before prompting, give the assistant the constraints you clarified, read every line it produces, test it with the same chosen cases, catch and explain its mistakes, and justify every line you accept. Blind acceptance is the AI-era version of silent coding. An assistant asked for an LRU cache will usually produce a correct happy path; whether its `put` handles an existing key is exactly the kind of thing you are expected to check.

On `/interviews`, **Solo** is the classic round with the coach locked. **AI-assisted** adds a pair-programmer panel: the interviewer asks you to justify code you accept, your conversation with the assistant is part of the transcript the grader reads, and the report adds an "AI direction and verification" dimension that is weighted heavily. [The AI-native interview](/learn/ai-assisted-engineering/senior-engineering-with-ai/the-ai-native-interview) covers the format in depth.

## Failure modes

**Symptom: "hire at the level below" with correct code and no stated negatives.** Diagnosis: every senior behaviour happened after a prompt; the notes are full of "when asked". Check your transcript for the minute of each clarification, first test and bug fix, and who started each. Fix: plan the unprompted moments before the round: two semantic questions at minute 3, the breaking test case at the start of testing, one sentence on concurrency or scale before you are asked.

**Symptom: "over-engineered; ran out of time".** Diagnosis: generality nobody asked for (an eviction-policy interface, type parameters, a config object) spent the minutes that testing and follow-ups needed. Fix: build the smallest thing that satisfies the interface, and name extension points in one sentence ("a policy object would go here if we needed LFU").

**Symptom: "answered follow-ups with technology names".** Diagnosis: "use Redis", "add a lock", "shard it" without what it serialises, costs or gives up. Fix: for every follow-up, say the mechanism, the cost and what you would measure, in that order.

**Symptom: "strong start, collapsed when a constraint changed".** Diagnosis: a recited solution; the candidate knew the code but not why each part was there, so a change (byte capacity, TTL) had nothing to attach to. Fix: derive aloud even when you know the answer, naming what each structure is for.

**Symptom: "confidently wrong" in the notes.** Diagnosis: a bluffed claim, such as "a dict is thread-safe, so no lock is needed", which ignores that the list pointers are updated in several steps. Fix: separate what you are sure of from what you are not, out loud.

## Interviewer follow-ups

**"Make it thread-safe."** Model answer: one lock around `get` and `put`, because `get` reorders the list and so mutates shared state; uncontended acquisition is cheap (51 ns measured in CPython) and contention is the real cost; if contended, stripe by key hash and accept per-stripe LRU, or approximate LRU with sampling; decide by measured contention. Common wrong answer: "use a concurrent hash map", which protects the map and leaves the list races untouched.

**"Why not use `OrderedDict`?"** Model answer: at work I would; it is implemented in C, measured about 25% faster than the hand-built version (101 against 133 ns per operation) with similar memory, and it removes forty lines of pointer code; building the list here shows the mechanism you asked to see. Common wrong answer: "`OrderedDict` is O(n) for `move_to_end`", which is false and reads as bluffing.

**"Capacity is in bytes and values vary in size."** Model answer: track total bytes; after inserting, evict from the LRU end in a loop until under budget; one insert can evict many entries; decide what happens to an item larger than the budget (reject it). Common wrong answer: "count bytes instead of items", which misses the loop and the oversize case.

**"Entries expire after a TTL."** Model answer: store a deadline per node; check it lazily on `get`; to bound memory, sweep expired entries via a min-heap of deadlines on each `put` (O(log n) more per put) or a periodic sweep; note that expiry and LRU order are independent orders. Common wrong answer: a timer thread per entry, which costs a thread per key.

**"Now it's shared across ten servers."** Model answer: partition keys by consistent hashing so each key has one owner, keep a local LRU per node, and accept that LRU is per node rather than global; say what happens when a node fails (its keys miss until warm). Common wrong answer: "put it in Redis", which moves the problem without describing it. The [distributed cache case study](/learn/system-design/case-studies/distributed-cache) goes further.

## What mid-level engineers get wrong

- **Believing level is decided by harder problems.** They grind more problems, and the next round's notes are full of "when asked" again.
- **Treating clarification as optional on a known problem.** LRU "has no ambiguity", so `get` semantics and capacity 0 are settled by the interviewer at minute 12.
- **Testing only the example.** The update-then-evict case is the one interviewers ask about, and "found by interviewer" lands in the testing row.
- **Answering follow-ups with a noun.** "A lock" is correct and says nothing about what it costs; the write-up says "shallow".
- **Mentioning production tools to impress.** "Redis does this" without the sampling mechanism reads as name-dropping.
- **Finishing at minute 40.** No follow-up is reached, so there is no level evidence at all, and the round can only confirm the bar.

## Practising for the senior column

Pick a problem you can already solve, such as [LRU Cache](/practice/lru-cache), [Merge Intervals](/practice/merge-intervals) or [Time-Based Key-Value Store](/practice/time-based-kv), and run it as a solo mock on `/interviews`. Solving it is not the point. When the report comes back, write your own two-column timestamp table like the ones above and mark every line "prompted" or "unprompted". Then run the same problem a week later and move three lines from the right column to the left. Problems you already know are the best practice for senior signals, because all your attention is free for everything except the algorithm.

## Senior signals

- You own each phase, from clarification to verification, without being prompted, and treat the interviewer as a collaborator.
- You know that prompted and unprompted versions of the same behaviour produce different notes, and you plan the unprompted ones.
- You state alternatives with the conditions under which you would switch, including what you would not do.
- Your code is decomposed with invariant comments, and deliberately free of unrequested generality.
- You mention the production equivalent in a sentence, with a number you can defend when you have one.
- You answer follow-ups from the mechanism: what breaks, what replaces it, what it costs, and what you would measure.
- In AI-assisted rounds, you direct, verify and justify every line you accept.

## Check yourself

```quiz
- q: >-
    Two candidates write identical, correct LRU caches. One clarifies get semantics, tests the update case and raises concurrency unprompted; the other does all three after the interviewer asks. How do the write-ups typically differ?
  options: ["Identical, since the final code is the same", "Senior-consistent versus the level below", "Both below the bar, since hints were given", "The second rated higher for responsiveness"]
  answer: 1
  explanation: >-
    Notes are timestamped and record who started each behaviour. The same correct actions, done only after prompts, describe someone who does the work when directed, which is close to the definition of the level below. Prompts to clarify or test are not core-idea hints, so neither candidate fails the bar on that basis.
- q: >-
    At many large companies, what role does the coding round typically play in the level decision?
  options: ["No effect on level; it is only pass or fail", "It matters for level only for new graduates", "A bar check that can still pull level down", "It alone decides level; other rounds confirm it"]
  answer: 2
  explanation: >-
    Level is usually driven more by system design and behavioural rounds, so coding is mostly a bar check, but a write-up like "hire at the level below" is a common reason a split senior decision resolves downward. Practical multi-part rounds often assess senior signals such as structure and extensibility directly.
- q: >-
    The interviewer asks how to make the LRU cache thread-safe. Which answer is strongest?
  options: ["No lock is needed, as dict operations are atomic", "Add one lock around get and put; nothing more", "Use a concurrent hash map in place of the dict", "One lock serialises even gets; stripe if contended"]
  answer: 3
  explanation: >-
    get reorders the list, so reads mutate shared state and need the lock; one lock serialises everything, and striping by key hash cuts contention at the price of per-stripe LRU. A concurrent map leaves the linked-list races untouched, and individual dict operations being atomic says nothing about the multi-step pointer updates.
- q: >-
    Measured on CPython 3.14, an OrderedDict-based LRU ran at 101 ns per operation against 133 ns for the hand-built map and list, with similar memory. What is the honest production argument for OrderedDict?
  options: ["It is thread-safe, so no lock is ever required", "Far less code to get wrong, at similar speed", "It is several times faster than the hand-built list", "It uses a fraction of the memory per entry"]
  answer: 1
  explanation: >-
    The measured gap is about 25 percent and memory per entry was 137 against 148 bytes, so the case is roughly forty fewer lines of pointer code, not speed or memory. OrderedDict is not a lock-free concurrent structure, so the thread-safety question remains. Calibrated claims like this separate production awareness from name-dropping.
- q: >-
    Which of these is gold-plating that counts against you in a 45-minute LRU round?
  options: ["A guard in put for a capacity of zero", "A one-line comment stating the invariant", "A pluggable eviction-policy interface", "A helper that removes duplicated unlinks"]
  answer: 2
  explanation: >-
    Unrequested generality costs the minutes that testing and follow-ups need and signals a habit of over-building; naming the extension point in a sentence gets the credit without the cost. Helpers that remove duplication, invariant comments and boundary guards are signs of good judgement.
- q: >-
    In an AI-assisted round, the assistant produces an LRU cache that passes the example. What is the senior move before accepting it?
  options: ["Test update-then-evict and explain each part", "Ask the assistant whether its code is correct", "Accept it, since it already passes the example", "Rewrite it by hand to show you did not need it"]
  answer: 0
  explanation: >-
    Assisted rounds grade direction and verification: run your own chosen cases, such as updating an existing key and then forcing an eviction, and be able to justify every line you accept. Passing the example is the case least likely to catch the common bug, asking the assistant to grade itself verifies nothing, and a rewrite wastes the time the format gives you.
```
