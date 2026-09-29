from collections import deque


def go_back_n(n, window, lost):
    lost = set(lost)
    base = 0
    next_seq = 0
    expected = 0
    log = []
    pipe = deque()

    while base < n:
        while next_seq < min(base + window, n):
            pos = len(log)
            log.append(next_seq)
            pipe.append((next_seq, pos in lost))
            next_seq += 1

        if pipe:
            seq, is_lost = pipe.popleft()
            if not is_lost and seq == expected:
                expected += 1
                base = expected

        if not pipe and base < next_seq:
            next_seq = base

    return log
