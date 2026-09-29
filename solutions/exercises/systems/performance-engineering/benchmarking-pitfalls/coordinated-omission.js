function nearestRank(samples, p) {
  const n = samples.length;
  if (n === 0) return null;
  const s = [...samples].sort((a, b) => a - b);
  const rank = Math.floor((p * n + 99) / 100);
  return s[rank - 1];
}

function co_percentiles(latencies, interval, p) {
  const raw = nearestRank(latencies, p);

  const corrected = [];
  for (const latency of latencies) {
    corrected.push(latency);
    if (interval > 0) {
      let m = latency - interval;
      while (m >= interval) {
        corrected.push(m);
        m -= interval;
      }
    }
  }

  return [raw, nearestRank(corrected, p)];
}
