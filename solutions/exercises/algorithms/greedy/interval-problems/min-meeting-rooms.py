import heapq


def min_meeting_rooms(intervals):
    if not intervals:
        return 0
    ordered = sorted(intervals, key=lambda iv: iv[0])
    heap = []
    for start, end in ordered:
        if heap and heap[0] <= start:
            heapq.heapreplace(heap, end)
        else:
            heapq.heappush(heap, end)
    return len(heap)
