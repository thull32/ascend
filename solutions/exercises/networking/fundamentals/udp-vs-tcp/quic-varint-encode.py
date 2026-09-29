def quic_varint(n):
    if n < 2 ** 6:
        length = 1
    elif n < 2 ** 14:
        length = 2
    elif n < 2 ** 30:
        length = 4
    else:
        length = 8

    length_bits = {1: 0, 2: 1, 4: 2, 8: 3}[length]
    value = n | (length_bits << (8 * length - 2))

    return format(value, "0" + str(length * 2) + "x")
