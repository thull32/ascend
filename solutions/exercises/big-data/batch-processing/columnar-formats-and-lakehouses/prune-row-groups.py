def prune_row_groups(stats, lo, hi):
    result = []
    for i, (mn, mx) in enumerate(stats):
        if mn is None:
            continue
        if lo is not None and mx < lo:
            continue
        if hi is not None and mn > hi:
            continue
        result.append(i)
    return result
