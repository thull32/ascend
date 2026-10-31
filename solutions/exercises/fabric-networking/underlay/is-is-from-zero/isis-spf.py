# SPF over an IS-IS link-state database: two-way check, overload bit, ECMP next hops.
import heapq


def spf_next_hops(lsps, source):
    def usable(u, v):
        # Two-way check: both LSPs must list each other.
        return v in lsps and u in lsps[v]["neighbors"]

    dist = {source: 0}
    hops = {source: set()}
    done = set()
    heap = [(0, source)]
    while heap:
        d, u = heapq.heappop(heap)
        if u in done:
            continue
        done.add(u)
        if u != source and lsps[u].get("overload"):
            continue  # reachable itself, but never transit
        for v, metric in lsps[u]["neighbors"].items():
            if not usable(u, v):
                continue
            nd = d + metric
            first = {v} if u == source else hops[u]
            if v not in dist or nd < dist[v]:
                dist[v] = nd
                hops[v] = set(first)
                heapq.heappush(heap, (nd, v))
            elif nd == dist[v]:
                hops[v] |= first

    local = set(lsps[source]["prefixes"])
    routes = {}
    for node in done:
        if node == source:
            continue
        for prefix, pmetric in lsps[node]["prefixes"].items():
            if prefix in local:
                continue
            total = dist[node] + pmetric
            best = routes.get(prefix)
            if best is None or total < best[0]:
                routes[prefix] = [total, set(hops[node])]
            elif total == best[0]:
                best[1] |= hops[node]
    return {p: {"metric": m, "next_hops": sorted(h)} for p, (m, h) in routes.items()}
