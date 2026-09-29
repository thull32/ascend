import heapq


def simulate_pool(size, hold, timeout, arrivals):
    free_at = [0] * size
    heapq.heapify(free_at)
    results = []
    for t in arrivals:
        earliest = free_at[0]
        wait = max(0, earliest - t)
        if wait > timeout:
            results.append(-1)
            continue
        start = max(t, earliest)
        heapq.heapreplace(free_at, start + hold)
        results.append(wait)
    return results
