def max_matching(n_left, n_right, edges):
    adj = [[] for _ in range(n_left)]
    for u, v in edges:
        adj[u].append(v)
    match_right = [-1] * n_right

    def try_assign(u, seen):
        for v in adj[u]:
            if v in seen:
                continue
            seen.add(v)
            if match_right[v] == -1 or try_assign(match_right[v], seen):
                match_right[v] = u
                return True
        return False

    result = 0
    for u in range(n_left):
        if try_assign(u, set()):
            result += 1
    return result
