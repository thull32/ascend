def simulate_pool(requests, size):
    free_at = [0] * size
    waits = []
    for arrival, service in requests:
        idx = min(range(size), key=lambda i: free_at[i])
        start = max(free_at[idx], arrival)
        waits.append(start - arrival)
        free_at[idx] = start + service
    return waits
