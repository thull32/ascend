function simulate_cache(capacity, policy, accesses) {
  let hits = 0;
  const evicted = [];
  const meta = new Map(); // key -> [count, lastAccessTime]
  let t = 0;
  for (const k of accesses) {
    t += 1;
    if (meta.has(k)) {
      hits += 1;
      const m = meta.get(k);
      m[0] += 1;
      m[1] = t;
    } else {
      if (meta.size >= capacity) {
        let bestRank = null;
        let victimKey = null;
        for (const [key, [count, last]] of meta) {
          const rankCount = policy === "lfu" ? count : 0;
          if (bestRank === null || rankCount < bestRank[0] || (rankCount === bestRank[0] && last < bestRank[1])) {
            bestRank = [rankCount, last];
            victimKey = key;
          }
        }
        meta.delete(victimKey);
        evicted.push(victimKey);
      }
      meta.set(k, [1, t]);
    }
  }
  return { hits, evicted };
}
