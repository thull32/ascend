---
problem: partition-equal-subset
args: [[3, 1, 4, 2, 2]]
frames: 64
source: 9ebf12cb24368d2b
---
@0
The numbers are 3, 1, 4, 2, 2. Can they be split into two groups with equal sums? The number of subsets is exponential, but the number of distinct subset sums is small. So instead of remembering which subsets we have built, remember only which sums are reachable, and take the items one at a time.

@1-5
The total is 12, which is even, so each half must be 6. An odd total would be an instant no. We keep one row of flags for the sums 0 to 6, and only 0 is reachable at first, by the empty subset.

@6-17
Item 3. For each sum, if the sum minus 3 was reachable, this sum is too. We go from the top down: 6, 5 and 4 look at 3, 2 and 1, which are not reachable. Sum 3 looks at 0, which is. Now 0 and 3 are reachable. Six is not, so no early exit.

@18-33
Item 1. Sum 4 looks at 3: reachable, using 3 and 1. Sum 1 looks at 0: reachable, using the 1 alone. The reachable sums are 0, 1, 3 and 4.

@34-44
Item 4. Sum 6 looks at 2, not reachable. Sum 5 looks at 1: yes, 1 and 4. Sum 4 looks at 0: already reachable.

@45-49
Item 2. Sum 6 looks at sum 4, which is reachable, so 6 is reachable: 4 and 2, or 3, 1 and 2.

@50-60
Watch sum 4 now. It looks at sum 2, which is still not reachable, because we have not reached sum 2 in this pass yet. That is why the loop runs downwards. Going upwards, sum 2 would be marked first, using this 2, and then sum 4 would read it and use the same 2 a second time. That is a different problem, the unbounded knapsack. Further down, sums 3 and 2 become reachable.

@61-63
Sum 6 is reachable, so we return true straight away, without looking at the last 2. One group is 4 and 2, and the other is 3, 1 and 2, both summing to 6. The cost is the number of items times the target, in a single row of space. The classic mistake is that upward loop: on 1, 2 and 5, it would reuse the 1 to make 4, and wrongly answer true.
