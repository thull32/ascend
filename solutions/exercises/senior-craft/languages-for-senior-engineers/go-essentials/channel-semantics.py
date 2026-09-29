def simulate_channel(capacity, ops):
    buffer = []
    closed = False
    outcomes = []

    for op in ops:
        kind = op[0]

        if kind == "send":
            v = op[1]
            if closed:
                outcomes.append("panic: send on closed channel")
                break
            if capacity is None or len(buffer) >= capacity:
                outcomes.append("deadlock")
                break
            buffer.append(v)
            outcomes.append("ok")

        elif kind == "recv":
            if buffer:
                outcomes.append([buffer.pop(0), True])
            elif closed:
                outcomes.append([0, False])
            else:
                outcomes.append("deadlock")
                break

        elif kind == "close":
            if capacity is None:
                outcomes.append("panic: close of nil channel")
                break
            if closed:
                outcomes.append("panic: close of closed channel")
                break
            closed = True
            outcomes.append("ok")

    return outcomes
