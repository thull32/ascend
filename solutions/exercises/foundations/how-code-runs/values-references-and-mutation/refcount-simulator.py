def refcount_trace(ops):
    names = {}
    counts = {}
    freed = []
    next_id = 0

    for op in ops:
        kind = op[0]
        if kind == "assign":
            name, src = op[1], op[2]
            if src == "new":
                next_id += 1
                obj = next_id
                counts[obj] = 1
            else:
                obj = names[src]
                counts[obj] = counts.get(obj, 0) + 1
            old = names.get(name)
            names[name] = obj
            if old is not None:
                counts[old] -= 1
                if counts[old] == 0:
                    freed.append(old)
        elif kind == "del":
            name = op[1]
            old = names.pop(name)
            counts[old] -= 1
            if counts[old] == 0:
                freed.append(old)
    return freed
