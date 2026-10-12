---
lesson: pattern-recognition
source: b272a75eca1612e6
---
## 1

A statement asks for the longest contiguous subarray whose sum is at most k, with all elements positive. Which pattern fits, and what property justifies it?

A, sliding window, since positives make the sum monotone. B, two pointers from both ends, since the array is sorted. C, Kadane's algorithm, because it is a subarray problem. D, prefix sums with a hash map, because sums are involved.

[think]

The answer is A: sliding window, since positives make the sum monotone.

With positive elements, extending the window never decreases its sum and shrinking from the left never increases it, so a violation is always fixed by shrinking. With negatives allowed, that property breaks, and prefix sums would be needed. Kadane answers maximum sum, a different question, and nothing says the array is sorted.

## 2

Which change to a problem statement most directly moves it from sliding window to prefix sums plus a hash map?

A, allowing negative numbers when the sum is what matters. B, asking for the shortest window instead of the longest. C, raising n from a thousand to a hundred thousand, which rules out quadratic time. D, guaranteeing the input array is sorted ascending.

[think]

The answer is A: allowing negative numbers when the sum is what matters.

Negative numbers destroy the monotone relationship between window size and window sum, so there is no rule for when to shrink. Prefix sums turn "a subarray with sum k" into "two prefixes that differ by k", which is a hash-map lookup. Shortest versus longest changes the window's bookkeeping, not the pattern.

## 3

A problem says n is at most 16, and asks for the minimum cost to visit every node exactly once. What is that constraint a signal for?

A, bitmask DP or backtracking, since 2 to the 16 states are cheap. B, Dijkstra, because the problem asks for a minimum cost. C, union-find, because visiting every node is connectivity. D, greedy nearest-neighbour, because n is small enough.

[think]

The answer is A: bitmask DP or backtracking, since 2 to the 16 states are cheap.

A tiny n is the signal that an exponential number of states is fine: 2 to the 16, times 16, is about a million. Dijkstra finds single-source shortest paths, not tours, and nearest-neighbour greedy has no exchange argument and gives wrong answers.

## 4

In the daily-temperatures stack solution, why is the total work linear, even though the inner loop can pop many indexes in one step?

A, the outer loop skips over indexes that were popped in an earlier step. B, the inner loop runs at most log n times, because temperatures halve. C, each index is pushed once and popped at most once: at most 2 n operations. D, the stack never holds more than 201 indexes, one per temperature.

[think]

The answer is C: each index is pushed once and popped at most once, at most 2 n operations.

An index enters the stack exactly once and leaves at most once, so however the pops are spread across iterations, the total number of pops is at most n. That amortised argument is what makes the algorithm linear. The temperature range plays no role in it, and the outer loop visits every index.

## 5

Why is greedy the wrong reflex for minimum coins, with denominations 1, 3 and 4, and a target of 6?

A, greedy only works when the target is a power of two. B, largest-first gives 4 plus 1 plus 1, but 3 plus 3 uses fewer coins. C, greedy is never valid for minimisation problems. D, it is not wrong: largest-first also finds 3 plus 3 here.

[think]

The answer is B: largest-first gives 4 plus 1 plus 1, but 3 plus 3 uses fewer coins.

Taking the largest coin first gives three coins, while two is optimal. Greedy requires that a locally best choice can always be exchanged into some optimal solution. That holds for canonical systems like 1, 5, 10, 25, but not for 1, 3, 4, so greedy is sometimes valid, just not here. The safe reflex is dynamic programming, unless you can state the exchange argument.

## 6

You have a quadratic Python solution for a problem with n up to 20 thousand and a 4-second limit. Using the measured loop rates, which assessment is honest?

A, comfortable: 400 million steps is well under a billion per second. B, fine, because limits are per test, and the tests are independent. C, impossible in any language, since 100 million per second is universal. D, unsafe: about 200 million loop bodies, at a few tens of millions per second, is seconds.

[think]

The answer is D: unsafe, because about 200 million loop bodies, at a few tens of millions per second, is seconds.

N times n plus 1 over 2, at 20 thousand, is about 200 million loop bodies. A CPython body with an add and a compare runs at a few tens of millions per second, so the brute force measured about 3 seconds natively, and would be slower in the WebAssembly runtimes that grade it: a failing submission, not a comfortable one. The same count is well under a second in compiled code, which is why a budget must be attached to a runtime.
