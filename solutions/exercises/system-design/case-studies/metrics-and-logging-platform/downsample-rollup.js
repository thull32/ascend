function rollup(samples, step) {
  const windows = new Map();
  for (const [ts, value] of samples) {
    const start = ts - (((ts % step) + step) % step);
    if (!windows.has(start)) {
      windows.set(start, [start, value, value, value, 1]);
    } else {
      const w = windows.get(start);
      w[1] = Math.min(w[1], value);
      w[2] = Math.max(w[2], value);
      w[3] += value;
      w[4] += 1;
    }
  }

  return [...windows.keys()].sort((a, b) => a - b).map(k => windows.get(k));
}
