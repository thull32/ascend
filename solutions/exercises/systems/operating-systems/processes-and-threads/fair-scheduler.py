def fair_schedule(tasks, slice_us, slices):
    vruntime = [0] * len(tasks)
    order = []
    for _ in range(slices):
        idx = min(range(len(tasks)), key=lambda i: vruntime[i])
        order.append(tasks[idx][0])
        vruntime[idx] += (slice_us * 1024) // tasks[idx][1]
    return order
