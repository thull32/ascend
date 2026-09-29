_ORIGIN_RANK = {"igp": 0, "egp": 1, "incomplete": 2}


def _ip_to_int(ip):
    parts = [int(p) for p in ip.split(".")]
    value = 0
    for p in parts:
        value = value * 256 + p
    return value


def bgp_best_path(routes):
    candidates = list(routes)

    # 1. highest local_pref
    best = max(c["local_pref"] for c in candidates)
    candidates = [c for c in candidates if c["local_pref"] == best]

    # 2. shortest as_path
    best = min(len(c["as_path"]) for c in candidates)
    candidates = [c for c in candidates if len(c["as_path"]) == best]

    # 3. best origin
    best = min(_ORIGIN_RANK[c["origin"]] for c in candidates)
    candidates = [c for c in candidates if _ORIGIN_RANK[c["origin"]] == best]

    # 4. MED, compared only within the same neighbouring AS (as_path[0])
    med_by_neighbor = {}
    for c in candidates:
        neighbor = c["as_path"][0]
        med_by_neighbor[neighbor] = min(
            med_by_neighbor.get(neighbor, c["med"]), c["med"]
        )
    candidates = [
        c for c in candidates if c["med"] == med_by_neighbor[c["as_path"][0]]
    ]

    # 5. eBGP over iBGP
    if any(c["ebgp"] for c in candidates):
        candidates = [c for c in candidates if c["ebgp"]]

    # 6. lowest igp_cost
    best = min(c["igp_cost"] for c in candidates)
    candidates = [c for c in candidates if c["igp_cost"] == best]

    # 7. lowest router_id, compared numerically
    best = min(_ip_to_int(c["router_id"]) for c in candidates)
    candidates = [c for c in candidates if _ip_to_int(c["router_id"]) == best]

    return candidates[0]["id"]
