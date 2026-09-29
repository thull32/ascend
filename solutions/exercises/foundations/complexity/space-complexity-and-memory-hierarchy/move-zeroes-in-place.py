def move_zeroes(nums):
    w = 0
    for i in range(len(nums)):
        if nums[i] != 0:
            nums[w] = nums[i]
            w += 1
    for i in range(w, len(nums)):
        nums[i] = 0
    return nums
