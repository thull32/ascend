def find_write_skew(schedule):
    first_op = {}
    commit_idx = {}
    reads = {}
    writes = {}

    for i, op in enumerate(schedule):
        txn = op[0]
        if txn not in first_op:
            first_op[txn] = i
            reads[txn] = set()
            writes[txn] = set()
        if op[1] == "r":
            reads[txn].add(op[2])
        elif op[1] == "w":
            writes[txn].add(op[2])
        elif op[1] == "c":
            commit_idx[txn] = i

    txns = sorted(first_op.keys())
    result = []
    for i in range(len(txns)):
        for j in range(i + 1, len(txns)):
            a, b = txns[i], txns[j]
            if a > b:
                a, b = b, a
            concurrent = first_op[a] < commit_idx[b] and first_op[b] < commit_idx[a]
            if not concurrent:
                continue
            if writes[a] & writes[b]:
                continue
            if reads[a] & writes[b] and reads[b] & writes[a]:
                result.append([a, b])

    result.sort()
    return result
