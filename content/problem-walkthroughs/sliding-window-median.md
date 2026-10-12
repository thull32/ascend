---
problem: sliding-window-median
args: [[1, 4, 2, 3], 3]
frames: 97
source: 77696e13c8ec8ea0
---
@0
A window of three slides over 1, 4, 2, 3. The windows are 1, 4, 2, with median 2, and 4, 2, 3, with median 3. The tool is the two heap median: a max heap called small for the lower half, stored negated because Python only has min heaps, and a min heap called large for the upper half. The median lives at their tops. The sliding part adds a problem: each step must remove the element that leaves the window, and a heap cannot delete from the middle. The fix is lazy deletion. Record the departing value in a delayed counter, leave it in the heap, and throw it away only when it surfaces at a top. Two live counts, kept apart from the heaps' real lengths, drive the balancing.

@1-10
Setup: two empty heaps, an empty delayed counter, live counts of zero and zero, and five helpers: prune, rebalance, add, remove and median.

@11-22
Position zero, value 1. small is empty, so 1 goes there, stored as minus 1, and small's live count becomes one. Rebalance checks the rule: small may hold the same number as large, or one more. One and zero is fine.

@23-34
Value 4. It is bigger than small's top, 1, so it belongs in the upper half: it goes into large. One and one, balanced.

@35-41
Value 2. It is bigger than small's top, so it also goes into large, which now holds 2 and 4. But now small has one live element and large has two, which breaks the rule.

@42-52
So rebalance moves large's top, 2, across into small. The counts become two and one. Then it prunes large, in case moving the top exposed a deleted element underneath. The new top is 4, which has no pending deletions, so the prune stops at once.

@53-59
The window is full, and three is odd, so the median is small's top: 2. That is right for 1, 4, 2.

@60-68
Position three, value 3. It is bigger than small's top, 2, so it joins large, which holds 3 and 4. Two and two, balanced.

@69-74
Now the 1 leaves the window. Here is the lazy part. We bump 1's delayed count to one. Since 1 is no bigger than small's top, it must live in small, so small's live count drops to one. But we only prune immediately if 1 is the top, and it is not, the top is 2. So the 1 stays buried in small, physically present, logically gone.

@75-88
The live counts are one and two, so rebalance moves large's top, 3, into small. small now physically holds 3, 1 and 2, but its live count is two: the stale 1 is not counted. That is why balancing must use the live counts, never the heaps' lengths. large's new top, 4, is clean.

@89-96
The median is small's top: 3, correct for 4, 2, 3. The buried 1 never reached a top, so it never mattered. The answer is 2, then 3.

Every element is pushed once, moved at most a few times, and popped once, so the total is n log n. Stale elements can pile up, so the heaps can grow toward n rather than k on unlucky input. The mistakes are balancing on heap lengths instead of live counts, and forgetting to prune after a rebalance move, which can leave a deleted element at a top and report a wrong median windows later.
