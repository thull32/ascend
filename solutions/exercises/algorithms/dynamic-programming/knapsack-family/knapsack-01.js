function knapsack_01(weights, values, capacity) {
  const dp = new Array(capacity + 1).fill(0);
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i], v = values[i];
    for (let c = capacity; c >= w; c--) {
      dp[c] = Math.max(dp[c], dp[c - w] + v);
    }
  }
  return dp[capacity];
}
