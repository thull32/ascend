function phi_values(arrivals, checks, window, min_std, pause) {
  const out = [];
  for (const c of checks) {
    const history = arrivals.filter(a => a <= c);
    if (history.length < 2) {
      out.push(0);
      continue;
    }

    let intervals = [];
    for (let i = 0; i < history.length - 1; i++) {
      intervals.push(history[i + 1] - history[i]);
    }
    intervals = intervals.slice(-window);
    const n = intervals.length;
    const mean = intervals.reduce((a, b) => a + b, 0) / n;
    let variance = intervals.reduce((a, x) => a + (x - mean) * (x - mean), 0) / n;
    variance = Math.max(variance, 0);
    let std = Math.sqrt(variance);
    if (std < min_std) std = min_std;

    const dt = c - history[history.length - 1];
    const y = (dt - (mean + pause)) / std;
    const g = y * (1.5976 + 0.070566 * y * y);

    let phi;
    if (g > 40) {
      phi = g / Math.log(10);
    } else {
      phi = Math.log10(1 + Math.exp(g));
    }

    out.push(Number(phi.toFixed(2)));
  }
  return out;
}
