import math


def _units(n_bytes, unit_size):
    return max(1, math.ceil(n_bytes / unit_size))


def capacity_units(op, sizes, strong):
    if op == "get":
        total = sum(_units(s, 4096) for s in sizes)
        return total if strong else total / 2
    if op == "query":
        total = _units(sum(sizes), 4096)
        return total if strong else total / 2
    if op == "transact_get":
        total = sum(_units(s, 4096) for s in sizes)
        return total * 2
    if op == "write":
        return sum(_units(s, 1024) for s in sizes)
    if op == "transact_write":
        return sum(_units(s, 1024) for s in sizes) * 2
    raise ValueError(op)
