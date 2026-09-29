def coordinator_read(replies, r):
    contacted = []
    for i, rep in enumerate(replies):
        if rep is not None:
            contacted.append((i, rep[0], rep[1]))
            if len(contacted) == r:
                break

    if len(contacted) < r:
        return None

    winner = max(contacted, key=lambda c: (c[2], c[1]))
    winning_value = winner[1]
    winning = (winner[1], winner[2])

    repair = [i for i, v, ts in contacted if (v, ts) != winning]
    repair.sort()

    return [winning_value, repair]
