---
lesson: backtracking-pattern
source: e8c58ac05a41e98c
fit: partial
desk:
  - "The template in Python and JavaScript: Subsets II, distinct permutations and the Sudoku solver"
  - "The families table: what fills the four slots for subsets, combinations, permutations, partitioning and constraint search"
  - "The traces: Subsets II on 1, 2, 2; Combination Sum on 2, 3, 6, 7; 4-queens to the first solution; Word Search"
  - "The bound-to-shape table, the near-misses table and the variations table"
  - "The measured costs: calls per second, itertools, generator memory, recursion limits"
  - "Exercises: combination sum with reuse, and distinct permutations of a multiset"
---
## Introduction

"Return all subsets." "Return every combination that sums to the target." "Place eight queens so that none attack." "Fill in the sudoku." Each of these asks you to search a space of candidates that is exponential in size, and there is no shortcut. Either the output itself is exponential, or the problem is hard in general and the interviewer is only asking for n equals 9.

What is being tested is whether you can organise the search: visit each candidate once, abandon hopeless branches as early as possible, and never leak state from one branch into the next. That organisation is backtracking. You build a candidate one decision at a time, recursing after each decision. When a partial candidate cannot lead to a valid answer, you return at once; that is the prune. And when you return from a decision, you undo it, so the next decision starts from clean state.

Four things, then. How to read the pattern and its size off the statement. The template and its four slots. The two rules that keep it correct: how duplicates are skipped, and when a prune is allowed. And the follow-ups that turn it into a different pattern.

## The signal and the budget

Reach for backtracking when the statement says "all", "every", "generate" or "list all possible": subsets, permutations, combinations, partitions. The output size forces exponential time, so the real questions are pruning, constants and duplicates. Or when it says "find any valid", "is there a way", or "solve", with a small n and constraints that interact: N-Queens, Sudoku, Word Search. Or "split into pieces that each satisfy something", like Palindrome Partitioning, where the decision is where to cut next.

The bound is the interviewer's budget, and you can turn it into a shape. n up to about 10 with "all orderings" means permutations, n factorial leaves. The full permutation tree for n equals 10 is just under 10 million calls, which took 1.1 seconds in CPython and 86 milliseconds in Node. n up to 15 or 20 with "all subsets" means 2 to the n: all subsets of 20 elements were built in about a third of a second and held 151 megabytes. At n around 30 to 40, 2 to the n is 10 to the 9 or more, and that is meet in the middle, not backtracking. Past a thousand, it is DP, greedy or graph search.

Here is the number to carry. In Python, the practical ceiling for an interview answer is a tree of around 10 million nodes. Past that you need pruning, a different algorithm, or a compiled language.

What rules it out? "Count", "minimum", "maximum" or "is it possible", where the answer for the rest of the input depends only on a small summary, such as the index and the amount remaining. Then the tree has repeated subtrees, and that is DP. The boundary is worth one sentence out loud: "the output requires every solution, so memoisation cannot shrink it, and I will backtrack with pruning". Or: "we only need the count, and the state is index and remaining, so I will memoise."

Two near misses live on grids. "Count the islands" looks like backtracking, but it is flood fill: a cell is claimed once, forever, and never unmarked. "Does the word occur in the grid" looks like flood fill, but it is backtracking, because a cell may be reused by a different path, so its mark must be undone.

## The template

One recursive function, with the partial candidate as shared mutable state, and four slots to fill. The decision made at each depth. The candidates that are legal from here. The test for complete. And the prune. The collect-all form records a copy when a candidate is complete. The find-first form returns true up the stack and keeps its state.

The families differ only in the slots. Subsets loop from a start index to the end, recurse with the next index, and record every node, because every node is a subset. Combination Sum with reuse recurses with the same index instead of the next one, and that single change is the whole difference between "each number once" and "unlimited times". Permutations loop over every index not yet used, tracked in a used array. Partitioning chooses where the next piece ends. Constraint search assigns a legal value to the next variable.

The heart of every one is three paired lines: choose, explore, unchoose. Append to the path, recurse, pop. The invariant: on entry to the function, the shared state reflects exactly the choices on the current path from the root. Every choose has a matching unchoose after the recursive call.

The find-first form breaks that pairing on purpose. In the Sudoku solver, when the recursive call reports success, you return true before the undo lines, because the filled board is the answer. Undo on the way out of a success, and the solver reports success with dots still on the board.

And one bug costs more interviews than any other: recording the shared path itself instead of a copy. Every recorded answer is a reference to one list, which ends up empty once the recursion unwinds. Copy at the moment you record.

## Duplicates, and why the skip is safe

Why does Subsets never produce 3, 2 after it has produced 2, 3? Each call starts its loop at the start index and recurses with the next index, so the path to any node is a strictly increasing sequence of positions. A set of distinct positions has exactly one increasing order, so it has exactly one node. Combination Sum passes the same index, so its sequences are non-decreasing instead: one node per multiset.

Now let the input contain duplicates. Subsets II on 1, 2, 2. Sort first, so equal values sit next to each other. Then one rule: at a single level of the tree, skip a value equal to the one just before it. In words, skip when i is greater than start and the value equals its left neighbour.

Why does that lose nothing? Two equal siblings at the same level root identical subtrees, and the first copy's subtree already contains everything the second would produce, because the first may still pick up the second copy further down.

