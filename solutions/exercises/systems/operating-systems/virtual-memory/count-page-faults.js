function count_page_faults(refs, frames, policy) {
  let order = []; // resident pages; index 0 is the eviction candidate
  const resident = new Set();
  let faults = 0;
  for (const r of refs) {
    if (resident.has(r)) {
      if (policy === "lru") {
        order = order.filter((x) => x !== r);
        order.push(r);
      }
      continue;
    }
    faults++;
    if (order.length >= frames) {
      const victim = order.shift();
      resident.delete(victim);
    }
    order.push(r);
    resident.add(r);
  }
  return faults;
}
