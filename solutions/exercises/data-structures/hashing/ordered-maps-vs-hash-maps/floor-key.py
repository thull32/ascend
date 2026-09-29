def floor_key(keys, x):
    lo, hi = 0, len(keys)
    while lo < hi:
        mid = (lo + hi) // 2
        if keys[mid] <= x:
            lo = mid + 1
        else:
            hi = mid
    return keys[lo - 1] if lo > 0 else None
