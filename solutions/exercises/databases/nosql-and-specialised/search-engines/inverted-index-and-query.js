const STOP = new Set(["a", "an", "and", "the", "of", "to", "in", "is"]);

function analyze(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t));
}

function search(docs, query) {
  const queryTerms = [...new Set(analyze(query))];
  if (queryTerms.length === 0) return [];

  const scored = [];
  for (let i = 0; i < docs.length; i++) {
    const counts = new Map();
    for (const term of analyze(docs[i])) {
      counts.set(term, (counts.get(term) || 0) + 1);
    }
    if (queryTerms.every((t) => counts.has(t))) {
      const score = queryTerms.reduce((s, t) => s + counts.get(t), 0);
      scored.push([i, score]);
    }
  }

  scored.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  return scored.map((p) => p[0]);
}
