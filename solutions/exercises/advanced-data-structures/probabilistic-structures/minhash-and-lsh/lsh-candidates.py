def lsh_candidates(signatures, b, r):
    buckets = {}
    for doc_idx, sig in enumerate(signatures):
        for band in range(b):
            key = (band, tuple(sig[band * r:(band + 1) * r]))
            buckets.setdefault(key, []).append(doc_idx)

    pairs = set()
    for docs in buckets.values():
        for i in range(len(docs)):
            for j in range(i + 1, len(docs)):
                a, bb = docs[i], docs[j]
                if a > bb:
                    a, bb = bb, a
                pairs.add((a, bb))

    return sorted(list(p) for p in pairs)
