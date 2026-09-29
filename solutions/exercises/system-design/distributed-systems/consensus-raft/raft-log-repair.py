def repair_follower(leader, follower):
    next_index = len(leader) + 1
    probes = []
    prev = None

    while True:
        prev = next_index - 1
        prev_term = leader[prev - 1] if prev > 0 else 0
        probes.append(prev)
        if prev == 0 or (prev <= len(follower) and follower[prev - 1] == prev_term):
            break
        next_index -= 1

    result = list(follower)
    truncated = 0

    for offset, term in enumerate(leader[prev:], start=1):
        pos = prev + offset - 1
        if pos < len(result):
            if result[pos] == term:
                continue
            truncated = len(result) - pos
            result = result[:pos]
            result.append(term)
        else:
            result.append(term)

    return {"probes": probes, "truncated": truncated, "log": result}
