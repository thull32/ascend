function can_partition(nums) {
  const total = nums.reduce((a, b) => a + b, 0);
  if (total % 2 !== 0) return false;
  const target = total / 2;
  const dp = new Array(target + 1).fill(false);
  dp[0] = true;
  for (const x of nums) {
    for (let c = target; c >= x; c--) {
      if (dp[c - x]) dp[c] = true;
    }
  }
  return dp[target];
}
