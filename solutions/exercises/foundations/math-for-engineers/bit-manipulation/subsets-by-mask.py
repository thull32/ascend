def subsets_by_mask(values):
    n = len(values)
    result = []
    for mask in range(1 << n):
        subset = [values[i] for i in range(n) if (mask >> i) & 1]
        result.append(subset)
    return result
