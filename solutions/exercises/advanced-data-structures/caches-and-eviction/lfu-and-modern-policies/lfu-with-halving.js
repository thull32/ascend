function lfu_with_halving(capacity, halveEvery, ops) {
  const counts = new Map(); // key -> count
  const recency = []; // keys from least to most recently accessed
  const evicted = [];
  let accesses = 0;

  function touch(key) {
    counts.set(key, (counts.get(key) || 0) + 1);
    const idx = recency.indexOf(key);
    if (idx !== -1) recency.splice(idx, 1);
    recency.push(key);
    accesses += 1;
    if (halveEvery > 0 && accesses % halveEvery === 0) {
      for (const k of counts.keys()) {
        counts.set(k, Math.floor(counts.get(k) / 2));
      }
    }
  }

  for (const [op, key] of ops) {
    if (op === "get") {
      if (counts.has(key)) touch(key);
      continue;
    }

    if (!counts.has(key)) {
      if (counts.size >= capacity) {
        let victim = null;
        let victimCount = Infinity;
        for (const k of recency) {
          if (counts.get(k) < victimCount) {
            victimCount = counts.get(k);
            victim = k;
          }
        }
        evicted.push(victim);
        counts.delete(victim);
        recency.splice(recency.indexOf(victim), 1);
      }
      counts.set(key, 0);
      recency.push(key);
    }
    touch(key);
  }

  return evicted;
}
