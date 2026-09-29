def two_sat(n, clauses):
    size = 2 * n

    def idx(lit):
        return 2 * (abs(lit) - 1) + (1 if lit < 0 else 0)

    adj = [[] for _ in range(size)]
    for a, b in clauses:
        adj[idx(-a)].append(idx(b))
        adj[idx(-b)].append(idx(a))

    disc = [-1] * size
    low = [0] * size
    on_stack = [False] * size
    stack = []
    counter = [0]
    comp = [-1] * size
    comp_counter = [0]

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
            while True:
                w = stack.pop()
                on_stack[w] = False
                comp[w] = comp_counter[0]
                if w == u:
                    break
            comp_counter[0] += 1

    for i in range(size):
        if disc[i] == -1:
            dfs(i)

    for i in range(1, n + 1):
        if comp[idx(i)] == comp[idx(-i)]:
            return False
    return True
