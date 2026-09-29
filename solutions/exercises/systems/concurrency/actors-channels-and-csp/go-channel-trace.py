from collections import deque

def chan_trace(capacity, ops):
    buf, recvq, sendq = deque(), deque(), deque()
    closed = False
    received = []
    panic = False

    for op in ops:
        kind = op[0]
        if kind == "send":
            g, value = op[1], op[2]
            if closed:
                panic = True
                break
            if recvq:
                r = recvq.popleft()
                received.append([r, value, True])
            elif len(buf) < capacity:
                buf.append(value)
            else:
                sendq.append((g, value))
        elif kind == "recv":
            g = op[1]
            if buf:
                value = buf.popleft()
                received.append([g, value, True])
                if sendq:
                    _, sv = sendq.popleft()
                    buf.append(sv)
            elif sendq:
                _, sv = sendq.popleft()
                received.append([g, sv, True])
            elif closed:
                received.append([g, None, False])
            else:
                recvq.append(g)
        else:  # close
            if closed:
                panic = True
                break
            closed = True
            while recvq:
                r = recvq.popleft()
                received.append([r, None, False])
            if sendq:
                panic = True
                break

    blocked = [g for g, _ in sendq] + list(recvq)
    return {"received": received, "blocked": blocked, "panic": panic}
