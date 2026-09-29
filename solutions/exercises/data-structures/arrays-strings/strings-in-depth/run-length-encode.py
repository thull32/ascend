def run_length_encode(s):
    parts = []
    i = 0
    n = len(s)
    while i < n:
        j = i
        while j < n and s[j] == s[i]:
            j += 1
        run_len = j - i
        parts.append(s[i])
        if run_len > 1:
            parts.append(str(run_len))
        i = j
    return "".join(parts)
