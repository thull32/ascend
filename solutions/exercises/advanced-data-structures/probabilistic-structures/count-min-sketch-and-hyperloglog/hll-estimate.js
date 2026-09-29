function alpha(m) {
  if (m === 16) return 0.673;
  if (m === 32) return 0.697;
  if (m === 64) return 0.709;
  return 0.7213 / (1 + 1.079 / m);
}

function hll_estimate(registers) {
  const m = registers.length;
  let sum = 0;
  for (const r of registers) sum += Math.pow(2, -r);
  const raw = (alpha(m) * m * m) / sum;

  if (raw <= 2.5 * m) {
    const zeros = registers.filter((r) => r === 0).length;
    if (zeros > 0) {
      return Math.round(m * Math.log(m / zeros));
    }
  }

  return Math.round(raw);
}
