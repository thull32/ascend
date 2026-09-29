def find_missing(nums):
    nums = list(nums)
    n = len(nums)
    i = 0
    while i < n:
        j = nums[i] - 1
        if nums[j] != nums[i]:
            nums[i], nums[j] = nums[j], nums[i]
        else:
            i += 1
    return [k + 1 for k in range(n) if nums[k] != k + 1]
