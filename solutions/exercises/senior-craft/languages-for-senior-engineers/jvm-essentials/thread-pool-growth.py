import heapq


def simulate_pool(core, max_threads, queue_capacity, tasks):
    threads = 0
    idle = 0
    queue = []  # FIFO of waiting durations
    finishes = []  # min-heap of finish times for running tasks
    outcomes = []

    for submit_time, duration in tasks:
        while finishes and finishes[0] <= submit_time:
            finish_time = heapq.heappop(finishes)
            if queue:
                next_duration = queue.pop(0)
                heapq.heappush(finishes, finish_time + next_duration)
            else:
                idle += 1

        if threads < core:
            threads += 1
            heapq.heappush(finishes, submit_time + duration)
            outcomes.append("thread")
        elif queue_capacity is None or len(queue) < queue_capacity:
            if idle > 0:
                idle -= 1
                heapq.heappush(finishes, submit_time + duration)
            else:
                queue.append(duration)
            outcomes.append("queued")
        elif threads < max_threads:
            threads += 1
            heapq.heappush(finishes, submit_time + duration)
            outcomes.append("thread")
        else:
            outcomes.append("rejected")

    return outcomes
