def next_greater(nums):
    n = len(nums)
    ans = [-1] * n
    stack = []  # indices, values strictly decreasing bottom to top
    for i in range(n):
        while stack and nums[stack[-1]] < nums[i]:
            ans[stack.pop()] = nums[i]
        stack.append(i)
    return ans
