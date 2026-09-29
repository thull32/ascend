def backoff_schedule(base_ms, cap_ms, draws):
    sleeps = []
    for i, d in enumerate(draws):
        window = min(cap_ms, base_ms * 2 ** i)
        sleeps.append(int(d * window))
    return sleeps
