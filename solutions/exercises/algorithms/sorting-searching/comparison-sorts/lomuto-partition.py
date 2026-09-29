def lomuto_partition(nums):
    pivot = nums[-1]
    i = -1
    for j in range(len(nums) - 1):
        if nums[j] <= pivot:
            i += 1
            nums[i], nums[j] = nums[j], nums[i]
    nums[i + 1], nums[-1] = nums[-1], nums[i + 1]
    return [i + 1, nums]
