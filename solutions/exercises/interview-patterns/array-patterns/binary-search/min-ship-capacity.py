def min_capacity(weights, days):
    def feasible(cap):
        needed = 1
        load = 0
        for w in weights:
            if load + w > cap:
                needed += 1
                load = 0
            load += w
        return needed <= days

    lo, hi = max(weights), sum(weights)
    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
