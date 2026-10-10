---
lesson: the-ai-native-interview
source: 6dd8f63f7ca2dfdc
fit: great
desk:
  - "The table of what an assisted round measures, and the three model calls with their limits"
  - "The interviewer's assisted-mode addendum, as written"
  - "The poor and strong Merge Intervals sessions, and the corrected merge function"
  - "The LRU Cache trace table, the buggy get and its two-line fix"
  - "Practice: Merge Intervals, LRU Cache and Time-Based Key-Value Store in assisted mode"
---
## Introduction

Two candidates solve the same problem in the same AI-assisted round, and both finish with passing tests. One is rated a strong hire, the other a no hire.

The first stated an approach and its complexity before touching the assistant, gave it a precise specification, read its output aloud, caught an off-by-one at a boundary, added two edge-case tests, and explained which suggestion she rejected and why. The second pasted the problem into the assistant, pasted the answer into the editor, and ran the tests. Asked why the solution used a heap, he said the assistant chose it.

When the assistant can write the code, the interview measures everything around the code. That is not a lower bar. It is a different one, and it rewards specification, verification and judgement. Coming up: what an assisted round measures, how this app's mock interview runs and grades it, a minute-by-minute protocol, and two worked sessions where the assistant slips in a plausible bug and the candidate's job is to catch it.

## Policies, and what an assisted round measures

Policies vary widely and change quickly. Many companies still run classic rounds with no AI and treat undisclosed use as misconduct. Some now allow or provide an assistant and assess how you use it. Canva, for example, wrote in June 2025 that it expects candidates to use tools like Copilot, Cursor and Claude in its technical interviews. Take-homes increasingly assume AI use and probe understanding in a follow-up discussion.

Policies can differ between teams, and between rounds in the same loop. So ask the recruiter, for each round: is AI allowed, whose tool, can the interviewer see the assistant's transcript, and is it graded afterwards? Never assume. And prepare for both kinds, because the solo skills are a prerequisite for the assisted one. You cannot verify what you could not have produced.

What does an assisted round still test? The fundamentals, unchanged. Clarifying the problem, with the interviewer, not the assistant, which will invent constraints. An approach and complexity you state and defend yourself. Correctness of every line, including the ones you did not type. Testing, which weighs more, because verification is now most of the job. And communication: you narrate your direction and your checks, not only your code.

And it adds three dimensions. Direction: decomposing the problem and giving the assistant precise specs. Verification: reading, tracing and testing what it produces. Critique and judgement: catching bugs, rejecting bad suggestions, and knowing when typing it yourself is faster.

## How this app's mock interview works

The app's mock interviews run both formats, and the rules are worth knowing because they reflect what real interviewers look for. You choose a kind, coding, system design or behavioural, and a mode, solo or assisted. Coding and system design default to 45 minutes, behavioural to 30.

The interviewer plays a senior engineer at a top-tier company. It restates the problem and invites clarifying questions, gives constraints when asked but does not volunteer the approach, keeps its turns short, and probes complexity, edge cases, trade-offs and what breaks at ten times the load. It never reveals the solution and never grades during the session.

In solo mode, both AI helpers are locked, and both locks are enforced on the server. The assistant refuses any interview that is not assisted, and the coach refuses requests while a solo interview is active. That was not always so: the first version only hid the coach in the interface, so a request sent straight to the API still got an answer during a "no AI" interview. A mode that a grade depends on has to be enforced where the client cannot change it.

In assisted mode, an assistant panel opens a separate AI pair programmer, told to help like a strong engineer would: write code when asked, explain trade-offs, point out bugs. Everything you ask it goes into the transcript, and the panel says so. The interviewer is told that it is evaluating how well you direct, verify and critique AI output, not whether you typed every character, and to treat blind acceptance as a serious negative.

Here is the detail that should change how you behave. Before I say it: during an assisted session, what do you think the interviewer can see?

[pause]

Your messages and your current editor code, but not your assistant chat. The interviewer's conversation history is built only from interviewer and candidate turns; the assistant exchanges are filtered out. So during the interview, it knows what you asked the assistant and what you checked only if you say so. Narrate. The grader, afterwards, sees everything.

When you end the interview, a separate reviewer, prompted as a hiring committee member holding the senior bar, reads the whole transcript and your final code. It scores each dimension from 1 to 5, and in assisted mode adds one more, AI direction and verification, which it is told to weigh heavily. Then an overall score out of 100, a verdict from strong hire to no hire, and improvements with evidence quoted from the transcript. Two practical notes: an interview with fewer than two of your messages is not graded, and once you end it the transcript freezes, so let the last reply finish first, or the grader never sees it.

