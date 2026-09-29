function volume_anomalies(counts, window, threshold) {
  function median(values) {
    const s = [...values].sort((a, b) => a - b);
    const n = s.length;
    const mid = Math.floor(n / 2);
    if (n % 2 === 1) return s[mid];
    return (s[mid - 1] + s[mid]) / 2;
  }

  const flagged = [];
  for (let i = window; i < counts.length; i++) {
    const history = counts.slice(i - window, i);
    const m = median(history);
    const mad = median(history.map((x) => Math.abs(x - m)));
    if (Math.abs(counts[i] - m) > threshold * mad) flagged.push(i);
  }
  return flagged;
}
