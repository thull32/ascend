# Suffix array via prefix doubling: sort suffixes by (rank[i], rank[i+k])
# pairs, using -1 as the sentinel for indices past the end, then double k
# until every rank is distinct.


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
            new_rank[sa[i]] = new_rank[sa[i - 1]]
            if key(sa[i]) != key(sa[i - 1]):
                new_rank[sa[i]] += 1
        rank = new_rank

        if rank[sa[-1]] == n - 1:
            break
        k *= 2

    return sa
