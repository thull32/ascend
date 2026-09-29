import math


def bloom_size(n, p):
    m = math.ceil(-n * math.log(p) / (math.log(2) ** 2))
    k = math.floor((m / n) * math.log(2) + 0.5)
    k = max(k, 1)
    return [m, k]
