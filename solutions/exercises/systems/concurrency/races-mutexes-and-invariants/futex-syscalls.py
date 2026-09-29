def futex_calls(events):
    state = 0
    waiters = []
    wait = wake = 0

    for op, thread in events:
        if op == "lock":
            if state == 0:
                state = 1
            else:
                state = 2
                waiters.append(thread)
                wait += 1
        else:  # unlock
            old_state = state
            state = 0
            if old_state == 2:
                wake += 1
                if waiters:
                    waiters.pop(0)
                    state = 2

    return {"wait": wait, "wake": wake}
