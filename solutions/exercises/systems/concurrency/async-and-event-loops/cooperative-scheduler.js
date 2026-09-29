function cooperative_finish_times(tasks) {
  const ready = tasks.map((_, i) => i);
  let clock = 0;
  const finish = new Array(tasks.length).fill(0);
  const nextSegment = new Array(tasks.length).fill(0);

  while (ready.length > 0) {
    const t = ready.shift();
    clock += tasks[t][nextSegment[t]];
    nextSegment[t] += 1;
    if (nextSegment[t] < tasks[t].length) {
      ready.push(t);
    } else {
      finish[t] = clock;
    }
  }

  return finish;
}
