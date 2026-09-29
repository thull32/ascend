from collections import deque


def breaker(events, window, min_calls, threshold_pct, open_ms, trials):
    calls = []
    state = "closed"
    win = deque(maxlen=window)
    opened_at = None
    half_open_trials = []

    for t, outcome in events:
        is_fail = outcome in ("fail", "slow")

        if state == "closed":
            calls.append("pass")
            win.append(is_fail)
            size = len(win)
            failures = sum(win)
            if size >= min_calls and failures * 100 >= threshold_pct * size:
                state = "open"
                opened_at = t
                win.clear()

        elif state == "open":
            if t - opened_at >= open_ms:
                state = "half_open"
                half_open_trials = []
                calls.append("trial")
                half_open_trials.append(is_fail)
                if len(half_open_trials) >= trials:
                    failures = sum(half_open_trials)
                    if failures * 100 >= threshold_pct * trials:
                        state = "open"
                        opened_at = t
                    else:
                        state = "closed"
                        win = deque(maxlen=window)
            else:
                calls.append("reject")

        else:  # half_open
            calls.append("trial")
            half_open_trials.append(is_fail)
            if len(half_open_trials) >= trials:
                failures = sum(half_open_trials)
                if failures * 100 >= threshold_pct * trials:
                    state = "open"
                    opened_at = t
                else:
                    state = "closed"
                    win = deque(maxlen=window)

    return {"calls": calls, "state": state}
