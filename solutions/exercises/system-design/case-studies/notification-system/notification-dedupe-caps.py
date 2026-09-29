def plan_notifications(events, window_s, cap_per_hour):
    dedupe = {}
    sends = {}
    out = []

    for user, key, t in events:
        dk = (user, key)
        if dk in dedupe and t - dedupe[dk] < window_s:
            out.append("duplicate")
            continue

        dedupe[dk] = t
        user_sends = sends.setdefault(user, [])
        count_recent = sum(1 for s in user_sends if t - s < 3600)
        if count_recent >= cap_per_hour:
            out.append("capped")
        else:
            user_sends.append(t)
            out.append("sent")

    return out
