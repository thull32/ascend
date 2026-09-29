def max_circular_sum(nums):
    total = sum(nums)

    max_ending = 0
    max_so_far = nums[0]
    min_ending = 0
    min_so_far = nums[0]

    for x in nums:
        max_ending = max(x, max_ending + x)
        max_so_far = max(max_so_far, max_ending)
        min_ending = min(x, min_ending + x)
        min_so_far = min(min_so_far, min_ending)

    if max_so_far < 0:
        return max_so_far

    return max(max_so_far, total - min_so_far)
