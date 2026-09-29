def best_split(xs, ys):
    n = len(xs)

    def gini(labels):
        if not labels:
            return 0.0
        p1 = sum(labels) / len(labels)
        p0 = 1 - p1
        return 1 - p1 * p1 - p0 * p0

    pairs = list(zip(xs, ys))
    distinct = sorted(set(xs))
    if len(distinct) < 2:
        return [None, gini(ys)]

    best_t = None
    best_score = None
    for i in range(len(distinct) - 1):
        t = (distinct[i] + distinct[i + 1]) / 2
        left = [y for x, y in pairs if x <= t]
        right = [y for x, y in pairs if x > t]
        score = (len(left) / n) * gini(left) + (len(right) / n) * gini(right)
        if best_score is None or score < best_score - 1e-9:
            best_score = score
            best_t = t
    return [best_t, best_score]
