def bellman_ford(n, edges, src):
    INF = float("inf")
    dist = [INF] * n
    dist[src] = 0

    for _ in range(n - 1):
        changed = False
        for u, v, w in edges:
            if dist[u] != INF and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                changed = True
        if not changed:
            break

    for u, v, w in edges:
        if dist[u] != INF and dist[u] + w < dist[v]:
            return {"dist": [], "negativeCycle": True}

    return {"dist": [d if d != INF else None for d in dist], "negativeCycle": False}
