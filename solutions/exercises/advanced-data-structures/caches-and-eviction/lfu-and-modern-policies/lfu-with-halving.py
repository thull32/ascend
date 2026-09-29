def lfu_with_halving(capacity, halve_every, ops):
    counts = {}  # key -> count
    recency = []  # keys from least to most recently accessed
    evicted = []
    accesses = 0

    def touch(key):
        nonlocal accesses
        counts[key] = counts.get(key, 0) + 1
        if key in recency:
            recency.remove(key)
        recency.append(key)
        accesses += 1
        if halve_every > 0 and accesses % halve_every == 0:
            for k in list(counts.keys()):
                counts[k] //= 2

    for op, key in ops:
        if op == "get":
            if key in counts:
                touch(key)
            continue

        if key not in counts:
            if len(counts) >= capacity:
                victim = min(recency, key=lambda k: counts[k])
                evicted.append(victim)
                del counts[victim]
                recency.remove(victim)
            counts[key] = 0
            recency.append(key)
        touch(key)

    return evicted
