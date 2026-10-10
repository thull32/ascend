---
lesson: constraint-satisfaction
source: 3480ee60f850f72d
fit: partial
desk:
  - "The 4-queens search table, column by column"
  - "The node-count table for leaf checks, column checks and diagonal checks"
  - "The bitmask N-queens code, and why x and minus x isolates the lowest set bit"
  - "The MRV sudoku solver and its measured ordering table"
  - "The word search code, and forward checking and AC-3 in detail"
  - "Exercises: count N-queens solutions, and word search on a letter grid"
---
## Introduction

Place eight queens on a chessboard so none attacks another. Fill a sudoku grid. Find whether a word can be traced through adjacent cells of a letter grid. Schedule 40 talks into 6 rooms with no speaker in two places at once.

Each of these is a search over an exponential space of assignments, and most assignments break a rule. The whole art is to detect the violation as early as possible, before you spend time extending a partial assignment that was already doomed, and to try the most promising choices first.

Here is the scale of it. Backtracking on 8-queens with no pruning tries 64 to the 8 placements, nearly 3 times 10 to the 14. With one queen per row and the rules checked only at the end, it visits about 19 million nodes. Check the columns and diagonals at each placement, and it visits 2,057. Same problem, same template. The difference is entirely in what you refuse to explore.

So: the four levers. N-queens, where you learn the diagonal trick. Sudoku, where choosing which cell to fill wins a factor of ten thousand. And word search, where the honest complexity is exponential and a cheap pre-check saves you.

## The four levers

A constraint satisfaction problem has variables, like the queen in row 0, or the sudoku cell at row 3, column 4. Each variable has a domain: columns 0 to 7, or digits 1 to 9. And there are constraints between variables: no shared column, no repeated digit in a box. Backtracking assigns one variable at a time, and checks each constraint the moment it becomes checkable.

Four levers move the running time by orders of magnitude. One: check constraints incrementally. Reject a partial assignment the moment it breaks a rule, not at the leaf. Two: keep the constraint state so the check is constant time: a set or bitmask of used columns, rather than rescanning the board. Three: order the variables, most constrained first. Assign the variable with the fewest legal values left. It either fails fast, pruning a big subtree early, or it has few branches. Four: order the values, so that "find any solution" hits one sooner.

None of this changes the worst case. Sudoku on n squared by n squared boards is NP-complete, and a bad instance can defeat any heuristic. What pruning and ordering buy you is that typical instances, which is what interviews and production usually hand you, finish in milliseconds instead of never.

## N-queens

Put one queen per row; that already rules out two in a row. The variable is the column. The constraints are no shared column and no shared diagonal, and the diagonal check is where candidates go wrong.

Here is the trick. Along a down-right diagonal, the row minus the column stays constant. Along a down-left diagonal, the row plus the column stays constant. Before I say more: do queens at row 0, column 1 and row 1, column 2 attack each other?

[pause]

Yes. Row minus column is minus 1 for both, so they share a down-right diagonal. Two queens attack diagonally exactly when they share either the difference or the sum. So keep three sets, used columns, used differences and used sums, and every check is constant time.

On a 4 by 4 board, the search finds its first solution in 17 calls: queens at columns 1, 3, 0 and 2, row by row. Its mirror is the other solution. Every rejection happens the moment a conflicting queen is proposed, one row after the queen it conflicts with, never deeper.

Now count what each lever buys on 8-queens, enumerating all 92 solutions. Checking only at the leaf: about 19 million nodes. Add the column check at placement: about 110 thousand, which divides the tree by 175. Add both diagonal checks: 2,057, another factor of 53.

Then a representation change. For n up to 32, the three sets fit in three integers, one bit per column. Shift the diagonal masks by one bit per row, and they track the diagonals without computing the difference or the sum at all. The state is passed by value, so there is nothing to undo. That does not change the tree: still 2,057 nodes. It changes the cost per node. Enumerating all solutions of 10-queens took 17 milliseconds with Python sets and 5 with bitmasks, about 3.7 times faster. One trap: JavaScript's bitwise operators work on 32-bit signed integers, so the bitmask solver is only safe up to n of 30.

## Sudoku: the most constrained cell first

