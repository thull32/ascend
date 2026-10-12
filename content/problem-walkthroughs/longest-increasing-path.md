---
problem: longest-increasing-path
args: [[[1, 2], [4, 3]]]
frames: 76
source: eb8fc859e2b49c0d
---
@0-3
A two by two grid. The top row is one, two; the bottom row is four, three. What is the longest path that climbs strictly upward, moving up, down, left or right? The insight: the longest climb from a cell depends only on the cell, not on how you got there. And because every step goes to a strictly larger value, the dependencies can never loop back. So it is a dynamic program, with one catch: a cell depends on neighbours in any direction, so row by row is the wrong order. The fix is to process cells from the largest value down. Then every larger neighbour is already final when you need it. Best starts at one everywhere: a single cell is a path of length one.

@4-20
We list every cell as its value with its row and column, and sort them, largest first: four, three, two, one.

@21-31
Four, at the bottom left. We check its four neighbours. Below and to the left are off the grid. Above is one, and to the right is three, both smaller. No larger neighbour, so four is a peak, and its best stays one. The answer so far is one.

@32-44
Three, at the bottom right. Its only larger neighbour is four, to its left, whose best is one. So three's best is one plus one: two. From three you can climb to four. The answer is two.

@45-57
Two, at the top right. Below it is three, which is larger, with a best of two. So two's best is three: two, three, four. Its other in-grid neighbour, one, is smaller and does not count. The answer is three.

@58-63
Last, one, at the top left. Its first larger neighbour is four, below it, with a best of one. That would give one a best of two.

@64-73
But one also has a larger neighbour to its right: two, with a best of three. Three plus one is four, which beats two, so best becomes four. The cell took the better of its two routes: the path one, two, three, four spirals round the whole grid, instead of jumping straight to four. The answer is four.

@74-75
We return four.

Every cell is computed once and looks at four neighbours, so the sweep is linear in the cells, and the sort adds a log factor. Space is the best grid; there is no rolling row, because any cell may be needed until the end. The memoised depth first search is the other answer, but a path can be as long as the whole grid, which can blow the recursion limit. The classic mistakes: using greater than or equal, which lets equal neighbours form cycles; adding a visited set, which is unnecessary because strict increase already prevents revisits; and filling the grid row by row.
