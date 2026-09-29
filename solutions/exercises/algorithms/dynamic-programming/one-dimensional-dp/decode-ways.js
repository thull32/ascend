function num_decodings(s) {
  const n = s.length;
  const dp = new Array(n + 1).fill(0);
  dp[0] = 1;
  for (let i = 1; i <= n; i++) {
    if (s[i - 1] !== "0") dp[i] += dp[i - 1];
    if (i >= 2) {
      const two = parseInt(s.slice(i - 2, i), 10);
      if (two >= 10 && two <= 26) dp[i] += dp[i - 2];
    }
  }
  return dp[n];
}
