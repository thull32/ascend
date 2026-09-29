# KMP search: find every (possibly overlapping) starting index of pattern
# in text in O(n + m), using the failure function so the text pointer
# never moves backwards.


def _lps(pattern):
    m = len(pattern)
    lps = [0] * m
    k = 0
    for i in range(1, m):
        while k > 0 and pattern[i] != pattern[k]:
            k = lps[k - 1]
        if pattern[i] == pattern[k]:
            k += 1
        lps[i] = k
    return lps


def kmp_find_all(text, pattern):
    n, m = len(text), len(pattern)
    out = []
    if m == 0 or n < m:
        return out

    lps = _lps(pattern)
    j = 0
    for i in range(n):
        while j > 0 and text[i] != pattern[j]:
            j = lps[j - 1]
        if text[i] == pattern[j]:
            j += 1
        if j == m:
            out.append(i - m + 1)
            j = lps[j - 1]
    return out
