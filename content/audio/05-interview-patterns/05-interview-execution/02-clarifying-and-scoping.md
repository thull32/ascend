---
lesson: clarifying-and-scoping
source: 70a685d5ba5944c9
fit: great
desk:
  - "The question catalogue by problem type: arrays, intervals, graphs, trees, linked lists, strings, numeric, design, streams"
  - "The measured per-iteration costs in CPython and Node, and the worked budgets for n"
  - "Meeting Rooms II: the heap trace, the difference-array code and trace, and the measured comparison"
  - "The rate limiter scoping example, the assumption ledger, and the two sets of interviewer notes"
---
## Introduction

"Given a log of API requests, return the k users who made the most requests." You can have a hash map and a sort on the screen in ninety seconds. Then at minute 25 the interviewer asks what happens when two users tie for k-th place, and you discover your output order depends on dictionary iteration order. At minute 35 they mention that the log is 200 gigabytes. The code handles neither, and it is too late to change the approach.

Every one of those facts was available at minute 4 for the price of a question. Clarifying is the step where the algorithm gets chosen. The input size picks the complexity class. The value range picks between a hash map and an array. "Is it sorted?" picks two pointers or binary search. "Does it fit in memory?" picks between an in-memory algorithm and a streaming one.

The opposite failure is just as real: twelve questions in eight minutes, most of whose answers you never use, reads as stalling. So: which questions are worth asking, how to turn the size into a budget, one answer that removes a log factor, and what to do when the interviewer says "your call".

## The one test

Before asking anything, run one test. For each possible answer, would I write different code? If yes, ask. If no, assume, and state the assumption in a sentence.

"Can the list be empty?" usually fails the test, because you will handle empty input with a one-line guard either way. So say it instead: "I'll return an empty list for empty input."

"Can values be negative?" often passes. Take "longest subarray with sum at most k". If values are non-negative, the window sum only grows when you extend the window and only shrinks when you contract it, so a sliding window works in linear time. Negatives break that, and push you to prefix sums with a binary search, n log n. One answer selects the algorithm.

The test also orders your questions. First the ones whose answers would invalidate the most code: size, memory, sortedness, value range. Then the ones that change a single line: tie-breaking, output order, inclusive bounds. And the single-line ones become statements whenever the example already implies the answer.

## The catalogue

Five questions apply to nearly every problem. How large is n? Does it fit in memory? Is the input sorted? What is the value range? And is this called once or many times?

Then each problem type has its own. A few that change the approach outright. For arrays: return indices or values? If indices, sorting destroys positions. Contiguous subarray or subsequence? If subsequence, windows and prefix sums no longer apply. For intervals: do touching intervals overlap? That is the difference between less-than and less-than-or-equal. For graphs: is it weighted? Then breadth-first search becomes Dijkstra. For grids: how many cells? At a million or more you want an iterative traversal, because CPython's default recursion limit is 1,000 frames. For strings: lowercase ASCII, or Unicode? Lowercase lets you count into an array of 26.

At minute 3 you need two or three questions from one of those lists, not all of them. The full catalogue is on the page.

## Turning n into a budget

"Python does about 10 million operations a second" is the folk number. The lesson measured it on one fast desktop. A simple loop iteration in CPython was about 12 nanoseconds. Comparing a pair in a nested loop, 14. Incrementing a dictionary entry, 51. In Node, the simple loop was half a nanosecond, but a hash-map increment still cost 31.

That supports a two-line rule. CPython runs 10 to 100 million simple loop iterations a second, with hash operations near the bottom of that range. A just-in-time compiler or a compiled language runs 100 million to a billion simple iterations, but hash-heavy loops sit nearer 10 to 100 million a second in every language. Plan with the bottom of each range and you are rarely wrong by more than a factor of ten. And a laptop or an online judge can be several times slower, so treat these as a ceiling.

Now use it. At n of 100 thousand, before I give you the number: how long does a quadratic pair loop take in CPython?

[pause]

It is 5 billion pair comparisons. At 14 nanoseconds each, about 70 seconds, and about 2 seconds even in Node. Out in both. n log n is about 1.7 million steps: milliseconds. Linear with a dictionary increment per element: about 5 milliseconds.

The other direction matters too. At n of 2,000, the quadratic loop measured 28 milliseconds. So code it cleanly and say why: it runs in about 30 milliseconds and is much simpler, and you would optimise past 10 thousand, provided you can name the optimisation. If the interviewer will not give you n, treat it as 100 thousand to a million and say so.

## One answer that removes a log

