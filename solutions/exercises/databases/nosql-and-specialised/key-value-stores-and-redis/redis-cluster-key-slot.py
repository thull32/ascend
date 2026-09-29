def key_slot(key):
    start = key.find("{")
    if start != -1:
        end = key.find("}", start + 1)
        if end != -1 and end > start + 1:
            key = key[start + 1:end]

    crc = 0
    for byte in key.encode():
        crc ^= (byte << 8)
        for _ in range(8):
            if crc & 0x8000:
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF
            else:
                crc = (crc << 1) & 0xFFFF

    return crc % 16384
