def visible_value(versions, snapshot, committed):
    committed_set = set(committed)
    xmax_snap = snapshot["xmax"]
    xip = set(snapshot["xip"])

    def counts(xid):
        return xid in committed_set and xid < xmax_snap and xid not in xip

    for v in versions:
        if counts(v["xmin"]) and (v["xmax"] is None or not counts(v["xmax"])):
            return v["value"]
    return None
