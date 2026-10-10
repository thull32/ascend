---
lesson: getting-unstuck
source: 561fa8518e29f5b4
fit: great
desk:
  - "The seven kinds of stuck as a table: diagnostic question, first move, and the problem each is shown on"
  - "The Subarray Sum Equals K code, its trace, and the shrink to the smallest failing input"
  - "The Koko transcript with the interviewer's notes, the code, and the binary search trace"
  - "The hint ladder, the table of moves, and the two sets of interviewer notes"
---
## Introduction

Minute 14. You have a brute force, you know it is quadratic, you know n is 100 thousand, and nothing is coming. You re-read the problem. You stare at the example. You try the same idea again, a little differently. Three minutes pass without a word. The interviewer shifts in their chair.

Every strong candidate gets stuck. Interviewers pick problems at the edge of what a candidate can do precisely so they can watch what happens next. Being stuck is not the failure; the next three minutes are the assessment. A candidate who says "I'm stuck on how to avoid rescanning; let me try it by hand on a small example" and gets there with one nudge can score as well as one who recalled the answer instantly. A candidate who goes silent for eight minutes and then guesses scores badly even if the guess is right.

Three ideas: notice it fast, diagnose which kind of stuck it is, and keep any hint small and early.

## Notice it within a minute

The costliest part of being stuck is the time before you admit it. These signals mean you are stuck, whatever it feels like. You have said the same idea twice. Two or three minutes have passed with nothing new on the screen: no new example, observation or line of code. Your code is growing special cases, for the first index, the last index, a stack of size one; a stream of special cases usually means the approach or the invariant is wrong. You are trying to remember rather than derive: "I've seen this; what was the trick?" Or the interviewer has asked "are you sure?" They are telling you something.

When you notice one, say so within seconds: "I'm going in circles. Let me step back." Visible, structured thinking is what is being evaluated. Interview-prep advice commonly puts the window of visible effort before a hint at three to five minutes. Eight silent minutes are a fifth of your working time with nothing in the notes.

## Seven kinds of stuck

Stuck is not one state, and each kind has a different first move. Diagnose before you act.

One, the problem is unclear: you cannot compute the right answer for an example by hand. Solve a small example slowly, aloud. Two, no approach at all: you cannot even state a brute force. Ask what all the candidate answers are, and how you would check one. Three, a brute force and no optimisation. Ask what the inner loop recomputes. Four, the idea seems right but the details keep needing special cases. Write down what is true at the top of every iteration. Five, the code is wrong. Find the smallest input that fails. Six, it seems to work but you cannot say why. Hunt a counterexample on tiny inputs. Seven, the mechanics: you know what to do but not how to write it, like an API or an index formula. Stub it behind a named helper and move on.

Kinds one and two are rarer than they feel. Three and four are the usual ones. And seven is the cheapest to escape and the easiest to lose five minutes on.

## The moves, shown

Solve it by hand. Daily Temperatures: for each day, how many days until a warmer one? Do it on paper and narrate what you keep track of. You notice you are holding a pile of days still waiting, say 75, 71 and 69. When 72 arrives it resolves 69 and 71, newest first, but not 75. The pile only resolves from the top, and its temperatures decrease from bottom to top. That is a monotonic stack, derived from your own bookkeeping.

Name the repeated work. In Daily Temperatures, the scan from each day walks past days that earlier scans already resolved. In "subarray sum equals k", the inner loop recomputes sums that a running prefix already holds. Naming the repeated work usually names the structure that stores it. If you know the target complexity, work backwards: "where would the log come from?" is often the fastest route to the idea.

Relax a constraint. Counting subarrays that sum to k: with only positive values, a sliding window works, because shrinking always lowers the sum. Restore negatives and the window breaks, but the running sum survives. For each prefix sum, count the earlier prefix sums equal to it minus k.

Shrink the failing input. Suppose a first draft of that code, starting with an empty map, returns 1 instead of 3 on 1, minus 1, 1. Drop elements while the output stays wrong, and a single element, 1, with k of 1, already fails. Now the trace is one line: the subarray that starts at the beginning needs an earlier prefix of zero, the empty prefix, and the map never had it. A three-row puzzle became a one-row diagnosis.

