function matrix_chain(dims) {
  const n = dims.length - 1;
  if (n <= 1) return 0;
  const dp = Array.from({ length: n + 1 }, () => new Array(n + 1).fill(0));
  for (let length = 2; length <= n; length++) {
    for (let i = 1; i <= n - length + 1; i++) {
      const j = i + length - 1;
      dp[i][j] = Infinity;
      for (let k = i; k < j; k++) {
        const cost = dp[i][k] + dp[k + 1][j] + dims[i - 1] * dims[k] * dims[j];
        if (cost < dp[i][j]) dp[i][j] = cost;
      }
    }
  }
  return dp[1][n];
}
