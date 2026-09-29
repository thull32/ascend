def apply_changes(events):
    store = {}  # key -> (version, value)
    skipped = {"cdc": 0, "backfill": 0}

    for source, key, version, value in events:
        if key in store and version <= store[key][0]:
            skipped[source] += 1
            continue
        store[key] = (version, value)

    rows = [[key, value] for key, (version, value) in sorted(store.items()) if value is not None]

    return {"rows": rows, "skipped": skipped}
