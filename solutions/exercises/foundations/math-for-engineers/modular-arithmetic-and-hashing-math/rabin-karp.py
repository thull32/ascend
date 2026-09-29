def rabin_karp(text, pattern, base, mod):
    n, m = len(text), len(pattern)
    if m > n:
        return []

    high = 1
    for _ in range(m - 1):
        high = (high * base) % mod

    p_hash = 0
    for ch in pattern:
        p_hash = (p_hash * base + ord(ch)) % mod

    h = 0
    for i in range(m):
        h = (h * base + ord(text[i])) % mod

    result = []
    for i in range(n - m + 1):
        if h == p_hash and text[i:i + m] == pattern:
            result.append(i)
        if i + m < n:
            h = (h - ord(text[i]) * high % mod + mod) % mod
            h = (h * base + ord(text[i + m])) % mod
    return result
