def find_path(n, adj, s, t):
    visited = [False] * n
    path = []

    def go(u):
        visited[u] = True
        path.append(u)
        if u == t:
            return True
        for v in adj[u]:
            if not visited[v] and go(v):
                return True
        path.pop()
        return False

    return path if go(s) else []
