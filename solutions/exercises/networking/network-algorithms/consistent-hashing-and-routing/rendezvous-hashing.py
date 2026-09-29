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


def rendezvous_owner(nodes, keys):
    owners = []
    for key in keys:
        best_score = -1
        best_node = None
        for node in nodes:
            score = hash32(f"{node}:{key}")
            if score > best_score or (score == best_score and node < best_node):
                best_score = score
                best_node = node
        owners.append(best_node)
    return owners
