---
problem: insert-interval
args: [[[1, 2], [3, 5], [6, 7], [8, 10], [12, 16]], [4, 8]]
frames: 24
source: b6bd6d6b24b073f5
---
@0-2
Five intervals, sorted and not overlapping: one to two, three to five, six to seven, eight to ten, and twelve to sixteen. We insert four to eight. The insight is that, because the input is sorted and disjoint, the intervals that touch the new one sit together in one contiguous run. So the list splits into three phases: everything entirely before, the run that overlaps, and everything entirely after. Only the middle needs work. We unpack the new interval into a start of four and an end of eight, and start an empty result.

@3-6
Phase one copies every interval that ends before the new one starts. One to two ends at two, which is less than four, so it goes straight into the result. The next interval, three to five, ends at five. Five is not less than four, so phase one stops.

@7-10
Phase two absorbs every interval that starts at or before the new end. Three to five starts at three, and three is at most eight, so it overlaps. We widen: the start becomes the smaller of four and three, which is three. The end stays the larger of eight and five, which is eight.

@11-14
Six to seven starts at six, inside our interval. The start stays three, the end stays eight. It is swallowed whole.

@15-18
Eight to ten starts at eight. This is the boundary case: eight is equal to our end, and the condition says less than or equal, so it counts as touching. The end widens to ten.

@19-20
Twelve to sixteen starts at twelve, which is past ten, so phase two stops. Now, after the loop, we append the merged interval: three to ten.

@21-23
Phase three copies everything that is left, which is twelve to sixteen, and we return one to two, three to ten, and twelve to sixteen.

Each interval is looked at once, so time is linear, against n log n for appending and re-sorting. Two classic mistakes. Writing strictly less than at the boundary, so eight to ten would not merge with an interval ending at eight. And appending the merged interval inside the loop, or forgetting it when phase two runs off the end of the list; appending once, after the loop, handles both.
