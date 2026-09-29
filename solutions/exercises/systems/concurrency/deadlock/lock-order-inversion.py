def lock_order_cycles(traces):
    edges = {}  # lock -> set of locks acquired while it was held

    for trace in traces:
        held = {}  # lock -> count currently held by this thread
        for op, lock in trace:
            if op == "lock":
                for h, count in held.items():
                    if count > 0:
                        edges.setdefault(h, set()).add(lock)
                held[lock] = held.get(lock, 0) + 1
            else:  # unlock
                held[lock] = held.get(lock, 0) - 1

    nodes = set(edges.keys())
    for targets in edges.values():
        nodes |= targets

    on_cycle = []
    for start in nodes:
        seen = {start}
        stack = list(edges.get(start, ()))
        reached = False
        while stack:
            node = stack.pop()
            if node == start:
                reached = True
                break
            if node in seen:
                continue
            seen.add(node)
            stack.extend(edges.get(node, ()))
        if reached:
            on_cycle.append(start)

    return sorted(on_cycle)
