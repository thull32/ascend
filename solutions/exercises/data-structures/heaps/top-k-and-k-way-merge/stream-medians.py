# Running median via two heaps: low is a max-heap (negated) for the lower
# half, high is a min-heap for the upper half, kept within one of each
# other in size. Push-then-move never needs balance-case branching.

import heapq


def stream_medians(nums):
    low, high = [], []   # low: max-heap (negated), high: min-heap
    out = []
    for x in nums:
        heapq.heappush(low, -x)
        heapq.heappush(high, -heapq.heappop(low))
        if len(high) > len(low):
            heapq.heappush(low, -heapq.heappop(high))
        if len(low) > len(high):
            out.append(-low[0])
        else:
            out.append((-low[0] + high[0]) / 2)
    return out
