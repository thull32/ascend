def deadlocked_threads(holds, waits):
    holder = {lock: thread for thread, lock in holds}
    nxt = {}
    for thread, lock in waits:
        if lock in holder:
            nxt[thread] = holder[lock]

    done = set()
    result = set()

    for start in nxt:
        if start in done:
            continue
        path = []
        node = start
        while True:
            if node not in nxt or node in done:
                for n in path:
                    done.add(n)
                break
            if node in path:
                idx = path.index(node)
                for n in path[idx:]:
                    result.add(n)
                for n in path:
                    done.add(n)
                break
            path.append(node)
            node = nxt[node]

    return sorted(result)
