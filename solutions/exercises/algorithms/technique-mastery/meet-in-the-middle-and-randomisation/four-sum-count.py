def four_sum_count(a, b, c, d):
    counts = {}
    for x in a:
        for y in b:
            s = x + y
            counts[s] = counts.get(s, 0) + 1

    total = 0
    for x in c:
        for y in d:
            total += counts.get(-(x + y), 0)
    return total
