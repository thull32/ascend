function dag_finish_times(tasks, workers) {
  const taskMap = new Map(tasks.map(t => [t[0], t]));
  const priorityIndex = new Map(tasks.map((t, i) => [t[0], i]));
  const remainingDeps = new Map(tasks.map(t => [t[0], new Set(t[2])]));
  const pending = new Set(taskMap.keys());
  let running = []; // [finishTime, id]
  let idleWorkers = workers;
  const finish = {};
  let now = 0;

  while (pending.size > 0 || running.length > 0) {
    let ready = [...pending].filter(tid => remainingDeps.get(tid).size === 0);
    ready.sort((a, b) => priorityIndex.get(a) - priorityIndex.get(b));

    while (idleWorkers > 0 && ready.length > 0) {
      const tid = ready.shift();
      pending.delete(tid);
      const duration = taskMap.get(tid)[1];
      running.push([now + duration, tid]);
      idleWorkers -= 1;
    }

    if (running.length === 0) break;

    now = Math.min(...running.map(([ft]) => ft));
    const finishedNow = running.filter(([ft]) => ft <= now).map(([, tid]) => tid);
    running = running.filter(([ft]) => ft > now);
    idleWorkers += finishedNow.length;

    for (const tid of finishedNow) {
      finish[tid] = now;
    }
    for (const other of pending) {
      const deps = remainingDeps.get(other);
      for (const tid of finishedNow) deps.delete(tid);
    }
  }

  return finish;
}
