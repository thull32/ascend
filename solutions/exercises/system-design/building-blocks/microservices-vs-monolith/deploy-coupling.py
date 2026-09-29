def coupling(access):
    table_services = {}
    table_writers = {}
    services = set()

    for service, table, mode in access:
        services.add(service)
        table_services.setdefault(table, set()).add(service)
        if mode == "w":
            table_writers.setdefault(table, set()).add(service)

    multi_writer = sorted(t for t, s in table_writers.items() if len(s) >= 2)

    parent = {s: s for s in services}

    def find(x):
        while parent[x] != x:
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for svcs in table_services.values():
        svcs = list(svcs)
        for i in range(1, len(svcs)):
            union(svcs[0], svcs[i])

    groups = {}
    for s in services:
        r = find(s)
        groups.setdefault(r, []).append(s)

    lockstep_groups = sorted((sorted(g) for g in groups.values() if len(g) >= 2))

    return {"multi_writer": multi_writer, "lockstep_groups": lockstep_groups}
