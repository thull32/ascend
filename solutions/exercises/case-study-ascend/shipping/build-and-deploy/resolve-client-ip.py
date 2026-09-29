def _is_ipv4(value):
    parts = value.split(".")
    if len(parts) != 4:
        return False
    for p in parts:
        if not p.isdigit() or not (1 <= len(p) <= 3) or int(p) > 255:
            return False
    return True


def resolve_client_ip(headers, trusted_header, socket_ip):
    if trusted_header is None:
        return socket_ip

    target = trusted_header.lower()
    value = None
    for k, v in headers.items():
        if k.lower() == target:
            value = v
            break

    if value is None:
        return socket_ip

    candidate = value.strip()
    if _is_ipv4(candidate):
        return candidate
    return socket_ip
