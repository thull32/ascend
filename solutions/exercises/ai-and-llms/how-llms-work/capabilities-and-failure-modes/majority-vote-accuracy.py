from math import comb


def majority_vote_accuracy(p, n):
    total = 0.0
    for k in range(n + 1):
        pk = comb(n, k) * (p ** k) * ((1 - p) ** (n - k))
        if 2 * k > n:
            total += pk
        elif 2 * k == n:
            total += pk / 2
    return total
