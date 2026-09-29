def reno_cwnd(initial_cwnd, ssthresh, events):
    cwnd = initial_cwnd
    out = []

    for event in events:
        out.append(cwnd)

        if event == ".":
            if cwnd < ssthresh:
                cwnd = min(2 * cwnd, ssthresh)
            else:
                cwnd = cwnd + 1
        elif event == "D":
            ssthresh = max(cwnd // 2, 2)
            cwnd = ssthresh
        elif event == "T":
            ssthresh = max(cwnd // 2, 2)
            cwnd = 1

    return out
