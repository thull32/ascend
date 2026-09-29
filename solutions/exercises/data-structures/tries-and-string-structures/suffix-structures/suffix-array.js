// Suffix array via prefix doubling: sort suffixes by (rank[i], rank[i+k])
// pairs, using -1 as the sentinel for indices past the end, then double k
// until every rank is distinct.

function suffix_array(s) {
  const n = s.length;
  if (n === 0) return [];

  let sa = Array.from({ length: n }, (_, i) => i);
  let rank = Array.from(s, (c) => c.charCodeAt(0));
  let k = 1;

  while (true) {
    const rankAt = rank;
    const kk = k;
    const keyOf = (i) => [rankAt[i], i + kk < n ? rankAt[i + kk] : -1];
    const cmpKey = (a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (ka[0] !== kb[0]) return ka[0] - kb[0];
      return ka[1] - kb[1];
    };

    sa = sa.slice().sort(cmpKey);

    const newRank = new Array(n).fill(0);
    newRank[sa[0]] = 0;
    for (let i = 1; i < n; i++) {
      newRank[sa[i]] = newRank[sa[i - 1]];
      const a = keyOf(sa[i]);
      const b = keyOf(sa[i - 1]);
      if (a[0] !== b[0] || a[1] !== b[1]) {
        newRank[sa[i]] += 1;
      }
    }
    rank = newRank;

    if (rank[sa[sa.length - 1]] === n - 1) break;
    k *= 2;
  }

  return sa;
}
