// Smooth weighted round robin.

function swrr(weights, n) {
  const current = weights.map(() => 0);
  const total = weights.reduce((a, b) => a + b, 0);
  const out = [];
  for (let r = 0; r < n; r++) {
    let best = 0;
    for (let i = 0; i < weights.length; i++) {
      current[i] += weights[i];
      if (current[i] > current[best]) best = i;
    }
    current[best] -= total;
    out.push(best);
  }
  return out;
}
