def rebuild(events, snapshot):
    balances = {}
    versions = {}
    held = {}
    applied = 0
    skipped = 0

    for stream, sv in snapshot.items():
        bal, ver = sv
        balances[stream] = bal
        versions[stream] = ver

    def apply_val(bal, typ, amount):
        if typ == "Opened":
            return amount
        if typ == "Deposited":
            return bal + amount
        return bal - amount  # Withdrawn

    for stream, version, typ, amount in events:
        last = versions.get(stream, 0)
        stream_held = held.setdefault(stream, {})
        if version <= last or version in stream_held:
            skipped += 1
            continue
        if version == last + 1:
            balances[stream] = apply_val(balances.get(stream, 0), typ, amount)
            applied += 1
            last = version
            versions[stream] = last
            while (last + 1) in stream_held:
                ntyp, namount = stream_held.pop(last + 1)
                balances[stream] = apply_val(balances.get(stream, 0), ntyp, namount)
                applied += 1
                last += 1
                versions[stream] = last
        else:
            stream_held[version] = (typ, amount)

    stalled = sorted(s for s, h in held.items() if h)
    return {"balances": balances, "applied": applied, "skipped": skipped, "stalled": stalled}
