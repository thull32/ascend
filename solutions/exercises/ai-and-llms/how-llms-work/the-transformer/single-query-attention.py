import math


def attend(q, keys, values):
    d = len(q)
    scores = [sum(qi * ki for qi, ki in zip(q, k)) / math.sqrt(d) for k in keys]
    m = max(scores)
    exps = [math.exp(s - m) for s in scores]
    total = sum(exps)
    weights = [e / total for e in exps]

    dim = len(values[0])
    output = [0.0] * dim
    for w, v in zip(weights, values):
        for c in range(dim):
            output[c] += w * v[c]
    return output
