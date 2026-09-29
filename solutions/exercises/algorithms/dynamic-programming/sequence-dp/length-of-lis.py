def length_of_lis(nums):
    tails = []
    for x in nums:
        lo, hi = 0, len(tails)
        while lo < hi:
            mid = (lo + hi) // 2
            if tails[mid] >= x:
                hi = mid
            else:
                lo = mid + 1
        if lo == len(tails):
            tails.append(x)
        else:
            tails[lo] = x
    return len(tails)
