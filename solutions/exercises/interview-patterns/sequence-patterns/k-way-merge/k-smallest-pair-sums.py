import heapq


def k_smallest_pairs(a, b, k):
    if not a or not b or k == 0:
        return []

    heap = []
    for i in range(min(k, len(a))):
        heapq.heappush(heap, (a[i] + b[0], i, 0))

    result = []
    while heap and len(result) < k:
        s, i, j = heapq.heappop(heap)
        result.append([a[i], b[j]])
        if j + 1 < len(b):
            heapq.heappush(heap, (a[i] + b[j + 1], i, j + 1))
    return result
