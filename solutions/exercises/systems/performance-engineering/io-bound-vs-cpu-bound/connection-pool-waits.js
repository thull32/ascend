function simulate_pool(requests, size) {
  const freeAt = new Array(size).fill(0);
  const waits = [];
  for (const [arrival, service] of requests) {
    let idx = 0;
    for (let i = 1; i < size; i++) {
      if (freeAt[i] < freeAt[idx]) idx = i;
    }
    const start = Math.max(freeAt[idx], arrival);
    waits.push(start - arrival);
    freeAt[idx] = start + service;
  }
  return waits;
}
