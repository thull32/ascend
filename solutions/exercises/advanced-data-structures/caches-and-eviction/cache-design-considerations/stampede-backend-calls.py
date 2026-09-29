def backend_calls(arrivals, expiry, latency, coalesce):
    refill = None
    calls = 0
    for t in sorted(arrivals):
        if refill is not None and t >= refill:
            continue  # hit, cache has been refilled
        if t < expiry:
            continue  # hit, original entry still valid
        # miss
        if refill is None:
            refill = t + latency
            calls += 1
        elif not coalesce:
            calls += 1
    return calls
