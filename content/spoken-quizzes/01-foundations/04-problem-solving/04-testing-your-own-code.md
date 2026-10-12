---
lesson: testing-your-own-code
source: 8d6e7e73bc640cdd
---
## 1

A merge-intervals solution passes the statement's example but fails a hidden test. Which input from the edge-case taxonomy is most likely to expose a bug in the merge step specifically?

A, an empty list, which has nothing to merge at all. B, intervals that already arrive sorted by their start. C, a single interval, with nothing to merge it against. D, an interval nested inside the previous merged one.

[think]

The answer is D: an interval nested inside the previous merged one.

A contained interval has a smaller end than the current merged end. Code that sets the end to the new interval's end, instead of the larger of the two, shrinks the merged range, and later intervals wrongly fail to merge. Empty and single inputs test setup and return paths, not the merge logic, and a chain of increasing ends passes the same bug.

## 2

Your Python solution throws an index error, list index out of range, on the line that loops while the element at hi is greater than the target. What is the most likely cause?

A, hi starts at the length of the list, or the input list is empty. B, hi became a float from true division, not an integer. C, Python cannot index a list inside a while condition. D, the target is larger than every element in the array.

[think]

The answer is A: hi starts at the length of the list, or the input list is empty.

An index error names an index that is out of range. Both an empty input, where hi is minus 1 and there is nothing to index, and hi initialised to the length rather than the length minus 1 produce it. A float index would raise a type error, not an index error, and a target above every element skips the loop. Reading the failing line and asking which value of hi could be out of range leads straight to the initialisation.

## 3

Why should hand traces use inputs of size two to six, rather than the statement's example?

A, hidden tests mostly use small inputs, so they matter most. B, the statement's example is guaranteed to pass already. C, small inputs run faster, so you get results sooner. D, boundaries show up at once, and the trace stays accurate.

[think]

The answer is D: boundaries show up at once, and the trace stays accurate.

The bugs a trace can find live at boundaries, such as initialisation, the last iteration, or an empty input, and a two-element input reaches them immediately. A nine-element trace is long enough that you start making errors in the trace itself. The statement's example is usually chosen to be friendly rather than to hit boundaries, which is why passing it proves little.

## 4

A solution is correct, but reports time limit exceeded. Which should you check first?

A, hidden linear operations inside the loop, such as popping from the front of a list. B, whether the recursion is too deep for the default stack. C, whether the judge's test inputs are malformed or huge. D, whether the language is too slow for this problem.

[think]

The answer is A: hidden linear operations inside the loop, such as popping from the front of a list.

A linear operation inside a linear loop, such as popping the front of a list, membership on a list, slicing, or string concatenation, silently makes the solution quadratic, and it is the most common cause of a timeout on an algorithm that is otherwise right. Language constants rarely account for a factor of n. Recursion depth produces a stack error, not a timeout.

## 5

You cannot write a brute force for a problem, but you want to test your solution on random inputs. What can you do?

A, compare against the same function run a second time. B, test only the statement's example, which is verified. C, check properties every correct output must satisfy. D, nothing: random testing always needs an oracle.

[think]

The answer is C: check properties every correct output must satisfy.

Property checks replace an oracle with invariants of the output, such as sortedness, no overlap, and covering the same points. They are often trivial to write even when the answer is hard to compute, and a violated property on a small random input gives you a minimal case to trace by hand. Running the same function twice only tests that it is deterministic.

## 6

Your Python solution returns the tuple 0, 1, and the test expects the list 0, 1. Your JavaScript version forgets its return statement on one path. What does the test harness report?

A, the tuple fails as a wrong type, and undefined passes as an empty result. B, the tuple passes as a list, and the undefined becomes null and fails. C, both pass: the harness ignores return types and missing returns. D, both fail: a tuple is not a list, and undefined is not null.

[think]

The answer is B: the tuple passes as a list, and the undefined becomes null and fails.

The Python harness encodes tuples as JSON lists before comparing, so the tuple matches. The JavaScript harness turns undefined into null, which only matches a test whose expected value is null, so against the list it fails. Knowing the canonical form tells you which failures are the algorithm and which are the shape of the return value.