A sudoku solver that fills cells in reading order and tries digits 1 to 9 works, and on hard puzzles it takes seconds to minutes in Python. The fix is lever three. At each step, pick the empty cell with the fewest candidates. If some cell has zero candidates, the branch is dead and you know immediately. If a cell has exactly one, you place it with no branching at all. Search people call this minimum remaining values.

The numbers, on Peter Norvig's "hard" puzzle with 17 givens. Reading order: about 9.7 million nodes and 15 seconds. Minimum remaining values: 964 nodes and a hundredth of a second. That is a factor of ten thousand from choosing which cell to fill next.

Notice the trade. Finding the cell with the fewest candidates means scanning every empty cell at every node, more work per node than reading order spends. It is still a four-orders-of-magnitude win. More work per node for far fewer nodes is the shape of every good pruning decision.

Two more measured rows. Adding "naked singles", placing any cell left with one candidate after each move and abandoning the branch if any cell has none, cut it to 343 nodes. That is forward checking, and arc consistency is its general form, which industrial constraint and SAT solvers build on. That is why scheduling 40 talks into 6 rooms is a solver call, not a hand-written search. And proving the puzzle has only one solution took 6,393 nodes, about six and a half times more, because the search can no longer stop at the first leaf.

## Word search

Word search asks whether a word can be traced through horizontally or vertically adjacent cells, each used at most once. The grid is a graph you never build; the recursion walks it. The visited set is a trick: overwrite the cell with a marker, like a hash sign, as you step on it, and restore the letter when you backtrack. No letter equals the marker, so a used cell fails the ordinary letter check on revisit. Zero extra memory. It is choose and unchoose applied to the board itself.

But it has a sharp edge: two threads sharing one board both mark cells in place, and one thread's marks block the other's path. You get intermittent false negatives under load. Give each search its own visited structure.

Now the honest complexity. From each start cell, the first step has up to four neighbours, and every later step at most three, because the cell you came from is marked. So the bound is the number of cells times 3 to the length of the word. Picture a 6 by 6 board of nothing but A, and the word is eleven As followed by a B. What cheap check avoids the search?

[pause]

Count letters. The board has no B, so compare the letter counts of the board and the word, and reject it in linear time. Without that, the search explores around 2 million paths before concluding there is no B, and every extra A triples it. A second cheap trick: if the word's last letter is rarer on the board than its first, search for the reversed word. Fewer start cells, earlier failures, same answer.

For many words on one board, walk a trie of all the words at once. Now the pruning is "this path is not a prefix of any word", which is far stronger, and words sharing a prefix are found by the same walk. Delete found words from the trie so they are never found again.

And palindrome partitioning, every way to cut a string into palindromes, is the bridge to the next lesson. Precompute a palindrome table once so each check is constant time. If the question becomes "minimum number of cuts", the enumeration disappears and dynamic programming takes over.

## In the interview

A follow-up the lesson expects. Find one valid placement of a million queens.

[pause]

Search is the wrong tool. There are explicit constructive placements for every n of at least 4, based on n modulo 6, that produce a valid board in linear time. The question tests whether you recognise an output-sized closed form. The wrong answer is backtracking with bitmasks, which cannot represent a million-bit board efficiently and has no guarantee of finishing.

And another: your sudoku solver is fast on this puzzle. What input defeats it? The general problem is NP-complete, so on larger boards there are instances that force exponential search whatever the ordering. The wrong answer is "minimum remaining values makes it polynomial".

## Recap

Four things to remember. Pull four levers and know which one you are pulling: check incrementally, keep constant-time state, order the variables most constrained first, and order the values. In N-queens, diagonals share row minus column or row plus column, and checking at placement shrinks 8-queens from about 19 million nodes to 2,057; bitmasks then make each node cheaper without changing the tree. In sudoku, choosing the cell with the fewest candidates wins a factor of ten thousand. And the worst case stays exponential, so add cheap global pre-checks like letter counts, and notice when a question really wants a count, a minimum, or a closed form.

At your desk: the 4-queens search table, the node-count table, the bitmask solver and the lowest-set-bit identity, the sudoku solver and its ordering table, the word search code and AC-3, and the two exercises, counting N-queens and word search.
