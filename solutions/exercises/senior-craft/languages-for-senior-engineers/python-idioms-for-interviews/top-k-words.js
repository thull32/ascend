function top_k_words(words, k) {
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  const distinct = Array.from(counts.keys());
  distinct.sort((a, b) => counts.get(b) - counts.get(a) || (a < b ? -1 : a > b ? 1 : 0));
  return distinct.slice(0, k);
}
