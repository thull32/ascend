# LCP array via Kasai's algorithm: walk text positions in order, and reuse
# (previous match length - 1) as the starting point for the next
# comparison instead of starting over from zero.


def suffix_array(s):
    return sorted(range(len(s)), key=lambda i: s[i:])


def lcp_array(s):
    n = len(s)
    if n == 0:
        return []

    sa = suffix_array(s)
    rank = [0] * n
    for pos, suf in enumerate(sa):
        rank[suf] = pos

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
