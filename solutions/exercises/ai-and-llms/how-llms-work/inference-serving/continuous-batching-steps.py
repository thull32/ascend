def batching_steps(lengths, slots):
    n = len(lengths)

    static_steps = 0
    for i in range(0, n, slots):
        static_steps += max(lengths[i:i + slots])

    active = []
    idx = 0
    continuous_steps = 0
    while True:
        while len(active) < slots and idx < n:
            active.append(lengths[idx])
            idx += 1
        if not active:
            break
        continuous_steps += 1
        active = [x - 1 for x in active if x - 1 > 0]
    return [static_steps, continuous_steps]
