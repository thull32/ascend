---
problem: merge-intervals
args: [[[8, 10], [1, 4], [2, 3], [4, 6]]]
frames: 26
source: f04b3d148de3a944
---
@0
Four intervals, out of order: 8 to 10, 1 to 4, 2 to 3, and 4 to 6. The hard part of merging is finding which intervals overlap. Sort by start, and the problem collapses: every new interval can only overlap the last merged one, because that one's end is the furthest point reached so far. One pass does the rest.

@1-10
The list is not empty, so we sort by start. The key function hands back each start, 8, 1, 2 and 4, and the sorted order is 1 to 4, 2 to 3, 4 to 6, 8 to 10.

@11-13
The answer begins as a copy of the first interval, 1 to 4. The loop takes the next one, 2 to 3, and looks at the last merged interval, 1 to 4.

@14-15
2 is not past 4, so they overlap. Now the line that matters: the new end is the larger of the two ends, 4 and 3. That is 4. Without that maximum, a contained interval like this one would shrink the merge to 1 to 3 and lose the rest.

@16-19
Next is 4 to 6. It starts at 4, exactly where the merged interval ends. Less than or equal counts touching as overlapping, so we extend again, and the end becomes the larger of 4 and 6. The merged interval is now 1 to 6.

@20-23
Last is 8 to 10. 8 is past 6, so there is a gap, and 8 to 10 starts a new merged interval of its own.

@24-25
We return two intervals: 1 to 6, and 8 to 10. The sort costs n log n and dominates; the sweep is linear. Two mistakes to watch for: comparing each interval with the previous input instead of the last merged one, which breaks chains, and assigning the new end instead of taking the maximum, which breaks containment, the exact case we saw with 2 to 3.
