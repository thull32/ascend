---
lesson: getting-unstuck
source: 4378c08ce512bcaa
---
## 1

Your code for Subarray Sum Equals K returns 1 on the input 1, minus 1, 1 with k of 1, but the answer is 3. Which kind of stuck is this, and what is the first move?

A, an unclear problem: re-read the statement from the top. B, wrong output: shrink to the smallest failing input. C, mechanics: stub the hash map behind a named helper. D, no optimisation: name the repeated work in the inner loop.

[think]

The answer is B: wrong output, so shrink to the smallest failing input.

The approach is right and the output is wrong. Shrinking finds that a single 1, with k of 1, already fails and returns 0. The one-line trace shows that a subarray starting at index 0 needs the empty prefix, 0, in the map, so the map must start with 0 counted once. Optimising or re-reading the statement does not address a wrong result.

## 2

In Koko Eating Bananas, why is binary search over the eating speed k valid?

A, the piles are given to you in sorted order. B, the answer always lies at the median pile. C, each pile can be split across several hours. D, the hours needed never increase as k grows.

[think]

The answer is D: the hours needed never increase as k grows.

Total hours is a sum, over the piles, of each pile divided by k, rounded up, and each term never increases with k. So feasibility is false for every speed below the answer and true from it upward, and binary search finds the first true in about log of the largest pile checks. The piles need not be sorted, since the search is over speeds, not over the array.

## 3

In a lower-bound binary search, mid is lo plus hi, halved and rounded down, and a candidate sets lo to mid when the check at mid is feasible. What happens on a two-element range?

A, it skips the answer and ends early. B, it loops forever, because mid equals lo. C, it works, because floor division rounds up. D, it returns an index one too high.

[think]

The answer is B: it loops forever, because mid equals lo.

With lo and hi adjacent, the rounded-down midpoint equals lo, so setting lo to mid changes nothing, and the loop never ends. The invariant, everything below lo is infeasible and hi is feasible, forces lo to mid plus 1 on an infeasible mid, and hi to mid on a feasible one, which always shrinks the range.

## 4

At 12:55 in the Koko round, the interviewer asks, if speed 5 works, what can you say about 6? The candidate derives the full approach within ten seconds. How is that typically recorded?

A, not a hint at all, since it was phrased as a question. B, led through the solution, below the bar for that dimension. C, a small nudge, converted quickly, with minor weight. D, a core-idea hint that caps the algorithm score.

[think]

The answer is C: a small nudge, converted quickly, with minor weight.

A question that supplies one fact, monotonicity, but not the technique, is a level-one nudge, and what follows sets its weight. Turning it into binary search, the complexity and the invariant within seconds reads as nearly unassisted. Being phrased as a question does not stop it counting as a hint. The core idea would have been naming binary search on the speed.

## 5

You believe that always taking the largest coin that fits solves Coin Change, but you cannot say why. What is the best move?

A, compare it with a brute force on small amounts. B, ask the interviewer whether greedy is correct. C, keep it, since it passes the typical coin sets. D, code it, and test it on the given example.

[think]

The answer is A: compare it with a brute force on small amounts.

An unproven greedy calls for a counterexample hunt. With coins 1, 3 and 4, greedy matches the minimum up to an amount of 5, and fails at 6: 4 plus 1 plus 1, against 3 plus 3. The example may pass by luck, and asking whether greedy is correct hands the interviewer the question you should be answering.

## 6

Two candidates end with the same correct Koko code. One stated the stuck point ten and a half minutes in, and asked a specific question at about twelve and a half minutes. The other was silent until past minute 15, and needed a core-idea hint at minute 17. What mainly separates their algorithm ratings?

A, whether they used Python or a compiled language. B, the total number of questions each one asked. C, how much of the solution was theirs, and when. D, only the final code, which is identical here.

[think]

The answer is C: how much of the solution was theirs, and when.

The algorithm dimension is typically rated after adjusting for hints. The first candidate supplied the check, the technique, the complexity and the invariant after one small nudge. The second was given the technique late, which also squeezed testing. Identical final code does not erase that, and question count or language are not what the debrief weighs.
