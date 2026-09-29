def recall_at_k(retrieved, truth, k):
    total = 0.0
    for r, t in zip(retrieved, truth):
        r_set = set(r[:k])
        t_set = set(t[:k])
        total += len(r_set & t_set) / k
    return total / len(retrieved)
