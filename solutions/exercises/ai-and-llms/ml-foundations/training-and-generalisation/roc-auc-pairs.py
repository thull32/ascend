def roc_auc(labels, scores):
    pos = [s for l, s in zip(labels, scores) if l == 1]
    neg = [s for l, s in zip(labels, scores) if l == 0]
    if not pos or not neg:
        return None

    total = 0.0
    for p in pos:
        for n in neg:
            if p > n:
                total += 1
            elif p == n:
                total += 0.5
    return total / (len(pos) * len(neg))
