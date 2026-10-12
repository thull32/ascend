---
problem: best-time-cooldown
args: [[2, 1, 4, 5, 2, 9, 7]]
frames: 18
source: 192a1af77e697c7d
---
@0-1
Seven days of prices: 2, 1, 4, 5, 2, 9, 7. The future depends on the past only through the situation you are in at the end of today, and there are three. Hold: you own a share. Sold: you sold today, so tomorrow is a cooldown. Rest: you own nothing and are free to buy tomorrow. We track the best profit in each. Before day zero, rest is zero, and hold and sold are minus infinity, because you cannot own or have sold anything yet.

@2-3
Each day, one line moves all three at once. Hold is the better of keeping yesterday's share, or buying today from rest. Sold is yesterday's hold plus today's price. Rest is the better of resting again or finishing yesterday's cooldown. Notice what is missing: there is no way into hold from sold. That gap is the cooldown. Day zero, price 2: the best hold is buying, minus 2. Nothing can be sold yet, and rest stays zero.

@4-5
Day one, price 1. Buying at 1 from rest beats the share bought at 2, so hold rises to minus 1. Sold becomes minus 1: selling yesterday's share at 1, a small loss, but it is the only way to be in that situation.

@6-7
Day two, price 4. Sold is now 3: the share bought at 1, sold at 4. Hold stays minus 1. Rest is still zero, because nothing has finished a cooldown yet.

@8-9
Day three, price 5. Sold rises to 4: buy at 1, sell at 5. And rest becomes 3, yesterday's sale, cooled down. Here is the tension the problem is built on. Selling at 5 makes more today, but its cooldown lands on day four, the cheap day.

@10-11
Day four, price 2. Hold becomes 1: rest was 3, and buying at 2 leaves 1. That only works because the sale at 4 cooled down on day three. The sale at 5 could not have done it. Rest becomes 4, the cooled-down sale at 5, and sold drops to 1.

@12-13
Day five, price 9. Sold becomes 10: the hold of 1 plus 9. That is two trades, buy at 1 and sell at 4, then buy at 2 and sell at 9, with day three as the cooldown between them.

@14-15
Day six, price 7. Selling today would give only 8. Rest takes yesterday's sale and becomes 10.

@16-17
The answer is the better of sold and rest, which is 10. Ending in hold is never optimal, so it is left out. One pass, three numbers, linear time and constant space.

The line to get right is the simultaneous update. If you assign hold first and then compute sold from the new hold, you let yourself buy and sell on the same day. And if you let hold be entered from sold, you have erased the cooldown: on the prices 1, 4, 2, 7 that gives 8 instead of the correct 6.
