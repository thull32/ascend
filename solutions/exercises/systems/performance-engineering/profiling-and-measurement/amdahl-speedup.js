function amdahl(parts) {
  let remaining = 1.0;
  let total = 0.0;
  for (const [fraction, speedup] of parts) {
    remaining -= fraction;
    total += fraction / speedup;
  }
  const newTime = remaining + total;
  return Math.round((1 / newTime) * 100) / 100;
}
