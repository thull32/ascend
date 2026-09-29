import math


def bloom_params(n, p):
    m = math.ceil(-n * math.log(p) / (math.log(2) ** 2))
    k = max(1, round(m / n * math.log(2)))
    return [m, k]
