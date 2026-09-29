def simulate_cache(capacity, policy, accesses):
    hits = 0
    evicted = []
    meta = {}  # key -> [count, last_access_time]
    t = 0
    for k in accesses:
        t += 1
        if k in meta:
            hits += 1
            meta[k][0] += 1
            meta[k][1] = t
        else:
            if len(meta) >= capacity:
                if policy == "lru":
                    victim = min(meta.items(), key=lambda kv: kv[1][1])[0]
                else:
                    victim = min(meta.items(), key=lambda kv: (kv[1][0], kv[1][1]))[0]
                del meta[victim]
                evicted.append(victim)
            meta[k] = [1, t]
    return {"hits": hits, "evicted": evicted}
