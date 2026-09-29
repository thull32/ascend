import bisect


def preference_lists(tokens, zones, keys, n):
    sorted_tokens = sorted(tokens, key=lambda t: t[0])
    m = len(sorted_tokens)
    positions = [t[0] for t in sorted_tokens]

    result = []
    for p in keys:
        start = bisect.bisect_left(positions, p)
        if start == m:
            start = 0

        chosen = []
        used_nodes = set()
        used_zones = set()
        for i in range(m):
            idx = (start + i) % m
            node = sorted_tokens[idx][1]
            zone = zones[node]
            if node in used_nodes or zone in used_zones:
                continue
            chosen.append(node)
            used_nodes.add(node)
            used_zones.add(zone)
            if len(chosen) >= n:
                break

        result.append(chosen)

    return result
