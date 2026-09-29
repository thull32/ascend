def cas_counter(increments, schedule):
    n = len(increments)
    next_step = ["read"] * n
    expected = [0] * n
    completed = [0] * n
    counter = 0
    failures = 0

    def finished(t):
        return completed[t] >= increments[t]

    def run_step(t):
        nonlocal counter, failures
        if next_step[t] == "read":
            expected[t] = counter
            next_step[t] = "cas"
        else:
            if counter == expected[t]:
                counter += 1
                completed[t] += 1
                next_step[t] = "read"
            else:
                failures += 1
                next_step[t] = "read"

    for t in schedule:
        if not finished(t):
            run_step(t)

    for t in range(n):
        while not finished(t):
            run_step(t)

    return [counter, failures]
