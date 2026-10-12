---
problem: range-sum-query-immutable
args: [["__init__", [-2, 0, 3, -5, 2, -1]], ["sum_range", 0, 2], ["sum_range", 2, 5], ["sum_range", 0, 5]]
frames: 21
source: 233b147ba39dc594
---
@0
The array is minus 2, 0, 3, minus 5, 2, minus 1, and it never changes. We will be asked for many range sums. Looping over the range on every query is linear each time. Since the data is fixed, do the work once: store running totals, where entry i is the sum of the first i elements. Then any range sum is one subtraction: the total up to the right end, minus the total before the left end.

@1-3
The prefix array is one longer than the input, and entry 0 is the sum of nothing: zero. That leading zero is the detail that removes every special case. The first running total is minus 2.

@4-9
Adding 0 keeps it at minus 2. Adding 3 gives 1. Adding minus 5 gives minus 4.

@10-14
Adding 2 gives minus 2, and adding minus 1 gives minus 3, the sum of the whole array. The prefix array is 0, minus 2, minus 2, 1, minus 4, minus 2, minus 3.

@15-16
The first query asks for positions 0 to 2. Take the total of the first three elements, entry 3, which is 1, and subtract entry 0, which is zero. The answer is 1: minus 2 plus 0 plus 3. Thanks to the leading zero, a range that starts at the beginning needs no branch.

@17-18
Positions 2 to 5: entry 6 is minus 3, and entry 2, the sum of everything before position 2, is minus 2. Minus 3 minus minus 2 is minus 1. Check: 3, minus 5, 2 and minus 1 do sum to minus 1.

@19-20
Positions 0 to 5, the whole array: minus 3 minus zero, so minus 3. Construction is linear, and every query is constant time, however long the range. The classic mistakes are off by one: subtracting entry right instead of right plus one, which drops the last element, or reaching for the entry before left, which breaks when left is zero.
