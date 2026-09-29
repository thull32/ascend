def min_jumps(nums):
    n = len(nums)
    if n <= 1:
        return 0

    jumps = 0
    current_end = 0
    furthest = 0

    for i in range(n - 1):
        furthest = max(furthest, i + nums[i])
        if i == current_end:
            jumps += 1
            current_end = furthest
            if current_end >= n - 1:
                break

    return jumps
