function keyGroupRange(i, maxParallelism, p) {
  const start = Math.floor((i * maxParallelism + p - 1) / p);
  const end = Math.floor(((i + 1) * maxParallelism - 1) / p);
  return [start, end];
}

function rescale_plan(max_parallelism, old_parallelism, new_parallelism) {
  const oldRanges = [];
  for (let i = 0; i < old_parallelism; i++) {
    oldRanges.push(keyGroupRange(i, max_parallelism, old_parallelism));
  }
  const newRanges = [];
  for (let i = 0; i < new_parallelism; i++) {
    newRanges.push(keyGroupRange(i, max_parallelism, new_parallelism));
  }

  const result = [];
  for (const [start, end] of newRanges) {
    const readsFrom = [];
    for (let j = 0; j < oldRanges.length; j++) {
      const [os, oe] = oldRanges[j];
      if (os <= end && start <= oe) readsFrom.push(j);
    }
    result.push({ range: [start, end], reads_from: readsFrom });
  }

  return result;
}
