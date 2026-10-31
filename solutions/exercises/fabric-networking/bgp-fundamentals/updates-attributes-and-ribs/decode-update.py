# Decode a BGP UPDATE: withdrawn prefixes, attribute type codes in order, announced prefixes.

def decode_update(msg):
    def prefixes(start, end):
        out, i = [], start
        while i < end:
            length = msg[i]
            n = (length + 7) // 8
            octets = list(msg[i + 1:i + 1 + n]) + [0] * (4 - n)
            out.append(".".join(str(o) for o in octets) + "/" + str(length))
            i += 1 + n
        return out

    total = (msg[16] << 8) | msg[17]
    wlen = (msg[19] << 8) | msg[20]
    withdrawn = prefixes(21, 21 + wlen)
    a = 21 + wlen
    alen = (msg[a] << 8) | msg[a + 1]
    i, end, codes = a + 2, a + 2 + alen, []
    while i < end:
        flags, code = msg[i], msg[i + 1]
        if flags & 0x10:
            vlen, hdr = (msg[i + 2] << 8) | msg[i + 3], 4
        else:
            vlen, hdr = msg[i + 2], 3
        codes.append(code)
        i += hdr + vlen
    return {"withdrawn": withdrawn, "attributes": codes, "nlri": prefixes(end, total)}
