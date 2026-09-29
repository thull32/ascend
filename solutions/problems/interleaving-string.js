// Rolling single-row DP: row[j] means s1[:i] and s2[:j] interleave to s3[:i+j].
function is_interleave(s1, s2, s3) {
  const m = s1.length, n = s2.length;
  if (m + n !== s3.length) return false;
  const row = new Array(n + 1).fill(false);
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      if (i === 0 && j === 0) {
        row[0] = true;
        continue;
      }
      const c = s3[i + j - 1];
      const fromS1 = i > 0 && row[j] && s1[i - 1] === c; // row[j] is still the row above
      const fromS2 = j > 0 && row[j - 1] && s2[j - 1] === c; // row[j-1] is this row
      row[j] = fromS1 || fromS2;
    }
  }
  return row[n];
}
