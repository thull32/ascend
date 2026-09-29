function shingles(text, k) {
  if (text.length < k) return [];
  const set = new Set();
  for (let i = 0; i <= text.length - k; i++) {
    set.add(text.slice(i, i + k));
  }
  return [...set].sort();
}
