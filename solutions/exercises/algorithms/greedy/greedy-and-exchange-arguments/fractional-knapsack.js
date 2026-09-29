function fractional_knapsack(weights, values, capacity) {
  const items = weights.map((w, i) => [w, values[i]]);
  items.sort((a, b) => (b[1] / b[0]) - (a[1] / a[0]));
  let remaining = capacity;
  let total = 0;
  for (const [w, v] of items) {
    if (remaining <= 0) break;
    if (w <= remaining) {
      total += v;
      remaining -= w;
    } else {
      total += (v * remaining) / w;
      remaining = 0;
    }
  }
  return total;
}
