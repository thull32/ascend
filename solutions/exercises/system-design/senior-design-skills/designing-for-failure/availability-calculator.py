import math


def _availability(node):
    if isinstance(node, (int, float)):
        return node

    if "serial" in node:
        a = 1.0
        for child in node["serial"]:
            a *= _availability(child)
        return a

    if "parallel" in node:
        unavail = 1.0
        for child in node["parallel"]:
            unavail *= (1 - _availability(child))
        return 1 - unavail

    # k-of-n
    k = node["k"]
    avails = [_availability(c) for c in node["of"]]
    n = len(avails)
    if k > n:
        return 0.0

    dist = [0.0] * (n + 1)
    dist[0] = 1.0
    for a in avails:
        new_dist = [0.0] * (n + 1)
        for j in range(n + 1):
            p = dist[j]
            if p == 0:
                continue
            new_dist[j] += p * (1 - a)
            if j + 1 <= n:
                new_dist[j + 1] += p * a
        dist = new_dist

    return sum(dist[k:])


def downtime_seconds(node):
    a = _availability(node)
    return math.floor((1 - a) * 2592000 + 0.5)