Meeting Rooms Two: given meetings as half-open intervals, return the minimum number of rooms. The standard plan sorts by start and keeps a min-heap of end times for the rooms in use. If the earliest-ending room is free by the next meeting's start, reuse it; otherwise open a room. That is n log n.

Now ask one question: are the times whole minutes within a single day? The interviewer says yes, it's a booking system for one day.

That bounds every time to 0 to 1,440. The number of rooms in use at any minute is the meetings started minus the meetings ended. So keep an array with one slot per minute. Add one at each start, subtract one at each end, then take a running sum. The peak of the running sum is the answer. No sort, no heap. The cost is n plus 1,441, which is linear, because the 1,441 is a constant fixed by the answer to your question.

The half-open rule does real work there. When one meeting ends at the same minute another starts, the minus one and the plus one land in the same slot and cancel, so the second meeting takes the first one's room. With closed intervals, on the lesson's five meetings, the answer would be 4 instead of 3.

Measured on a million random meetings, the difference array was about 18 times faster than the sort and heap in CPython, and 60 times faster in Node. Neither version would time out. The point is that a cheap question changed the complexity class.

And when the answer is no? If times are Unix timestamps in seconds over a year, the array would need about 32 million slots: 252 megabytes as a Python list, and 1.4 seconds just to scan it before a single meeting is processed. The bound that made it linear is gone, so you go back to sorting the endpoints. Say the threshold aloud: if the range is within a small multiple of n, and at most about 10 million, the array wins; otherwise sort.

## Your call, and the ledger

Senior interviews often leave details open on purpose. You ask how ties break and hear "what do you think?" Do not ask again. Decide, say why, and say what would change: "Then I'll break ties by user id ascending, so the output is deterministic and testable. If the product needed earliest first request instead, only the sort key changes."

Keep an assumption ledger: a few comment lines at the top of the editor. The log fits in memory, up to about a million lines. Malformed lines are skipped. Ties by user id. It takes thirty seconds. When the follow-up arrives, "what if the log is 200 gigabytes?", you point at line two: that is the assumption that changes. If the distinct users fit in memory, one streaming pass with a count per user. If not, partition lines by a hash of user id into files, count each partition, merge the per-partition top-k lists.

The cheapest clarifying question of all is an example with your expected output. "So for intervals 1 to 4 and 4 to 5, I'd return 1 to 5, right?" It checks the whole problem, and interviewers answer a concrete example more precisely than an abstract question. Write two: a normal one, and a small one that tests a definition, such as touching intervals, ties, or duplicates.

For open-ended problems, like "build a rate limiter", the first five minutes are a small design exercise. Fix the interface first, ask the two questions that matter, such as exact window or not and single process or shared, then say out loud what you are not building: thread safety, idle-key eviction, sharing across servers. That list turns later follow-ups into "that's what I set aside; here's how it changes".

## How it is graded

A workable rule for a 45-minute round: three to five questions, two examples, and one sentence of stated assumptions, all within five minutes. You are over-clarifying when no example is written yet, or when you are asking because you have no idea for the approach. That is being stuck, not clarifying.

A commonly reported habit is that the interviewer keeps one material constraint in reserve: the size, a memory limit, a tie rule, "minutes in a day". The note records whether you asked for it or it was revealed at a follow-up. In the debrief, this dimension is argued from three facts. Were the constraints that mattered discovered or volunteered? How early was there a confirmed example? And did the assumptions absorb the follow-up? Question count is not one of the three. Four material questions outrank twelve.

## In the interview

Here is a follow-up the lesson expects. Why did you ask whether the times were minutes in a day?

[pause]

Because a bounded range lets me index by value instead of comparing values: n plus 1,441, which is linear. The wrong answer is "to be thorough", which says the question was not chosen for a reason.

And the next one: you chose ties by user id; what if product wants the earliest first request? The tiebreaker moves into the key, count first and then the time each user was first seen, which needs one more map filled in the counting pass. Complexity is unchanged. The wrong answer is sorting again after the top-k selection, which cannot promote a user the heap has already evicted.

## Recap

Four things to remember. Ask a question only if some answer would change your code; otherwise state the assumption. Ask for n first and turn it into a budget out loud: a quadratic loop at 100 thousand is about 70 seconds in CPython, out. Watch for a bounded range, which can remove a log factor, and know the threshold where it stops paying. And when you hear "your call", decide, give the reason, write it in the ledger, and say what would change.

At your desk: the full question catalogue, the measured per-iteration costs, the Meeting Rooms traces and code, and the rate limiter and debrief notes.
