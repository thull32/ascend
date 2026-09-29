def earliest_full_connection(n, logs):
    parent = list(range(n))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    components = n
    for t, u, v in sorted(logs, key=lambda log: log[0]):
        ru, rv = find(u), find(v)
        if ru != rv:
            parent[ru] = rv
            components -= 1
            if components == 1:
                return t
    return -1
