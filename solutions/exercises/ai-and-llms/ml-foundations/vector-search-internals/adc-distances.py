def adc_distances(query, codebooks, codes):
    m = len(codebooks)
    s = len(query) // m
    table = []
    for j in range(m):
        sub_q = query[j * s:(j + 1) * s]
        dists = []
        for centroid in codebooks[j]:
            d = sum((a - b) ** 2 for a, b in zip(sub_q, centroid))
            dists.append(d)
        table.append(dists)

    result = []
    for code in codes:
        total = 0.0
        for j in range(m):
            total += table[j][code[j]]
        result.append(total)
    return result
