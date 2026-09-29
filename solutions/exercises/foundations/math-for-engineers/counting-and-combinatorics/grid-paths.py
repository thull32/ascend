def grid_paths(m, n):
    def n_choose_k(a, b):
        if b < 0 or b > a:
            return 0
        b = min(b, a - b)
        result = 1
        for i in range(1, b + 1):
            result = result * (a - b + i) // i
        return result

    return n_choose_k(m + n - 2, m - 1)
