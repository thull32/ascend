import itertools


def quorum(n):
    return n // 2 + 1


def _satisfies(dist, cl, dc, rf):
    total = sum(dist.values())
    n = sum(rf.values())
    if cl == "ONE":
        return total >= 1
    if cl == "TWO":
        return total >= 2
    if cl == "QUORUM":
        return total >= quorum(n)
    if cl == "LOCAL_ONE":
        return dist[dc] >= 1
    if cl == "LOCAL_QUORUM":
        return dist[dc] >= quorum(rf[dc])
    if cl == "EACH_QUORUM":
        return all(dist[d] >= quorum(rf[d]) for d in rf)
    if cl == "ALL":
        return total >= n
    raise ValueError(cl)


def _valid_distributions(rf, cl, dc):
    dcs = list(rf.keys())
    ranges = [range(rf[d] + 1) for d in dcs]
    out = []
    for combo in itertools.product(*ranges):
        dist = dict(zip(dcs, combo))
        if _satisfies(dist, cl, dc, rf):
            out.append(dist)
    return out


def min_overlap(rf, write_cl, write_dc, read_cl, read_dc):
    write_dists = _valid_distributions(rf, write_cl, write_dc)
    read_dists = _valid_distributions(rf, read_cl, read_dc)

    best = None
    for w in write_dists:
        for r in read_dists:
            overlap = sum(max(0, w[d] + r[d] - rf[d]) for d in rf)
            if best is None or overlap < best:
                best = overlap
    return best
