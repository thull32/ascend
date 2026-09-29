def slow_start_rounds(nbytes, mss, initcwnd, max_cwnd):
    if nbytes == 0:
        return 0
    segments = -(-nbytes // mss)
    cwnd = min(initcwnd, max_cwnd)
    sent = 0
    rounds = 0
    while sent < segments:
        sent += cwnd
        rounds += 1
        cwnd = min(2 * cwnd, max_cwnd)
    return rounds
