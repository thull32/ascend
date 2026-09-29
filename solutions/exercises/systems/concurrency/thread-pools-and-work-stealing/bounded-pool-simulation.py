from collections import deque

def pool_finish_times(workers, queue_capacity, tasks):
    free_at = [0] * workers      # when each worker next becomes free
    queue = deque()              # indices of waiting tasks
    result = [None] * len(tasks)

    def earliest_worker():
        return min(range(workers), key=lambda w: free_at[w])

    def drain(t):
        while queue:
            w = earliest_worker()
            if free_at[w] > t:
                break
            i = queue.popleft()
            start = free_at[w]
            finish = start + tasks[i][1]
            result[i] = finish
            free_at[w] = finish

    for i, (arrival, duration) in enumerate(tasks):
        drain(arrival)
        w = earliest_worker()
        if free_at[w] <= arrival:
            finish = arrival + duration
            result[i] = finish
            free_at[w] = finish
        elif len(queue) < queue_capacity:
            queue.append(i)
        else:
            result[i] = -1

    drain(float("inf"))
    return result
