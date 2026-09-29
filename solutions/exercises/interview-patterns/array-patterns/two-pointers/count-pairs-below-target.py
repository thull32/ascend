def count_pairs_below(nums, target):
    nums = sorted(nums)
    lo, hi = 0, len(nums) - 1
    count = 0
    while lo < hi:
        if nums[lo] + nums[hi] < target:
            count += hi - lo
            lo += 1
        else:
            hi -= 1
    return count
