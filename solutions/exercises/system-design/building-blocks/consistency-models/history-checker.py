def check_history(history, model):
    n = len(history)
    if n == 0:
        return True

    must_before = [set() for _ in range(n)]
    for i in range(n):
        ci, ki, vi, si, ei = history[i]
        for j in range(n):
            if i == j:
                continue
            cj, kj, vj, sj, ej = history[j]
            if model == "linearizable":
                if ei < sj:
                    must_before[j].add(i)
            else:  # sequential
                if ci == cj and si < sj:
                    must_before[j].add(i)

    memo = {}

    def dfs(placed, value):
        if len(placed) == n:
            return True
        key = (placed, value)
        if key in memo:
            return memo[key]
        result = False
        for j in range(n):
            if j in placed:
                continue
            if not must_before[j].issubset(placed):
                continue
            kind, val = history[j][1], history[j][2]
            if kind == "r":
                if val != value:
                    continue
                if dfs(placed | {j}, value):
                    result = True
                    break
            else:
                if dfs(placed | {j}, val):
                    result = True
                    break
        memo[key] = result
        return result

    return dfs(frozenset(), 0)
