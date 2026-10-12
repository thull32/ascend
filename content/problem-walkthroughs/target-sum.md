---
problem: target-sum
args: [[1, 2, 3], 0]
frames: 26
source: 2bedd65987560cd8
---
@0
Put a plus or a minus in front of each of 1, 2 and 3 so the total is zero. There are two ways: plus 1, plus 2, minus 3, and minus 1, minus 2, plus 3. The insight is a little algebra. Call P the sum of the numbers with a plus, and N the sum of those with a minus. P minus N is the target, and P plus N is the total. Add the two equations and P is the total plus the target, halved. So every sign assignment is just a choice of which numbers get the plus, and we only need to count the subsets that sum to P. That is a zero one knapsack count.

@1-2
The total is 6. Two checks come first. If the target were further from zero than the total, no assignment could reach it. And the total plus the target must be even, or P would not be a whole number. Six plus zero is even, so the goal is 3.

@3-5
cnt holds, for each sum from zero to 3, how many subsets reach it. It starts with one way to make zero, the empty subset, and no way to make anything else.

@6-12
Now the number 1. For each sum, the ways either leave 1 out, which is the count already there, or put it in, which adds the count for that sum minus 1. The sums run downwards, from 3 to 1. Only sum 1 changes: it gains the one way to make zero, so one subset, just the 1, makes 1.

@13-18
The number 2. Sum 3 gains the count at sum 1, which is one: that is 1 plus 2. Sum 2 gains the count at sum zero, one: just the 2. The counts are now one, one, one, one.

@19-23
The number 3. Only sum 3 can take it, and it gains the count at sum zero, one: just the 3. So sum 3 now has two subsets: 1 and 2, or 3 alone.

@24-25
We return 2. Those two subsets are exactly the two sign assignments: the numbers in the subset get the plus.

Why downwards? Going from high sums to low means the count at sum minus x has not yet been touched for the current number, so one array behaves like two rows of the table and each number is used at most once. Going upwards would let a number be counted again and again. Time is the count of numbers times P, and space is P. The mistakes are skipping the parity check, so rounding down quietly invents answers, skipping the range check, and special casing zeros: a zero simply doubles every count, which is right, because plus zero and minus zero are both valid.
