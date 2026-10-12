---
problem: subsets-ii
args: [[1, 2, 2]]
frames: 56
source: 1181177cfffaac98
---
@0
We want every distinct subset of 1, 2, 2. There are six: empty, 1, 1 2, 1 2 2, 2, and 2 2. The ordinary subsets recursion would produce 2 twice and 1 2 twice, once for each copy of 2. The insight: sort, so equal values sit next to each other. Then at any one level of the recursion, once you have explored taking the first copy of a value, taking a later copy instead can only repeat what you already found. Skip it. But a second copy taken at the next level down is a genuinely new subset, 2 2. The skip rule has to tell those two cases apart.

@1-5
Sorting leaves 1, 2, 2 as it is. Backtrack starts at position zero, and every call begins by recording the current path. The first record is the empty subset.

@6-10
Level zero takes position zero, the 1, and recurses from position 1. That call records 1.

@11-15
Level one, starting at position 1. The skip check asks two things: is this position past where this level started, and does it equal its left neighbour? Position 1 is where this level started, so no skip. We take the first 2 and record 1, 2.

@16-22
Level two starts at position 2. The value there is 2, equal to its neighbour, but the position is where this level started, so it is not skipped. This is the second copy taken at a new level, and it gives 1, 2, 2, which is a new subset. A skip rule that only checked whether the position was past zero would wrongly drop it.

@23-27
Backtracking: pop the last 2, and the level two loop is done. Pop the other 2, back at level one, where the path is 1 again.

@28-31
Level one moves on to position 2, the second 2. Now the position is past this level's start, and the value matches its neighbour. Taking this 2 here would rebuild 1, 2, which we already have, so we skip it.

@32-37
Back at level zero, the 1 is popped. Level zero now takes the first 2, at position 1, and records the subset 2.

@38-44
One level down, starting at position 2, the second copy is again first in its level, so it is allowed: we record 2, 2.

@45-53
Unwinding again. At level zero, position 2 is a 2 past this level's start, equal to its neighbour, so it is skipped: starting a subset with the second 2 would only repeat 2 and 2, 2.

@54-55
Six subsets, no duplicates, and no set was needed to filter them.

Time is up to n times 2 to the n when there are no duplicates, and less with them; the path uses linear space. The mistakes are writing the skip as "position past zero" instead of "position past this level's start", which loses 2, 2 and 1, 2, 2, and forgetting to sort, so equal values are not adjacent and the skip never fires. Counting the answer is a nice follow up: a value with m copies offers m plus 1 choices, so here it is two times three, six.
