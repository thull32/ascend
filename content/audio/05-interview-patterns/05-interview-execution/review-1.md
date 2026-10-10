---
review: interview-execution
source: 8302ab852538687b
---
## Introduction

Twelve questions from the interview-execution module. Answer out loud before the answer comes.

They follow the lessons in order: the 45-minute protocol, clarifying and scoping, testing live, getting unstuck, and senior signals in coding rounds. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

At minute 16 you have only a quadratic brute force, for a problem where n goes up to 100 thousand, and no idea how to improve it. What is the best move?

A, start coding an n log n idea you are not sure is correct. B, ask the interviewer to switch you to a different problem. C, name the blocker, then either code the brute force or ask for a hint. D, keep thinking silently until the optimisation comes to you.

[think]

The answer is C: name the blocker, then code the brute force or ask for a hint.

Minute 15 is the checkpoint where you should be typing. Saying what you are stuck on and making an explicit choice, out loud, keeps the round moving and shows you are managing the clock. Silent thinking past the checkpoint is the most common way rounds run out of time, and coding an unverified idea risks fifteen minutes on something that does not work.

## Question 2

Why ask "does that sound reasonable?" after describing your approach and before you code?

A, it lets the interviewer redirect you before you spend time coding. B, it prompts the interviewer to reveal the optimal answer. C, it is polite, and interviewers expect to be asked it. D, rubrics award points for every question a candidate asks.

[think]

The answer is A: it lets the interviewer redirect you before you spend time coding.

The question buys information at the cheapest possible moment. If the interviewer wanted a better complexity, you find out at minute 12 rather than at minute 30, after fifteen minutes of coding. It does not extract the answer, and asking questions for their own sake is not rewarded.

## Question 3

You have a plan that sorts and uses a heap for Meeting Rooms Two. Which answer to a clarifying question lets you drop the sort and solve it in linear time?

A, the times are whole minutes within one day. B, no two meetings share a start time. C, back-to-back meetings may share a room. D, the meetings arrive already sorted by start.

[think]

The answer is A: the times are whole minutes within one day.

A bounded integer range lets you index by time: add one at each start and subtract one at each end across 1,441 slots, then take a running sum whose peak is the answer. Sorted starts remove one sort, but the heap of end times still costs a logarithmic step per meeting. Distinct starts and the back-to-back rule change a comparison, not the complexity class.

## Question 4

You ask how ties at k-th place should be broken and the interviewer says "your call". What is the strongest response?

A, return every tied item, to satisfy any rule. B, ask the same question again in other words. C, ignore ties, since real inputs rarely have them. D, pick a rule, give a reason, and say what would change.

[think]

The answer is D: pick a rule, give a reason, and say what would change.

"Your call" tests whether you can make and own a reasonable decision. Choose a rule such as user id ascending, for deterministic and testable output, write it in the assumption ledger, and say the key changes if the product wants another rule. Asking again signals you need to be told, ignoring ties makes the output nondeterministic, and returning extra items changes the function's contract.

## Question 5

In a debrief, which fact most strengthens a candidate's problem-understanding rating?

A, the candidate asked more than ten clarifying questions. B, the material constraints were asked for, not volunteered by the interviewer. C, the candidate avoided asking and inferred every constraint. D, the candidate wrote the distributed design before coding.

[think]

The answer is B: the material constraints were asked for, not volunteered.

Interviewers commonly hold one material constraint in reserve and note whether the candidate asked for it or had to be told. Discovered constraints, an example confirmed early, and assumptions that absorb the follow-up are the evidence. Question count is not: four material questions outrank twelve, and silent inference leaves nothing in the notes.

## Question 6

An LRU cache's put appends a new node for an existing key without unlinking the old one. The sequence is: put 1, put 2, update key 1 to 10, put 3, get 2, get 1. Tracing only the return values, when does the bug first become visible?

A, at get 2, two operations after the cause. B, never, since every return value is right. C, at put 3, since the eviction raises an error. D, at the update of key 1, the operation with the bug.

[think]

The answer is A: at get 2, two operations after the cause.

The update leaves three nodes for two keys but returns nothing. Put 3 evicts the stale node and deletes the live map entry for key 1, also silently. The first wrong return is get 2, which returns 2 instead of minus one. Tracing the state, or asserting that the list size equals the map size, exposes the bug at the update itself.

## Question 7

Draining a Python list by popping from the front took 0.21 seconds at 100 thousand elements and 0.93 seconds at 200 thousand. What does that ratio tell you?

