def poly_hash(s, base, m):
    h = 0
    for ch in s:
        h = (h * base + ord(ch)) % m
    return h
