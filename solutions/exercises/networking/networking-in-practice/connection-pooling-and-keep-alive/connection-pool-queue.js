function simulate_pool(size, hold, timeout, arrivals) {
  const freeAt = new Array(size).fill(0);
  const results = [];
  for (const t of arrivals) {
    let minIdx = 0;
    for (let i = 1; i < freeAt.length; i++) {
      if (freeAt[i] < freeAt[minIdx]) minIdx = i;
    }
    const earliest = freeAt[minIdx];
    const wait = Math.max(0, earliest - t);
    if (wait > timeout) {
      results.push(-1);
      continue;
    }
    const start = Math.max(t, earliest);
    freeAt[minIdx] = start + hold;
    results.push(wait);
  }
  return results;
}
