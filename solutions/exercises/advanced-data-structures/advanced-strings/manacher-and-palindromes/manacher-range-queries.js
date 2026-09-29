function manacher(s) {
  const T = "#" + s.split("").join("#") + "#";
  const n = T.length;
  const P = new Array(n).fill(0);
  let C = 0;
  let R = 0;
  for (let i = 0; i < n; i++) {
    if (i < R) {
      const mirror = 2 * C - i;
      P[i] = Math.min(P[mirror], R - i);
    }
    while (i - P[i] - 1 >= 0 && i + P[i] + 1 < n && T[i - P[i] - 1] === T[i + P[i] + 1]) {
      P[i] += 1;
    }
    if (i + P[i] > R) {
      C = i;
      R = i + P[i];
    }
  }
  return P;
}

function palindrome_queries(s, queries) {
  if (s.length === 0) return [];

  const P = manacher(s);
  return queries.map(([l, r]) => {
    const idx = l + r + 1;
    const length = r - l + 1;
    return P[idx] >= length;
  });
}
