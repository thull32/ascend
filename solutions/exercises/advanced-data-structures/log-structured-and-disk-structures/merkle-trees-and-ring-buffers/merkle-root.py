def fnv1a(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def merkle_root(leaves):
    if not leaves:
        return 0

    level = [fnv1a(s) for s in leaves]
    while len(level) > 1:
        if len(level) % 2 == 1:
            level.append(level[-1])
        next_level = []
        for i in range(0, len(level), 2):
            left, right = level[i], level[i + 1]
            next_level.append(fnv1a(str(left) + ":" + str(right)))
        level = next_level

    return level[0]
