def to_int32(n):
    m = 1 << 32
    v = (n + (1 << 31)) % m
    return v - (1 << 31)
