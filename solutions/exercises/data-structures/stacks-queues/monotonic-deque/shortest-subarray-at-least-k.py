from collections import deque


def shortest_subarray_at_least(nums, k):
    n = len(nums)
    P = [0] * (n + 1)
    for i, x in enumerate(nums):
        P[i + 1] = P[i] + x
    dq = deque()  # indices into P, P values increasing front to back
    best = n + 1
    for j in range(n + 1):
        while dq and P[j] - P[dq[0]] >= k:
            best = min(best, j - dq.popleft())
        while dq and P[dq[-1]] >= P[j]:
            dq.pop()
        dq.append(j)
    return best if best <= n else -1
