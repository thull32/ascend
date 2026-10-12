---
problem: edit-distance
args: ["flaw", "lawn"]
frames: 101
source: f11a88650a7b315c
---
@0-2
Turn flaw into lawn with the fewest inserts, deletes and replaces. Look at the last letters of two prefixes. If they match, they cost nothing, and the answer is the answer for both prefixes one letter shorter. If not, the last step was a delete, an insert, or a replace, each landing on a smaller pair of prefixes, and we take the cheapest plus one. The full table has a row for each prefix of flaw and a column for each prefix of lawn, but each row only reads the row above, so we keep one row. The first row says turning nothing into the first j letters of lawn costs j inserts: zero, 1, 2, 3, 4.

@3-26
Row for f. The row's first cell becomes 1: turning f into nothing is one delete. Diag holds the upper-left value before it gets overwritten; that is the one subtle variable. Now f against each letter of lawn: no letter matches, and every cell is one plus the smallest of up, left and diagonal. The row comes out 1, 1, 2, 3, 4. For example, f into l is one replace.

@27-33
Row for f, l. The first cell is 2. Against l, the letters match, so the cell copies the diagonal: the cost of f into nothing, which is 1. That 1 means: delete the f, and the l comes for free.

@34-49
The rest of this row is mismatches: one plus the smallest neighbour. The row reads 2, 1, 2, 3, 4.

@50-62
Row for f, l, a. Against l, a mismatch gives 2. Against a, a match: copy the diagonal, the 1 from the cell for f, l into l. So f, l, a into l, a costs 1, still just the deleted f.

@63-73
Against w and n, mismatches give 2 and 3. The row reads 3, 2, 1, 2, 3. Notice the diagonal of ones forming: once the f is paid for, matching letters ride along for free.

@74-91
The last row, the whole of flaw. Against l and a, mismatches give 3 and 2. Against w, a match: copy the diagonal, 1. Turning flaw into law costs one operation, deleting the f.

@92-98
The final cell: flaw against lawn. W and n differ. The neighbours are: up, 3; left, 1; and diagonal, 2. The cheapest is the left one, the 1 for flaw into law, and moving left in the table means inserting the n. So the cell is 2.

@99-100
We return 2: delete the f, insert the n. Time is the product of the two lengths, and space is one row, kept as short as the shorter string, which is why the code swaps them first when the second is longer. Distance is symmetric, so that swap is safe. The classic bugs: starting the first row and column at zero, copied from the longest common subsequence template, which makes an empty string free to turn into anything; and charging one even when the letters match.
