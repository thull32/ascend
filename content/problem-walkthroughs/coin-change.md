---
problem: coin-change
args: [[1, 3, 4], 6]
frames: 62
source: e7e38bab9b0c286d
---
@0-2
Coins of 1, 3 and 4, and we want the fewest coins that make 6. Greedy says take the biggest coin that fits: 4, then 1, then 1, three coins. But 3 plus 3 is two. The insight: take any best pile for an amount and remove one coin. What is left must be a best pile for the smaller amount, or you could improve the whole thing. So the fewest coins for an amount is one plus the best over each coin of the fewest for the amount minus that coin. We fill an array from zero up to 6. Zero needs zero coins. Everything else starts at 7, which stands for infinity: no real answer can use more than 6 coins, since every coin is at least 1.

@3-11
Amount 1. Only the 1 coin fits: zero coins for amount zero, plus one, gives 1. The 3 and the 4 are too big.

@12-20
Amount 2: two coins, both 1s. Again the bigger coins do not fit.

@21-29
Amount 3. Through the 1 coin: two coins for amount 2, plus one, is 3. Then the 3 coin: zero coins for amount zero, plus one, is 1, which is better. Fewest for 3 becomes 1. The array tries every coin as the last one and keeps the smallest.

@30-40
Amount 4. Through the 1 coin, one coin for 3 plus one gives 2. The 3 coin lands on amount 1, also 2, not better. The 4 coin lands on zero: 1. Fewest for 4 is 1.

@41-49
Amount 5. The 1 coin lands on 4, which needs one coin, so 2. The 3 coin lands on 2, which needs two, so 3. The 4 coin lands on 1, also 2. Best is 2.

@50-58
Amount 6, the one greedy gets wrong. Through the 1 coin: amount 5 needs two, so 3. Through the 3 coin: amount 3 needs just one, so 2. That is the new best. Through the 4 coin: amount 2 needs two 1s, so 3 again, no better. Greedy only ever looks at that last option. The table looks at all three.

@59-61
Fewest for 6 is 2, not the sentinel 7, so we return 2: two 3s. If it were still 7, the amount would be unreachable and we would return minus 1. The cost is the amount times the number of coins in time, and one array in space.

The mistakes: trusting greedy, which only works for special coin systems like 1, 5, 10 and 25; starting unreachable amounts at zero, which makes them look free; and forgetting to turn the infinity sentinel into minus 1 at the end.
