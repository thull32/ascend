def vector_clocks(n, events, queries):
    proc_vec = [[0] * n for _ in range(n)]
    msgs = {}
    clocks = []

    for ev in events:
        kind = ev[0]
        if kind == "local":
            p = ev[1]
            proc_vec[p][p] += 1
            clocks.append(list(proc_vec[p]))
        elif kind == "send":
            p, msg = ev[1], ev[2]
            proc_vec[p][p] += 1
            msgs[msg] = list(proc_vec[p])
            clocks.append(list(proc_vec[p]))
        else:  # recv
            p, msg = ev[1], ev[2]
            carried = msgs[msg]
            proc_vec[p] = [max(a, b) for a, b in zip(proc_vec[p], carried)]
            proc_vec[p][p] += 1
            clocks.append(list(proc_vec[p]))

    def dominates(a, b):
        return all(x <= y for x, y in zip(a, b))

    relations = []
    for i, j in queries:
        a, b = clocks[i], clocks[j]
        if a == b:
            relations.append("equal")
        elif dominates(a, b):
            relations.append("before")
        elif dominates(b, a):
            relations.append("after")
        else:
            relations.append("concurrent")

    return {"clocks": clocks, "relations": relations}
