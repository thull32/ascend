function simulate_pool(core, max_threads, queue_capacity, tasks) {
  let threads = 0;
  let idle = 0;
  const queue = [];
  const finishes = []; // kept sorted ascending

  function pushFinish(t) {
    finishes.push(t);
    finishes.sort((a, b) => a - b);
  }

  const outcomes = [];

  for (const [submitTime, duration] of tasks) {
    while (finishes.length > 0 && finishes[0] <= submitTime) {
      const finishTime = finishes.shift();
      if (queue.length > 0) {
        const nextDuration = queue.shift();
        pushFinish(finishTime + nextDuration);
      } else {
        idle += 1;
      }
    }

    if (threads < core) {
      threads += 1;
      pushFinish(submitTime + duration);
      outcomes.push("thread");
    } else if (queue_capacity === null || queue.length < queue_capacity) {
      if (idle > 0) {
        idle -= 1;
        pushFinish(submitTime + duration);
      } else {
        queue.push(duration);
      }
      outcomes.push("queued");
    } else if (threads < max_threads) {
      threads += 1;
      pushFinish(submitTime + duration);
      outcomes.push("thread");
    } else {
      outcomes.push("rejected");
    }
  }

  return outcomes;
}
