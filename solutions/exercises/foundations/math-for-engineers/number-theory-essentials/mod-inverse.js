function mod_inverse(a, m) {
  function extendedGcd(a, b) {
    if (b === 0) return [a, 1, 0];
    const [g, x1, y1] = extendedGcd(b, a % b);
    return [g, y1, x1 - Math.floor(a / b) * y1];
  }

  const [g, x] = extendedGcd(a, m);
  if (g !== 1) return -1;
  return ((x % m) + m) % m;
}
