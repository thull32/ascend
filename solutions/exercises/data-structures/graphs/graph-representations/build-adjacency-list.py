def adjacency_list(n, edges, directed):
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)
        if not directed:
            adj[v].append(u)
    for neighbours in adj:
        neighbours.sort()
    return adj
