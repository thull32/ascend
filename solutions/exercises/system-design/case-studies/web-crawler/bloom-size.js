function bloom_size(n, p) {
  const m = Math.ceil((-n * Math.log(p)) / (Math.log(2) ** 2));
  let k = Math.floor((m / n) * Math.log(2) + 0.5);
  k = Math.max(k, 1);
  return [m, k];
}
