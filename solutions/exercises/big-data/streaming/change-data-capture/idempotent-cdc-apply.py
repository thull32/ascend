def apply_cdc(events):
    rows = {}
    versions = {}
    ignored = 0

    for op, key, value, version in events:
        last = versions.get(key)
        if last is not None and version <= last:
            ignored += 1
            continue
        versions[key] = version
        if op == "d":
            rows.pop(key, None)
        else:
            rows[key] = value

    return {"rows": [[k, rows[k]] for k in sorted(rows)], "ignored": ignored}
