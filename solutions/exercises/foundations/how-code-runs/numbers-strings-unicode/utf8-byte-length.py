def utf8_length(s):
    total = 0
    for ch in s:
        cp = ord(ch)
        if cp < 0x80:
            total += 1
        elif cp < 0x800:
            total += 2
        elif cp < 0x10000:
            total += 3
        else:
            total += 4
    return total
