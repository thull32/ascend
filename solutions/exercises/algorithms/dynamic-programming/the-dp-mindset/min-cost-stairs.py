def min_cost_climbing(cost):
    prev2, prev1 = 0, 0
    for i in range(len(cost)):
        cur = cost[i] + min(prev1, prev2)
        prev2, prev1 = prev1, cur
    return min(prev1, prev2)
