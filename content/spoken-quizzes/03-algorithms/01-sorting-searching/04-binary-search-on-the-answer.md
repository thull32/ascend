---
lesson: binary-search-on-the-answer
source: 9f0e15924a49ffc9
---
## 1

Which of these questions is not a valid target for binary search on the answer?

A, the minimum number of coins needed to make amount x, searched over x. B, the smallest ship capacity that delivers the packages in d days. C, the smallest eating speed that finishes the piles in h hours. D, the largest minimum distance when placing k cows in n stalls.

[think]

The answer is A: the minimum coins for amount x.

Coins needed is not monotone in the amount: amount 6 may need one coin and amount 7 three, so the predicate has no false-then-true shape. The other three each have a threshold that, once satisfied, stays satisfied as it grows, or, for the cows, as it shrinks.

## 2

In the Koko eating-speed problem the largest pile is 11, but you set hi to a billion. The search still returns 4. Why is the tighter bound, the largest pile, still preferred?

A, it saves about 26 predicate calls, each a linear pass. B, monotonicity only holds for speeds up to the largest pile. C, a loose hi can return a speed that is too large. D, each probe costs more when the speed is huge.

[think]

The answer is A: it saves about 26 predicate calls, each a linear pass.

A billion takes about 30 probes and 11 about 4, and each probe is a linear pass whatever the speed. Both bounds are correct, since the search returns the first feasible speed; the tighter one is cheaper, and shows you understand the answer's range. Monotonicity is a property of the predicate, not of the range, and holds for every speed.

## 3

In the split-array problem, the predicate greedily extends the current piece as far as it can under the cap. Why does that greedy compute the minimum number of pieces for that cap?

A, it works because the input array is sorted. B, it is only a heuristic; dynamic programming gives the exact count. C, moving any earlier cut to the right never adds an extra piece. D, with small k, the greedy happens to match the dynamic programming answer.

[think]

The answer is C: moving any earlier cut right never adds an extra piece.

Any solution that cuts earlier can have its cut moved right without exceeding the cap, so cutting as late as possible never costs a piece. That exchange argument makes the predicate exact for any k, so no dynamic programming is needed. Sortedness is irrelevant, because the pieces are contiguous; the greedy is linear and correct for any positive array.

## 4

In a maximise-the-minimum search, you set lo to mid when mid is feasible and hi to mid minus 1 otherwise, with mid rounded down. What is wrong?

A, the predicate must be inverted to read false, then true. B, when hi is lo plus 1, setting lo to mid never shrinks the range. C, setting hi to mid minus 1 skips a value that could be the answer. D, nothing; this is the standard closed-range form.

[think]

The answer is B: when hi is lo plus 1, setting lo to mid never shrinks the range.

With mid rounded down and a two-element range, mid equals lo, so a feasible mid leaves lo where it was and the loop may never end. Round mid up instead, so that setting lo to mid always makes progress. Setting hi to mid minus 1 is fine here, because an infeasible mid cannot be the answer.

## 5

You find the k-th smallest value in an n by n matrix, with sorted rows and columns, by binary searching the value range. The count of x is the number of entries at most x. The midpoint is usually not an entry of the matrix. Why is the final answer still an actual entry?

A, it is not; a final scan must snap it to an entry. B, the count only increases when x reaches an entry. C, each probe rounds mid to the nearest entry. D, the staircase walk only ever visits matrix entries.

[think]

The answer is B: the count only increases when x reaches an entry.

The count is a step function that rises only as x passes an entry. So the first x at which it reaches k is exactly the value of some entry, and no rounding or post-processing is needed. The staircase walk visiting entries is how the count is computed, not why the result lands on one.

## 6

In split-array with k equal to 5, on the array 7, 2, 5, 10, 8, the correct answer is 10. Starting the search at lo equals 1, instead of at the largest element, returns 7. What went wrong?

A, the greedy never rejects a lone element larger than the cap. B, the search needs at least log of the sum probes to be exact. C, with k equal to 5, the monotone shape of the predicate breaks down. D, the upper bound, the sum of the array, was infeasible for this input.

[think]

The answer is A: the greedy never rejects a lone element larger than the cap.

At a cap of 7, the greedy produces 7, then 2 and 5, then 10, then 8: four pieces, one of them a single element above the cap, and four is within five, so the predicate reports feasible. Starting the range at the largest element, or rejecting any element above the cap inside the predicate, removes the lie. The predicate is still monotone, and the sum is always feasible.
