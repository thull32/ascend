// LCP array via Kasai's algorithm: walk text positions in order, and reuse
// (previous match length - 1) as the starting point for the next
// comparison instead of starting over from zero.

function suffix_array(s) {
  return Array.from({ length: s.length }, (_, i) => i)
    .sort((a, b) => (s.slice(a) < s.slice(b) ? -1 : 1));
}

function lcp_array(s) {
  const n = s.length;
  if (n === 0) return [];

  const sa = suffix_array(s);
  const rank = new Array(n).fill(0);
  for (let pos = 0; pos < n; pos++) {
    rank[sa[pos]] = pos;
  }

  const lcp = new Array(n).fill(0);
  let h = 0;
  for (let i = 0; i < n; i++) {
    if (rank[i] > 0) {
      const j = sa[rank[i] - 1];
      while (i + h < n && j + h < n && s[i + h] === s[j + h]) {
        h += 1;
      }
      lcp[rank[i]] = h;
      if (h > 0) h -= 1;
    } else {
      h = 0;
    }
  }
  return lcp;
}
