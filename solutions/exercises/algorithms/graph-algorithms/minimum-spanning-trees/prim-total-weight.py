import heapq


def prim_mst(n, edges):
    adj = [[] for _ in range(n)]
    for u, v, w in edges:
        adj[u].append((v, w))
        adj[v].append((u, w))

    visited = [False] * n
    heap = [(0, 0)]
    total = 0
    settled = 0
    while heap and settled < n:
        w, u = heapq.heappop(heap)
        if visited[u]:
            continue
        visited[u] = True
        settled += 1
        total += w
        for v, vw in adj[u]:
            if not visited[v]:
                heapq.heappush(heap, (vw, v))

    return total if settled == n else -1
