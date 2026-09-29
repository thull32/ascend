import heapq


def merge_k_sorted(arrays):
    heap = []
    for i, arr in enumerate(arrays):
        if arr:
            heapq.heappush(heap, (arr[0], i, 0))

    result = []
    while heap:
        value, i, pos = heapq.heappop(heap)
        result.append(value)
        if pos + 1 < len(arrays[i]):
            heapq.heappush(heap, (arrays[i][pos + 1], i, pos + 1))
    return result
