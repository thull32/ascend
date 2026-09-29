def internet_checksum(data):
    total = 0
    for i in range(0, len(data), 2):
        hi = data[i]
        lo = data[i + 1] if i + 1 < len(data) else 0
        total += (hi << 8) | lo
        total = (total & 0xFFFF) + (total >> 16)
    return (~total) & 0xFFFF
