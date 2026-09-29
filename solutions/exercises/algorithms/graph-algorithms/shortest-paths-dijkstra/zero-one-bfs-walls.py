from collections import deque


def min_walls(grid):
    rows, cols = len(grid), len(grid[0])
    dist = [[float("inf")] * cols for _ in range(rows)]
    dist[0][0] = grid[0][0]
    dq = deque([(0, 0)])
    while dq:
        r, c = dq.popleft()
        d = dist[r][c]
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                w = grid[nr][nc]
                nd = d + w
                if nd < dist[nr][nc]:
                    dist[nr][nc] = nd
                    if w == 0:
                        dq.appendleft((nr, nc))
                    else:
                        dq.append((nr, nc))
    return dist[rows - 1][cols - 1]
