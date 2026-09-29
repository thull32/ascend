def kth_smallest(nums, k):
    nums = list(nums)
    target = k - 1
    lo, hi = 0, len(nums) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        nums[mid], nums[hi] = nums[hi], nums[mid]
        pivot = nums[hi]
        i = lo - 1
        for j in range(lo, hi):
            if nums[j] <= pivot:
                i += 1
                nums[i], nums[j] = nums[j], nums[i]
        i += 1
        nums[i], nums[hi] = nums[hi], nums[i]
        if i == target:
            return nums[i]
        elif target < i:
            hi = i - 1
        else:
            lo = i + 1
    return nums[lo]
