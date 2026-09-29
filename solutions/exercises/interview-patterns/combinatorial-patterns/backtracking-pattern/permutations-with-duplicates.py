def permute_unique(nums):
    nums = sorted(nums)
    n = len(nums)
    used = [False] * n
    result = []
    path = []

    def backtrack():
        if len(path) == n:
            result.append(list(path))
            return
        for i in range(n):
            if used[i]:
                continue
            if i > 0 and nums[i] == nums[i - 1] and not used[i - 1]:
                continue
            used[i] = True
            path.append(nums[i])
            backtrack()
            path.pop()
            used[i] = False

    backtrack()
    return result
