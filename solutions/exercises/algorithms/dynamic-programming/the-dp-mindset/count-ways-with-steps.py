def count_ways(n, steps):
    dp = [0] * (n + 1)
    dp[0] = 1
    for i in range(1, n + 1):
        for s in steps:
            if s <= i:
                dp[i] += dp[i - s]
    return dp[n]
