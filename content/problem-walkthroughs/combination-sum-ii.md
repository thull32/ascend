---
problem: combination-sum-ii
args: [[1, 2, 1, 2, 3], 4]
frames: 122
source: d8c2057eb61ff3b9
---
@0-4
Five candidates, 1, 2, 1, 2 and 3, each usable once, and we want every distinct combination that sums to 4. There are two 1s and two 2s, so the danger is producing the same combination twice: 1 and 3 using the first 1, and 1 and 3 using the second. The fix has two parts. Sort first, so equal values sit next to each other: 1, 1, 2, 2, 3. Then, at any one level of the recursion, only the first of a run of equal values may start a branch. The later copies may still be used deeper down, which is how 1, 1, 2 survives.

@5-11
The top level starts at position zero with 4 remaining. The first candidate is a 1. It is not bigger than 4, and it is the first at this level, so we take it. The path is 1, and we recurse from position 1 with 3 remaining. Starting from the next position, not the same one, is what makes each candidate usable once.

@12-18
At the second level, position 1 holds the other 1. Is it a duplicate to skip? No: the skip only applies when the position is after this level's start, and position 1 is the start. So the second 1 is taken, one level deeper. The path is 1, 1, with 2 remaining.

@19-29
Third level, from position 2. The 2 fits exactly. The path is 1, 1, 2, and the remaining amount hits zero, so we record a copy of it. Our first combination.

@30-40
Back at the third level, the 2 is popped off. Position 3 holds another 2, and it is not the first at this level, so it is skipped. Taking it would build 1, 1, 2 a second time. Position 4 holds a 3, bigger than the 2 remaining. Because the list is sorted, everything after it is bigger too, so we break out of the loop entirely.

@41-53
Back at the second level, path 1, with 3 remaining. Position 2 is a 2: take it, leaving 1. One level down, the next candidate is a 2, already too big, so break. Nothing found down that branch.

@54-69
Position 3, the second 2, is skipped at this level: same value as its neighbour. Position 4 is the 3, which leaves zero. Record 1, 3.

@70-78
The second level is done, and we pop back to the top with an empty path. Position 1 is the second 1. At this level it is not the start, and it equals the 1 before it, so it is skipped. This is the skip that matters most: every combination starting with a 1 has already been found through the first 1. Without it, we would find 1, 3 again.

@79-101
Position 2 is a 2, leaving 2. One level down, position 3 is the other 2. It is that level's start, so it is allowed: the path is 2, 2, and it sums to 4. Record it. Then the 3 is too big, so break.

@102-119
Back at the top, the second 2 is skipped, and the 3 leaves 1, with nothing after it to use. Done.

@120-121
Three combinations: 1, 1, 2; then 1, 3; then 2, 2. In the worst case this is exponential, because the answers themselves can be, but the sort-and-break and the duplicate skip prune most branches. The classic bug is skipping a duplicate whenever it is not the first position overall, rather than not the first at this level. That loses 1, 1, 2, because the second 1 is needed one level down.
