from collections import defaultdict


def rate_limit(requests, limit, window_ms):
    logs = defaultdict(list)
    result = []

    for user, now_ms in requests:
        log = logs[user]
        cutoff = now_ms - window_ms
        while log and log[0] <= cutoff:
            log.pop(0)

        if len(log) < limit:
            log.append(now_ms)
            result.append(True)
        else:
            result.append(False)

    return result
