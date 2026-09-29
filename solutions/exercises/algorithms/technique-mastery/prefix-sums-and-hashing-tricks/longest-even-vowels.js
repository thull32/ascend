function longest_even_vowels(s) {
  const vowelBit = { a: 0, e: 1, i: 2, o: 3, u: 4 };
  const first = new Array(32).fill(-1);
  first[0] = 0;
  let mask = 0;
  let best = 0;
  for (let j = 1; j <= s.length; j++) {
    const ch = s[j - 1];
    if (ch in vowelBit) mask ^= 1 << vowelBit[ch];
    if (first[mask] === -1) {
      first[mask] = j;
    } else {
      best = Math.max(best, j - first[mask]);
    }
  }
  return best;
}
