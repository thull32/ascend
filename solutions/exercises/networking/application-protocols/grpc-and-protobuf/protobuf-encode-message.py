# Encode a protobuf message from [field_number, value] pairs.
# Integers use wire type 0; strings use wire type 2.

def encode_varint(n):
    out = []
    while True:
        byte, n = n % 128, n // 128
        if n:
            out.append(byte + 128)
        else:
            out.append(byte)
            return out


def encode_message(fields):
    out = []
    for field_number, value in fields:
        if isinstance(value, str):
            tag = (field_number << 3) | 2
            out.extend(encode_varint(tag))
            data = value.encode("utf-8")
            out.extend(encode_varint(len(data)))
            out.extend(data)
        else:
            tag = (field_number << 3) | 0
            out.extend(encode_varint(tag))
            out.extend(encode_varint(value))
    return out
