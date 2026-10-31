def circuits_at_risk(circuits, demand):
    def pair(a, b):
        return tuple(sorted((a, b)))

    need = {pair(a, b): gbps for a, b, gbps in demand}
    at_risk = []
    for failed in circuits:
        survivors = {}
        for c in circuits:
            if c is not failed:
                survivors.setdefault(pair(c[1], c[2]), []).append(c)
        broken = False
        for p, gbps in need.items():
            if gbps <= 0:
                continue
            up = survivors.get(p, [])
            if not up:
                broken = True
                break
            share = gbps / len(up)
            if any(share > c[3] for c in up):
                broken = True
                break
        if broken:
            at_risk.append(failed[0])
    return at_risk
