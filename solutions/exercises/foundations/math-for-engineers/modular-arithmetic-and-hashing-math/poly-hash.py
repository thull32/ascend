def poly_hash(s, base, mod):
    h = 0
    for ch in s:
        h = (h * base + ord(ch)) % mod
    return h
