---
review: problem-solving
source: 41edea96160e74c3
---
## Introduction

Twelve questions from the problem-solving module. Answer out loud before the answer comes.

They run through the module in order: the problem-solving loop, invariants and loop reasoning, pattern recognition, testing your own code, and communicating while solving. Each has four options, A to D, then a few seconds for you to commit to one.

## Question 1

You have coded a solution, and it returns the wrong answer for an example you had not written down before. According to the loop, where do you go first?

A, step 4, to rethink the optimisation you chose. B, step 1, to check you read the problem right. C, step 5, to find and fix the bug in the code. D, step 3, to compare against the brute force.

[think]

The answer is B: step 1, to check you read the problem right.

A failure on a case you never considered usually means the problem is different from the one you solved: a missed constraint or a misread term. Re-examine the statement first, because fixing code for the wrong problem wastes time. A failure on an example you did work by hand points at the optimisation or the code instead.

## Question 2

The restart-from-each-start version of longest substring without repeats, using a set, measured 2.4 milliseconds on 8,000 random lowercase characters, but 2.4 seconds on 8,000 distinct characters. What explains the thousandfold gap?

A, non-Latin characters make each set lookup far slower. B, the interpreter caches results for repeated random text. C, distinct characters force a set resize on every insertion. D, a 26-letter alphabet caps every inner loop at about 26 steps.

[think]

The answer is D: a 26-letter alphabet caps every inner loop at about 26 steps.

The inner loop stops at the first repeat, which on a 26-letter alphabet arrives within about 20 characters, so the total work is n times the alphabet rather than n squared. With all-distinct characters every inner loop runs to the end of the string, and the quadratic worst case appears. Set resizes are amortised constant time, the interpreter caches nothing between runs, and the 40 percent slowdown measured for non-Latin text cannot account for a factor of a thousand.

## Question 3

For the first-true binary search, with the invariant "all indices below lo are false, all at or above hi are true", why does hi start at the length of the array and not the length minus 1?

A, because Python ranges are half-open, so it must match. B, it is arbitrary; both starting values give the same result. C, to avoid an index-out-of-range error on the first probe. D, nothing is known to be true yet except the index past the end.

[think]

The answer is D: nothing is known to be true yet except the index past the end.

Before any probe, the only index known to be true is the imaginary one past the end. Starting hi at the length minus 1 would assert the last element is true before checking it, which breaks the invariant when the array is all false. Starting at the length keeps the invariant vacuously true, and makes the all-false case return the length as its sentinel.

## Question 4

You write a binary search with mid as lo plus hi, halved and rounded down, and in one branch you set lo equal to mid. What is the most likely consequence?

A, it loops forever once hi is lo plus 1, since mid equals lo. B, nothing; lo equals mid is the standard form of that branch. C, it raises an index error when mid reaches the end of the array. D, it returns an index that is off by one on some inputs.

[think]

The answer is A: it loops forever once hi is lo plus 1.

With a range of width one, mid rounds down to lo, so setting lo to mid leaves the range unchanged and the loop never shrinks it. On false, true, it is still at lo 0, hi 1 after any number of iterations. The termination check, does every branch strictly shrink the range, catches this before any test does. Use lo equals mid plus 1, or round mid up if the branch must keep mid.

## Question 5

A service validates request sizes with an assert that size is at most the maximum, and is deployed with python dash O. What happens?

A, the check runs, but about 60 percent slower than an if statement. B, the check still runs, but raises a different exception. C, the check runs only when the debug flag is set at runtime. D, the check is compiled out entirely, and every size is accepted.

[think]

The answer is D: the check is compiled out entirely, and every size is accepted.

Under dash O the compiler emits no bytecode for assert statements at all, so the validation vanishes in exactly the environment where input is least trusted. Input validation, and anything with a side effect, must be an explicit if that raises. Assert is for invariants that only a bug in the function itself could break.

## Question 6

Which change to a problem statement most directly moves it from sliding window to prefix sums plus a hash map?

A, allowing negative numbers when the sum is what matters. B, asking for the shortest window instead of the longest. C, raising n from a thousand to a hundred thousand, which rules out quadratic time. D, guaranteeing the input array is sorted ascending.

[think]

The answer is A: allowing negative numbers when the sum is what matters.

Negative numbers destroy the monotone relationship between window size and window sum, so there is no rule for when to shrink. Prefix sums turn "a subarray with sum k" into "two prefixes that differ by k", which is a hash-map lookup. Shortest versus longest changes the window's bookkeeping, not the pattern.

## Question 7

