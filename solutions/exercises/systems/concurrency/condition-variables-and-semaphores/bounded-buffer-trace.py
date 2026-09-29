from collections import deque


def buffer_trace(capacity, ops):
    buf = deque()
    waiting_putters = deque()  # (thread, value)
    waiting_takers = deque()   # thread
    taken = []

    def serve():
        changed = True
        while changed:
            changed = False
            if buf and waiting_takers:
                t = waiting_takers.popleft()
                v = buf.popleft()
                taken.append([t, v])
                changed = True
            elif len(buf) < capacity and waiting_putters:
                t, v = waiting_putters.popleft()
                buf.append(v)
                changed = True

    for op in ops:
        if op[1] == "put":
            waiting_putters.append((op[0], op[2]))
        else:
            waiting_takers.append(op[0])
        serve()

    return taken
