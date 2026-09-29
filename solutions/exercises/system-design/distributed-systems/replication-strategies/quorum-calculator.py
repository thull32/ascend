import math


def quorum_properties(n, w, r):
    min_overlap = max(0, w + r - n)
    overlap = min_overlap >= 1

    write_failures_tolerated = n - w
    read_failures_tolerated = n - r

    miss_sets = math.comb(n - w, r) if r <= n - w else 0
    total_sets = math.comb(n, r)
    if miss_sets == 0:
        p_miss = [0, 1]
    else:
        g = math.gcd(miss_sets, total_sets)
        p_miss = [miss_sets // g, total_sets // g]

    return {
        "overlap": overlap,
        "min_overlap": min_overlap,
        "write_failures_tolerated": write_failures_tolerated,
        "read_failures_tolerated": read_failures_tolerated,
        "p_miss": p_miss,
    }
