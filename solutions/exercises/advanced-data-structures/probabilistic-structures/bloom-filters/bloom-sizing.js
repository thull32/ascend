function bloom_params(n, p) {
  const m = Math.ceil((-n * Math.log(p)) / Math.log(2) ** 2);
  const k = Math.max(1, Math.round((m / n) * Math.log(2)));
  return [m, k];
}
