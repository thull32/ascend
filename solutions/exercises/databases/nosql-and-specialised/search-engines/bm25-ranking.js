function bm25_rank(docs, query) {
  const k1 = 1.2;
  const b = 0.75;

  const n = docs.length;
  if (n === 0) return [];

  const avgdl = docs.reduce((s, d) => s + d.length, 0) / n;

  const queryTerms = [...new Set(query)];

  const docFreq = new Map(queryTerms.map((t) => [t, 0]));
  for (const d of docs) {
    const dSet = new Set(d);
    for (const t of queryTerms) {
      if (dSet.has(t)) docFreq.set(t, docFreq.get(t) + 1);
    }
  }

  const idf = new Map();
  for (const t of queryTerms) {
    const nt = docFreq.get(t);
    idf.set(t, Math.log(1 + (n - nt + 0.5) / (nt + 0.5)));
  }

  const scored = [];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i];
    const counts = new Map();
    for (const term of d) counts.set(term, (counts.get(term) || 0) + 1);
    let score = 0;
    for (const t of queryTerms) {
      const tf = counts.get(t) || 0;
      if (tf > 0) {
        score += (idf.get(t) * tf) / (tf + k1 * (1 - b + (b * d.length) / avgdl));
      }
    }
    if (score > 0) scored.push([i, score]);
  }

  scored.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
  return scored.map((p) => p[0]);
}
