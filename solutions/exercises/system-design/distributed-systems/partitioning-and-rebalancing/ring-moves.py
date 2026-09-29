import bisect


def _owner(ring, positions, pos):
    idx = bisect.bisect_left(positions, pos)
    if idx == len(ring):
        idx = 0
    return ring[idx][1]


def ring_moves(nodes, new_node, keys):
    old_ring = sorted((p, n) for n, plist in nodes.items() for p in plist)
    old_positions = [p for p, _ in old_ring]

    new_name, new_positions_list = new_node
    new_ring = sorted(old_ring + [(p, new_name) for p in new_positions_list])
    new_positions = [p for p, _ in new_ring]

    moves = []
    for k, pos in keys.items():
        old_owner = _owner(old_ring, old_positions, pos)
        new_owner = _owner(new_ring, new_positions, pos)
        if old_owner != new_owner:
            moves.append([k, old_owner, new_owner])

    moves.sort(key=lambda x: x[0])
    return moves
