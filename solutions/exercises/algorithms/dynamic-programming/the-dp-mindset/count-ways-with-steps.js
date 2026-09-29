function count_ways(n, steps) {
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  for (let i = 1; i <= n; i++) {
    for (const s of steps) {
      if (s <= i) dp[i] += dp[i - s];
    }
  }
  return dp[n];
}
