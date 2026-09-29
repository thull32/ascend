def _manacher(s):
    T = "#" + "#".join(s) + "#"
    n = len(T)
    P = [0] * n
    C = R = 0
    for i in range(n):
        if i < R:
            mirror = 2 * C - i
            P[i] = min(P[mirror], R - i)
        while (
            i - P[i] - 1 >= 0
            and i + P[i] + 1 < n
            and T[i - P[i] - 1] == T[i + P[i] + 1]
        ):
            P[i] += 1
        if i + P[i] > R:
            C = i
            R = i + P[i]
    return P


def palindrome_queries(s, queries):
    if not s:
        return []

    P = _manacher(s)
    result = []
    for l, r in queries:
        idx = l + r + 1
        length = r - l + 1
        result.append(P[idx] >= length)
    return result
