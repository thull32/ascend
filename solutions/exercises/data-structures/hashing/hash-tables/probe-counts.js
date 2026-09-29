function probe_counts(hashes, capacity) {
  const occupied = new Array(capacity).fill(false);
  const result = [];
  for (const h of hashes) {
    let i = h % capacity;
    let count = 1;
    while (occupied[i]) {
      i = (i + 1) % capacity;
      count++;
    }
    occupied[i] = true;
    result.push(count);
  }
  return result;
}
