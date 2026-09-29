def simulate(initial, events, use_leases):
    db = initial
    cache = None
    local = {}
    leases = set()

    for ev in events:
        kind = ev[0]
        if kind == "miss":
            r = ev[1]
            local[r] = db
            if use_leases:
                leases.add(r)
        elif kind == "fill":
            r = ev[1]
            if use_leases:
                if r in leases:
                    cache = local[r]
                leases.discard(r)
            else:
                cache = local[r]
        elif kind == "write":
            db = ev[1]
        elif kind == "invalidate":
            cache = None
            if use_leases:
                leases = set()

    stale = cache is not None and cache != db
    return {"db": db, "cache": cache, "stale": stale}
