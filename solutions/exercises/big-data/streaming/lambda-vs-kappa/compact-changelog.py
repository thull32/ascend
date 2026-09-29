def compact_changelog(events, retain_tombstones):
    last_index = {}
    for i, (key, _value) in enumerate(events):
        last_index[key] = i

    log = []
    for i, (key, value) in enumerate(events):
        if last_index[key] != i:
            continue
        if value is None and not retain_tombstones:
            continue
        log.append([key, value])

    table = sorted(([k, v] for k, v in log if v is not None), key=lambda kv: kv[0])

    return {"log": log, "table": table}
