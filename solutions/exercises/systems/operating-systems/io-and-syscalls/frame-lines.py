def frame_lines(chunks):
    lines = []
    rest = ""
    for c in chunks:
        if c is None:
            continue
        start = len(rest)
        rest += c
        while True:
            idx = rest.find("\n", start)
            if idx == -1:
                break
            lines.append(rest[:idx])
            rest = rest[idx + 1:]
            start = 0
    return {"lines": lines, "rest": rest}
