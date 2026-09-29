def breaker(events, volume, error_pct, window, sleep):
    out = []
    state = "closed"
    opened_at = None
    history = []  # list of (t, failed)

    for t, outcome in events:
        failed = outcome in ("error", "timeout")

        if state == "closed":
            history.append((t, failed))
            history = [(ht, hf) for ht, hf in history if ht > t - window]
            count = len(history)
            failures = sum(1 for _, hf in history if hf)
            if count >= volume and failures * 100 >= error_pct * count:
                state = "open"
                opened_at = t
            out.append("call")
        else:  # open
            if t - opened_at < sleep:
                out.append("reject")
            else:
                out.append("trial")
                if failed:
                    opened_at = t
                else:
                    state = "closed"
                    history = []

    return out
