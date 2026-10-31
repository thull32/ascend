# Ring all-reduce as NCCL's ring runs it: reduce-scatter, then all-gather, counting elements sent.


def ring_allreduce(vectors):
    n = len(vectors)
    length = len(vectors[0])
    buf = [list(v) for v in vectors]
    bounds = [(c * length // n, (c + 1) * length // n) for c in range(n)]
    sent = [0] * n

    def transfer(phase, k):
        for r in range(n):
            c = (r - k) % n if phase == "rs" else (r + 1 - k) % n
            lo, hi = bounds[c]
            dst = (r + 1) % n
            for i in range(lo, hi):
                buf[dst][i] = buf[dst][i] + buf[r][i] if phase == "rs" else buf[r][i]
            sent[r] += hi - lo

    # In a step, the chunk a rank receives is never the one it sends, so the
    # sequential loop gives the same result as simultaneous transfers.
    for k in range(n - 1):
        transfer("rs", k)
    for k in range(n - 1):
        transfer("ag", k)
    return {"result": buf, "elements_sent": sent, "steps": 2 * (n - 1)}
