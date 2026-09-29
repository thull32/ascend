import math


def _alpha(m):
    if m == 16:
        return 0.673
    if m == 32:
        return 0.697
    if m == 64:
        return 0.709
    return 0.7213 / (1 + 1.079 / m)


def hll_estimate(registers):
    m = len(registers)
    raw = _alpha(m) * m * m / sum(2 ** (-r) for r in registers)

    if raw <= 2.5 * m:
        zeros = registers.count(0)
        if zeros > 0:
            return round(m * math.log(m / zeros))

    return round(raw)
