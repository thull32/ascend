def resolve_route(routes, dst):
    def to_int(ip):
        a, b, c, d = (int(x) for x in ip.split("."))
        return (a << 24) | (b << 16) | (c << 8) | d

    table = []
    for prefix, hops in routes:
        net, length = prefix.split("/")
        length = int(length)
        mask = ((1 << 32) - 1) ^ ((1 << (32 - length)) - 1) if length else 0
        table.append((length, to_int(net) & mask, mask, prefix, hops))

    def matches(ip, allow_default):
        a = to_int(ip)
        found = [r for r in table if a & r[2] == r[1] and (allow_default or r[0] > 0)]
        return sorted(found, key=lambda r: -r[0])

    def expand(route, chain):
        out = set()
        for hop in route[4]:
            if hop.startswith("if:"):
                continue
            nxt = matches(hop, False)
            if not nxt:
                continue
            best = nxt[0]
            if best[3] in chain:
                continue
            if any(h.startswith("if:") for h in best[4]):
                out.add((hop, best[4][0][3:]))
            else:
                out |= expand(best, chain + (best[3],))
        return out

    for route in matches(dst, True):
        if any(h.startswith("if:") for h in route[4]):
            return [[dst, route[4][0][3:]]]
        pairs = expand(route, (route[3],))
        if pairs:
            return [list(p) for p in sorted(pairs)]
    return []
