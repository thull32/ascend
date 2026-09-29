def token_bucket(capacity, refill_ms, times):
    tokens = capacity
    last = 0
    result = []
    for t in times:
        added = t // refill_ms - last // refill_ms
        tokens = min(capacity, tokens + added)
        last = t
        if tokens > 0:
            tokens -= 1
            result.append(True)
        else:
            result.append(False)
    return result
