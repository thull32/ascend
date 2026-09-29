# Encode a protobuf sint64 value: ZigZag map, then varint-encode.

def encode_sint(n):
    z = 2 * n if n >= 0 else -2 * n - 1
    out = []
    while True:
        byte, z = z % 128, z // 128
        if z:
            out.append(byte + 128)
        else:
            out.append(byte)
            return out
