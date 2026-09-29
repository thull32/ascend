def dfs_order(n, adj, start):
    order = []
    visited = [False] * n
    stack = [start]
    while stack:
        u = stack.pop()
        if visited[u]:
            continue
        visited[u] = True
        order.append(u)
        for v in reversed(adj[u]):
            stack.append(v)
    return order
