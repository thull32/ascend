def dag_finish_times(tasks, workers):
    task_map = {t[0]: t for t in tasks}
    priority_index = {t[0]: i for i, t in enumerate(tasks)}
    remaining_deps = {t[0]: set(t[2]) for t in tasks}
    pending = set(task_map.keys())
    running = []  # list of (finish_time, id)
    idle_workers = workers
    finish = {}
    now = 0

    while pending or running:
        ready = sorted(
            (tid for tid in pending if not remaining_deps[tid]),
            key=lambda tid: priority_index[tid],
        )
        while idle_workers > 0 and ready:
            tid = ready.pop(0)
            pending.discard(tid)
            duration = task_map[tid][1]
            running.append((now + duration, tid))
            idle_workers -= 1

        if not running:
            break

        now = min(ft for ft, _ in running)
        finished_now = [tid for ft, tid in running if ft <= now]
        running = [(ft, tid) for ft, tid in running if ft > now]
        idle_workers += len(finished_now)

        for tid in finished_now:
            finish[tid] = now
        for other in pending:
            remaining_deps[other].difference_update(finished_now)

    return finish
