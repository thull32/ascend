def fnv1a_32(s):
    h = 0x811c9dc5  # offset basis
    for ch in s:
        h ^= ord(ch)                      # 1. mix the byte in
        h = (h * 0x01000193) & 0xffffffff  # 2. multiply by the FNV prime, wrap to 32 bits
    return h
