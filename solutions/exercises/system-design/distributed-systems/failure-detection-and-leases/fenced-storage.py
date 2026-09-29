def fenced_store(ops):
    value = {}
    highest = {}
    out = []

    for op in ops:
        kind, key = op[0], op[1]
        token = op[2]
        h = highest.get(key, 0)
        if kind == "write":
            val = op[3]
            if token >= h:
                value[key] = val
                highest[key] = token
                out.append("ok")
            else:
                out.append("rejected")
        else:  # read
            if token >= h:
                highest[key] = token
                out.append(value.get(key))
            else:
                out.append("rejected")

    return out
