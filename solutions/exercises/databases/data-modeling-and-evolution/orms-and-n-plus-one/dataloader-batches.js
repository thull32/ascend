function plan_batches(ticks) {
  const loaded = new Set();
  const batches = [];

  for (const tick of ticks) {
    const newKeys = [...new Set(tick.filter((k) => !loaded.has(k)))].sort((a, b) => a - b);
    if (newKeys.length) {
      batches.push(newKeys);
      for (const k of newKeys) loaded.add(k);
    }
  }

  return batches;
}
