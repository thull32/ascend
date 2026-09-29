# Shortest-job-first, non-preemptive: process arrivals in order, keep a
# min-heap of (duration, arrival, index) among arrived-but-unstarted tasks,
# and jump the clock to the next arrival whenever the heap runs dry.

import heapq


def sjf_order(tasks):
    n = len(tasks)
    order = []
    idx_sorted = sorted(range(n), key=lambda i: (tasks[i][0], i))

    heap = []
    time = 0
    j = 0
    while j < n or heap:
        while j < n and tasks[idx_sorted[j]][0] <= time:
            i = idx_sorted[j]
            arrival, duration = tasks[i]
            heapq.heappush(heap, (duration, arrival, i))
            j += 1
        if not heap:
            time = tasks[idx_sorted[j]][0]
            continue
        duration, arrival, i = heapq.heappop(heap)
        order.append(i)
        time += duration

    return order
