function top_k_suggestions(pairs, prefix, k) {
  const totals = new Map();
  for (const [query, count] of pairs) {
    totals.set(query, (totals.get(query) || 0) + count);
  }

  const matches = [...totals.keys()].filter(q => q.startsWith(prefix));
  matches.sort((a, b) => {
    const ca = totals.get(a), cb = totals.get(b);
    if (ca !== cb) return cb - ca;
    return a < b ? -1 : a > b ? 1 : 0;
  });

  return matches.slice(0, k);
}
