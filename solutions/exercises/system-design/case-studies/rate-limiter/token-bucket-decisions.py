def token_bucket(capacity, rate, times):
    tokens = capacity
    last = 0
    out = []
    for t in times:
        tokens = min(capacity, tokens + (t - last) * rate)
        last = t
        if tokens >= 1:
            tokens -= 1
            out.append(True)
        else:
            out.append(False)
    return out
