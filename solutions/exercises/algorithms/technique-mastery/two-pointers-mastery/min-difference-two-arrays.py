def min_abs_difference(a, b):
    a = sorted(a)
    b = sorted(b)
    i, j = 0, 0
    best = float('inf')
    while i < len(a) and j < len(b):
        best = min(best, abs(a[i] - b[j]))
        if a[i] < b[j]:
            i += 1
        else:
            j += 1
    return best
