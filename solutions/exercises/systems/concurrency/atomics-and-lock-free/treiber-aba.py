def treiber(initial, ops, tagged):
    nxt = {}
    for i in range(len(initial) - 1):
        nxt[initial[i]] = initial[i + 1]
    if initial:
        nxt[initial[-1]] = None

    head = initial[0] if initial else None
    version = 0
    recorded_head = {}
    recorded_next = {}
    recorded_version = {}
    cas_results = []

    for op in ops:
        kind = op[1]
        if kind == "pop":
            head = nxt[head]
            version += 1
        elif kind == "push":
            n = op[2]
            nxt[n] = head
            head = n
            version += 1
        elif kind == "read":
            t = op[0]
            recorded_head[t] = head
            recorded_next[t] = nxt.get(head)
            recorded_version[t] = version
        else:  # cas
            t = op[0]
            ok = head == recorded_head[t]
            if tagged:
                ok = ok and version == recorded_version[t]
            if ok:
                head = recorded_next[t]
                version += 1
            cas_results.append(ok)

    stack = []
    node = head
    while node is not None and len(stack) < 10:
        stack.append(node)
        node = nxt.get(node)

    return {"stack": stack, "cas": cas_results}
