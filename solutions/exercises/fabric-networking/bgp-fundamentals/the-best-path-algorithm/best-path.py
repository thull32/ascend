# Pick BGP's best path with the decision process, set-wise, and name the step that decided.

ORIGIN_RANK = {"IGP": 0, "EGP": 1, "INCOMPLETE": 2}


def best_path(paths, always_compare_med):
    def rid(p):
        a, b, c, d = (int(x) for x in p["router_id"].split("."))
        return ((a * 256 + b) * 256 + c) * 256 + d

    def med(p):
        return p.get("med") or 0

    def keep(alive, key, highest):
        values = [key(p) for p in alive]
        target = max(values) if highest else min(values)
        return [p for p in alive if key(p) == target]

    def med_step(alive):
        groups = {}
        for p in alive:
            g = "all" if always_compare_med else (p["as_path"][0] if p["as_path"] else 0)
            groups.setdefault(g, []).append(p)
        kept = []
        for group in groups.values():
            low = min(med(p) for p in group)
            kept += [p for p in group if med(p) == low]
        return [p for p in alive if p in kept]

    steps = [
        ("weight", lambda a: keep(a, lambda p: p.get("weight", 0), True)),
        ("local_pref", lambda a: keep(a, lambda p: p.get("local_pref", 100), True)),
        ("locally_originated", lambda a: keep(a, lambda p: 1 if p.get("local", False) else 0, True)),
        ("as_path", lambda a: keep(a, lambda p: len(p["as_path"]), False)),
        ("origin", lambda a: keep(a, lambda p: ORIGIN_RANK[p["origin"]], False)),
        ("med", med_step),
        ("ebgp", lambda a: keep(a, lambda p: 1 if p["ebgp"] else 0, True)),
        ("igp_cost", lambda a: keep(a, lambda p: p["igp_cost"], False)),
        ("router_id", lambda a: keep(a, rid, False)),
    ]
    alive = list(paths)
    if len(alive) == 1:
        return [alive[0]["id"], "only_path"]
    for name, step in steps:
        alive = step(alive)
        if len(alive) == 1:
            return [alive[0]["id"], name]
    return [alive[0]["id"], "router_id"]
