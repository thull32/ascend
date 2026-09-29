from collections import deque


def longest_within_limit(nums, limit):
    max_dq = deque()
    min_dq = deque()
    left = 0
    best = 0
    for right, x in enumerate(nums):
        while max_dq and nums[max_dq[-1]] <= x:
            max_dq.pop()
        max_dq.append(right)
        while min_dq and nums[min_dq[-1]] >= x:
            min_dq.pop()
        min_dq.append(right)

        while nums[max_dq[0]] - nums[min_dq[0]] > limit:
            if max_dq[0] == left:
                max_dq.popleft()
            if min_dq[0] == left:
                min_dq.popleft()
            left += 1

        best = max(best, right - left + 1)
    return best
