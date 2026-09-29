def gcra(interval, burst, times):
    tau = (burst - 1) * interval
    tat = 0
    out = []
    for t in times:
        cur_tat = max(tat, t)
        if cur_tat - t > tau:
            out.append(cur_tat - tau - t)
        else:
            out.append(0)
            tat = cur_tat + interval
    return out
