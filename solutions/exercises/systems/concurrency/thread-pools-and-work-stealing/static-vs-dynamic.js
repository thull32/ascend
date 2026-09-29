function makespan(durations, workers, mode) {
  const n = durations.length;
  if (n === 0) return 0;

  if (mode === "static") {
    const chunkSize = Math.ceil(n / workers);
    let best = 0;
    for (let i = 0; i < n; i += chunkSize) {
      let sum = 0;
      for (let j = i; j < Math.min(i + chunkSize, n); j++) sum += durations[j];
      best = Math.max(best, sum);
    }
    return best;
  }

  const free = new Array(workers).fill(0);
  for (const d of durations) {
    let idx = 0;
    for (let w = 1; w < workers; w++) {
      if (free[w] < free[idx]) idx = w;
    }
    free[idx] += d;
  }
  return Math.max(...free);
}
