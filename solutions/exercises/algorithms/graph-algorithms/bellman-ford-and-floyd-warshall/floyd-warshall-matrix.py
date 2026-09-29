def floyd_warshall(n, edges):
    INF = float("inf")
    d = [[INF] * n for _ in range(n)]
    for i in range(n):
        d[i][i] = 0
    for u, v, w in edges:
        if w < d[u][v]:
            d[u][v] = w

    for k in range(n):
        for i in range(n):
            if d[i][k] == INF:
                continue
            for j in range(n):
                nd = d[i][k] + d[k][j]
                if nd < d[i][j]:
                    d[i][j] = nd

    return [[x if x != INF else None for x in row] for row in d]
