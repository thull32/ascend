def plan_batches(ticks):
    loaded = set()
    batches = []

    for tick in ticks:
        new_keys = sorted({k for k in tick if k not in loaded})
        if new_keys:
            batches.append(new_keys)
            loaded.update(new_keys)

    return batches
