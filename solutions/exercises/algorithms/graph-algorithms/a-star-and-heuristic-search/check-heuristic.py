import heapq


def check_heuristic(n, edges, goal, h):
    radj = [[] for _ in range(n)]
    for u, v, w in edges:
        radj[v].append((u, w))

    INF = float("inf")
    dist = [INF] * n
    dist[goal] = 0
    heap = [(0, goal)]
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in radj[u]:
            nd = d + w
            if nd < dist[v]:
                dist[v] = nd
                heapq.heappush(heap, (nd, v))

    admissible = True
    for v in range(n):
        if dist[v] != INF and h[v] > dist[v]:
            admissible = False
            break

    consistent = h[goal] == 0
    if consistent:
        for u, v, w in edges:
            if h[u] > w + h[v]:
                consistent = False
                break

    return {"admissible": admissible, "consistent": consistent}
