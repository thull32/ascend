def token_bucket(capacity, rate, times):
    tokens = capacity
    last = times[0] if times else 0
    result = []
    for t in times:
        tokens = min(capacity, tokens + (t - last) * rate)
        last = t
        if tokens >= 1:
            tokens -= 1
            result.append(True)
        else:
            result.append(False)
    return result
