function percentile(samples, p) {
  const n = samples.length;
  if (n === 0) return null;
  const s = [...samples].sort((a, b) => a - b);
  const rank = Math.floor((p * n + 99) / 100); // ceil(p * n / 100)
  return s[rank - 1];
}
