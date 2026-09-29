function tumbling_counts(events, size, max_delay) {
  const results = [];
  const late = [];
  const windows = new Map();
  const fired = new Set();
  let largest = -Infinity;

  function watermark() {
    return largest - max_delay;
  }

  function fireUpTo(wm) {
    const starts = Array.from(windows.keys())
      .filter((s) => !fired.has(s) && s + size <= wm)
      .sort((a, b) => a - b);
    for (const s of starts) {
      const counts = windows.get(s);
      for (const k of Array.from(counts.keys()).sort()) {
        results.push([s, k, counts.get(k)]);
      }
      fired.add(s);
    }
  }

  for (const [t, key] of events) {
    const start = t - (t % size);
    if (start + size <= watermark()) {
      late.push([t, key]);
      continue;
    }
    if (!windows.has(start)) windows.set(start, new Map());
    const counts = windows.get(start);
    counts.set(key, (counts.get(key) || 0) + 1);
    if (t > largest) largest = t;
    fireUpTo(watermark());
  }

  fireUpTo(Infinity);

  return { results, late };
}
