def validate_cabling(planned, lldp):
    def port(device, iface):
        device = device.strip().lower()
        if device.endswith(".meridian.example"):
            device = device[: -len(".meridian.example")]
        return (device, iface.strip().lower())

    def link(a_dev, a_if, b_dev, b_if):
        return tuple(sorted([port(a_dev, a_if), port(b_dev, b_if)]))

    plan = {link(*row) for row in planned}
    seen = {link(*row) for row in lldp}
    planned_ports = {p for l in plan for p in l}

    def out(links):
        return sorted([a[0], a[1], b[0], b[1]] for a, b in links)

    unexpected = seen - plan
    return {
        "missing": out(plan - seen),
        "miswired": out(l for l in unexpected if l[0] in planned_ports or l[1] in planned_ports),
        "extra": out(l for l in unexpected if l[0] not in planned_ports and l[1] not in planned_ports),
    }
