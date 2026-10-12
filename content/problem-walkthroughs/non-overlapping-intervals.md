---
problem: non-overlapping-intervals
args: [[[1, 100], [11, 22], [1, 11], [2, 12]]]
frames: 24
source: 40669f743a60b6b3
---
@0
Four intervals: 1 to 100, 11 to 22, 1 to 11, and 2 to 12. What is the fewest you can remove so the rest do not overlap? Turn it around: removing the fewest means keeping the most, and that is the classic interval scheduling problem. Its greedy is to always keep the interval that ends earliest. Ending early leaves the most room for everything after it, so swapping any other first choice for the earliest-ending one can never hurt.

@1-10
So we sort by end, not by start. The key function hands back each end: 100, 22, 11, 12. Sorted, the intervals are 1 to 11, 2 to 12, 11 to 22, and 1 to 100.

@11-12
Nothing is removed yet. We keep the first interval, 1 to 11, and the frontier, the end of the last interval we kept, is 11.

@13-15
2 to 12 starts at 2, before the frontier at 11, so it overlaps what we kept. Remove it. Notice the frontier stays at 11. The interval we dropped ends later, so keeping the earlier end is always at least as good.

@16-18
11 to 22 starts at 11, exactly at the frontier. Touching is not overlapping, so we keep it, and the frontier moves to 22.

@19-21
1 to 100 starts at 1, long before 22. Remove it.

@22-23
We return 2: remove 2 to 12 and 1 to 100, and keep 1 to 11 and 11 to 22. The sort is n log n, and the scan is linear. Here is why sorting by start fails: it would look at 1 to 100 first and keep it, a huge interval that blocks everything else. The other classic mistake is less than or equal in the overlap test, which treats touching intervals like 1 to 11 and 11 to 22 as a conflict.
