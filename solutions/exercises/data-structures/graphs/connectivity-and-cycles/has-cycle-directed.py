def has_cycle_directed(n, edges):
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)

    colour = [0] * n  # 0 = white, 1 = grey, 2 = black

    def dfs(u):
        colour[u] = 1
        for v in adj[u]:
            if colour[v] == 1:
                return True
            if colour[v] == 0 and dfs(v):
                return True
        colour[u] = 2
        return False

    for start in range(n):
        if colour[start] == 0 and dfs(start):
            return True
    return False
