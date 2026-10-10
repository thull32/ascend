---
lesson: the-problem-solving-loop
source: 9af0d6df9906b378
fit: great
desk:
  - "The sliding-window code in Python and JavaScript, and the hand trace of abba"
  - "The Two Sum code and its trace"
  - "The senior thinking-aloud transcript"
  - "The bytecode listing and the measured cost of one window iteration"
  - "Exercises: longest substring without repeats, most recent event per user"
---
## Introduction

You are handed a problem you have not seen before. Maybe an interviewer reading from a doc, maybe a ticket that says dedupe these events but keep the most recent one per user. The instinct is to start typing within thirty seconds, because typing feels like progress. Ten minutes later you have a half-written function, a vague sense that it is wrong, and no idea which part to fix.

The engineers who consistently solve unfamiliar problems do not think faster. They follow a protocol that turns one big question, how do I solve this, into six small ones, each with a concrete deliverable. It is the shape a senior interviewer is listening for, whether or not they say so.

So: the six steps and where to go back when one fails, the loop walked on a real problem, how to take a hint, and when to stop optimising.

## The six steps

One: understand. The output is a one-sentence restatement, the input and output types, and the constraints. Two or three minutes in a 45-minute round.

Two: examples. Two or three tiny inputs worked by hand, one of them an edge case. Another two or three minutes.

Three: brute force. The simplest correct algorithm and its cost, stated, not coded. Two or three minutes.

Four: optimise. Name the brute force's bottleneck, the idea that removes it, and the new complexity. Five to ten minutes.

Five: code. A clean implementation of the optimised idea, ten to fifteen minutes. Six: test. Trace your examples by hand through your code, then edge cases. Five minutes.

Each step makes the next one cheaper. Understanding first means the examples test the right problem. Examples first means the brute force can be checked. Brute force first means the optimisation targets a known bottleneck rather than a guessed technique. Skipping a step moves the time into debugging, where it costs more and earns no credit.

The arrows back from testing matter most. Here is a question to hold: you have coded a solution, and it returns the wrong answer on an example you had not written down before. Which step do you go back to first?

[pause]

Step one. A failure on a case you never considered usually means you solved a different problem: a missed constraint or a misread term. Re-read the statement before touching the code. A wrong answer on an example you did work by hand is different; that points at the optimisation, step four.

## The loop on a real problem

Given a string, return the length of the longest substring with no repeated characters. Resist the urge to code.

Understand. Substring, not subsequence: contiguous. Return the length, not the substring. Ask the alphabet: plain ASCII allows a small array, arbitrary Unicode means a hash map. If n can be a hundred thousand, anything quadratic is out. And the empty string is valid, with answer zero. This step looks trivial and is where most wrong answers are born. Solve the subsequence version perfectly and you still fail.

Examples. abcabcbb gives 3. bbbbb gives 1. pwwkew gives 3, not 4, because pwke is a subsequence; that example exists to catch the misreading. And abba, which gives 2. It looks pointless. It is reserved to break a specific bug later. Notice too that working pwwkew by hand, you scanned left to right, extending a run of distinct characters until a repeat, then restarted. That intuition is the optimised algorithm, unnamed.

Brute force. Every substring, check whether it is all distinct, keep the longest. About n cubed over 6 operations. Now put a number on it, because that is the reflex this step trains. Measured in CPython, 305 milliseconds at 800 characters, growing about eight times per doubling, the signature of a cubic algorithm. At a hundred thousand characters, about a week. The working figures: roughly 10 million simple loop iterations a second in CPython, and 100 million to a billion in compiled code. Quadratic at a hundred thousand is 10 to the 10, out of reach in any runtime.

Optimise. Ask what work is repeated. If one substring was distinct, the next one, one character longer, is distinct exactly when the new character is not already in the window. So keep a set and extend one character at a time. That still restarts from every start. But when the new character repeats one at position k, every start at or before k is now useless, because any window from there includes both copies. So the left edge jumps to k plus 1, and it only ever moves right.

Two pointers that both move monotonically right, with a structure describing what lies between them: the sliding window. Each pointer moves at most n times, so it is linear. Measured, about 57 nanoseconds per character in CPython: 60 milliseconds for a million characters.

Code. Keep a map from each character to where you last saw it. For each new character, if it was last seen inside the current window, move the left edge just past that position. Record the new position, and update the best length.

Here is the bug abba was saved for. Before I tell you: what goes wrong if you always move the left edge past the last occurrence, without checking that the occurrence is inside the window?

[pause]

The left edge can move backwards. On abba, by the final a the window is b, a, starting at index 2. The previous a was at index 0, outside the window. Without the check, the left edge jumps back to 1, the window bba contains two b's, and the function returns 3 instead of 2. The whole fix is one condition: the last-seen position must be at or after the left edge. More generally, state the invariant, left never decreases, before coding, and check every assignment against it.

