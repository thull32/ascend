---
lesson: invariants-and-loop-reasoning
source: fdabaceea3b46abf
---
## 1

In the two-pointer pair sum, why does the loop run while lo is strictly less than hi, rather than while lo is at most hi?

A, strictly less saves one iteration, which is the only reason. B, a pair needs two indexes, and lo equal to hi leaves only one. C, both are correct: the choice is purely a matter of style. D, at most would loop forever once the pointers meet.

[think]

The answer is B: a pair needs two indexes, and lo equal to hi leaves only one.

The postcondition requires two distinct indexes. When lo equals hi, the loop would compare an element with itself, and could wrongly return the same index twice, so it is not a style choice. The invariant, plus the exit condition that lo has reached hi, is exactly what proves no pair remains.

## 2

For the first-true binary search, with the invariant "all indices below lo are false, all at or above hi are true", why does hi start at the length of the array and not the length minus 1?

A, because Python ranges are half-open, so it must match. B, it is arbitrary: both starting values give the same result. C, to avoid an index-out-of-range error on the first probe. D, nothing is known to be true yet, except the index past the end.

[think]

The answer is D: nothing is known to be true yet, except the index past the end.

Before any probe, the only index known to be true is the imaginary one past the end. Starting hi at the length minus 1 would assert the last element is true before checking it, which breaks the invariant when the array is all false. Starting at the length keeps the invariant vacuously true, and makes the all-false case return the length as its sentinel.

## 3

You write a binary search with mid as lo plus hi, halved and rounded down, and in one branch you set lo equal to mid. What is the most likely consequence?

A, it loops forever once hi is lo plus 1, since mid equals lo. B, nothing: lo equals mid is the standard form of that branch. C, it raises an index error when mid reaches the end of the array. D, it returns an index that is off by one on some inputs.

[think]

The answer is A: it loops forever once hi is lo plus 1, since mid equals lo.

With a range of width one, mid rounds down to lo, so setting lo to mid leaves the range unchanged and the loop never shrinks it. On false, true, it is still at lo 0, hi 1 after any number of iterations. The termination check, does every branch strictly shrink the range, catches this before any test does. Use lo equals mid plus 1, or round mid up if the branch must keep mid.

## 4

Which statement is a useful loop invariant for the two-pointer pair-sum algorithm?

A, lo and hi are always valid indexes into the array. B, the array stays sorted throughout the whole loop. C, the sum at lo and hi moves steadily closer to the target. D, if a valid pair exists, one lies within lo to hi.

[think]

The answer is D: if a valid pair exists, one lies within lo to hi.

An invariant must connect the loop state to the postcondition. Sorted is the precondition, and valid indexes is true but proves nothing about the answer. If a valid pair exists, one lies within lo to hi: that is what lets you conclude, at exit, that no pair exists.

## 5

A first-true search starts hi at the length minus 1, loops while lo is less than hi, sets hi to mid on true, and returns lo. On which inputs is it wrong?

A, every all-false input, where it returns n minus 1. B, none: it is the closed-interval convention. C, every input whose first true is at index 0. D, only the empty list, where hi starts at minus 1.

[think]

The answer is A: every all-false input, where it returns n minus 1.

Starting hi at n minus 1 asserts that the last element is true before checking it. When the array is all false, the loop converges on index n minus 1 and returns it, instead of n. Checked against a brute-force scan on 2,000 random inputs, this hybrid was wrong on 390 of them. The closed convention that starts at n minus 1 needs either an answer variable or an explicit check of the last element.

## 6

A service validates request sizes with an assert that size is at most the maximum, and is deployed with python dash O. What happens?

A, the check runs, but about 60 percent slower than an if statement. B, the check still runs, but raises a different exception. C, the check runs only when the debug flag is set at runtime. D, the check is compiled out entirely, and every size is accepted.

[think]

The answer is D: the check is compiled out entirely, and every size is accepted.

Under dash O the compiler emits no bytecode for assert statements at all, so the validation vanishes in exactly the environment where input is least trusted. That is why input validation, and anything with a side effect, must be an explicit if that raises. Assert is reserved for invariants that only a bug in the function itself could break.
