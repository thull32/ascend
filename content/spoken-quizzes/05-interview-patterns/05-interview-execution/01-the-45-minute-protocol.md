---
lesson: the-45-minute-protocol
source: 4de1278c22bae332
---
## 1

At minute 16 you have only a quadratic brute force, for a problem where n goes up to 100 thousand, and no idea how to improve it. What is the best move?

A, start coding an n log n idea you are not sure is correct. B, ask the interviewer to switch you to a different problem. C, name the blocker, then either code the brute force or ask for a hint. D, keep thinking silently until the optimisation comes to you.

[think]

The answer is C: name the blocker, then code the brute force or ask for a hint.

Minute 15 is the checkpoint where you should be typing. Saying what you are stuck on and making an explicit choice, out loud, keeps the round moving and shows you are managing the clock. Silent thinking past the checkpoint is the most common way rounds run out of time, and coding an unverified idea risks fifteen minutes on something that does not work.

## 2

Why ask, does that sound reasonable, after describing your approach and before you code?

A, it lets the interviewer redirect you before you spend time coding. B, it prompts the interviewer to reveal the optimal answer. C, it is polite, and interviewers expect to be asked it. D, rubrics award points for every question a candidate asks.

[think]

The answer is A: it lets the interviewer redirect you before you spend time coding.

The question buys information at the cheapest possible moment. If the interviewer wanted a better complexity, you find out at minute 12 rather than at minute 30, after fifteen minutes of coding. It does not extract the answer, and asking questions for their own sake is not rewarded.

## 3

In a phone screen with two problems in 45 minutes, you have a correct, tested n log n solution to the warm-up at minute 14, and you can see how to make it linear. What do you do?

A, ask the interviewer whether to skip problem two. B, rewrite the solution in a faster language first. C, mention the linear idea briefly, then start problem two. D, implement the linear version now, while the idea is fresh.

[think]

The answer is C: mention the linear idea briefly, then start problem two.

In a two-problem round, the budget for the warm-up is about 15 minutes. Mentioning the improvement shows you see it; implementing it costs time that problem two needs. An unfinished second problem is a much bigger negative than a warm-up that is correct but not optimal.

## 4

You finish coding at minute 33. Which testing plan fits the time left?

A, trace one input, then name each edge case and the line that handles it. B, re-read the whole program silently for five minutes. C, skip testing and go straight to the follow-ups. D, write a quick randomised test harness and run it.

[think]

The answer is A: trace one input, and name each edge case and its line.

The compressed test proves the main path and covers the edge cases out loud in about three minutes, leaving room for a follow-up. Skipping testing leaves a scored dimension blank, a harness takes too long, and silent re-reading gives the interviewer nothing to evaluate.

## 5

Two candidates write identical, correct code for the base problem. What most often separates a senior rating from a mid-level one?

A, whether they split the code into helper functions. B, typing speed, which frees up extra time at the end. C, the language they chose, and how idiomatic it is. D, their follow-up answers, which need time to spare.

[think]

The answer is D: their follow-up answers, which need time to spare.

Base-problem code is often the same for both levels. The follow-ups, on scale, streaming and concurrency, are where interviewers test judgement and trade-offs, and a candidate who finishes at minute 44 never gets asked. Typing speed, language and helpers matter far less than getting to that conversation.

## 6

In the Top K transcript, the candidate began a full max-heap of all the counts six and a half minutes in. Two minutes later they said, let me check that against what I claimed, and switched to a heap of size k before writing any code. How does that moment typically appear in the write-up?

A, as a negative, since two minutes were spent on an abandoned idea. B, as a hint, because the interviewer's question prompted the switch. C, as neutral, because only the final approach is recorded in notes. D, as a positive, noted as self-correcting before any code was written.

[think]

The answer is D: a positive, noted as self-correcting before any code.

Interviewers record the detour and the recovery, and a candidate who checks a plan against their own claim and switches before coding is credited with judgement. The interviewer's remark that k is small answered a question the candidate asked, which is not a hint on the core idea. Had the candidate coded the full heap and found its cost only at the streaming follow-up, the note would have been a nudge, and the follow-up would have come too late.
