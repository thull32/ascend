---
lesson: binary-search-on-the-answer
source: e14054a44e55c315
fit: partial
desk:
  - "The template and its correctness proof, with the invariant written out"
  - "The Koko, split-array and ship-capacity traces, probe by probe"
  - "The aggressive-cows trace, and the rounding that makes it spin"
  - "The k-th smallest in a sorted matrix staircase count, and the real-valued max-average search"
  - "Exercises: minimum eating speed, and split array largest sum"
---
## Introduction

Koko has piles of bananas and h hours: find the smallest eating speed that finishes in time. Ship these packages in order within d days: what is the smallest ship capacity? Split this array into k contiguous pieces, and minimise the largest piece's sum.

None of these mentions a sorted array. A candidate who has only seen binary search as "find x in a sorted list" will try greedy, then dynamic programming, then panic.

They are all the same problem. Each asks for the smallest value of some quantity such that a condition holds, and the condition has a special shape: if it holds for a value, it holds for every larger value. That shape is called monotone, and a monotone yes-or-no question over a range of integers is exactly what binary search answers. You do not search the input. You search the space of possible answers.

Three ideas, then. The reframing and the one sentence you must be able to say. Why the template is correct, and the two ways it fails silently. And how to spot the pattern, and when not to use it.

## The reframing

Write the question as a predicate, feasible of x: is answer x good enough? Then check the one property that matters. If x is feasible, is x plus 1 also feasible?

If eating at speed 4 finishes in time, so does speed 5. If capacity 15 ships everything in 5 days, so does 16. If the array splits into k pieces each summing to at most 18, the same split works for 19. When that holds, the candidate answers in order look like false, false, false, then true from some point on, and you want the first true. That is the first-true search from the previous lesson, with a new predicate.

Every problem in this family is solved by filling in three things. The range: the smallest conceivable answer, and a value you know is feasible. The predicate: usually a greedy simulation, linear in the input. And the monotonicity argument, one sentence, said out loud: "a larger x only makes this easier, because the same witness still works."

The cost is the predicate's cost times the log of the range. With a linear predicate and answers up to a billion, that is about 30 passes over the input. Fine.

## Koko, and the split

Try Koko. The piles are 3, 6, 7 and 11, and she has 8 hours. At speed s, a pile takes the pile size over s, rounded up. The range is speed 1 up to speed 11, the biggest pile, which finishes every pile in an hour. Before I go on: is speed 3 fast enough?

[pause]

No. At speed 3 the piles take 1, 2, 3 and 4 hours: 10 hours, over the limit. At speed 4 they take 1, 2, 2 and 3: exactly 8. So the answer is 4, and binary search finds it in four predicate calls instead of eleven. One small trap: compute the rounded-up division with integers, not by converting to a float and calling ceiling, because near 2 to the 53 floats round.

Now split-array: 7, 2, 5, 10, 8, into two pieces. This one is usually taught as dynamic programming, at k times n squared. As binary search on the answer, it is n times the log of the sum: faster and shorter. The range runs from the largest element, 10, to the total, 32. The predicate walks the array and starts a new piece whenever adding the next element would push the current piece over the cap, and the cap is feasible if that needs at most k pieces. At cap 18, you get 7 plus 2 plus 5, which is 14, and then 10 plus 8, which is 18. Two pieces. At 17, the 10 and the 8 cannot share a piece, so you need three. The answer is 18.

Why is the greedy exact, not a heuristic? It is an exchange argument. The greedy's first piece is the longest prefix that fits. Any other valid split cuts at or before that point, and moving its cut right to the greedy's position keeps the first piece under the cap and only takes elements away from the second. Repeat cut by cut, and you turn any valid split into the greedy one without adding a piece. And fewer than k pieces is fine, because any piece can be split further without raising the maximum.

Ship capacity is the same problem in different words: packages in order, d days, one ship. Same range, same greedy. Recognising that two differently worded problems share a predicate is the skill being tested.

## Why it is correct, and how it lies

The invariant: every value below lo is infeasible, and hi is feasible. Each step keeps it. If mid is feasible, hi moves to mid. If mid is infeasible, monotonicity says everything below it is too, so lo moves to mid plus 1. That is the only place the proof uses monotonicity. When the loop ends, lo equals hi, everything below is infeasible, and lo itself is feasible. So it is the smallest.

Notice what the proof never used: that the predicate is cheap, exact, or integer-valued. That is why it carries over to real numbers, and to predicates that are load tests.

