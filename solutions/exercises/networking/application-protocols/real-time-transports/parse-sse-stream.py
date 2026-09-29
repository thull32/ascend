# Parse a text/event-stream into dispatched events, per the HTML spec.

def parse_sse(chunks):
    text = "".join(chunks)
    lines = []
    pos = 0
    n = len(text)
    while pos < n:
        i = pos
        while i < n and text[i] not in ("\r", "\n"):
            i += 1
        lines.append(text[pos:i])
        if i >= n:
            pos = i
            break
        if text[i] == "\r" and i + 1 < n and text[i + 1] == "\n":
            pos = i + 2
        else:
            pos = i + 1

    events = []
    event_type = ""
    data_buf = []
    last_id = ""

    for line in lines:
        if line == "":
            # blank line: dispatch
            if not data_buf:
                event_type = ""
                data_buf = []
                continue
            data = "\n".join(data_buf)
            events.append([event_type or "message", data, last_id])
            event_type = ""
            data_buf = []
            continue
        if line.startswith(":"):
            continue
        if ":" in line:
            field, value = line.split(":", 1)
            if value.startswith(" "):
                value = value[1:]
        else:
            field, value = line, ""
        if field == "event":
            event_type = value
        elif field == "data":
            data_buf.append(value)
        elif field == "id":
            last_id = value
        # other fields ignored

    return events
