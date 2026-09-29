def final_counter(increments, schedule):
    n = len(increments)
    step = [0] * n       # 0=load, 1=add, 2=store
    register = [0] * n
    completed = [0] * n
    counter = 0

    def finished(t):
        return completed[t] >= increments[t]

    def run_step(t):
        nonlocal counter
        if step[t] == 0:
            register[t] = counter
            step[t] = 1
        elif step[t] == 1:
            register[t] += 1
            step[t] = 2
        else:
            counter = register[t]
            completed[t] += 1
            step[t] = 0

    for t in schedule:
        if not finished(t):
            run_step(t)

    for t in range(n):
        while not finished(t):
            run_step(t)

    return counter
