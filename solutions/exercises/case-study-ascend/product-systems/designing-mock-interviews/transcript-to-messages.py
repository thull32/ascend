_ROLE_MAP = {"candidate": "user", "interviewer": "assistant"}


def transcript_to_messages(entries):
    mapped = [[_ROLE_MAP[role], content] for role, content in entries if role in _ROLE_MAP]

    i = 0
    while i < len(mapped) and mapped[i][0] == "assistant":
        i += 1
    mapped = mapped[i:]

    merged = []
    for role, content in mapped:
        if merged and merged[-1][0] == role:
            merged[-1][1] += "\n\n" + content
        else:
            merged.append([role, content])

    while merged and merged[-1][0] == "assistant":
        merged.pop()

    return merged
