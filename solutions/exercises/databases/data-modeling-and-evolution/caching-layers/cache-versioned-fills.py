def simulate_versioned(initial, events, mode):
    primary_value = initial
    primary_version = 1
    replica_value = initial
    replica_version = 1
    cache = None  # None, ("tombstone", version), or ("value", value, version)
    local = {}

    for ev in events:
        kind = ev[0]
        if kind == "write":
            primary_value = ev[1]
            primary_version += 1
        elif kind == "replicate":
            replica_value = primary_value
            replica_version = primary_version
        elif kind == "read":
            local[ev[1]] = (primary_value, primary_version)
        elif kind == "read_replica":
            local[ev[1]] = (replica_value, replica_version)
        elif kind == "invalidate":
            if mode == "delete":
                cache = None
            else:
                cache = ("tombstone", primary_version)
        elif kind == "fill":
            value, version = local[ev[1]]
            if mode == "delete":
                cache = ("value", value, version)
            else:
                allow = (
                    cache is None
                    or (cache[0] == "tombstone" and cache[1] <= version)
                    or (cache[0] == "value" and cache[2] < version)
                )
                if allow:
                    cache = ("value", value, version)

    if cache is None or cache[0] == "tombstone":
        cache_value = None
    else:
        cache_value = cache[1]

    stale = cache_value is not None and cache_value != primary_value
    return {"cache": cache_value, "stale": stale}
