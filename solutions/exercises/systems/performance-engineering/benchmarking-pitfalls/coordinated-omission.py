def _nearest_rank(samples, p):
    n = len(samples)
    if n == 0:
        return None
    s = sorted(samples)
    rank = -(-(p * n) // 100)
    return s[rank - 1]


def co_percentiles(latencies, interval, p):
    raw = _nearest_rank(latencies, p)

    corrected = []
    for latency in latencies:
        corrected.append(latency)
        if interval > 0:
            m = latency - interval
            while m >= interval:
                corrected.append(m)
                m -= interval

    return [raw, _nearest_rank(corrected, p)]
