def index_provides_sort(index, equality, sort):
    equality_set = set(equality)
    remaining = [s for s in sort if s[0] not in equality_set]
    if not remaining:
        return True

    index_fields = [c[0] for c in index]
    first_field, first_dir = remaining[0]
    if first_field not in index_fields:
        return False
    p = index_fields.index(first_field)

    for c in index[:p]:
        if c[0] not in equality_set:
            return False

    n = len(remaining)
    if p + n > len(index):
        return False

    matching = index[p:p + n]
    for (sf, _sd), (idxf, _idxd) in zip(remaining, matching):
        if sf != idxf:
            return False

    same = all(sd == idxd for (_, sd), (_, idxd) in zip(remaining, matching))
    opposite = all(sd == -idxd for (_, sd), (_, idxd) in zip(remaining, matching))
    return same or opposite
