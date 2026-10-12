---
lesson: dp-craft
source: 3feb77ac829ea07b
---
## 1

You optimised longest common subsequence to two rolling rows, and the interviewer asks for the actual subsequence. What are your options?

A, none; rolling rows discard the table, so the path is gone. B, switch to a greedy scan that matches characters left to right. C, read the subsequence directly off the two rows still in memory. D, keep the full table, store parent pointers, or use Hirschberg's trick.

[think]

The answer is D: keep the full table, store parent pointers, or use Hirschberg's trick.

Rolling rows lose the walk-back path, but the full table, using m times n memory, explicit parent pointers, or Hirschberg's divide and conquer each recover it. Hirschberg gets the subsequence in memory proportional to m plus n, with about twice the fill time. The two remaining rows hold only the last values, not the route, and greedy does not solve this problem.

## 2

Which of these is not a reason to reject dynamic programming for a problem?

A, a greedy choice is provably safe, and gives a better complexity. B, the state must include the set of visited items, and n is 200. C, the subproblems are disjoint, as in merge sort and quicksort. D, the subproblems overlap heavily across the naive recursion.

[think]

The answer is D: the subproblems overlap heavily across the naive recursion.

Overlap is the property that makes dynamic programming pay off. A safe greedy choice, an exponential state space, such as 2 to the 200 subsets, and disjoint subproblems are each a reason to use something else.

## 3

Word break has no minimum and no count in its statement. What makes it a dynamic programming problem anyway?

A, nothing; a trie over the dictionary solves it without one. B, every split point must be tried, which is what dynamic programming means. C, the dictionary is a set, so repeated lookups are cached. D, a prefix's yes or no depends on shorter prefixes, which recur.

[think]

The answer is D: a prefix's yes or no depends on shorter prefixes, which recur.

The answer for a prefix depends only on the answers for shorter prefixes, and a naive search revisits those prefixes many times: optimal substructure plus overlap. Trying every split is brute force; the reuse is what makes it dynamic programming. A trie speeds up the word lookups, but does not remove the exponential search without memoisation.

## 4

Your coin-change table gives the right count, but the walk-back that recovers the coins loops forever. What is the most likely bug?

A, the table should have been filled backwards, from the amount down. B, the coins are not sorted, so the walk-back picks the wrong one. C, the walk-back looks for a smaller amount with the same value, instead of a value one less. D, infinity was stored as the amount plus 1, which the walk-back follows.

[think]

The answer is C: it tests for the same value instead of a value one less.

The walk-back must step to a state whose value is exactly one less. With an equality test, it soon reaches an amount where no coin qualifies. With coins 1, 3 and 4 it goes from 6 to 5 to 2, and then finds nothing, so the amount never changes and the loop spins. Sorting, the fill direction and the sentinel are unrelated.

## 5

A dynamic programming solution is correct and runs in n times m time, with n and m both 20 thousand, in pure Python, and it must finish in under a second. What is the first thing to try?

A, add a cache, so repeated cells are not recomputed. B, shrink the state space, or vectorise the inner loop. C, switch to top-down, so only the needed cells get computed. D, raise the recursion limit, so the deep calls can finish.

[think]

The answer is B: shrink the state space, or vectorise the inner loop.

400 million cells at tens of nanoseconds each is many seconds, so the number of states is the problem. Banding, pruning unreachable cells, NumPy vectorisation or a compiled inner loop are the real levers. Top-down adds call and hash overhead and needs nearly every cell anyway, the recursion limit is irrelevant to a bottom-up fill, and a cache is what the table already is.

## 6

A JavaScript unique-paths solution using plain numbers is exact on small grids, but comes out 32 too small on a 32 by 32 grid. Why?

A, the count passes 2 to the 53, beyond which doubles cannot represent every integer. B, floating-point addition is not associative, so the row sums drift. C, the table exceeds the engine's array length limit at 900 cells. D, recursion depth reaches the engine's frame limit at 30 rows.

[think]

The answer is A: the count passes 2 to the 53, beyond which doubles cannot represent every integer.

Square-grid counts pass 2 to the 53, about 9 quadrillion, at 30 by 30, and beyond that doubles are spaced 2 or more apart, so an addition may round. The 30 and 31 results happen to land on representable values; 32 by 32 is the first grid that loses 32. A thousand-cell array is tiny, and a bottom-up fill has no recursion. Use BigInt, or count modulo a prime.
