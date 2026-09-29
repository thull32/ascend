function first_unique_char(s) {
  const counts = new Array(128).fill(0);
  for (let i = 0; i < s.length; i++) {
    counts[s.charCodeAt(i)] += 1;
  }
  for (let i = 0; i < s.length; i++) {
    if (counts[s.charCodeAt(i)] === 1) return i;
  }
  return -1;
}
