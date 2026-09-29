def num_islands_online(rows, cols, positions):
    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra == rb:
            return False
        parent[ra] = rb
        return True

    result = []
    count = 0
    for r, c in positions:
        key = r * cols + c
        if key in parent:
            result.append(count)
            continue
        parent[key] = key
        count += 1
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                nkey = nr * cols + nc
                if nkey in parent and union(key, nkey):
                    count -= 1
        result.append(count)
    return result
