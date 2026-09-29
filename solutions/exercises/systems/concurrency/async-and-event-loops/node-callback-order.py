from collections import deque

def node_order(ops):
    out = []
    ticks, micro = deque(), deque()
    immediates, timeouts = [], []

    def schedule(op):
        kind, label = op[0], op[1]
        children = op[2] if len(op) > 2 else []
        if kind == "sync":
            out.append(label)
        elif kind == "nextTick":
            ticks.append((label, children))
        elif kind == "microtask":
            micro.append((label, children))
        elif kind == "immediate":
            immediates.append((label, children))
        elif kind == "timeout":
            timeouts.append((label, children))

    def run(label, children):
        out.append(label)
        for child in children:
            schedule(child)

    def drain():
        while ticks or micro:
            while ticks:
                label, children = ticks.popleft()
                run(label, children)
            while micro:
                label, children = micro.popleft()
                run(label, children)

    for op in ops:
        schedule(op)
    drain()

    for label, children in immediates:
        run(label, children)
        drain()

    for label, children in timeouts:
        run(label, children)
        drain()

    return out
