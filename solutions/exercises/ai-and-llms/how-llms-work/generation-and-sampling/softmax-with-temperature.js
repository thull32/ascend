function softmax(logits, temperature) {
  const z = logits.map((x) => x / temperature);
  const m = Math.max(...z);
  const exps = z.map((v) => Math.exp(v - m));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}
