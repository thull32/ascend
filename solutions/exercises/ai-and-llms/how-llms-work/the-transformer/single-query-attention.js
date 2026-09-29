function attend(q, keys, values) {
  const d = q.length;
  const scores = keys.map((k) => {
    let dot = 0;
    for (let i = 0; i < d; i++) dot += q[i] * k[i];
    return dot / Math.sqrt(d);
  });
  const m = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - m));
  const total = exps.reduce((a, b) => a + b, 0);
  const weights = exps.map((e) => e / total);

  const dim = values[0].length;
  const output = new Array(dim).fill(0);
  for (let j = 0; j < weights.length; j++) {
    for (let c = 0; c < dim; c++) {
      output[c] += weights[j] * values[j][c];
    }
  }
  return output;
}
