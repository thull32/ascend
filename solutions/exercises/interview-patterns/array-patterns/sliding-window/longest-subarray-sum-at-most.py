def longest_subarray_at_most(nums, limit):
    left = 0
    total = 0
    best = 0
    for right, value in enumerate(nums):
        total += value
        while total > limit:
            total -= nums[left]
            left += 1
        best = max(best, right - left + 1)
    return best
