# KMP failure (LPS) function: lps[i] is the length of the longest proper
# prefix of pattern[0..i] that is also a suffix of it. O(m) via fall-back
# through lps[k - 1] on a mismatch.


def failure_function(pattern):
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
