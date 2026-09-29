import bisect


def hash32(s):
    h = 0x811C9DC5
    for b in s.encode():
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    h ^= h >> 16
    h = (h * 0x85EBCA6B) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * 0xC2B2AE35) & 0xFFFFFFFF
    h ^= h >> 16
    return h


def ring_owner(nodes, vnodes, keys):
    points = []
    for node in nodes:
        for i in range(vnodes):
            points.append((hash32(f"{node}#{i}"), node))
    points.sort(key=lambda p: (p[0], p[1]))
    positions = [p[0] for p in points]

    owners = []
    for key in keys:
        pos = hash32(key)
        idx = bisect.bisect_left(positions, pos)
        if idx == len(points):
            idx = 0
        owners.append(points[idx][1])
    return owners
