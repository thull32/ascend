function apply_range_adds(n, updates) {
  const diff = new Array(n + 1).fill(0);
  for (const [l, r, v] of updates) {
    diff[l] += v;
    if (r + 1 < n) diff[r + 1] -= v;
  }
  const result = new Array(n).fill(0);
  let running = 0;
  for (let i = 0; i < n; i++) {
    running += diff[i];
    result[i] = running;
  }
  return result;
}
