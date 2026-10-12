---
problem: remove-duplicates-sorted
args: [[0, 0, 1, 1, 1, 2]]
frames: 19
source: f157d3605fb2ed83
---
@0
The array is 0, 0, 1, 1, 1, 2, sorted. Remove the duplicates in place, with constant extra space, and report how many distinct values there are. Sorted means duplicates sit next to each other, so a value is a duplicate exactly when it equals the last value we kept. And since we only ever keep values we have already read, we can overwrite the array as we go: a write pointer marks where the next kept value goes, a read pointer scans ahead, and write can never pass read.

@1-2
The array is not empty. The first element is always kept, so write starts at 1, and read starts at 1 too.

@3-4
Read is at 1, which holds 0. The last kept value, just before the write position, is also 0. A duplicate: skip it.

@5-8
Read is at 2, which holds 1. That differs from the last kept 0, so it is copied to position 1, and write moves to 2. The front of the array now reads 0, 1.

@9-12
Positions 3 and 4 hold more ones. Each equals the last kept value, 1, so both are skipped.

@13-16
Position 5 holds 2, which differs from 1. It goes to position 2, and write moves to 3. The front reads 0, 1, 2. Everything after it is leftover and does not matter.

@17-18
We return 3, with the first three elements 0, 1, 2. One pass, linear time, constant extra space. Comparing with the last kept value, the one just before write, is the form that expresses the invariant, and it generalises to variants like keeping at most two copies. Deleting elements inside the loop instead shifts the tail every time, which is quadratic, and skips elements as the array shrinks under you.
