---
problem: find-pivot-index
args: [[1, 7, 3, 6, 5, 6]]
frames: 15
source: 3a38b19c06b22425
---
@0-2
The array is 1, 7, 3, 6, 5, 6. We want the first position where everything to its left sums to the same as everything to its right. Summing both sides at every position is quadratic. The left sum is easy to carry as you go. The right sum looks like it needs a second structure, but it does not: the right side is the total, minus the left side, minus the element itself. So one number computed up front, the total, gives every right sum for free. The total is 28, and the running left sum starts at zero.

@3-4
Position zero, value 1. Left is zero. Right is 28 minus zero minus 1, which is 27. Not equal. Only now, after the check, does the 1 join the left sum. Adding it before the check would put the pivot on its own left side and shift every answer by one.

@5-7
Position 1, value 7. Left is 1; right is 28 minus 1 minus 7, which is 20. Not equal. Left becomes 8.

@8-10
Position 2, value 3. Left is 8; right is 28 minus 8 minus 3, which is 17. Not equal. Left becomes 11.

@11-14
Position 3, value 6. Left is 11; right is 28 minus 11 minus 6, which is 11. Equal. We return 3: 1 plus 7 plus 3 on the left, 5 plus 6 on the right, both 11.

Two passes, one for the total and one for the walk, so linear time, and constant space. This is prefix sums with the whole array of prefixes collapsed into one running value, because we only ever need the current one.

The mistakes: adding the current element to the left before the check; forgetting to subtract the pivot itself from the right side; and starting the loop at position 1 because the left side supposedly cannot be empty. It can. For 2, 1, minus 1, the pivot is position zero: nothing on the left, and 1 plus minus 1 on the right, both zero.
