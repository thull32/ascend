def autoscale(start, target_pct, demand, min_replicas, max_replicas, window):
    current = start
    recs = [start] * (window - 1)
    out = []
    for d in demand:
        util = min(d, 100 * current)
        target_at_current = target_pct * current
        if abs(util - target_at_current) * 10 <= target_at_current:
            rec = current
        else:
            rec = (util + target_pct - 1) // target_pct
        rec = max(min_replicas, min(max_replicas, rec))
        recs.append(rec)
        if rec > current:
            current = min(rec, max(2 * current, current + 4))
        else:
            current = min(current, max(recs[-window:]))
        out.append(current)
    return out
