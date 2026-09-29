def rfc_status(events, fcp_days, day):
    state = "draft"
    since = 0
    window_start = None

    def close_if_needed(upto_day):
        nonlocal state, since, window_start
        if state == "fcp" and window_start is not None:
            closing_day = window_start + fcp_days
            if closing_day <= upto_day:
                state = "accepted"
                since = closing_day
                window_start = None

    for ev_day, kind in events:
        if ev_day > day:
            break

        close_if_needed(ev_day)
        if state in ("accepted", "rejected", "withdrawn"):
            continue

        if kind == "submit" and state == "draft":
            state, since = "in-review", ev_day
        elif kind == "resolve" and state == "in-review":
            state, since, window_start = "fcp", ev_day, ev_day
        elif kind == "block" and state == "fcp":
            state, since, window_start = "in-review", ev_day, None
        elif kind == "reject" and state in ("in-review", "fcp"):
            state, since, window_start = "rejected", ev_day, None
        elif kind == "withdraw" and state in ("draft", "in-review", "fcp"):
            state, since, window_start = "withdrawn", ev_day, None

    close_if_needed(day)

    return {"state": state, "since": since}
