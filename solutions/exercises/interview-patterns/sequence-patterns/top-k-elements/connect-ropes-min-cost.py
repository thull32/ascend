import heapq


def connect_ropes(lengths):
    if len(lengths) <= 1:
        return 0
    heap = list(lengths)
    heapq.heapify(heap)
    total = 0
    while len(heap) > 1:
        a = heapq.heappop(heap)
        b = heapq.heappop(heap)
        total += a + b
        heapq.heappush(heap, a + b)
    return total
