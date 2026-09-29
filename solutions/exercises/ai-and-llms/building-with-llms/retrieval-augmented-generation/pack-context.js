function pack_context(chunks, budget, per_doc, min_score) {
  const ordered = chunks.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  const taken = [];
  let total = 0;
  const docCounts = new Map();
  for (const c of ordered) {
    if (c.score < min_score) continue;
    const count = docCounts.get(c.doc) || 0;
    if (count >= per_doc) continue;
    if (total + c.tokens > budget) continue;
    taken.push(c.id);
    total += c.tokens;
    docCounts.set(c.doc, count + 1);
  }
  return { ids: taken, tokens: total };
}
