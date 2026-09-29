def crc32(s):
    crc = 0xFFFFFFFF
    for byte in s.encode():
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xEDB88320
            else:
                crc = crc >> 1
    return crc ^ 0xFFFFFFFF
