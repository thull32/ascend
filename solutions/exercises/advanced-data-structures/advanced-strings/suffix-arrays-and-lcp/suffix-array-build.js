function suffix_array(s) {
  const n = s.length;
  if (n === 0) return [];

  let sa = Array.from({ length: n }, (_, i) => i);
  let rank = Array.from(s, (c) => c.charCodeAt(0));
  let k = 1;

  function key(i) {
    return [rank[i], i + k < n ? rank[i + k] : -1];
  }

  function keyEqual(a, b) {
    return a[0] === b[0] && a[1] === b[1];
  }

  while (true) {
    sa.sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      return ka[1] - kb[1];
    });

    const newRank = new Array(n).fill(0);
    newRank[sa[0]] = 0;
    for (let i = 1; i < n; i++) {
      newRank[sa[i]] = newRank[sa[i - 1]] + (keyEqual(key(sa[i]), key(sa[i - 1])) ? 0 : 1);
    }
    rank = newRank;
    if (rank[sa[n - 1]] === n - 1) break;
    k *= 2;
  }

  return sa;
}
