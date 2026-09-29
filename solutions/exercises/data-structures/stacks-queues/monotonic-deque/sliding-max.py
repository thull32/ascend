from collections import deque


def sliding_max(nums, k):
    if not nums:
        return []
    dq = deque()  # indices, values strictly decreasing front to back
    out = []
    for i, x in enumerate(nums):
        while dq and nums[dq[-1]] <= x:
            dq.pop()
        dq.append(i)
        if dq[0] <= i - k:
            dq.popleft()
        if i >= k - 1:
            out.append(nums[dq[0]])
    return out
