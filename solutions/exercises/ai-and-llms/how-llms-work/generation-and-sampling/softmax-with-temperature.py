import math


def softmax(logits, temperature):
    z = [x / temperature for x in logits]
    m = max(z)
    exps = [math.exp(v - m) for v in z]
    total = sum(exps)
    return [e / total for e in exps]
