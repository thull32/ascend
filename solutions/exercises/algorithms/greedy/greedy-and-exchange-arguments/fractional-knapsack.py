def fractional_knapsack(weights, values, capacity):
    items = sorted(
        zip(weights, values),
        key=lambda wv: wv[1] / wv[0],
        reverse=True,
    )
    remaining = capacity
    total = 0
    for w, v in items:
        if remaining <= 0:
            break
        if w <= remaining:
            total += v
            remaining -= w
        else:
            total += v * remaining / w
            remaining = 0
    return total
