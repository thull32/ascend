def split_array(nums, k):
    def pieces_needed(cap):
        pieces = 1
        running = 0
        for x in nums:
            if running + x > cap:
                pieces += 1
                running = x
            else:
                running += x
        return pieces

    lo, hi = max(nums), sum(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if pieces_needed(mid) <= k:
            hi = mid
        else:
            lo = mid + 1
    return lo
