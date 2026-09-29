def apply_range_adds(n, updates):
    diff = [0] * (n + 1)
    for l, r, v in updates:
        diff[l] += v
        if r + 1 < n:
            diff[r + 1] -= v
    result = [0] * n
    running = 0
    for i in range(n):
        running += diff[i]
        result[i] = running
    return result
