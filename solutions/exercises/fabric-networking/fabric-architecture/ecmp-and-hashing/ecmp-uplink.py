# Pick each flow's ECMP uplink from a seeded FNV-1a hash of its 5-tuple.

def ecmp_uplinks(flows, members, seed):
    picks = []
    for src, dst, proto, sport, dport in flows:
        key = f"{src}|{dst}|{proto}|{sport}|{dport}"
        h = (2166136261 ^ seed) & 0xFFFFFFFF
        for byte in key.encode("ascii"):
            h ^= byte
            h = (h * 16777619) & 0xFFFFFFFF
        picks.append(members[h % len(members)])
    return picks
