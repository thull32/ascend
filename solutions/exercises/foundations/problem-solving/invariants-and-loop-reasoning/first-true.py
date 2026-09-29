def first_true(flags):
    lo, hi = 0, len(flags)
    while lo < hi:
        mid = (lo + hi) // 2
        if flags[mid] == 1:
            hi = mid
        else:
            lo = mid + 1
    return lo
