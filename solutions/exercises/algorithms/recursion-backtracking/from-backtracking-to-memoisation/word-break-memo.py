def word_break(s, words):
    word_set = set(words)
    max_len = max((len(w) for w in words), default=0)
    n = len(s)
    memo = {}

    def can(i):
        if i == n:
            return True
        if i in memo:
            return memo[i]
        result = False
        for j in range(i + 1, min(n, i + max_len) + 1):
            if s[i:j] in word_set and can(j):
                result = True
                break
        memo[i] = result
        return result

    return can(0)
