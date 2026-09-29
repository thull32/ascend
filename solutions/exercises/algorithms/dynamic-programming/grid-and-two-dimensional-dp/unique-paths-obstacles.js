function unique_paths_with_obstacles(grid) {
  const m = grid.length;
  const n = grid[0].length;
  const dp = new Array(n).fill(0);
  dp[0] = grid[0][0] === 0 ? 1 : 0;
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c] === 1) {
        dp[c] = 0;
      } else if (r === 0 && c === 0) {
        continue;
      } else if (c > 0) {
        dp[c] += dp[c - 1];
      }
    }
  }
  return dp[n - 1];
}
