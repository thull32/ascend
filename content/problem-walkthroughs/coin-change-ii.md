---
problem: coin-change-ii
args: [[1, 2, 3], 4]
frames: 29
source: 6d88eec40b646217
---
@0-2
Coins of 1, 2 and 3, as many as you like, and we count the combinations that make 4. One plus three and three plus one are the same combination, so we must count each mix once, not each ordering. The trick is to decide coins in a fixed order: first how many 1s, then how many 2s, then how many 3s. Each combination is then one path through those decisions. The array ways holds, for every amount from zero to 4, the number of combinations using the coins seen so far. Ways of zero is one: the empty combination. Every count grows from that seed.

@3-11
The outer loop is over coins, and that is the whole point. First, coins of 1 only. For each amount from 1 upward, we add the ways to make the amount minus one coin. So 1, 2, 3 and 4 each get exactly one way: all ones. The amounts go upward on purpose. When we reach 2, ways of 1 has already been updated in this pass, so a second 1 can be stacked on the first. Upward means a coin may repeat.

@12-19
Now allow 2s. Amount 2: one way without a 2, plus ways of zero, one, for the combination that is a single 2. That makes 2. Amount 3: one plus ways of 1, which is one: 1 and 2. That makes 2. Amount 4: one, plus ways of 2, which is now 2. Those two are the combinations for 2, each with a 2 added on top: 1, 1, 2, and 2, 2. Ways of 4 becomes 3.

@20-25
Now allow 3s. Amount 3 gains ways of zero, the single 3, and becomes 3. Amount 4 gains ways of 1, which is one: 1 plus 3. Ways of 4 becomes 4. Notice that 3 plus 1 never gets counted separately: by the time 3s are allowed, every 1 in a combination was already decided.

@26-28
We return 4: four ones, two ones and a two, two twos, and a one with a three. The cost is the number of coins times the amount, in time, and one array of amounts in space.

The line to remember is the loop order. Swap it, with amounts outside and coins inside, and each amount sums over which coin comes last, with no order imposed on the rest. That counts orderings, and here it returns 7 instead of 4. It is a valid answer to a different question, the follow-up one. Two more traps: setting ways of zero to zero makes every count zero, and running the amounts downward allows each coin only once.
