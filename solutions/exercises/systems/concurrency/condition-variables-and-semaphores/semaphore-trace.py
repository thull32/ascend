from collections import deque


def semaphore_trace(permits, ops, bounded):
    count = permits
    waiters = deque()
    granted = []

    for i, (thread, action) in enumerate(ops):
        if action == "acquire":
            if count > 0:
                count -= 1
                granted.append(thread)
            else:
                waiters.append(thread)
        else:  # release
            if bounded and count >= permits:
                return {"granted": granted, "count": count, "error_at": i}
            if waiters:
                granted.append(waiters.popleft())
            else:
                count += 1

    return {"granted": granted, "count": count, "error_at": -1}
