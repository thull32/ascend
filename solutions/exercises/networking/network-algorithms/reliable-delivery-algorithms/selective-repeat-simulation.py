from collections import deque


def selective_repeat(n, window, lost):
    lost = set(lost)
    base = 0
    next_seq = 0
    acked = set()
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
            if not is_lost:
                acked.add(seq)
                while base in acked:
                    base += 1

        if not pipe and base < next_seq:
            for s in range(base, next_seq):
                if s not in acked:
                    pos = len(log)
                    log.append(s)
                    pipe.append((s, pos in lost))

    return log
