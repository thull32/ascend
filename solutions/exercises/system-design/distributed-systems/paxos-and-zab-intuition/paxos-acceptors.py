def paxos(n_acceptors, values, schedule):
    promised = [0] * n_acceptors
    accepted = [[0, None] for _ in range(n_acceptors)]
    chosen = None
    promises = {}
    majority = n_acceptors // 2 + 1

    for kind, proposer, n, targets in schedule:
        if kind == "prepare":
            key = (proposer, n)
            lst = promises.setdefault(key, [])
            for a in targets:
                if n > promised[a]:
                    promised[a] = n
                    lst.append((accepted[a][0], accepted[a][1]))
        else:  # accept
            key = (proposer, n)
            lst = promises.get(key, [])
            if len(lst) < majority:
                continue

            best_num = 0
            best_val = None
            for num, val in lst:
                if num > best_num:
                    best_num = num
                    best_val = val
            value = best_val if best_num > 0 else values[proposer]

            for a in targets:
                if n >= promised[a]:
                    promised[a] = n
                    accepted[a] = [n, value]

            if chosen is None:
                count = sum(1 for a in range(n_acceptors) if accepted[a][0] == n)
                if count >= majority:
                    chosen = value

    acceptors = [[promised[a], accepted[a][0], accepted[a][1]] for a in range(n_acceptors)]
    return {"chosen": chosen, "acceptors": acceptors}
