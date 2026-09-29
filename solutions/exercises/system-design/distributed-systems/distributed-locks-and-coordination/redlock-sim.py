def redlock(n, ttl, events):
    majority = n // 2 + 1
    drift = ttl // 100 + 2
    offset = [0] * n
    owner = [None] * n
    expiry = [0] * n
    believes = {}
    out = []

    for ev in events:
        kind = ev[0]
        if kind == "acquire":
            client, t, reachable = ev[1], ev[2], ev[3]
            acquired_nodes = []
            for node in reachable:
                node_clock = t + offset[node]
                if owner[node] is None or node_clock >= expiry[node]:
                    owner[node] = client
                    expiry[node] = node_clock + ttl
                    acquired_nodes.append(node)

            if len(acquired_nodes) >= majority:
                believes[client] = t + ttl - drift
                ok = True
            else:
                for node in acquired_nodes:
                    owner[node] = None
                ok = False

            also_holding = sorted(
                c for c, until in believes.items() if c != client and until > t
            )
            out.append({"ok": ok, "also_holding": also_holding})

        elif kind == "jump":
            node, delta = ev[1], ev[2]
            offset[node] += delta

        elif kind == "restart":
            node = ev[1]
            owner[node] = None

        elif kind == "release":
            client = ev[1]
            for node in range(n):
                if owner[node] == client:
                    owner[node] = None
            believes.pop(client, None)

    return out
