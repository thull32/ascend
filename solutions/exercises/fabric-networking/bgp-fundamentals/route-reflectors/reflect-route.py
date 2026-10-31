def reflect(route, from_peer, peers, router_id, cluster_id):
    clusters = list(route.get("cluster_list") or [])
    if route.get("originator_id") == router_id:
        return {"action": "drop", "reason": "originator-loop"}
    if cluster_id in clusters:
        return {"action": "drop", "reason": "cluster-loop"}
    kind = peers[from_peer]["kind"]
    ibgp = [n for n, p in peers.items() if p["kind"] in ("client", "non-client") and n != from_peer]
    if kind == "non-client":
        targets = [n for n in ibgp if peers[n]["kind"] == "client"]
    else:
        targets = ibgp
    out = dict(route)
    out["cluster_list"] = clusters
    if kind != "ebgp":
        out["originator_id"] = route.get("originator_id") or peers[from_peer]["router_id"]
        out["cluster_list"] = [cluster_id] + clusters
    return {"action": "send", "to": sorted(targets), "route": out}
