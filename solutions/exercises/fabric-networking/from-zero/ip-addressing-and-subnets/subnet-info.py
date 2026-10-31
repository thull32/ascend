# Network, broadcast, host range and usable count for an IPv4 CIDR, with /31 and /32 rules.

def subnet_info(cidr):
    addr, plen = cidr.split("/")
    plen = int(plen)
    a = 0
    for octet in addr.split("."):
        a = (a << 8) | int(octet)
    mask = (0xFFFFFFFF << (32 - plen)) & 0xFFFFFFFF
    net = a & mask
    last = net | (~mask & 0xFFFFFFFF)

    def dotted(n):
        return ".".join(str((n >> s) & 0xFF) for s in (24, 16, 8, 0))

    if plen == 32:
        return {"network": dotted(net), "broadcast": None, "first": dotted(net),
                "last": dotted(net), "hosts": 1}
    if plen == 31:
        return {"network": dotted(net), "broadcast": None, "first": dotted(net),
                "last": dotted(last), "hosts": 2}
    return {"network": dotted(net), "broadcast": dotted(last), "first": dotted(net + 1),
            "last": dotted(last - 1), "hosts": 2 ** (32 - plen) - 2}
