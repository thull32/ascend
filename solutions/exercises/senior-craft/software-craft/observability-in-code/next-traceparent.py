def _is_hex(s, n):
    return len(s) == n and all(c in "0123456789abcdef" for c in s)


def next_traceparent(header, span_id, fresh_trace_id):
    def fresh():
        return {"traceparent": f"00-{fresh_trace_id}-{span_id}-01", "continued": False}

    if header is None:
        return fresh()

    fields = header.split("-")
    if len(fields) < 4:
        return fresh()

    version, trace_id, parent_id, flags = fields[0], fields[1], fields[2], fields[3]

    if not _is_hex(version, 2) or version == "ff":
        return fresh()
    if version == "00" and len(fields) != 4:
        return fresh()
    if not _is_hex(trace_id, 32) or trace_id == "0" * 32:
        return fresh()
    if not _is_hex(parent_id, 16) or parent_id == "0" * 16:
        return fresh()
    if not _is_hex(flags, 2):
        return fresh()

    sampled = (int(flags, 16) & 1) == 1
    return {
        "traceparent": f"00-{trace_id}-{span_id}-{'01' if sampled else '00'}",
        "continued": True,
    }
