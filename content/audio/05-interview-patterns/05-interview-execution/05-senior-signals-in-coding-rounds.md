---
lesson: senior-signals-in-coding-rounds
source: 400fa08b42ee11ee
fit: great
desk:
  - "The five-dimension table, mid-level pass against senior pass, and the prompted-versus-unprompted table"
  - "Rounds A and B as timestamped tables with the interviewer's notes, and the two write-ups side by side"
  - "Round B's LRU code, and the Time-Based Key-Value Store code across its three parts"
  - "The follow-up ladder and the table of ways to build the cache, with measured costs"
---
## Introduction

Two candidates get the same LRU cache problem in the same week. Both produce correct constant-time code with a hash map and a doubly linked list. Both pass every test. One comes out with "hire, senior-consistent". The other gets "hire, at the level below". Nobody tells either of them why, and the second spends the next month grinding more problems, which will not help, because the difference was never the algorithm.

The difference is in how the 45 minutes were spent. Who drove the session. Whether trade-offs were stated. Whether the code read like something you would approve in review. Whether testing happened unprompted. And what happened when the interviewer asked, "now what if it's shared across threads?"

## What the coding round does to level

At many large companies, as commonly reported, the coding bar for mid-level and senior engineers is similar, and level is decided mostly by the system design and behavioural rounds. That does not make the coding round level-neutral. It can pull a level decision down. A senior candidate who needs heavy hints, writes messy code, or has to be led through every phase looks mid-level in that round, and a committee reading "strong design, but the coding felt junior" hesitates. So the goal is a round whose notes read "senior-consistent", not merely a pass.

Many coding rubrics reduce to five dimensions: problem understanding, algorithm and complexity, code quality, testing, and communication. Across all five, the senior column is not "knows harder algorithms". It is ownership: of the problem definition, the choice, the quality, the verification, and the session.

## Prompted or unprompted

Read the mid-level and senior columns side by side and one difference runs through every row. The mid-level candidate does the right thing when asked. The senior candidate does it before being asked. Interviewers record which, because the notes are timestamped and the prompt is in them.

Settle whether get refreshes recency on your own, and the note says "clarified semantics that affect correctness". Do it when asked, and it says "semantics clarified when asked". Test updating an existing key yourself: "tested the case that breaks LRU implementations". Wait for the interviewer: "bug on update path found by interviewer". Cut scope when behind and say so: "managed time; stated the cut". Don't: "ran out of time".

None of the prompted lines is a negative in isolation. Six of them together describe a candidate who can do the work when directed, which is close to the definition of the level below. The reason interviewers care is what it costs at work: the prompt in the transcript stands in for the review comment that would have been needed, and a reviewer's time is the scarce resource.

## Two rounds of the same problem

Round A. At minute 3, the candidate says "hash map for lookup, doubly linked list for order; I'll start coding." Then nine minutes of mostly silent coding, with the unlink logic written out three times. At 12:40 the interviewer asks whether get updates recency; the candidate says yes and reworks get. At 17:10, "I think it's done." The interviewer asks how they would test it; they run the example and it passes. At 19:00 the interviewer asks what happens on a put for an existing key. A second node gets added. The candidate fixes it correctly. Complexity, when asked: constant for both. Thread safety at minute 24: "a lock around get and put." Any cost? "Some overhead."

Round B. At minute 3: "Two questions. Does get count as a use? Can capacity be zero? I'll assume a single thread and come back to concurrency." Then the design: a map from key to node, a list in recency order, and the remark that Python's OrderedDict does exactly this and is what they would use at work. Use it, or build the list? Build it. Then three stated decisions: sentinels so unlink and append never check for null, the node stores its key because eviction must delete the map entry, and two helpers because every operation is unlink plus append. At 12:40, unprompted: testing the cases that break LRU, including update an existing key then force an eviction. At 15:30, complexity with its assumptions. And then three follow-ups, with time to spare.

Both write-ups say hire. Round A's says every senior behaviour appeared only after a prompt, and there is no evidence of senior ownership. Round A had exactly one clear negative, the interviewer-found bug, and the candidate fixed it correctly. The recommendation rests on an absence, not on the bug.

