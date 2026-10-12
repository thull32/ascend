---
problem: best-time-to-buy-sell
args: [[7, 1, 5, 3, 6, 4]]
frames: 25
source: 3893e252013c0ef1
---
@0-2
Six days of prices: 7, 1, 5, 3, 6, 4. You buy once and sell once, later. Checking every pair of days is quadratic. The insight is to fix the selling day: the best day to buy for it is simply the cheapest day before it. So we scan once, carrying the lowest price seen so far, and each day's best profit is one subtraction. Best profit starts at zero, because doing nothing is allowed, and the lowest price starts at infinity, so the first price always replaces it.

@3-5
Day zero, price 7. It is lower than infinity, so 7 becomes the lowest so far.

@6-8
Day one, price 1. Lower again, so the lowest becomes 1. On a day that sets a new low there is nothing to sell, because selling the same day makes zero. That is why the profit check sits in an else branch.

@9-12
Day two, price 5. Not a new low, so we try selling: 5 minus 1 is 4, better than zero. Best becomes 4.

@13-15
Day three, price 3. Selling would make 2, which does not beat 4. Nothing changes.

@16-19
Day four, price 6. Six minus 1 is 5, a new best. Buy at 1, sell at 6.

@20-22
Day five, price 4. That would make only 3. Nothing changes.

@23-24
We return 5. One pass, two numbers, linear time and constant space. Think of it as a window whose left edge is the cheapest day so far, jumping forward whenever a cheaper day appears.

The classic wrong answer is the highest price minus the lowest. Here that is 7 minus 1, which would mean selling on day zero before buying on day one. The order matters, and carrying the minimum forward is what enforces it. The other trap is returning a loss when prices only fall. Starting best at zero means the answer is never negative.
