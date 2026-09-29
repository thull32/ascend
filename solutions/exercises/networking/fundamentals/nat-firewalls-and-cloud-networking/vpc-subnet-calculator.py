def _ip_to_int(ip):
    parts = [int(p) for p in ip.split(".")]
    value = 0
    for p in parts:
        value = value * 256 + p
    return value


def _int_to_ip(value):
    return ".".join(str((value >> shift) & 0xFF) for shift in (24, 16, 8, 0))


def split_cidr(cidr, new_prefix, count):
    addr, prefix_str = cidr.split("/")
    prefix = int(prefix_str)

    if new_prefix < prefix or new_prefix > 28:
        return []

    addr_int = _ip_to_int(addr)
    block_size = 2 ** (32 - prefix)
    network = (addr_int // block_size) * block_size

    subnet_size = 2 ** (32 - new_prefix)
    total_subnets = block_size // subnet_size
    n = min(count, total_subnets)

    result = []
    for i in range(n):
        base = network + i * subnet_size
        subnet_cidr = f"{_int_to_ip(base)}/{new_prefix}"
        first_usable = _int_to_ip(base + 4)
        last_usable = _int_to_ip(base + subnet_size - 2)
        usable_count = subnet_size - 5
        result.append([subnet_cidr, first_usable, last_usable, usable_count])

    return result
