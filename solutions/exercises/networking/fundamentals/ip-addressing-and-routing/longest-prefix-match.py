def _ip_to_int(ip):
    parts = [int(p) for p in ip.split(".")]
    value = 0
    for p in parts:
        value = value * 256 + p
    return value


def longest_prefix_match(routes, dst):
    dst_int = _ip_to_int(dst)

    best_hop = None
    best_prefix = -1

    for cidr, next_hop in routes:
        addr, prefix_str = cidr.split("/")
        prefix = int(prefix_str)
        addr_int = _ip_to_int(addr)

        shift = 32 - prefix
        if shift == 32:
            network = 0
        else:
            network = (addr_int >> shift) << shift
            dst_masked = (dst_int >> shift) << shift
            if network != dst_masked:
                continue

        if prefix > best_prefix:
            best_prefix = prefix
            best_hop = next_hop

    return best_hop
