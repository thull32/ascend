def trace_request(groups, reject_at):
    layers = []
    for group in groups:
        layers.extend(reversed(group))

    events = []
    entered = []
    rejected = False

    for name in layers:
        events.append(f"in:{name}")
        entered.append(name)
        if name == reject_at:
            rejected = True
            break

    if not rejected:
        events.append("handler")

    for name in reversed(entered):
        events.append(f"out:{name}")

    return events
