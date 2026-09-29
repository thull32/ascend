function pool_finish_times(workers, queue_capacity, tasks) {
  const freeAt = new Array(workers).fill(0); // when each worker next becomes free
  const queue = [];                          // indices of waiting tasks
  const result = new Array(tasks.length).fill(null);

  function earliestWorker() {
    let best = 0;
    for (let w = 1; w < workers; w++) {
      if (freeAt[w] < freeAt[best]) best = w;
    }
    return best;
  }

  function drain(t) {
    while (queue.length > 0) {
      const w = earliestWorker();
      if (freeAt[w] > t) break;
      const i = queue.shift();
      const start = freeAt[w];
      const finish = start + tasks[i][1];
      result[i] = finish;
      freeAt[w] = finish;
    }
  }

  for (let i = 0; i < tasks.length; i++) {
    const [arrival, duration] = tasks[i];
    drain(arrival);
    const w = earliestWorker();
    if (freeAt[w] <= arrival) {
      const finish = arrival + duration;
      result[i] = finish;
      freeAt[w] = finish;
    } else if (queue.length < queue_capacity) {
      queue.push(i);
    } else {
      result[i] = -1;
    }
  }

  drain(Infinity);
  return result;
}