Hunt a counterexample. "Always take the largest coin that fits" feels right for Coin Change. With coins 1, 3 and 4, greedy agrees with the minimum up to amount 5, and at 6 it takes 4, 1 and 1, three coins, when 3 and 3 uses two. One counterexample ends the greedy idea and points at dynamic programming.

## Koko, from stuck to binary search

The lesson's transcript is Koko Eating Bananas. Koko has piles of bananas and h hours. Each hour she eats up to k bananas from one pile, and if the pile has fewer, the rest of that hour is lost. Find the minimum k that finishes in time. Piles and h go up to a billion.

At minute 8 the candidate clarifies the leftover-hour rule. That is an answer, not a hint. They work an example by hand to the answer. They describe the search space: every speed from 1 to the largest pile, with a linear check for each. Up to a billion checks, too slow. Kind two has become kind three.

At 10:30 they name the stuck point and sweep the patterns aloud. At 11:40, "what would make this easy?": a fast check for one candidate, and they already have it. So the question is which speeds to check. At 12:40 they ask a specific question: is there a relationship between speeds I should use?

The interviewer answers with a question: if speed 5 works, what can you say about 6? Before I go on: what does that one fact unlock?

[pause]

Then 6 works too. Hours per pile never grow as k grows, so feasibility is false, false, false, then true from the answer upward. Binary search for the first true: about 30 checks for a billion. The candidate says all that within ten seconds, then states the invariant before writing the bounds: high is always feasible, and everything below low is infeasible. The bounds follow from that sentence. And the integer ceiling, a kind-seven detail, goes into a small helper with a one-value check.

Measured, the whole binary search took 10 milliseconds. On that instance the linear scan from speed 1 would have needed about 25 hours.

## How hints are weighed

Hints are not counted; they sit on a ladder. Level zero is an answer to a clarifying question, not a hint at all. Level one is a nudge, usually a question, like "if 5 works, what about 6?" Minor when converted quickly, and one is common in strong rounds. Level two is a direction: "could you search over speeds instead of trying each?" Level three is the core idea: "binary search on the speed, with a linear check." That commonly caps the algorithm dimension near a mid-level pass. Level four is being led through, which is below the bar for that dimension.

Three things change the weight of the same hint. What happened after it: a nudge turned into the full approach in ten seconds reads as nearly unassisted, and the same nudge needing to be repeated reads as level two. When it came: a nudge at minute 13 leaves time for everything else; a core-idea hint at minute 28 leaves testing empty. And who started it: a candidate's specific question is itself evidence of diagnosis.

So ask after three to five minutes of visible effort, or at minute 17 with no approach. Say where you are and ask about a direction, not for "a hint". A specific question earns a small hint, and a small hint you convert reads far better than a large one you are handed. Then repeat it in your own words and continue from your own work. Do not restart.

If the approach itself turns out to be wrong halfway through, switch out loud, with a counterexample in hand, and keep what carries over. Switching on a feeling tends to happen twice. And at around minute 20 with no optimised approach, change goal: ship the brute force cleanly, test it, and name the bottleneck. It still earns code-quality and testing credit.

## In the interview

A follow-up the lesson expects. Why is binary search valid here?

[pause]

The total hours is a sum of each pile divided by k, rounded up, and each term never increases as k grows. So feasibility is false for small k and true from the answer upward, and binary search finds the first true in a logarithmic number of checks. The wrong answer is "because the piles are sorted". They need not be; the search is over speeds, not over the array.

And another: you needed a nudge; how would you find this alone next time? Name the trigger: minimise a value subject to a yes-or-no check that is monotone in that value means binary search on the answer. Add it to your pattern sweep. The wrong answer is "I'd memorise this problem", which does not transfer to the next one.

## Recap

Four things to remember. Say "I'm stuck on X" within a minute, naming the specific sub-problem, and never let silence run past a few minutes. Diagnose which of the seven kinds you are in, because the move for one wastes time on another: shrinking for wrong output, the invariant for details that keep breaking, the repeated work for a slow brute force. Ask for hints with a specific question that shows your position, and convert the nudge visibly. And at minute 20 with nothing better, ship a tested brute force.

At your desk: the seven-kinds table, the subarray sum code and shrink, the full Koko transcript and trace, and the hint ladder with the two sets of notes.
