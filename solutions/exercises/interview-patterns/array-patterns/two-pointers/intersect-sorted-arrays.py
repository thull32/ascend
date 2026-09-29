def intersect_sorted(a, b):
    i, j = 0, 0
    result = []
    while i < len(a) and j < len(b):
        if a[i] < b[j]:
            i += 1
        elif a[i] > b[j]:
            j += 1
        else:
            result.append(a[i])
            i += 1
            j += 1
    return result
