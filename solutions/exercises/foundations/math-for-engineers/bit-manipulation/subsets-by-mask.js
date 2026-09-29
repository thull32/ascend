function subsets_by_mask(values) {
  const n = values.length;
  const result = [];
  for (let mask = 0; mask < 2 ** n; mask++) {
    const subset = [];
    for (let i = 0; i < n; i++) {
      if (Math.floor(mask / 2 ** i) % 2 === 1) {
        subset.push(values[i]);
      }
    }
    result.push(subset);
  }
  return result;
}
