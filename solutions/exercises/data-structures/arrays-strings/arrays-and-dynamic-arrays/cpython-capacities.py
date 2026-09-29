def cpython_capacities(n):
    allocated = 0
    result = []
    for newsize in range(1, n + 1):
        if newsize > allocated:
            allocated = (newsize + (newsize >> 3) + 6) & ~3
            result.append(allocated)
    return result
