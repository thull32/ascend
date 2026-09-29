from collections import deque


def longest_path_dag(n, edges):
    adj = [[] for _ in range(n)]
    indegree = [0] * n
    for u, v in edges:
        adj[u].append(v)
        indegree[v] += 1

    queue = deque(v for v in range(n) if indegree[v] == 0)
    order = []
    while queue:
        u = queue.popleft()
        order.append(u)
        for v in adj[u]:
            indegree[v] -= 1
            if indegree[v] == 0:
                queue.append(v)

    if len(order) != n:
        return -1

    best = [0] * n
    for u in order:
        for v in adj[u]:
            if best[u] + 1 > best[v]:
                best[v] = best[u] + 1

    return max(best) if n > 0 else 0
