def zk_lock_queue(events):
    seq = 0
    znodes = {}
    out = []

    for kind, client in events:
        if kind == "create":
            znodes[client] = seq
            seq += 1
        else:
            znodes.pop(client, None)

        ordered = sorted(znodes.items(), key=lambda kv: kv[1])
        if ordered:
            holder, token = ordered[0]
        else:
            holder, token = None, None

        watching = {}
        for i in range(1, len(ordered)):
            watching[ordered[i][0]] = ordered[i - 1][0]

        out.append({"holder": holder, "token": token, "watching": watching})

    return out
