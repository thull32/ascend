---
lesson: generating-combinatorial-objects
source: fe85c6d4756e4757
---
## 1

A subsets function records its answer by appending the path list itself, instead of a copy of it. What does the output contain when the call returns?

A, all 2 to the n subsets, each recorded correctly. B, all 2 to the n subsets, but in reverse order. C, 2 to the n references to one list, which now holds the full set. D, 2 to the n references to one list, which is now empty.

[think]

The answer is D: 2 to the n references to one list, which is now empty.

The path is one list, mutated in place, and every recorded entry points at it. Every append is undone by a pop, so after the final pop it is empty and every entry reads as empty; it never stays at the full set. Copy on record.

## 2

The subsets-with-duplicates code skips index i when i is greater than start and the value equals the previous one. If you change "greater than start" to "greater than zero", what happens on the input 1, 2, 2?

A, you lose only the subset 2, 2, and keep 1, 2, 2. B, you get 1, 2 and 2 twice each. C, you get the same six subsets as before. D, you lose both 1, 2, 2 and 2, 2.

[think]

The answer is D: you lose both 1, 2, 2 and 2, 2.

With "greater than zero", the rule also fires when the equal element is the first choice of a deeper level, so a 2 can never follow a 2, whether the path starts with 1 or with 2. No duplicates appear, because sibling 2s are still skipped. The rule must only block equal siblings, which is what "greater than start" says.

## 3

You need every permutation of 12 distinct items. Roughly how many objects is that, and is listing them all feasible in a few seconds?

A, about 4 billion; no, not even in compiled code. B, about 479 million; borderline in Python. C, about 144, which is 12 squared; yes, very fast. D, about 4 thousand, which is 2 to the 12; yes, very fast.

[think]

The answer is B: about 479 million; borderline in Python.

12 factorial is roughly 480 million, not 2 to the 12, which counts subsets. In a compiled language it takes seconds; in Python it takes minutes and the output alone is gigabytes, so it is borderline, and probably not in Python. A limit of n equal to 12 for permutations signals that the intended solution prunes or counts rather than lists.

## 4

Combination Sum allows reusing a candidate. Which single change to the combinations template implements that?

A, drop the start index and loop over all candidates. B, remove the early break, so larger candidates are retried. C, recurse with start reset to zero, so every candidate is open. D, recurse with start equal to i, rather than i plus 1.

[think]

The answer is D: recurse with start equal to i, rather than i plus 1.

That lets the same index be chosen again but still forbids going back to earlier ones, so each multiset comes out in one canonical order. Dropping the start index or resetting it to zero produces every ordering of the same sum. The break is only pruning on sorted input; removing it changes speed, not which items can repeat.

## 5

An interviewer gives you n up to 100 thousand, and asks for the number of subsets whose sum equals a target. What does the constraint tell you?

A, sort, then count matching sums with two pointers. B, enumerate bitmasks, since iteration avoids recursion. C, backtrack, pruning once the sum passes the target. D, count with dynamic programming over index and sum, not enumeration.

[think]

The answer is D: count with dynamic programming over index and sum.

2 to the 100 thousand subsets cannot be enumerated by any method, iterative or pruned; pruning cuts branches, but the number of matches alone can be exponential. Asking for a count rather than the objects, with a large n, is the signature of dynamic programming over the subproblem state, not a search.

## 6

C plus plus next permutation is applied once to the array 1, 3, 2. Which array results?

A, 2, 1, 3, after swapping the pivot 1 with 2 and reversing the suffix. B, 1, 2, 3, after reversing the non-increasing suffix in place. C, 3, 1, 2, after rotating the whole array left by one position. D, 2, 3, 1, after swapping the pivot 1 with 2 and keeping the suffix.

[think]

The answer is A: 2, 1, 3.

The longest non-increasing suffix is 3, 2, so the pivot is 1, and the rightmost suffix element larger than 1 is 2. Swapping gives 2, 3, 1, and reversing the suffix gives 2, 1, 3, the next permutation in value order. Reversing without the swap would move backwards, to 1, 2, 3, and a rotation is not part of the algorithm.
