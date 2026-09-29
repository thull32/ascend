# Count origin fetches with and without request coalescing.

def origin_fetches(times, fetch_ms, ttl_ms, coalesce):
    starts = []          # start time of every fetch sent to the origin
    for t in times:
        fresh = any(s + fetch_ms <= t < s + fetch_ms + ttl_ms for s in starts)
        if fresh:
            continue
        in_flight = coalesce and any(s <= t < s + fetch_ms for s in starts)
        if in_flight:
            continue
        starts.append(t)
    return len(starts)
