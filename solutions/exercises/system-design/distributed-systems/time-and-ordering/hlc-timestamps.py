def hlc_stamps(events):
    state = {}
    msgs = {}
    out = []

    for ev in events:
        kind = ev[0]
        node = ev[1]
        pt = ev[2]
        l, c = state.get(node, (0, 0))

        if kind in ("local", "send"):
            l2 = max(l, pt)
            c2 = c + 1 if l2 == l else 0
            state[node] = (l2, c2)
            out.append([l2, c2])
            if kind == "send":
                msgs[ev[3]] = (l2, c2)
        else:  # recv
            lm, cm = msgs[ev[3]]
            l2 = max(l, lm, pt)
            if l2 == l and l2 == lm:
                c2 = max(c, cm) + 1
            elif l2 == l:
                c2 = c + 1
            elif l2 == lm:
                c2 = cm + 1
            else:
                c2 = 0
            state[node] = (l2, c2)
            out.append([l2, c2])

    return out