A, the loop is n log n, since the list re-sorts itself. B, the loop is linear, with a large constant factor. C, the timings are noise, and each pop is constant time. D, the loop is quadratic, because each pop shifts the rest.

[think]

The answer is D: the loop is quadratic, because each pop shifts the rest.

Doubling n multiplied the time by about four and a half, the signature of quadratic work. Each pop from the front moves every remaining element down one slot. A deque measured about 2 and then about 5 milliseconds, a factor of about two, which is linear.

## Question 8

The interviewer asks what your merge returns for the intervals 1 to 10 and 2 to 3, and it is wrong. What is the strongest response?

A, rewrite the whole solution using another approach. B, point out that the input is unusual and unlikely to occur. C, add an if-statement for that particular input. D, trace it, fix the root cause, and re-run the earlier cases.

[think]

The answer is D: trace it, fix the root cause, and re-run the earlier cases.

How a found bug is handled is recorded alongside the bug. Tracing, naming the root cause, which is assigning the end instead of taking the max, fixing the logic and running a regression check show the habit interviewers want. A special case is noted as a patch-style fix, arguing about the input reads as defensive, and a rewrite is rarely needed for a local bug.

## Question 9

Your code for Subarray Sum Equals K returns 1 on the input 1, minus 1, 1 with k of 1, but the answer is 3. Which kind of stuck is this, and what is the first move?

A, an unclear problem: re-read the statement from the top. B, wrong output: shrink to the smallest failing input. C, mechanics: stub the hash map behind a named helper. D, no optimisation: name the repeated work in the inner loop.

[think]

The answer is B: wrong output, so shrink to the smallest failing input.

The approach is right and the output is wrong. Shrinking finds that a single 1, with k of 1, already fails and returns zero. The one-line trace shows that a subarray starting at the beginning needs the empty prefix, zero, in the map, so the map must start with it. Optimising or re-reading the statement does not address a wrong result.

## Question 10

At 12:55 in the Koko round, the interviewer asks "if speed 5 works, what can you say about 6?", and the candidate derives the full approach within ten seconds. How is that typically recorded?

A, not a hint at all, since it was phrased as a question. B, led through the solution, below the bar for that dimension. C, a small nudge, converted quickly, with minor weight. D, a core-idea hint that caps the algorithm score.

[think]

The answer is C: a small nudge, converted quickly, with minor weight.

A question that supplies one fact, monotonicity, but not the technique is a level-one nudge, and what follows sets its weight. Turning it into binary search, the complexity and the invariant within seconds reads as nearly unassisted. Being phrased as a question does not stop it counting as a hint. The core idea would have been naming binary search on the speed.

## Question 11

The interviewer asks how to make the LRU cache thread-safe. Which answer is strongest?

A, no lock is needed, because dictionary operations are atomic. B, add one lock around get and put, and nothing more. C, use a concurrent hash map in place of the dictionary. D, one lock serialises even the gets, so stripe the cache if it is contended.

[think]

The answer is D: one lock serialises even the gets; stripe if contended.

Get reorders the list, so reads mutate shared state and need the lock. One lock serialises everything, and striping by key hash cuts contention at the price of LRU within each stripe instead of globally. A concurrent map leaves the linked-list races untouched, and single dictionary operations being atomic says nothing about the multi-step pointer updates.

## Question 12

In an AI-assisted round, the assistant produces an LRU cache that passes the example. What is the senior move before you accept it?

A, test update-then-evict yourself, and be able to explain each part. B, ask the assistant whether its code is correct. C, accept it, since it already passes the example. D, rewrite it by hand to show you did not need it.

[think]

The answer is A: test update-then-evict, and explain each part.

Assisted rounds grade direction and verification: run your own chosen cases, such as updating an existing key and then forcing an eviction, and be able to justify every line you accept. Passing the example is the case least likely to catch the common bug, asking the assistant to grade itself verifies nothing, and a rewrite wastes the time the format gives you.

## Recap

Three ideas kept coming back. Act before you are asked: name the blocker, ask for buy-in, test unprompted, and hunt for the constraint the interviewer is holding in reserve. When something is wrong, find the root cause the cheap way: the smallest failing input, the state rather than the return values, and a fix to the logic rather than the input. And everything is read from timestamped notes, so a small hint converted fast, a decision you owned, and an answer that names the cost all count, while silence counts for nothing.
