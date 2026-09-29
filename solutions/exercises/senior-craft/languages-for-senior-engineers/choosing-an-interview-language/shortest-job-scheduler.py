import heapq


def schedule_jobs(jobs):
    n = len(jobs)
    order = sorted(range(n), key=lambda i: jobs[i][0])
    heap = []
    result = []
    clock = 0
    ptr = 0

    while ptr < n or heap:
        if not heap and ptr < n and jobs[order[ptr]][0] > clock:
            clock = jobs[order[ptr]][0]
        while ptr < n and jobs[order[ptr]][0] <= clock:
            i = order[ptr]
            heapq.heappush(heap, (jobs[i][1], i))
            ptr += 1
        duration, i = heapq.heappop(heap)
        result.append(i)
        clock += duration

    return result
