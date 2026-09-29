import heapq


def install_order(packages):
    names = list(packages.keys())
    adj = {name: [] for name in names}
    indegree = {name: 0 for name in names}
    for p, deps in packages.items():
        for d in deps:
            adj[d].append(p)
            indegree[p] += 1

    heap = [name for name in names if indegree[name] == 0]
    heapq.heapify(heap)
    order = []
    while heap:
        u = heapq.heappop(heap)
        order.append(u)
        for v in adj[u]:
            indegree[v] -= 1
            if indegree[v] == 0:
                heapq.heappush(heap, v)

    return order if len(order) == len(names) else []
