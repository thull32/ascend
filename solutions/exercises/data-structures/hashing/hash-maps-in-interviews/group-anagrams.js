function group_anagrams(words) {
  const groups = new Map();
  for (const w of words) {
    const key = w.split('').sort().join('');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }
  return Array.from(groups.values());
}
