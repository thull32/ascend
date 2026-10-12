---
problem: trapping-rain-water
args: [[3, 0, 1, 4, 0, 2]]
frames: 31
source: 9764e2379268bd8e
---
@0
Bars of height 3, 0, 1, 4, 0, 2. Rain fills the dips, and we want the total water: 7 units. The water above a column is the lower of the tallest wall to its left and the tallest wall to its right, minus the column's own height. The insight is that you only ever need the lower of those two walls. Walk two pointers inward from the ends, keep the tallest bar seen from each side, and always process the side whose current bar is shorter. That side's water is settled by its own running maximum, because something at least as tall is waiting on the other side.

@1-3
lo starts at the left end, hi at the right end, both running maxima at zero, and no water yet.

@4-8
The left bar is 3 and the right bar is 2. The right is shorter, so we process the right. Its running maximum becomes 2, and the column's water is 2 minus 2, zero. hi moves in.

@9-13
The right bar is now 0, still shorter than 3. The running maximum on the right is 2, so this column holds 2 minus 0: two units. Why is 2 safe? The left side has a 3 waiting, so the right wall is what limits this column, and that wall is 2. The total is 2.

@14-18
The right bar is now the 4. The left bar, 3, is shorter, so we switch sides. The left running maximum becomes 3, and the column itself holds nothing. lo moves in.

@19-23
The left bar is 0, against the 4 on the right. The left maximum is 3, so this column holds 3 units. Notice the left maximum, 3, is larger than the right maximum, 2. That is fine: what matters is that the 4 under hi guarantees a right wall of at least 4, so the left wall of 3 is the binding one. The total is 5.

@24-28
The left bar is 1, still shorter than 4. It holds 3 minus 1, two units. The total is 7, and lo moves onto the 4, where it meets hi.

@29-30
The pointers have met, so we return 7: two units on the right, three and two on the left.

Each column is settled once, so time is linear and space is constant. If you are unsure, start with the version that precomputes the tallest bar to the left and to the right of every column: also linear, just with two extra arrays. The mistakes are using the larger wall instead of the smaller, and borrowing the logic of container with most water, which picks one best pair. Here the answer is a sum over every column.
