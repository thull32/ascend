// DP over prefixes: can[i] is true if s[:i] can be segmented; only check
// back to the longest word length, since anything shorter can't be a word.
function word_break(s, words) {
  const vocab = new Set(words);
  const longest = Math.max(...words.map((w) => w.length));
  const n = s.length;
  const can = new Array(n + 1).fill(false);
  can[0] = true;
  for (let i = 1; i <= n; i++) {
    for (let j = Math.max(0, i - longest); j < i; j++) {
      if (can[j] && vocab.has(s.slice(j, i))) {
        can[i] = true;
        break;
      }
    }
  }
  return can[n];
}
