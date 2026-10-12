---
lesson: constraint-satisfaction
source: 98c303f1ae70d5d5
---
## 1

In N-queens, a queen at row 2, column 5 and a queen at row 4, column 3 attack each other. Why?

A, they share the same column. B, they do not attack each other at all. C, they share row minus column, a down-right diagonal. D, they share row plus column, a down-left diagonal.

[think]

The answer is D: they share row plus column, a down-left diagonal.

2 plus 5 is 7, and 4 plus 3 is 7: the same anti-diagonal. Row minus column gives minus 3 and 1, so they are on different down-right diagonals, and the columns, 5 and 3, differ.

## 2

A sudoku solver that fills cells in reading order takes minutes on a hard puzzle. Which change is most likely to make it fast?

A, always filling the empty cell with the fewest candidates first. B, replacing the used-digit sets with a bitmask per row, column and box. C, converting the recursion to a loop with an explicit stack. D, trying the digits from 9 down to 1, instead of 1 up to 9.

[think]

The answer is A: always fill the empty cell with the fewest candidates first.

That ordering, minimum remaining values, finds dead ends before branching and takes forced moves with no branching at all, cutting the measured puzzle from millions of nodes to under a thousand. Bitmasks and an explicit stack only change the cost per node, and digit order rarely matters much.

## 3

In the word search depth-first search, the code overwrites the current board cell with a hash character while exploring from it. Why does that work as a visited set?

A, it is faster to compare than a visited-set lookup. B, an explicit test for the hash character rejects used cells. C, it removes the cell from the implicit graph permanently. D, no letter of the word is a hash character, so revisits fail the check.

[think]

The answer is D: no letter of the word is a hash, so revisits fail the check.

Marking makes the cell fail the same comparison that rejects wrong letters, so revisits are pruned by the existing check, with no separate test and no extra memory. The removal is not permanent: restoring the letter on the way out keeps other paths correct.

## 4

Word search on a 6 by 6 board filled with A, for the word made of eleven As followed by a B, is slow. Which pre-check avoids the search entirely?

A, check that the word fits in the 36 board cells. B, cap the recursion depth at 6, the width of the board. C, compare the letter counts of the board and the word. D, start the search from the centre cell of the board.

[think]

The answer is C: compare the letter counts of the board and the word.

The board has no B, so a frequency count rejects the instance in linear time. The length check passes, since 12 letters fit in 36 cells, and neither a start cell nor a depth cap removes the exponential number of A-paths the search explores before finding there is never a B to finish on.

## 5

The bitmask N-queens solver passes the first diagonal mask, with the new queen's bit added, shifted left by one to the next row. What does that mask represent when the next row reads it?

A, columns already holding a queen in any row above. B, columns hit in the next row along down-left diagonals. C, columns hit in the next row along down-right diagonals. D, attacks from both diagonal directions, merged.

[think]

The answer is C: columns hit in the next row along down-right diagonals.

A queen in column c attacks column c plus 1 one row down, along the down-right diagonal, and shifting the accumulated mask left by one moves every such attack to the next row. A separate mask tracks columns, and a third, shifted right, tracks the down-left direction, so the two diagonals stay apart.

## 6

Switching an 8-queens solver from three Python sets to three bitmask integers made it about 3.7 times faster on one machine. What did the change do to the search tree?

A, it halved the tree, by exploiting the mirror symmetry of the board. B, it pruned the tree further, since masks encode both diagonals at once. C, it removed the leaf checks, so only interior nodes are visited. D, nothing: the same 2,057 nodes, each processed with cheaper operations.

[think]

The answer is D: nothing; the same 2,057 nodes, each processed with cheaper operations.

Bitmasks are a change of representation. The same constraints are checked at the same moments, so the tree is identical, but each check is a few integer operations instead of hashed set lookups and method calls. Pruning, symmetry and leaf checks are separate levers that the representation does not touch.
