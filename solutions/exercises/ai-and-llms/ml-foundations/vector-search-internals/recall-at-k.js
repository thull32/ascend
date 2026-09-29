function recall_at_k(retrieved, truth, k) {
  let total = 0;
  for (let i = 0; i < retrieved.length; i++) {
    const rSet = new Set(retrieved[i].slice(0, k));
    const tSet = new Set(truth[i].slice(0, k));
    let hits = 0;
    for (const id of rSet) {
      if (tSet.has(id)) hits += 1;
    }
    total += hits / k;
  }
  return total / retrieved.length;
}
