function word_break(s, words) {
  const wordSet = new Set(words);
  const maxLen = words.reduce((m, w) => Math.max(m, w.length), 0);
  const n = s.length;
  const memo = new Map();

  function can(i) {
    if (i === n) return true;
    if (memo.has(i)) return memo.get(i);
    let result = false;
    for (let j = i + 1; j <= Math.min(n, i + maxLen); j++) {
      if (wordSet.has(s.slice(i, j)) && can(j)) {
        result = true;
        break;
      }
    }
    memo.set(i, result);
    return result;
  }

  return can(0);
}