So why "i greater than start", and not "i greater than 0"? Before I tell you, think about what happens to the subset 2, 2.

[pause]

Deeper in the tree, after taking the first 2, the second 2 is the first candidate at its own level, so i equals start, and it must be kept. The rule "i greater than 0" skips it there as well, and returns only four subsets: empty, 1, 1 and 2, and 2. You lose 1, 2, 2, and you lose 2, 2. The correct rule makes six calls, finds six subsets, and cuts two branches, each of which would have rebuilt a duplicate subtree.

The tempting alternative is to generate everything into a set and let the set remove the duplicates. It is correct, and it pays for the whole tree. On ten 1s and ten 2s, the set version makes just over a million calls to find 121 distinct subsets. The skip rule makes 121 calls. That is the difference between understanding where duplicates come from and cleaning up after them.

Permutations with duplicates use a sibling of the same rule: skip a value equal to its left neighbour when that neighbour is not currently used. That forces equal copies to be placed left to right. The mirror rule, skip when the neighbour is used, also gives correct output, but it prunes later: on four 1s and four 2s, the first makes 251 calls and the second 4,695.

## A prune must be monotone

Cutting a branch is sound only if no extension of a doomed partial candidate can become valid. "The sum already exceeds the target" is monotone when every number is positive. With a negative candidate, it is not. With a zero candidate and reuse allowed, the recursion never ends at all.

Combination Sum on 2, 3, 6 and 7, target 7. Sort the candidates, and when one is bigger than what remains, break out of the loop, because everything after it is bigger too. That break needs sorted, positive candidates. The search makes ten calls and finds two answers: 2, 2, 3, and 7 alone. Without the prune, recursing and returning on a negative remainder, the same input makes 28 calls.

On a bigger input, candidates 2 to 40 and target 40, no prune made about 916 thousand calls. "Continue when the candidate is too big" made about 37 thousand. "Break" made the same 37 thousand calls and ran four times faster than continue, because it also skips the loop iterations over every larger candidate.

One JavaScript trap belongs here. The default sort compares values as strings, so 2, 9, 10 sorts as 10, 2, 9. The duplicate skip still works, because equal values are still adjacent. But the break stops at the 10 and never tries the 2 or the 9: target 9 returns nothing instead of the single combination, 9. Always pass a numeric comparator.

## Constraint search: queens and words

N-Queens places one queen per row, so the decision at row r is a column. The prune is the attack check, made constant time by three sets: the used columns, the used diagonals, along which row minus column is constant, and the used anti-diagonals, along which row plus column is constant. For four queens, the search reaches the first solution, columns 1, 3, 0, 2, in nine calls, rejecting 18 of the 26 cells it tests, each in constant time. For eight queens, 2,057 calls find all 92 solutions.

Word Search is the clearest lesson in restoring state. The state is the set of cells on the current path, kept on the board itself: overwrite a cell with a marker when you step onto it, and restore it when you leave. On the lesson's board, the word A, B, C, B needs a B next to the C, and the only such B is already on the path. The marker makes that visible in constant time.

Now delete the restoring line. On a small board where the word A, A, B is present, the search returns false: the first failed start leaves three A cells marked, and the valid path through them is never found. Whether it fails can even depend on which start cell is tried first. Every mark needs an unmark, on every return path.

Complexity is nodes in the tree times work per node. Subsets: 2 to the n nodes, each copying up to n elements. Permutations: about e times n factorial nodes, so order n times n factorial. Word Search: every start cell, then at most four choices and three after that, so three to the power of the word length per start. Space is the recursion depth plus the output.

## In the interview

Here is the follow-up that tests the boundary. "Only return the number of combinations, and the target is 10 thousand."

[pause]

The output no longer forces enumeration, and the state, index and remaining, recurs. So it is the unbounded knapsack count, candidates times target, with the coin loop outside. The wrong answer is to keep backtracking and memoise the list of combinations for each state, which stores the exponential output anyway.

Second: "n is now 40, and you need every subset sum within a range." 2 to the 40 is about 10 to the 12. Split the input into halves, enumerate the 2 to the 20 sums of each half, sort one side, and binary search or two-pointer the other: meet in the middle. "Add more pruning" cannot shrink an output-sized search.

Third: "use all 16 cores." The only shared mutable state is the path and the marks. Give each worker its own copy, split the tree at the top, one task per first choice, and merge the results at the end. No locks on the hot path. One shared path behind a lock serialises the whole search. And if they ask for the N-Queens count only: same search, return 1 at each leaf and sum. Memoisation does not help, because the three masks almost never repeat.

Last: "the output does not fit in memory." Turn the collector into a generator. Peak memory drops from the size of the output to the depth of the tree: for all subsets of 20, from 151 megabytes to about 10 kilobytes, at one and a half times the running time.

## Recap

Five things to remember. Size the tree from the bound before writing code: about 10 million nodes is the Python budget. Choose, explore, unchoose, copy when you record, and in the find-first form keep the state on success. Sort, then skip equal siblings with i greater than start, so duplicate subtrees are never entered. A prune must be monotone, and break needs sorted, positive candidates. And draw the line out loud: every solution means backtracking, while a count over a recurring state means DP.

At your desk: the template in both languages and the families table, the four traces, the measured costs, and the two exercises on combination sum and distinct permutations.
