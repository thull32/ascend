def agent_cost(prefix, adds, budget):
    calls = total = write = read = 0
    prev_input = None
    current_input = prefix
    i = 0
    while True:
        if total + current_input > budget:
            break
        calls += 1
        total += current_input
        if prev_input is None:
            write += current_input
        else:
            write += current_input - prev_input
            read += prev_input
        prev_input = current_input
        if i >= len(adds):
            break
        current_input = prev_input + adds[i]
        i += 1
    return {"calls": calls, "total_input": total, "cache_write": write, "cache_read": read}
