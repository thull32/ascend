---
problem: permutations
args: [[1, 2, 3]]
frames: 211
source: 8585e1edb592ad07
---
@0
We list every ordering of 1, 2 and 3. Fill the positions left to right: three choices for the first, two of what remains for the second, and one for the last. That decision tree has exactly three factorial leaves, six, and each leaf is a different permutation. Backtracking walks it with a path, the choices so far, and a used flag for each element, so no element is chosen twice.

@1-10
The result and the path start empty, and nothing is used. At the top level, the first unused element is 1. Mark it used and put it on the path.

@11-19
One level down, 1 is used, so it is skipped. 2 is free: mark it and append it. The path is 1, 2.

@20-35
At the third level, 1 and 2 are both used, and 3 is free, so the path becomes 1, 2, 3. The path is as long as the input, so it is a complete permutation, and a copy goes into the result.

@36-45
Now we undo. 3 comes off the path and is marked free again. That reset is the line people forget: without it, 3 would look taken for the rest of the search. Back at the second level, 2 comes off too, and the loop moves on to 3.

@46-59
The path is 1, 3, and the only free element is 2, so we reach 1, 3, 2. Second permutation.

@60-72
Undo all the way back to the top level. The path is empty and every flag is false again, exactly as at the start. The branch that begins with 1 is finished.

@73-105
The top level now chooses 2. Below it, 1 is free, then 3: the permutation 2, 1, 3.

@106-139
Then 2, 3, and finally 1: the permutation 2, 3, 1. Undo back to an empty path.

@140-172
The top level chooses 3, and the same pattern gives 3, 1, 2.

@173-208
Then 3, 2, 1. Every branch has been explored, and every flag is reset.

@209-210
We return all six permutations, in order. Each one costs a copy of length n, so the time is n times n factorial, which is unavoidable, since that is the size of the output. The extra space is the path, the flags and the recursion, all linear. The two classic mistakes: forgetting to reset the used flag after the recursive call, and appending the path itself instead of a copy, so every stored result ends up as the same empty list.