Why is greedy the wrong reflex for minimum coins, with denominations 1, 3 and 4, and a target of 6?

A, greedy only works when the target is a power of two. B, largest-first gives 4 plus 1 plus 1, but 3 plus 3 uses fewer coins. C, greedy is never valid for minimisation problems. D, it is not wrong; largest-first also finds 3 plus 3 here.

[think]

The answer is B: largest-first gives 4 plus 1 plus 1, but 3 plus 3 uses fewer coins.

Taking the largest coin first gives three coins, while two is optimal. Greedy requires that a locally best choice can always be exchanged into some optimal solution. That holds for canonical systems like 1, 5, 10, 25, but not for 1, 3, 4, so greedy is sometimes valid, just not here. The safe reflex is dynamic programming unless you can state the exchange argument.

## Question 8

A merge-intervals solution passes the statement's example but fails a hidden test. Which input from the edge-case taxonomy is most likely to expose a bug in the merge step specifically?

A, an empty list, which has nothing to merge at all. B, intervals that already arrive sorted by their start. C, a single interval, with nothing to merge it against. D, an interval nested inside the previous merged one.

[think]

The answer is D: an interval nested inside the previous merged one.

A contained interval has a smaller end than the current merged end. Code that sets the end to the new interval's end, instead of the larger of the two, shrinks the merged range, and later intervals wrongly fail to merge. Empty and single inputs test setup and return paths, not the merge logic, and a chain of increasing ends passes the same bug.

## Question 9

A solution is correct, but reports time limit exceeded. Which should you check first?

A, hidden linear operations inside the loop, such as popping from the front of a list. B, whether the recursion is too deep for the default stack. C, whether the judge's test inputs are malformed or huge. D, whether the language is too slow for this problem.

[think]

The answer is A: hidden linear operations inside the loop.

A linear operation inside a linear loop, popping the front of a list, membership on a list, slicing, string concatenation, silently makes the solution quadratic, and it is the most common cause of a timeout on an algorithm that is otherwise right. Language constants rarely account for a factor of n. Recursion depth produces a stack error, not a timeout.

## Question 10

You cannot write a brute force for a problem, but you want to test your solution on random inputs. What can you do?

A, compare against the same function run a second time. B, test only the statement's example, which is verified. C, check properties every correct output must satisfy. D, nothing; random testing always needs an oracle.

[think]

The answer is C: check properties every correct output must satisfy.

Property checks replace an oracle with invariants of the output, such as sortedness, no overlap, and covering the same points. They are often trivial to write even when the answer is hard to compute, and a violated property on a small random input gives you a minimal case to trace by hand. Running the same function twice only tests that it is deterministic.

## Question 11

An interviewer asks why a hash map rather than sorting. Which answer best demonstrates senior-level reasoning?

A, it is the standard solution to this problem, so it is the safe choice. B, I need constant-time lookups, not order; if space were capped, I'd sort instead. C, hash maps are faster than sorting, and speed is what the problem needs. D, sorting is n log n while one hash-map pass is linear, so it is faster.

[think]

The answer is B: I need constant-time lookups, not order; if space were capped, I'd sort instead.

The strong answer names the property of the problem that justifies the choice, membership queries with order irrelevant, and the condition under which the alternative wins: with constant extra space required, sorting plus two pointers is right. "Standard solution" and "faster" are assertions without reasons. The n log n comparison is true, but it does not explain why sorting is unnecessary here, or when it would win.

## Question 12

The interviewer gives a hint that steers toward an approach you think is slightly worse than your own idea. What should you do?

A, explain why your approach is better until the interviewer agrees. B, thank them, then carry on with your own idea, since it is better. C, restate the hint, say once why you differed, then follow it. D, drop your idea without comment and follow the hint from scratch.

[think]

The answer is C: restate the hint, say once why you differed, then follow it.

Restating the hint in your own words shows it landed. One sentence of disagreement with a reason shows judgement. Following it unless the interviewer withdraws it respects that they may be steering toward a planned follow-up. Ignoring or arguing at length is graded as poor collaboration, and silently restarting hides your reasoning and throws away correct work.

## Recap

The questions kept returning to three ideas. First, every technique has a property it depends on, and the property is what you check: a sliding window needs monotonicity, greedy needs an exchange argument, binary search needs an invariant that every branch preserves while shrinking the range. Second, boundaries are where bugs live, so test at them on purpose: the nested interval, the all-false array, the width-one range, the case you never wrote down. Third, reasoning only counts when it is visible: name the property behind a choice, take a hint by restating and deriving, and say what you tested.
