---
problem: max-product-subarray
args: [[2, -5, -2, -4, 3]]
frames: 20
source: 06869d3d669005a8
---
@0-1
Five numbers: two, minus five, minus two, minus four, three. Which contiguous run has the largest product? For the largest sum, Kadane's algorithm keeps one number, the best sum ending here. Products break that, because multiplying by a negative flips the order: the smallest product so far can become the largest in one step. So we keep both extremes at every position, hi and lo, the largest and smallest product of a run ending here. Everything starts at the first number, two.

@2-4
Minus five arrives. There are only three candidates for a run ending here: start fresh at minus five, extend the old high, two times minus five is minus ten, or extend the old low, also minus ten. So hi is minus five and lo is minus ten. Best stays two. Straight Kadane would forget the minus ten right now, and that is the bug the problem is built to catch.

@5-9
Minus two arrives. Fresh start: minus two. Extend the old high: minus five times minus two is ten. Extend the old low: minus ten times minus two is twenty. The largest is twenty, and it came from the old minimum. That is the run two, minus five, minus two. Hi is twenty, lo is minus two, and best is twenty.

@10-13
Minus four. Fresh: minus four. Twenty times minus four: minus eighty. Minus two times minus four: eight. So hi is eight, the run minus two, minus four, and lo is minus eighty, waiting for another negative to flip it. Best stays twenty.

@14-17
Three. Fresh: three. Eight times three: twenty four. Minus eighty times three: minus two hundred and forty. Hi is twenty four, and best becomes twenty four.

@18-19
We return twenty four: the run minus two, minus four, three.

Notice the line that updates hi and lo. Both are computed from the same three candidates, built from the old pair, in one assignment. Updating hi first and then computing lo from the new hi is the classic bug. A zero needs no special case: every candidate becomes zero, and the next number starts fresh.

One pass with two numbers of state, so time is linear and space is constant. The other mistakes: returning the final hi instead of the best over all positions; and starting best at zero, which is wrong for a single minus two, where the answer is minus two.
