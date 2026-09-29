def percentile(samples, p):
    n = len(samples)
    if n == 0:
        return None
    s = sorted(samples)
    rank = -(-(p * n) // 100)  # ceil(p * n / 100)
    return s[rank - 1]
