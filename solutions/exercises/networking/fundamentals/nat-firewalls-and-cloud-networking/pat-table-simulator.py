def pat_simulate(public_ip, mode, events):
    out = []

    # mapping_key -> external_port
    key_to_port = {}
    # external_port -> {"inside": (ip, port), "dests": set of (dst_ip, dst_port)}
    port_table = {}
    used_ports = set()

    def mapping_key(ip, port, dst_ip=None, dst_port=None):
        if mode == "symmetric":
            return (ip, port, dst_ip, dst_port)
        return (ip, port)

    for event in events:
        if event[0] == "out":
            _, ip, port, dst_ip, dst_port = event
            key = mapping_key(ip, port, dst_ip, dst_port)

            if key in key_to_port:
                ext_port = key_to_port[key]
            else:
                candidate = port
                while candidate in used_ports:
                    candidate += 1
                ext_port = candidate
                key_to_port[key] = ext_port
                used_ports.add(ext_port)
                port_table[ext_port] = {"inside": (ip, port), "dests": set()}

            port_table[ext_port]["dests"].add((dst_ip, dst_port))
            out.append(f"{public_ip}:{ext_port}")

        elif event[0] == "in":
            _, src_ip, src_port, ext_port = event
            entry = port_table.get(ext_port)
            if entry is not None and (src_ip, src_port) in entry["dests"]:
                inside_ip, inside_port = entry["inside"]
                out.append(f"{inside_ip}:{inside_port}")
            else:
                out.append("drop")

    return out
