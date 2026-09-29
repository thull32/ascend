def handle_requests(events):
    out = []
    store = {}
    for ev in events:
        kind = ev[0]
        if kind == "request":
            _, account, key, body_hash, now = ev
            k = (account, key)
            entry = store.get(k)
            if entry is not None and now - entry["created"] >= 86400:
                entry = None
            if entry is None:
                store[k] = {"hash": body_hash, "state": "in_progress",
                            "response": None, "created": now}
                out.append("execute")
            elif entry["hash"] != body_hash:
                out.append("mismatch")
            elif entry["state"] == "in_progress":
                out.append("conflict")
            else:
                out.append("replay:" + entry["response"])
        elif kind == "complete":
            _, account, key, response = ev
            entry = store[(account, key)]
            entry["state"] = "done"
            entry["response"] = response
        elif kind == "abort":
            _, account, key = ev
            store.pop((account, key), None)
    return out
