def coin_change_coins(coins, amount):
    if amount == 0:
        return []
    inf = amount + 1
    dp = [0] + [inf] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    if dp[amount] == inf:
        return []

    result = []
    a = amount
    while a > 0:
        for c in coins:
            if c <= a and dp[a - c] == dp[a] - 1:
                result.append(c)
                a -= c
                break
    result.sort()
    return result
