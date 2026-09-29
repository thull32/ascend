# Smooth weighted round robin.

def swrr(weights, n):
    current = [0] * len(weights)
    total = sum(weights)
    out = []
    for _ in range(n):
        best = 0
        for i in range(len(weights)):
            current[i] += weights[i]
            if current[i] > current[best]:
                best = i
        current[best] -= total
        out.append(best)
    return out
