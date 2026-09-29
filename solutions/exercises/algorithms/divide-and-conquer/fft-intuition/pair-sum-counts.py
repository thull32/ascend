def pair_sum_counts(a, b):
    if not a or not b:
        return []
    hist_a = [0] * (max(a) + 1)
    for x in a:
        hist_a[x] += 1
    hist_b = [0] * (max(b) + 1)
    for x in b:
        hist_b[x] += 1

    result = [0] * (len(hist_a) + len(hist_b) - 1)
    for i, ai in enumerate(hist_a):
        if ai == 0:
            continue
        for j, bj in enumerate(hist_b):
            result[i + j] += ai * bj
    return result
