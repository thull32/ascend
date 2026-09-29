function info_nce_loss(sims, tau) {
  const n = sims.length;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const z = sims[i].map((s) => s / tau);
    const m = Math.max(...z);
    const logSumExp = m + Math.log(z.reduce((acc, v) => acc + Math.exp(v - m), 0));
    total += logSumExp - z[i];
  }
  return total / n;
}
