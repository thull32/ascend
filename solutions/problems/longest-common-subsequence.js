// Longest Common Subsequence — space-optimized DP, one row plus a saved diagonal.
function longest_common_subsequence(a, b) {
  if (b.length > a.length) {
    [a, b] = [b, a];
  }
  const row = new Array(b.length + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    const ch = a[i];
    let diag = 0; // L[i-1][0]
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]; // L[i-1][j], about to be overwritten
      if (ch === b[j - 1]) {
        row[j] = diag + 1;
      } else {
        row[j] = Math.max(up, row[j - 1]);
      }
      diag = up; // becomes L[i-1][j-1] for the next j
    }
  }
  return row[b.length];
}
