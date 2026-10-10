---
review: dynamic-programming
source: 769137c4b0bc98bb
---
## Introduction

Twelve questions from the dynamic-programming module, from the mindset lesson through to the craft lesson. Answer out loud before the answer comes.

## Question 1

You define cell i as "something about the first i elements", and you cannot write a transition. What is the most likely fix?

A, sharpen the state, often by adding a dimension the transition needs. B, add more base cases, so the recurrence always has somewhere to start. C, precompute prefix sums, so each transition reads a range in constant time. D, switch from top-down to bottom-up, so the fill order is explicit.

[think]

The answer is A: sharpen the state. A transition can only be derived from a precise state. If the last decision depends on information the state does not carry, such as whether you are holding a share, or whether the last move was a 2-step, that information must become part of the state, usually as an extra dimension. Changing the evaluation direction does not help, because top-down and bottom-up evaluate the same recurrence.

## Question 2

You want the number of multisets of coins that make an amount, where order does not matter. Which loop nesting is correct?

A, coins on the outside, amounts on the inside, swept downwards. B, amounts on the outside, coins on the inside. C, coins on the outside, amounts on the inside. D, either nesting, since addition is commutative.

[think]

The answer is C: coins outside, amounts inside. With coins outermost, the table means "ways using only the coins seen so far", so each multiset is built in one canonical order. Amounts outermost counts every ordering separately, so the nestings are not interchangeable. And a downward sweep is the use-each-coin-once variant, which is a different problem.

## Question 3

The coin-change table runs in time proportional to the amount times the number of coins. An interviewer says the amount can be up to 10 to the 12. What do you say?

A, sort the coins, so the inner loop can stop at the first coin bigger than the amount. B, use memoisation, so only reachable amounts are computed. C, it still works, because the running time is linear in the amount. D, it is infeasible: pseudo-polynomial means 10 to the 12 table cells.

[think]

The answer is D: it is infeasible. The table has one cell per unit of amount. Polynomial in the numeric value means exponential in the number of bits used to write the input, so "linear in the amount" is exactly the problem. You need a different approach, or a restriction on the coin system. Memoisation does not meaningfully reduce the reachable states here, and sorting does not change the count.

## Question 4

In unique paths on a grid, why are the paths counted from the cell above and the paths counted from the cell to the left guaranteed not to overlap?

A, because each path's final move is either down or right. B, because the grid has no obstacles, so no path is shared. C, because two distinct paths never pass through the same cell. D, they do overlap, and the double count is divided out at the end.

[think]

The answer is A: each path's final move is either down or right, never both. Partitioning by the last move gives disjoint sets, so each path is counted in exactly one term. Paths certainly share cells along the way; what matters is only the last move. It is the same "what was the last decision" argument as in one-dimensional problems, and it is why the combine is a plain sum.

## Question 5

You compute edit distance, and you initialise the whole border to zero, as you would for longest common subsequence. What happens?

A, only the first row and column are wrong; the interior is right. B, it returns the insert-and-delete-only distance: the two lengths added, minus twice the common subsequence. C, nothing; the interior recurrence corrects the bad border. D, the interior underestimates, because deleting a prefix now looks free.

[think]

The answer is D: the interior underestimates. The border encodes the cost of deleting or inserting a whole prefix: i deletions down the side, j insertions along the top. With a zero border, turning a, b, c into the empty string claims zero edits instead of three, and every interior cell that routes through the border inherits the error. The border is the base case, and a wrong base case poisons the table rather than being corrected by it.

## Question 6

The regular-expression table takes time proportional to the string length times the pattern length, for every input. Yet Python's regex engine can take seconds on a pattern with a nested repetition, against thirty a's. What explains the difference?

A, a backtracker must allocate a new table for every alternative it tries. B, Python's regex engine is written in pure Python, so each step is slower. C, the table memoises each pair of positions once, while a backtracker revisits them. D, the table supports only dot and star, so it has fewer cases to check.

[think]

The answer is C: the table memoises each state once. Each row of the table is the set of pattern positions still alive after consuming a prefix, which is a nondeterministic automaton simulation: at most one state per pattern position for each character. A backtracking engine explores alternatives one at a time and recomputes the same pairs of string and pattern positions without a memo, which on nested repetitions is exponential. Python's engine is written in C, and the number of features is not the issue; the missing memo is.

## Question 7

In the one-row zero-one knapsack, you accidentally sweep the capacity upward. With a single item weighing 2 and worth 3, and a capacity of 6, what do you get?

