def find_bridges(n, edges):
    adj = [[] for _ in range(n)]
    for i, (u, v) in enumerate(edges):
        adj[u].append((v, i))
        adj[v].append((u, i))

    disc = [-1] * n
    low = [0] * n
    counter = [0]
    bridges = []

    def dfs(u, parent_edge):
        disc[u] = low[u] = counter[0]
        counter[0] += 1
        for v, ei in adj[u]:
            if ei == parent_edge:
                continue
            if disc[v] == -1:
                dfs(v, ei)
                low[u] = min(low[u], low[v])
                if low[v] > disc[u]:
                    bridges.append([min(u, v), max(u, v)])
            else:
                low[u] = min(low[u], disc[v])

    for i in range(n):
        if disc[i] == -1:
            dfs(i, -1)

    bridges.sort()
    return bridges