## Where the minutes went

Before I tell you: B reached the first follow-up at 16:30, and A at 24:00. Where did that seven and a half minutes come from?

[pause]

Not typing speed. Three places. Forty seconds of questions at minute 3: A learned the get semantics at 12:40 and reworked the code, which cost about four and a half minutes. Narrated structure: B's two helpers meant the update path was written once, while A's three copies of the pointer logic are where the update bug lived. And testing designed in: B's unprompted testing and complexity took under four minutes and found nothing, because the risky case had been designed for. A's prompted testing, the interviewer-found bug and the prompted complexity took about seven.

So B answered three follow-ups and A answered two, shallowly, and ran out of round. The level evidence was decided in the first twelve minutes, by time that B's habits saved.

## The senior deltas

Speak trade-offs, including what you would not do. "A heap of size k, n log k, because k is small; if k were close to n, I'd sort."

Write code that reads like production code, without gold-plating. Small helpers where they remove duplication, invariant comments, validation at the boundary. And leave out generality nobody asked for. A pluggable eviction policy in a 40-line problem costs ten minutes and reads as a habit of over-building.

Know the gap to production, with a number. The lesson measured a million mixed operations in CPython. The hand-built cache ran at 133 nanoseconds per operation, the OrderedDict version at 101, and the hand-built version behind one lock at 201. Memory per entry was similar. So "in production I'd use OrderedDict" is honestly about forty fewer lines to get wrong, not a large speed win. That calibration is what separates production awareness from name-dropping.

Give complexity with its assumptions. "Constant time" is the mid-level answer and it is correct. The senior answer says dictionary operations are expected constant, so the cache is expected constant per operation, the worst case is linear when many keys collide, and memory grows with the capacity. One sentence, and one of the lines interviewers most often quote.

Write part one so part two is an addition. In the Time-Based Key-Value Store, when timestamps can suddenly arrive out of order, the change stays local, because part one kept the one decision that could change, where a timestamp goes, in one place. The two appends become a binary search and two inserts, and the candidate says the cost: an insert is linear per out-of-order write, fine unless most writes are out of order.

Calibrate your confidence. Say which parts you are sure of and which you are not. Bluffing is graded below not knowing, because at work it causes incidents.

And in rounds that allow an AI assistant, the signal moves rather than disappears. What gets scored is how well you direct and verify: give it the constraints you clarified, read every line, test it with your own chosen cases, and justify everything you accept. Blind acceptance is the AI-era version of silent coding.

## In the interview

Here is the follow-up that turned Round B. Make the cache thread-safe.

[pause]

The simplest correct version is one lock around both methods. Get mutates the list, so reads need the lock too, which serialises every operation. An uncontended lock is cheap, 51 nanoseconds measured in CPython; contention is the real cost. If it becomes the bottleneck, stripe: hash each key to one of N independent caches, each with its own lock, and give up global LRU order for LRU within a stripe. Production caches often approximate further: Redis samples a few keys and evicts the oldest among them. Decide by measured contention. The common wrong answer is "use a concurrent hash map", which protects the map and leaves the list races untouched.

And a second: capacity is now in bytes, and values vary in size. Track total bytes, then evict from the least-recent end in a loop until you are under budget, because one large insert can evict many entries. And decide what happens to an item larger than the whole budget: reject it. The wrong answer is "count bytes instead of items", which misses the loop and the oversize case.

## Recap

Four things to remember. Level evidence has to be affirmative: a round with no mistakes and no senior signals confirms the bar and says nothing about level. The same correct behaviour reads differently prompted and unprompted, so plan the unprompted moments: two semantic questions at minute 3, the breaking test case, one sentence on concurrency or scale. Those habits save the minutes that get you to the follow-ups, which are the most level-specific evidence in the round. And answer follow-ups from the mechanism: what breaks, what replaces it, what it costs, and what you would measure.

At your desk: the dimension and prompted-versus-unprompted tables, the two round tables and write-ups, the LRU and time-based store code, and the follow-up ladder with the measured build options.