Now the silent failures. First: if hi is not actually feasible, the invariant is false from the start. The loop still terminates and returns hi, with no error. A capacity planner says "256 replicas" for a latency target no replica count can meet. Choose hi by a construction that is provably feasible, or test it up front.

Second, a subtler one, about lo. Run split-array on 7, 2, 5, 10, 8, now into five pieces, but start the range at 1 instead of the largest element. At cap 7, the greedy produces 7, then 2 and 5, then 10 alone, then 8: four pieces. Four is at most five, so cap 7 is "feasible", and the search returns 7. The true answer is 10. The greedy only starts a new piece when the running sum would overflow; it never checks that a single element fits. Start the range at the largest element, or have the predicate reject any element bigger than the cap.

## Maximise the minimum, and real numbers

Some problems run the other way. Place three cows in stalls at 1, 2, 4, 8 and 9, maximising the minimum distance between any two. If a spacing works, every smaller spacing works too, so the picture is true, true, true, then false, and you want the last true. The answer here is 3: cows at 1, 4 and 8.

The trap is the update. If you write "when feasible, lo becomes mid", and mid rounds down, then on a range of two values, mid equals lo, nothing changes, and the loop spins forever. The rule from the previous lesson, unchanged: never assign mid back to the side it came from without adjusting by one. When the update is lo equals mid, round mid up.

For real-valued answers, such as the maximum average of a subarray of at least k elements, run a fixed number of halvings, say 60, never "while hi minus lo is above some epsilon". Doubles near 10 thousand are spaced about 2 times 10 to the minus 12 apart. After roughly 52 halvings the midpoint equals one of the ends and the interval stops shrinking. An epsilon of 10 to the minus 13 is never met, and the loop spins.

One more surprise. To find the k-th smallest value in a matrix whose rows and columns are sorted, binary search the value range, counting how many entries are at or below x. Mid is usually not in the matrix. But the answer always is, because the count only changes when x reaches an entry, so the first x where it reaches k is an entry's value.

## Spotting it, and when not to

The signals: "minimum such that" or "maximum such that". "Minimise the maximum" or "maximise the minimum". An answer in a known range, where checking one candidate is easy. A greedy or a DP that feels almost right, but the objective is a threshold. And constraints like values up to a billion with n up to 100 thousand.

The disqualifier: if you cannot say the monotonicity sentence, stop. "Minimum coins to make amount x" is not monotone in x: amount 6 might need one coin and amount 7 three. That is dynamic programming. And "the batch size that maximises throughput" is not monotone either: throughput rises, then falls once batches stop fitting in cache. Bisect a rise-then-fall curve and you get wherever the first probe happened to land.

The same template runs in production. Git bisect is binary search on the answer over commits, and it assumes the bug was introduced once and never fixed and reintroduced. Capacity planning is another: the smallest replica count that keeps 99th percentile latency under 200 milliseconds, where each probe is a half-hour load test. From 1 to 256 replicas, that is 8 probes, an afternoon. A linear sweep would be 256 probes, more than five days around the clock. Check that the top of the range is feasible, repeat noisy probes and take a majority, and confirm the curve really is monotone.

## In the interview

A follow-up the lesson expects. You solved split-array with binary search. What is the DP, and when would you prefer it?

[pause]

The DP is: the best largest-piece sum for the first i elements in j pieces is the minimum, over the last cut, of the larger of the best for the shorter prefix and the last piece's sum. That is k times n squared. Prefer it when the objective is not a threshold, such as minimising the sum of the squared piece sums, which has no feasibility test. The wrong answer is "the DP is more exact, binary search is an approximation". Binary search on the answer is exact. It is not numerical root-finding.

And one more: the range is 1 to 10 to the 18, and each predicate call takes a second. That is 60 probes, a minute, which is fine. If the answer is expected to be small, gallop first, probing 1, 2, 4, 8, until it turns feasible, then bisect the last interval.

## Recap

Four things to remember. Binary search on the answer turns "smallest x such that" into a monotone yes-or-no question over the answers, at the predicate's cost times log of the range. Say the monotonicity sentence before you write code, and if you cannot, it is not this pattern. Pick lo and hi from the problem's structure: an infeasible hi returns a non-answer silently, and a lo below the largest element can make a greedy predicate lie. And for maximise-the-minimum, round mid up when lo moves to mid; for real numbers, use a fixed iteration count.

At your desk: the template and its proof, the Koko, split-array and ship-capacity traces, the aggressive-cows trace, the sorted-matrix count, and the two exercises, minimum eating speed and split array largest sum.
