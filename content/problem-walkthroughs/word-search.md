---
problem: word-search
args: [[["a", "b"], ["c", "d"]], "abdc"]
frames: 55
source: 320e0e86238a59dd
---
@0
A two by two board, a, b on top and c, d below, and the word a, b, d, c. It is there: a, right to b, down to d, left to c, a little clockwise loop. The tool is depth first search with undo. At a cell that matches the next letter, mark it as used, try its four neighbours for the letter after, then unmark it. Marking stops the current path from reusing a cell; unmarking lets other paths through it later. The neat trick: overwrite the cell with a hash sign. A used cell then simply never matches any letter, so the board is its own visited set.

@1-6
We try every cell as a start, beginning top left. Its letter, a, matches the first letter of the word, and this is not the last letter yet.

@7-12
Save the a and overwrite it with a hash. Above is off the board, so try below: c. The word needs b next, so that fails at once.

@13-16
To the left is off the board, so try the right: b. That is the second letter.

@17-22
At b, save it and mark it. Above is off the board, so try below: d, the third letter.

@23-30
At d, save it and mark it. First try above: that is b's cell, which now holds a hash, so it cannot match c. This is the marking at work: without it, the path could step straight back onto b.

@31-37
Below and to the right are off the board, so try the left: c. It matches the fourth letter, and it is the last one, so this call returns true without even marking.

@38-51
Now the success travels back up. Each level gets true, restores its own letter, d, then b, then a, and passes true upward. The board ends exactly as it started, which matters if the caller reuses it.

@52-54
The first starting cell succeeded, so any stops trying the others, and we return true.

Every cell can start a search, and after the first step each path has at most three ways to go, since it never steps back where it came from. So the worst case is the number of cells times three to the power of the word length, with recursion as deep as the word. The mistakes are forgetting to restore a cell, so a failed path poisons later ones; comparing a letter after marking the cell, which never matches; and checking bounds after indexing, which in Python quietly wraps around to the other side of the board. Two cheap prunes help on hostile input: reject words needing more of a letter than the board has, and search from the rarer end of the word.
