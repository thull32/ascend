// Rolling single row: row[c] becomes (above) + (left) since paths[r][c] only
// depends on the cell above and the cell to the left.
function unique_paths(m, n) {
  const row = new Array(n).fill(1); // the top row
  for (let r = 1; r < m; r++) {
    for (let c = 1; c < n; c++) {
      row[c] += row[c - 1]; // above (old row[c]) + left (new row[c-1])
    }
  }
  return row[n - 1];
}
