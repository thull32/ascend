// 1D DP with coin types as the outer loop (fixes an order so combinations
// aren't counted as permutations) and amounts ascending (a coin may repeat).
function coin_change_ways(coins, amount) {
  const ways = new Array(amount + 1).fill(0);
  ways[0] = 1;
  for (const c of coins) {
    for (let a = c; a <= amount; a++) {
      ways[a] += ways[a - c];
    }
  }
  return ways[amount];
}
