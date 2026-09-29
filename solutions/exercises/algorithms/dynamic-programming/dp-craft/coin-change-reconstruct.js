function coin_change_coins(coins, amount) {
  if (amount === 0) return [];
  const inf = amount + 1;
  const dp = new Array(amount + 1).fill(inf);
  dp[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c <= a && dp[a - c] + 1 < dp[a]) {
        dp[a] = dp[a - c] + 1;
      }
    }
  }
  if (dp[amount] === inf) return [];

  const result = [];
  let a = amount;
  while (a > 0) {
    for (const c of coins) {
      if (c <= a && dp[a - c] === dp[a] - 1) {
        result.push(c);
        a -= c;
        break;
      }
    }
  }
  result.sort((x, y) => x - y);
  return result;
}
