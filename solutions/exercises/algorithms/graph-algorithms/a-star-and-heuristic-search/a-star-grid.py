import heapq


def a_star_grid(grid, start, goal):
    rows, cols = len(grid), len(grid[0])
    sr, sc = start
    gr, gc = goal

    def h(r, c):
        return abs(r - gr) + abs(c - gc)

    g = {(sr, sc): 0}
    heap = [(h(sr, sc), 0, sr, sc)]
    closed = set()

    while heap:
        f, cur_g, r, c = heapq.heappop(heap)
        if (r, c) == (gr, gc):
            return cur_g
        if (r, c) in closed:
            continue
        closed.add((r, c))
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 0:
                ng = cur_g + 1
                if ng < g.get((nr, nc), float("inf")):
                    g[(nr, nc)] = ng
                    heapq.heappush(heap, (ng + h(nr, nc), ng, nr, nc))

    return -1
