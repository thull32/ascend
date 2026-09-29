def backoff_schedule(base_ms, cap_ms, deadline_ms, draws):
    sleeps = []
    total = 0
    for i, draw in enumerate(draws):
        ceiling = min(cap_ms, base_ms * 2 ** i)
        sleep = ceiling * draw // 1000
        if total + sleep > deadline_ms:
            break
        sleeps.append(sleep)
        total += sleep
    return sleeps
