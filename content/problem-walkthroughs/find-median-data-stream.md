---
problem: find-median-data-stream
args: [["add_num", 1], ["add_num", 2], ["find_median"], ["add_num", 3], ["find_median"]]
frames: 23
source: 1371ad9846e9164b
---
@0-2
Numbers arrive one at a time, 1, then 2, then 3, and we must report the median along the way. Sorting on every query is far too slow. The insight: the median only cares about the boundary between the lower half and the upper half. So keep the lower half in a max-heap, which hands you its largest value, and the upper half in a min-heap, which hands you its smallest. The median is read off the two tops. Python only has min-heaps, so the low heap stores negated numbers: when you see minus 1 in it, read 1. Two rules hold after every insert: everything in low is at most everything in high, and low has the same size as high or one more.

@3-7
Add 1. The insert always does the same three moves. Push the number into low. Then pop low's largest and push it into high: that guarantees the ordering, because whatever crosses is the biggest of the low side. Then, if high has become bigger than low, move high's smallest back. Here, 1 goes into low, crosses to high, and comes back, since high had one and low had none. Low holds 1; high is empty.

@8-11
Add 2. Push it into low, which now holds 2 and 1, shown as minus 2 and minus 1. Low's largest, 2, crosses to high. Now low holds 1 and high holds 2. The sizes are equal, so no move back.

@12-14
Find the median. The halves are the same size, so the median is the average of the two tops: low's 1 and high's 2. That is 1.5.

@15-17
Add 3. It goes into low, which now holds 3 and 1. Low's largest is 3, which crosses to high. Notice how that handles a number that belongs in the upper half: it passes straight through low. High now holds 2 and 3, and low holds just 1. High is bigger, which breaks the size rule.

@18-19
So high's smallest, 2, moves back to low. Now low holds 2 and 1, and high holds 3.

@20-22
Find the median. Low has one more element than high, so the median is simply low's top: 2. As a float, 2.0.

Each insert is three heap operations, so logarithmic time, and the median is read in constant time. The push, pop, push sequence is worth memorising because it maintains both rules unconditionally. Hand-rolled versions that compare with one top and then forget to rebalance, or rebalance without keeping the order, are the usual bugs. So is negating on the way in and forgetting to negate on the way out.