A, 6, because only capacity 4 reads an already-updated cell. B, 0, because the cell two lower is read before it is filled. C, 3, because each item is still used at most once. D, 9, because the one item is taken three times.

[think]

The answer is D: 9, the item taken three times. An upward sweep reads the cell two lower after it has already been updated with this item. So capacity 2 becomes 3, capacity 4 becomes 6, and capacity 6 becomes 9. That is the unbounded answer. Every cell from capacity 4 upwards reads an updated cell, not only capacity 4. A downward sweep reads the previous row's values and gives the correct 3.

## Question 8

You need the best value with weight exactly W, not at most W. What changes?

A, the base cases: the zero cell is 0 and every other cell starts at minus infinity. B, the combine operator, so a take must land on the capacity exactly. C, nothing; the at-most and exactly answers always coincide. D, the sweep direction, so no capacity is left part-empty.

[think]

The answer is A: the base cases. With every cell starting at zero, an unfilled capacity is worth zero, which is the at-most meaning. With minus infinity everywhere except the zero cell, the transition can only produce a finite value at a capacity by adding an item to a capacity that was itself exactly fillable, so only exactly fillable capacities become finite. The sweep and the combine are unchanged, and the two answers differ whenever W cannot be filled exactly.

## Question 9

After processing 3, 4, 1 with the fast increasing-subsequence method, the tails array is 1, 4. Which statement is true?

A, the longest increasing subsequence has length 1, because the new 1 replaced the 3. B, tails must be re-sorted after every replacement. C, 1, 4 is a longest increasing subsequence of the input, with length 2. D, the length is 2, but 1, 4 is not a subsequence of the input.

[think]

The answer is D: the length is 2, but 1, 4 is not a subsequence. The 1 replaced the 3 in the first slot. Each slot only guarantees that some increasing subsequence of that length ends in that value; the slots together need not form a subsequence, and here the 1 comes after the 4. The real answer is 3, 4, length 2, which is the length of tails. And tails stays sorted by construction.

## Question 10

For burst balloons, why does defining the state as "the best coins when balloon k is burst first in the range" fail?

A, the recursion never terminates, since k can be picked again later. B, the answer moves to a cell the fill never reaches. C, the two sides become adjacent, so they stop being independent. D, the array can no longer be padded with ones at both ends.

[think]

The answer is C: the two sides become adjacent and stop being independent. After bursting k first, the balloons on its left and right become neighbours and interact. An interval table needs the two sides of a split to be solvable separately. Bursting k last keeps the two boundaries as k's neighbours throughout, so the sides never interact. Padding is needed in both formulations and is not the issue.

## Question 11

House robber on a tree returns two numbers per node, rob and skip. Why does a node's rob value add each child's skip value, rather than the better of the child's rob and skip?

A, because skip is always at least as large as rob. B, because a robbed node's children cannot be robbed at all. C, it should be the better of the two; the pair is only a memory saving. D, because rob is undefined for leaves, so skip is safer.

[think]

The answer is B: a robbed node's children cannot be robbed. The constraint is on directly connected nodes. If the node is robbed, its children must be skipped, so only their skip value is legal, and a child's skip value already includes the best choice for the grandchildren. Skip is not always larger: a leaf's rob value is its cash, and its skip value is zero. The node's own skip value is where the better of the two is taken.

## Question 12

Word break has no minimum and no count in its statement. What makes it a dynamic-programming problem anyway?

A, nothing; a trie over the dictionary solves it without one. B, every split point must be tried, which is what dynamic programming means. C, the dictionary is a set, so repeated lookups are cached. D, a prefix's yes or no depends on shorter prefixes, which recur.

[think]

The answer is D: a prefix's answer depends on shorter prefixes, which recur. The yes or no for a prefix depends only on the answers for shorter prefixes, and a naive search revisits those prefixes many times. A boolean prefix state with a transition to smaller prefixes is exactly optimal substructure plus overlap. Trying every split is brute force; the reuse is what makes it dynamic programming. A trie speeds up the word lookups but does not remove the exponential search without memoisation.

## Recap

Three ideas kept coming back. The state must carry everything the next decision needs: sharpen it when you are stuck, end it at the last element, or think about what happens last. The base cases and the order are part of the algorithm, not decoration: a zero border, an upward sweep or the wrong nesting gives a confident wrong number. And the cost is the number of states, which is why pseudo-polynomial tables and large subsets are infeasible, and why memoising a state is what turns an exponential search polynomial.
