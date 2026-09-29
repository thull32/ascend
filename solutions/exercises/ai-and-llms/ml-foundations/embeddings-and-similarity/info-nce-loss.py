import math


def info_nce_loss(sims, tau):
    n = len(sims)
    total = 0.0
    for i, row in enumerate(sims):
        z = [s / tau for s in row]
        m = max(z)
        log_sum_exp = m + math.log(sum(math.exp(v - m) for v in z))
        total += log_sum_exp - z[i]
    return total / n
