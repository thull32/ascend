def min_path_sum(grid):
    m = len(grid)
    n = len(grid[0])
    row = [float("inf")] * n
    row[0] = 0
    for r in range(m):
        for c in range(n):
            left = row[c - 1] if c > 0 else float("inf")
            up = row[c]
            row[c] = grid[r][c] + min(left, up)
    return row[n - 1]
