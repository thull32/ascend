from collections import deque

def cooperative_finish_times(tasks):
    ready = deque(range(len(tasks)))
    clock = 0
    finish = [0] * len(tasks)
    next_segment = [0] * len(tasks)

    while ready:
        t = ready.popleft()
        clock += tasks[t][next_segment[t]]
        next_segment[t] += 1
        if next_segment[t] < len(tasks[t]):
            ready.append(t)
        else:
            finish[t] = clock

    return finish
