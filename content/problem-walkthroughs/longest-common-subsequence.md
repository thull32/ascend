---
problem: longest-common-subsequence
args: ["agca", "gac"]
frames: 77
source: af626c01aec8daf4
---
@0-2
The strings a g c a and g a c. What is the longest sequence of letters that appears in both, in order, though not necessarily side by side? Look at the last letters of two prefixes. If they match, matching them never hurts: the answer is one plus the answer for both prefixes shortened by one. If they differ, one of them is not in the answer, so drop either one and keep the better result. Each case shrinks to a smaller pair of prefixes, so the answer is a grid, one cell per pair. A cell reads its neighbour above, to the left, and diagonally up and left. We keep only one row of that grid: four cells, for the empty prefix and the three letters of g a c, all zero.

@3-4
The first letter of the long string is a. Diag holds the upper-left value, and starts at zero for each new row.

@5-9
Before we overwrite a cell, we save its old value in up: that is the cell above. Column one is g. A does not match g, so the cell takes the larger of up and the cell to its left. Both are zero.

@10-13
Column two is a, and a matches a. So the cell is diag plus one, which is one. The common subsequence so far is a. Then diag takes the old up, ready for the next column.

@14-20
Column three is c. No match, so the cell copies the larger of up, zero, and left, one. The row reads zero, zero, one, one.

@21-26
Second letter: g. Column one is g, a match. Diag is zero, so the cell becomes one. On its own, the g matches g.

@27-37
Columns two and three don't match g, so they copy the larger neighbour, which is one. The row reads zero, one, one, one. Notice the old values saved in up and diag as we go: without saving, we would read this row's new value where we wanted the row above.

@38-49
Third letter: c. Columns one and two, g and a, don't match, so they stay at one.

@50-55
Column three is c, a match. Diag holds one, the answer for a g against g a. So this cell is one plus one, two. The subsequence is g c.

@56-67
Last letter: a. Column one stays one. Column two is a, a match, and diag is one, the answer for a g c against g. So this cell is two as well. That subsequence is g a.

@68-73
Column three, c, doesn't match a. It takes the larger of up, two, and left, two. Two.

@74-76
We return the last cell: two. Both g a and g c are common subsequences of length two.

The grid has one cell per pair of prefixes, so time is the product of the lengths, and one row means space is the shorter length. The classic mistakes: on a match, adding one to the larger of up and left instead of to the diagonal, which can count one letter twice; confusing subsequence with substring, which resets to zero on a mismatch; and in the one-row version, forgetting to save the diagonal before overwriting it.
