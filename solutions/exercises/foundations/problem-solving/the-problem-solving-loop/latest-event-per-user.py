def latest_per_user(events):
    best = {}
    for user_id, event_time, payload in events:
        if user_id not in best or event_time >= best[user_id][0]:
            best[user_id] = [event_time, payload]
    return [[user_id, best[user_id][1]] for user_id in sorted(best)]
