def check_as_path(local_asn, peer_asn, as_path):
    def kind(asn):
        if 64512 <= asn <= 65534 or 4200000000 <= asn <= 4294967294:
            return "private"
        if asn in (0, 23456, 65535, 4294967295) or 65552 <= asn <= 131071:
            return "reserved"
        return None

    if not as_path:
        return ["malformed", None]
    if as_path[0] != peer_asn:
        return ["first-as", as_path[0]]
    if local_asn in as_path:
        return ["loop", local_asn]
    for asn in as_path:
        k = kind(asn)
        if k:
            return [k, asn]
    return ["accept", None]
