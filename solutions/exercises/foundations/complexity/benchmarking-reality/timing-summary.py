def timing_summary(samples):
    s = sorted(samples)
    n = len(s)
    minimum = s[0]
    p50_idx = -(-(n) // 2) - 1
    p90_idx = -(-(9 * n) // 10) - 1
    return [minimum, s[p50_idx], s[p90_idx]]
