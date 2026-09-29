import bisect


def h32(s):
    h = 2166136261                      # FNV-1a over the UTF-8 bytes
    for b in s.encode("utf-8"):
        h = ((h ^ b) * 16777619) % 2**32
    h ^= h >> 16                        # murmur3 finaliser
    h = (h * 0x85EBCA6B) % 2**32
    h ^= h >> 13
    h = (h * 0xC2B2AE35) % 2**32
    h ^= h >> 16
    return h


def _build_ring(nodes, vnodes):
    points = []
    for n in nodes:
        for i in range(vnodes):
            points.append((h32(f"{n}#{i}"), n))
    points.sort(key=lambda p: (p[0], p[1]))
    return points


def _owner(points, positions, key):
    target = h32(key)
    idx = bisect.bisect_left(positions, target)
    if idx == len(points):
        idx = 0
    return points[idx][1]


def ring_moves(old_nodes, new_nodes, vnodes, keys):
    old_points = _build_ring(old_nodes, vnodes)
    new_points = _build_ring(new_nodes, vnodes)
    old_positions = [p[0] for p in old_points]
    new_positions = [p[0] for p in new_points]

    moves = []
    for key in keys:
        old_owner = _owner(old_points, old_positions, key)
        new_owner = _owner(new_points, new_positions, key)
        if old_owner != new_owner:
            moves.append([key, old_owner, new_owner])

    return moves
