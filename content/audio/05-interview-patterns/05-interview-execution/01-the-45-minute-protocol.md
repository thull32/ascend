---
lesson: the-45-minute-protocol
source: 40a03cc2b78d6d1a
fit: great
desk:
  - "The checkpoint flowchart, and the costed table of the four minute-15 moves"
  - "The two timestamped transcripts, Merge Intervals and Top K, with the heap trace that finds the bug"
  - "The table of phrases interviewers write, and the table of transition sentences"
  - "Practice: a timed solo mock, transition-only drills, and two-problem drills"
---
## Introduction

A 45-minute coding interview is not 45 minutes of problem solving. Take off three minutes of introductions at the start and four for your questions at the end, and you have about 38 minutes for a problem the interviewer expects to see understood, solved, coded, tested and extended.

Many candidates who fail a round they nearly had did not fail on the algorithm. They circled the approach for fourteen minutes, finished typing at minute 41, never traced an input, and never reached the follow-up where the interviewer planned to test for seniority. The feedback says "ran out of time", and the hiring decision reads that as "could not deliver".

The fix is not typing faster. It is a budget: fixed phases, a deliverable for each, and checkpoints at which you change course if you are behind. Three parts, then. Where the minutes go. The checkpoints, and the one at minute 15 that decides most rounds. And what the interviewer writes down while you work.

## Where the minutes go

Here is the clock. Minutes 0 to 3, introductions: a 30-second summary of who you are, then stop. Minutes 3 to 8, understand and clarify: you leave with the problem restated, the constraints that matter, and one worked example with its expected output. Minutes 8 to 15, approach: the brute force named with its cost, a better approach agreed with the interviewer, the complexity stated.

Then minutes 15 to 30, code. Minutes 30 to 36, test: the example traced, edge cases checked, your own bugs fixed. Minutes 36 to 41, follow-ups: at least one extension discussed, such as scale, streaming, or a changed constraint. And minutes 41 to 45, your questions.

Three things about that budget are not obvious. First, coding gets only a third of the time. Fifteen minutes is plenty for 20 to 40 lines if you knew what you would write before you started, and nowhere near enough if you design while you type.

Second, testing is a fixed slot, not whatever is left. Left to the remainder, it gets none. Many rubrics score testing as its own item, and it is the phase most easily squeezed out.

Third, follow-ups are where level is decided. The interviewer usually has one or two extensions planned: now it doesn't fit in memory, now it's a stream, now make it thread-safe. Mid-level and senior candidates often write the same base code and diverge only there.

When the format changes, change the budget and keep the order. A 60-minute round: keep the first 36 minutes identical and spend the extra time on follow-ups. Two problems in one round: roughly 15 and 25 minutes, and the trap is polishing problem one. A correct, tested first answer at minute 14 that is not optimal beats an elegant one at minute 22. No code execution: take two minutes from coding and give them to testing, because tracing by hand is slower. And with execution available, the risk flips: say what you expect the output to be before you press run.

## Checkpoints

Each phase ends at a checkpoint, and at each one, if you are behind, you make a named cut instead of hoping.

Minute 8: you can state the input, the output and the size, and there is one example with a correct expected answer on the screen. If you are still asking at minute 9, stop and state your assumptions instead.

Minute 15: you should be typing. Before that, end the approach phase with a buy-in question: "That's n log n for the sort and linear space for the output. Does that sound reasonable, or would you like me to look for something better before I code?" It lets the interviewer redirect you before fifteen minutes of coding, and every honest answer to it saves you time.

Minute 25: the core loop or recursion is written. If it is not, cut scope now: drop input validation, inline the helper, choose the simpler of two data structures. And when you skip a detail, say so out loud. Said, it is a scope decision. Silent, it is a bug.

Minute 33: if you are only now finishing the code, do a compressed test. Trace one input, then name each edge case in a sentence and point to the line that handles it.

## The minute-15 decision

The checkpoint that decides most rounds is minute 15 with a brute force and nothing better. Before I list them: what are your options, and which one is the trap?

[pause]

There are four moves, and they are not equal. One: code the brute force and optimise afterwards. That costs 8 to 10 minutes to working code and usually caps the algorithm score below strong unless the optimisation follows, but it guarantees tested code by about minute 26, with code-quality and testing credit. Choose it when n is small enough to defend it, or when you have no lead at all.

Two: think two or three more minutes, aloud. That is neutral if the idea arrives and costly if it does not, and it guarantees nothing. Take it only with a specific lead, like "the repeated work is the rescans".

Three: ask a targeted hint. About a minute. A small nudge is usually noted without much penalty; a hint on the core idea weighs more. Take it at minute 17 with no lead, or when your lead has not paid off.

Four: code an optimisation you have not verified. Ten to fifteen minutes. Strong if it works, and the worst outcome of the four if it does not, because nothing gets tested. Only do it when you can state the invariant that makes it correct.

