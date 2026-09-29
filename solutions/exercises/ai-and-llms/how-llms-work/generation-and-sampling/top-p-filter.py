def top_p_filter(probs, p):
    n = len(probs)
    order = sorted(range(n), key=lambda i: (-probs[i], i))

    kept = []
    cum = 0.0
    for i in order:
        kept.append(i)
        cum += probs[i]
        if cum >= p:
            break

    total = sum(probs[i] for i in kept)
    result = [0.0] * n
    for i in kept:
        result[i] = probs[i] / total
    return result
