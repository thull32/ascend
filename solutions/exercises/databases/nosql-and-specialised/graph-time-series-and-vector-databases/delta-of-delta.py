def _dod_bits(dod):
    if dod == 0:
        return 1
    if -63 <= dod <= 64:
        return 9
    if -255 <= dod <= 256:
        return 12
    if -2047 <= dod <= 2048:
        return 16
    return 36


def encode_timestamps(ts):
    if not ts:
        return {"encoded": [], "bits": 0}
    if len(ts) == 1:
        return {"encoded": [ts[0]], "bits": 64}

    encoded = [ts[0], ts[1] - ts[0]]
    bits = 64 + 32
    prev_delta = ts[1] - ts[0]

    for i in range(2, len(ts)):
        delta = ts[i] - ts[i - 1]
        dod = delta - prev_delta
        encoded.append(dod)
        bits += _dod_bits(dod)
        prev_delta = delta

    return {"encoded": encoded, "bits": bits}
