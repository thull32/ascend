def reservoir_sample(stream, k, draws):
    reservoir = list(stream[:k])
    for i in range(k, len(stream)):
        d = draws[i - k]
        if d < k:
            reservoir[d] = stream[i]
    return reservoir
