def send_completion_times(capacity, produce, consume):
    n = len(produce)
    sent = [0] * n
    received = [0] * n
    done = [0] * n

    for i in range(n):
        ready = (sent[i - 1] if i > 0 else 0) + produce[i]
        if capacity == 0:
            recv = max(ready, done[i - 1] if i > 0 else 0)
            sent[i] = recv
            received[i] = recv
        else:
            floor = received[i - capacity] if i >= capacity else 0
            sent[i] = max(ready, floor)
            received[i] = max(sent[i], done[i - 1] if i > 0 else 0)
        done[i] = received[i] + consume[i]

    return sent
