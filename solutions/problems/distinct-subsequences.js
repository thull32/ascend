// 1D DP over t, scanned downward so each character of s is used at most once
// per position when updating W[j] from W[j-1].
function num_distinct(s, t) {
  const n = t.length;
  const W = new Array(n + 1).fill(0);
  W[0] = 1; // the empty target
  for (const ch of s) {
    for (let j = n; j >= 1; j--) {
      if (ch === t[j - 1]) W[j] += W[j - 1];
    }
  }
  return W[n];
}
