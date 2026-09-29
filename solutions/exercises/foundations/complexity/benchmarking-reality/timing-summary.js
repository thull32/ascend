function timing_summary(samples) {
  const s = samples.slice().sort((a, b) => a - b);
  const n = s.length;
  const minimum = s[0];
  const p50Idx = Math.ceil(n / 2) - 1;
  const p90Idx = Math.ceil((9 * n) / 10) - 1;
  return [minimum, s[p50Idx], s[p90Idx]];
}
