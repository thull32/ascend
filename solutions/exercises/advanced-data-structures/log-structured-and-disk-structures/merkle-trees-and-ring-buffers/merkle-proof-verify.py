def fnv1a(s):
    h = 0x811C9DC5
    for b in s.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def merkle_proof_verify(leaf, index, proof, root):
    h = fnv1a(leaf)
    for sibling in proof:
        if index % 2 == 0:
            h = fnv1a(str(h) + ":" + str(sibling))
        else:
            h = fnv1a(str(sibling) + ":" + str(h))
        index //= 2
    return h == root
