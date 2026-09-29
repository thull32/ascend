def makespan(durations, workers, mode):
    n = len(durations)
    if n == 0:
        return 0

    if mode == "static":
        chunk_size = (n + workers - 1) // workers
        best = 0
        for i in range(0, n, chunk_size):
            best = max(best, sum(durations[i:i + chunk_size]))
        return best

    free = [0] * workers
    for d in durations:
        idx = min(range(workers), key=lambda w: free[w])
        free[idx] += d
    return max(free)
