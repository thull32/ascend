import sys


def strongly_connected_components(n, edges):
    sys.setrecursionlimit(10000)
    adj = [[] for _ in range(n)]
    for u, v in edges:
        adj[u].append(v)

    disc = [-1] * n
    low = [0] * n
    on_stack = [False] * n
    stack = []
    counter = [0]
    result = []

    def dfs(u):
        disc[u] = low[u] = counter[0]
        counter[0] += 1
        stack.append(u)
        on_stack[u] = True
        for v in adj[u]:
            if disc[v] == -1:
                dfs(v)
                low[u] = min(low[u], low[v])
            elif on_stack[v]:
                low[u] = min(low[u], disc[v])
        if low[u] == disc[u]:
            comp = []
            while True:
                w = stack.pop()
                on_stack[w] = False
                comp.append(w)
                if w == u:
                    break
            comp.sort()
            result.append(comp)

    for i in range(n):
        if disc[i] == -1:
            dfs(i)

    result.sort(key=lambda c: c[0])
    return result
