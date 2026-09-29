def unique_paths_with_obstacles(grid):
    m = len(grid)
    n = len(grid[0])
    dp = [0] * n
    dp[0] = 1 if grid[0][0] == 0 else 0
    for r in range(m):
        for c in range(n):
            if grid[r][c] == 1:
                dp[c] = 0
            elif r == 0 and c == 0:
                continue
            elif c > 0:
                dp[c] += dp[c - 1]
            # c == 0 and r > 0: dp[c] carries over from the row above (no change)
    return dp[n - 1]