The trap is the second move. "Two more minutes" becomes eight, because nothing forces the stop. If you take it, say the deadline out loud: "Give me until minute 18; if I haven't got it, I'll code the quadratic version."

## Two rounds on the clock

The first run is Merge Intervals. By minute 4 the candidate has restated the problem and asked three things: is the input sorted, do touching intervals merge, and roughly how big is it. Not sorted, touching ones merge, up to about 100 thousand. By minute 5 there is an example on screen with its output, and a second example that settles the touching rule.

The approach takes a minute and a half: the brute force compares every pair and is at least n squared per pass, too slow for 100 thousand. Sort by start, and anything that overlaps the current block must come right after it, so one pass is enough. n log n overall. "Does that sound reasonable?" Go ahead. About ten lines of code, then a test that ends on the line the candidate trusts least, the max that extends the end. For an interval contained inside another, without the max the block would shrink.

The base problem was done at minute 18, and the spare time went into a follow-up: intervals arriving one at a time. Keep the merged set in a sorted structure keyed by start, and each arrival costs logarithmic time, amortised. That is where the senior signal was earned.

The second run is Top K Frequent Elements, and it goes wrong twice. At minute 6 the interviewer asks for something better than a sort, and the candidate starts a max-heap of every count. At 08:30 they stop: "Let me check that against what I claimed." The heap holds all the distinct values, so it costs that much memory, and if k is near the number of distinct values, the pops cost about what the sort did. They ask whether k is small, hear yes, and switch to a min-heap of size k before writing the code.

Then, testing at minute 16, they trace the heap and get 2 and 4 instead of 6 and 4. And 2 isn't even in the input. They had pushed value then count instead of count then value. One root cause, two symptoms, one fix, and a re-trace that matches.

Look at where each recovery sat on the clock. The wrong approach was caught at minute 8, before any code. The bug was caught at minute 18, by the candidate. And there was still time for two follow-ups.

## What the interviewer writes down

That round became a set of timestamped notes. Clarified constraints unprompted. Named the brute force and asked for buy-in. Self-corrected before coding. Tested unprompted, found and fixed own bug. Stated the assumption behind the complexity. Handled the follow-up with trade-offs. And over the whole round: drove the session, because every transition was announced and none needed prompting.

Those phrases, or close paraphrases, recur across companies, and each one is produced by a behaviour you can practise. "Drove the session" reads as senior. "Needed a small nudge" is minor. "Needed a hint on the core idea" commonly caps the algorithm dimension around a mid-level pass. "Bug found by interviewer", "did not test" and "ran out of time before testing" are negative, and the last two also read as delivery risk. And "handled the follow-up with trade-offs" is the most common phrase in a senior-consistent write-up.

Here is how they become a decision. During the round, anything the interviewer did not hear cannot appear in the notes, which is why silent progress earns nothing and narrating a decision is not chatter. Within about a day, the notes become a rating per dimension with a sentence of evidence each. Then people who were not in the room read the write-ups side by side. "Correct code; needed a hint on the core idea; did not reach testing" next to a strong design round raises the question "is the coding a concern?", and that question pulls level down.

Transitions are where minutes leak, so have a sentence ready for each. "Let me test this before we move on." "I'm going to skip input validation so we get to testing." And when time is short: "We have about ten minutes. Would you rather I optimise this or test what I have?" Offering the choice shows you understand the trade-off. The hardest one to say is "Let me check that against what I claimed; it doesn't hold, so I'm switching." Rehearse it, because its moment feels like failure and reads as judgement.

## In the interview

Here is a follow-up the Top K interviewer asked. You said the heap version beats n log n. Prove it.

[pause]

The time is n for counting, plus d log k for the heap, where d is the number of distinct values. d is at most n, so that is at most n log k, which is linear for a fixed k. And state the assumption: it holds for small k and weakens as k approaches d, while the bucket version is linear regardless, because it never compares counts. The common wrong answer is "heap operations are log n, so it's n log n as well", which confuses the heap's size with the input's.

And a second: the values now arrive as a stream. What changes? The count map must persist and grows with the distinct values. The size-k heap cannot be kept incrementally, because a value outside it can climb past its minimum unseen. So rebuild it per query, keep a count-ordered structure, or go approximate with a Count-Min sketch. The wrong answer is "push each arrival into the size-k heap", which silently drops values whose counts later overtake the minimum.

## Recap

Four things to remember. The 38 working minutes have a budget: 5 to clarify, 7 for the approach, 15 to code, 6 to test, 5 for follow-ups, and testing and follow-ups are fixed slots, not leftovers. The checkpoints at minutes 8, 15, 25 and 33 each come with a named cut. At minute 15 with only a brute force, choose one of four moves out loud, and if you choose to keep thinking, give yourself a deadline. And the round becomes timestamped phrases, so make the behaviours that produce the good ones visible, starting with asking for buy-in before you code.

At your desk: the checkpoint flowchart and the costed minute-15 table, the two full transcripts with the heap trace, the phrase and sentence tables, and the three practice drills.
