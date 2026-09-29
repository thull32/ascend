function min_assignment_cost(cost) {
  const n = cost.length;
  const size = 1 << n;
  const dp = new Array(size).fill(Infinity);
  dp[0] = 0;
  for (let mask = 0; mask < size; mask++) {
    if (dp[mask] === Infinity) continue;
    let job = 0;
    for (let b = 0; b < n; b++) if (mask & (1 << b)) job++;
    if (job === n) continue;
    for (let w = 0; w < n; w++) {
      if (!(mask & (1 << w))) {
        const newMask = mask | (1 << w);
        const newCost = dp[mask] + cost[w][job];
        if (newCost < dp[newMask]) dp[newMask] = newCost;
      }
    }
  }
  return dp[size - 1];
}
