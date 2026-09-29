// Rolling single-row DP; keep the shorter string as the row to minimise space.
function edit_distance(a, b) {
  if (b.length > a.length) [a, b] = [b, a]; // distance is symmetric; keep the row short
  let row = [];
  for (let j = 0; j <= b.length; j++) row.push(j); // D[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0]; // D[i-1][0]
    row[0] = i; // D[i][0]
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]; // D[i-1][j]
      if (a[i - 1] === b[j - 1]) {
        row[j] = diag;
      } else {
        row[j] = 1 + Math.min(up, row[j - 1], diag);
      }
      diag = up;
    }
  }
  return row[b.length];
}
