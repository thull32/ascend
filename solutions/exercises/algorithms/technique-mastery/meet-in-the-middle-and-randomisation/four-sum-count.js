function four_sum_count(a, b, c, d) {
  const counts = new Map();
  for (const x of a) {
    for (const y of b) {
      const s = x + y;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  }

  let total = 0;
  for (const x of c) {
    for (const y of d) {
      total += counts.get(-(x + y)) || 0;
    }
  }
  return total;
}
