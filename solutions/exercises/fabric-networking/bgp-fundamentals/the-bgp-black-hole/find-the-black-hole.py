def walk_packet(fibs, loopbacks, start, dst, ttl):
    def to_int(ip):
        a, b, c, d = (int(x) for x in ip.split("."))
        return (a << 24) | (b << 16) | (c << 8) | d

    def lookup(router, addr):
        x, best = to_int(addr), None
        for prefix, action in fibs[router]:
            net, length = prefix.split("/")
            length = int(length)
            mask = ((1 << 32) - 1) ^ ((1 << (32 - length)) - 1)
            if (x & mask) == (to_int(net) & mask) and (best is None or length > best[0]):
                best = (length, action)
        return best

    router, stack, path = start, [dst], [start]
    while True:
        match = lookup(router, stack[-1])
        if match is None:
            return {"path": path, "outcome": f"no route at {router}"}
        action = match[1]
        if action == "local":
            if len(stack) == 1:
                return {"path": path, "outcome": f"delivered at {router}"}
            stack.pop()
            continue
        if action.startswith("vxlan:"):
            stack.append(loopbacks[action[len("vxlan:"):]])
            continue
        if ttl == 0:
            return {"path": path, "outcome": f"ttl expired at {router}"}
        ttl -= 1
        router = action
        path.append(router)
