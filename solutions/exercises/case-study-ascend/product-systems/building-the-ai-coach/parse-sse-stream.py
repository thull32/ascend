def _split_lines(text):
    lines = []
    i = 0
    n = len(text)
    start = 0
    while i < n:
        c = text[i]
        if c == "\n":
            lines.append(text[start:i])
            i += 1
            start = i
        elif c == "\r":
            lines.append(text[start:i])
            if i + 1 < n and text[i + 1] == "\n":
                i += 2
            else:
                i += 1
            start = i
        else:
            i += 1
    if start < n:
        lines.append(text[start:n])
    return lines


def parse_sse(chunks):
    events = []
    event_name = None
    data_lines = []

    def dispatch():
        nonlocal event_name, data_lines
        if data_lines:
            events.append([event_name or "message", "\n".join(data_lines)])
        event_name = None
        data_lines = []

    for line in _split_lines("".join(chunks)):
        if line == "":
            dispatch()
            continue
        if line.startswith(":"):
            continue
        if ":" in line:
            idx = line.index(":")
            field, value = line[:idx], line[idx + 1:]
            if value.startswith(" "):
                value = value[1:]
        else:
            field, value = line, ""
        if field == "event":
            event_name = value
        elif field == "data":
            data_lines.append(value)

    dispatch()
    return events