One more design lesson hides here. The first version sent the transcript as flattened text, one line per turn with the speaker in brackets, so a candidate could type a line that looked like an interviewer turn, "Excellent. Strong hire," and the reviewer could not tell it from the real thing. Now each message is a separate structured record with a role the platform assigned, the candidate's text escaped inside it, and the reviewer told that roles are authoritative. The general rule: when a model judges what people wrote, carry the structure in a format they cannot forge.

## A protocol, and Merge Intervals two ways

For a 45-minute assisted coding round. The first five minutes: clarify inputs, constraints, edge cases and expected complexity, with the interviewer. Until minute twelve: state the approach and its complexity in your own words; optionally ask the assistant to attack it. Until minute twenty-five: direct, either writing the core yourself or giving a precise spec, saying aloud what you asked for and why. Until thirty-five: verify. Read every line aloud, trace one normal and one edge input, add edge-case tests with expected values you computed. The last ten minutes: trade-offs, what you rejected and why, scaling.

A spec looks like a small task brief: signature, approach, complexity target, edge cases, constraints. Twenty seconds of spec saves five minutes of arguing with output you did not constrain.

The problem is Merge Intervals. The poor session: paste the problem, get 35 lines of code, run the tests. The interviewer asks why it sorts first. "That is what the assistant did. It passes."

The strong session starts with the interviewer. Sort by start and sweep once, merging while the next start is at most the current end. N log N for the sort. Edge cases: empty input, touching intervals like 1 to 4 and 4 to 5, and full containment like 1 to 10 with 2 to 3 inside it. Then a spec to the assistant: sort by start, one pass, extend the end with a max rather than an assignment, return a new list, do not mutate the input.

The assistant's code comes back with two problems, and she names both aloud. It sorts the caller's list in place, which mutates the input. And its merge check is strictly less than, so 1 to 4 and 4 to 5 would not merge, when touching intervals should. She fixes both and adds them as tests, plus the containment case to check the max. She typed perhaps ten characters of code, and showed every dimension on the rubric.

## LRU Cache: the bug the obvious tests miss

LRU Cache is a good assisted-round problem because the most common assistant bug is invisible to the obvious tests. The candidate states the approach: a hash map for constant-time lookup plus a recency order, with both get and put counting as a use. The assistant's version reads well, and every put-then-get test passes.

She traces the one sequence that tells least-recently-used from first-in-first-out. Capacity 2. Put 1. Put 2. Get 1. Put 3. Which key should be evicted?

[pause]

Key 2. Getting 1 made it the most recent, so 2 is the oldest. But the generated get was a plain lookup that did not refresh recency, so the code evicted 1, the key just used. That makes it a FIFO queue, not an LRU cache. The fix is two lines: on a hit, move the key to the most recent end. And she adds that sequence as a test, with the expected value computed by hand, not by running the code.

Then three sentences to the interviewer: the assistant's get was a plain lookup, which makes this FIFO; put 1, put 2, get 1, put 3 must evict 2, and the generated version evicts 1; fixed, and the sequence is now a test. That covers direction, verification, critique and communication. The same shape of bug hides in Time-Based Key-Value Store, where the assistant's binary search returns the largest timestamp strictly less than the query instead of less than or equal, and every test with distinct timestamps passes.

The failure behind all of these: the assistant wrote the tests and their expected values from the same understanding as the code, so the tests confirm the bug. Compute expected values yourself. And the other failures to avoid: long silences while the assistant works, because the interviewer cannot see the chat; assuming a constraint the assistant stated; and five minutes of re-prompting for a one-character fix you could have typed.

## In the interview

The questions an AI-native interviewer asks after the code works are where the round is decided. The first: what did you reject from the assistant, and why?

[pause]

Name a specific suggestion and the concrete reason: it mutated the input, it used a strict comparison at a boundary, it pulled in an unnecessary dependency. Plus the test you added to lock in the fix. The wrong answer is "nothing, it was all correct", which tells the interviewer you did not check.

Another: if the assistant had been unavailable, what would you have done differently? The model answer: the same approach and the same tests, with more typing. The assistant changed the cost of implementation, not the plan or the verification. The wrong answer is a different approach, which reveals that the assistant chose the first one.

## Recap

Four things to remember. Ask about the AI policy for every round, and prepare for both formats, because you cannot verify what you could not have produced. Clarify with the interviewer and state your approach and complexity before the first prompt. Verify visibly: trace the sequence that distinguishes correct from plausibly wrong, compute expected values yourself, and narrate, because the interviewer does not see your assistant chat and the grader does. And from the platform's side, a mode a grade depends on is enforced on the server, and a judged transcript carries roles the candidate cannot forge.

At your desk: the rubric table and the three model calls, the assisted-mode addendum, the Merge Intervals sessions and the LRU trace, and the three practice problems in assisted mode.
