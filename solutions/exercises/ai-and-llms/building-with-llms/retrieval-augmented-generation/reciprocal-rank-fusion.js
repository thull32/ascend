function rrf(rankings, k) {
  const scores = new Map();
  for (const ranking of rankings) {
    ranking.forEach((docId, i) => {
      const rank = i + 1;
      scores.set(docId, (scores.get(docId) || 0) + 1 / (k + rank));
    });
  }
  return [...scores.keys()].sort((a, b) => {
    const sa = scores.get(a);
    const sb = scores.get(b);
    if (sb !== sa) return sb - sa;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}
