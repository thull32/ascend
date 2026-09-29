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

function longest_palindrome(s) {
  if (s.length === 0) return "";

  const P = manacher(s);
  let bestLen = -1;
  let bestI = 0;
  for (let i = 0; i < P.length; i++) {
    if (P[i] > bestLen) {
      bestLen = P[i];
      bestI = i;
    }
  }

  const start = (bestI - bestLen) / 2;
  const end = (bestI + bestLen) / 2;
  return s.slice(start, end);
}
