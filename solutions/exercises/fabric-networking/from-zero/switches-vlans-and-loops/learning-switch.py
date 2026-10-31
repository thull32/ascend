def learning_switch(ports, aging, frames):
    vlan_of = {p: v for p, v in ports}
    table = {}  # (vlan, mac) -> (port, last_seen)
    out = []
    for time, in_port, src, dst in frames:
        vlan = vlan_of[in_port]
        table[(vlan, src)] = (in_port, time)
        flood = sorted(p for p, v in ports if v == vlan and p != in_port)
        if int(dst[0:2], 16) & 1:
            out.append(flood)
            continue
        entry = table.get((vlan, dst))
        if entry is not None and time - entry[1] <= aging:
            out.append([] if entry[0] == in_port else [entry[0]])
        else:
            out.append(flood)
    return out
