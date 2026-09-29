function cubic_window(w_max, times) {
  const C = 0.4,
    BETA = 0.7;
  const k = Math.cbrt((w_max * (1 - BETA)) / C);

  const out = [];
  for (const t of times) {
    const w = C * (t - k) ** 3 + w_max;
    out.push(Math.round(w * 10) / 10);
  }
  return out;
}
