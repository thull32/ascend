# Encode a non-negative integer as a protobuf varint.

def encode_varint(n):
    out = []
    while True:
        byte, n = n % 128, n // 128
        if n:
            out.append(byte + 128)
        else:
            out.append(byte)
            return out
