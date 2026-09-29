from functools import lru_cache


def count_decodings(s):
    n = len(s)

    @lru_cache(maxsize=None)
    def frm(i):
        if i == n:
            return 1
        if s[i] == '0':
            return 0
        total = frm(i + 1)
        if i + 1 < n and 10 <= int(s[i:i + 2]) <= 26:
            total += frm(i + 2)
        return total

    result = frm(0)
    frm.cache_clear()
    return result
