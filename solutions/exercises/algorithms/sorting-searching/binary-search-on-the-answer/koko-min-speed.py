def min_eating_speed(piles, h):
    def feasible(s):
        return sum((p + s - 1) // s for p in piles) <= h

    lo, hi = 1, max(piles)
    while lo < hi:
        mid = (lo + hi) // 2
        if feasible(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
