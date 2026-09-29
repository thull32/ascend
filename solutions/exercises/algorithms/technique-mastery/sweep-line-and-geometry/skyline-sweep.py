import heapq


def skyline(buildings):
    if not buildings:
        return []

    events = []
    for l, r, h in buildings:
        events.append((l, -h, r))
        events.append((r, 0, 0))
    events.sort()

    heap = [(0, float('inf'))]
    result = []
    i = 0
    n = len(events)
    while i < n:
        x = events[i][0]
        while i < n and events[i][0] == x:
            neg_h, r = events[i][1], events[i][2]
            if neg_h != 0:
                heapq.heappush(heap, (neg_h, r))
            i += 1
        while heap[0][1] <= x:
            heapq.heappop(heap)
        cur_height = -heap[0][0]
        if not result or result[-1][1] != cur_height:
            result.append([x, cur_height])
    return result
