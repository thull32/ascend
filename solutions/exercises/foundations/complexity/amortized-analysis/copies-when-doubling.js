function total_copies(n) {
  let size = 0;
  let capacity = 1;
  let total = 0;
  for (let i = 0; i < n; i++) {
    if (size === capacity) {
      total += size;
      capacity *= 2;
    }
    size += 1;
  }
  return total;
}
