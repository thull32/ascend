# HPACK prefix integer encoding (RFC 7541, section 5.1).

def hpack_int(value, prefix_bits):
    out = []
    limit = 2 ** prefix_bits - 1
    if value < limit:
        out.append(value)
        return out
    out.append(limit)
    remainder = value - limit
    while remainder >= 128:
        out.append(remainder % 128 + 128)
        remainder //= 128
    out.append(remainder)
    return out
