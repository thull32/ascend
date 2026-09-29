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


def longest_palindrome(s):
    if not s:
        return ""

    P = _manacher(s)
    best_len = -1
    best_i = 0
    for i, p in enumerate(P):
        if p > best_len:
            best_len = p
            best_i = i

    start = (best_i - best_len) // 2
    end = (best_i + best_len) // 2
    return s[start:end]
