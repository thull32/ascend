def suffix_array(s):
    n = len(s)
    if n == 0:
        return []

    sa = list(range(n))
    rank = [ord(c) for c in s]
    k = 1

    while True:
        def key(i):
            return (rank[i], rank[i + k] if i + k < n else -1)

        sa.sort(key=key)
        new_rank = [0] * n
        new_rank[sa[0]] = 0
        for i in range(1, n):
            new_rank[sa[i]] = new_rank[sa[i - 1]] + (
                1 if key(sa[i]) != key(sa[i - 1]) else 0
            )
        rank = new_rank
        if rank[sa[-1]] == n - 1:
            break
        k *= 2

    return sa


def lcp_array(s):
    n = len(s)
    if n == 0:
        return []

    sa = suffix_array(s)
    rank = [0] * n
    for i, p in enumerate(sa):
        rank[p] = i

    lcp = [0] * n
    h = 0
    for i in range(n):
        if rank[i] > 0:
            j = sa[rank[i] - 1]
            while i + h < n and j + h < n and s[i + h] == s[j + h]:
                h += 1
            lcp[rank[i]] = h
            if h > 0:
                h -= 1
        else:
            h = 0

    return lcp
