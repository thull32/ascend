def largest_input(budget, cls):
    def cost(n):
        if cls == "linear":
            return n
        if cls == "linearithmic":
            return n * (n.bit_length() - 1)
        if cls == "quadratic":
            return n * n
        if cls == "cubic":
            return n * n * n
        if cls == "exponential":
            return 2 ** n
        if cls == "factorial":
            f = 1
            for i in range(2, n + 1):
                f *= i
            return f
        raise ValueError("unknown class")

    if cost(1) > budget:
        return 0

    lo, hi = 1, 2
    while cost(hi) <= budget:
        hi *= 2

    while lo + 1 < hi:
        mid = (lo + hi) // 2
        if cost(mid) <= budget:
            lo = mid
        else:
            hi = mid
    return lo
