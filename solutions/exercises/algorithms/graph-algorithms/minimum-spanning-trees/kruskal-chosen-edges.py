def kruskal_edges(n, edges):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    order = sorted(range(len(edges)), key=lambda i: (edges[i][2], i))
    chosen = []
    for i in order:
        u, v, _ = edges[i]
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
            chosen.append(i)
    return chosen