Test. Trace abba by hand, one variable at a time. A five-character trace takes under a minute and catches most off-by-one bugs before anything runs. Then the cases your examples missed. Raising, unprompted, that JavaScript indexes strings by UTF-16 code units, so an emoji counts as two characters that can never repeat each other, is a senior signal.

## Knowing when the quadratic version is fine

There is a middle version: restart from each start, but extend with a set. Measured on 8,000 random lowercase letters, 2.4 milliseconds. On 8,000 all-distinct characters, 2.4 seconds. A thousand times apart, same code. Why?

Because the inner loop stops at the first repeat, and with a 26-letter alphabet a repeat arrives within about 20 characters. On that alphabet the quadratic version is effectively linear, with a constant of about 20. Only a large alphabet with few repeats exposes the quadratic worst case.

So if the problem says n up to 10 thousand and lowercase letters, shipping the simpler version is correct. Saying why, the inner loop cannot run past 26 characters, is a stronger signal than reaching for the window by reflex. That call needs the numbers from step three.

The same is true of runtimes. The same window ran at 57 nanoseconds per character in CPython and 21 on Node. Both are linear. The constant belongs to the runtime, not the algorithm.

## A second pass: Two Sum

Given an array and a target, return the indices of two distinct elements that add to the target. Understand: indices, not values. Distinct elements, not distinct values, so 3 and 3 with target 6 is valid, answer 0 and 1. Brute force: every pair, n squared over 2. At a hundred thousand elements that is about 5 billion pairs, roughly eight minutes in CPython.

Optimise: for each element, the inner loop asks one question, is target minus this value somewhere else? That is a membership query, and a hash map answers it in constant time. Walk left to right and look backwards: when you reach x, ask whether target minus x has already been seen, and only then record x.

That order is what the 3, 3 example tests. Record x before checking, and the very first 3 finds the entry it just made for itself, and you return 0 and 0, one element used twice. Check first, and an element can only pair with earlier ones.

## Taking a hint without losing the thread

Step four is where you stall, if you stall. Interviewers expect it, and give hints. What they grade is what you do with one. Four moves.

Stop: finish the sentence, then stop talking and typing, because a hint given over your typing is a hint you did not hear. Restate it and place it in the loop: "you're saying the brute force redoes the distinctness check; that's the bottleneck, so this is a step four problem." Derive the consequence out loud, in your own words, rather than guessing a technique's name. Then confirm the new plan and its complexity against one example, and resume at the step the hint addressed, not at step one.

Three ways to mishandle a hint. Ignoring it, "right, but let me finish this first", is recorded as not taking feedback. Rubber-stamping it, "oh yes, of course", followed by code that does not use it, shows you did not understand it, and a second, larger hint follows. And treating it as a verdict, apologising and deleting everything, throws away correct work from steps one to three.

## The loop outside interviews

The ticket from the opening: dedupe events, keeping the most recent per user. Understand: what identifies a user, an ID or an email whose case can vary? Most recent by the event's own timestamp, or by arrival time? They differ whenever a producer retries. Examples: three events for two users with one out-of-order arrival, so the choice visibly changes the answer. Brute force: sort by user and time, take the last of each group. Optimise: one pass with a map from user to best so far.

And here step four often stops early. At ten thousand events a day, the sort finishes in milliseconds and the map is over-engineering. At a billion a day, around 100 gigabytes, the sort no longer fits in one process and the map is the design. At a trillion, the map is keyed state inside a stream processor, partitioned by user. The algorithm never changed; only where the map lives did. Before optimising, write down n, the current cost at that n, and the budget. If the cost fits with a ten-times margin, stop.

## In the interview

Here is a follow-up the lesson expects. The string is now a stream too large to hold in memory. Does your sliding window still work?

[pause]

Yes, for the length. The window reads the string one character at a time and keeps only the last-seen map, the left edge, the best and the current index, so it runs in memory proportional to the alphabet. The brute force cannot, because it re-reads arbitrary substrings. If the substring itself is wanted, record the best window's offsets. The wrong answer is that a sliding window needs random access; this one never indexes the string.

## Recap

Four things to remember. Six steps, each with a deliverable: understand, examples, brute force, optimise, code, test. A failure on a case you never considered sends you back to understanding; a failure on a worked example sends you to the optimisation. Put a number on the brute force against the stated n, and derive the optimisation from the work it repeats, not from the problem's title. And take a hint by stopping, restating, deriving and resuming, never by restarting.

At your desk: the window code and the abba trace, the Two Sum trace, the senior transcript, the per-iteration cost breakdown, and the two exercises.
