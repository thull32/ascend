def min_assignment_cost(cost):
    n = len(cost)
    size = 1 << n
    dp = [float("inf")] * size
    dp[0] = 0
    for mask in range(size):
        if dp[mask] == float("inf"):
            continue
        job = bin(mask).count("1")
        if job == n:
            continue
        for w in range(n):
            if not (mask & (1 << w)):
                new_mask = mask | (1 << w)
                new_cost = dp[mask] + cost[w][job]
                if new_cost < dp[new_mask]:
                    dp[new_mask] = new_cost
    return dp[size - 1]
