import math


def masked_nll(probs, mask):
    total = 0.0
    count = 0
    for p, m in zip(probs, mask):
        if m == 1:
            total += -math.log(p)
            count += 1
    if count == 0:
        return 0.0
    return total / count
