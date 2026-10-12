---
problem: subsets
args: [[1, 2, 3]]
frames: 58
source: 5aaed85b1c867077
---
@0
We want every subset of 1, 2, 3, and there are eight, because each element is a yes or no decision: two times two times two. Backtracking makes those decisions in order and undoes them on the way back. One rule keeps each subset unique: after choosing an element, only elements to its right may be added. So 1, 2 can be built, but 2, 1 never is. And every call records its path before extending it, so every prefix is recorded once, starting with the empty one.

@1-5
An empty result and an empty path. The first call starts at position zero and records the empty subset.

@6-8
Take 1, recurse from position 1, and that call records 1.

@9-12
Take 2, recurse from position 2, and record 1, 2.

@13-18
Take 3, recurse from position 3, and record 1, 2, 3. That call starts past the end, so its loop has nothing to try, and it returns.

@19-21
Now the undo. Pop 3, and the path is 1, 2 again. The loop at that level has no more positions, so it returns too.

@22-28
Pop 2, back to the path 1. The loop moves on to position 2: take 3 and record 1, 3. Notice that this branch skipped 2 entirely. Each branch is a different set of yes and no decisions.

@29-33
Pop 3, the level for 1 is finished, pop 1. We are back at the top with an empty path, and every subset containing 1 is done: four of them.

@34-46
The top level now takes 2, starting the subsets without 1. Record 2. Then take 3 and record 2, 3. Pop back up. The start index means 1 is never reconsidered here, which is what prevents 2, 1.

@47-55
Finally the top level takes 3 alone and records it. Nothing lies to its right, so it returns, and 3 is popped.

@56-57
Eight subsets: empty, 1, 1 2, 1 2 3, 1 3, 2, 2 3, and 3.

There are 2 to the n subsets, each copied in up to n steps, so the time is n times 2 to the n, and that is the size of the output itself, so you cannot do better. The extra space is the path and the recursion, linear in n. The mistakes are appending the path itself rather than a copy, so every entry aliases the same list and ends up empty; recursing from the same position instead of the next one, which reuses elements; and recording only at the leaves, which loses the smaller subsets. The iterative alternative is a bitmask: count from zero to 2 to the n minus 1, and include element i when bit i is set.
